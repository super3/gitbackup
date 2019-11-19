const fs = require('fs').promises;
const axios = require('axios');
const execa = require('execa');
const storj = require('./lib/rclone');

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

if(typeof client_id !== 'string' || typeof client_secret !== 'string') {
	throw new Error('No API keys set!');
}

async function getGithubEndpoint(...args) {
	try {
		return await axios.get(...args);
	} catch(error) {
		// if 'Forbidden', assume hit rate limit
		if(error.response.status === 403) {
			// time to reset + random timeout to avoid multiple workers hitting at once
			const timeout = ((Number(error.response.headers['x-ratelimit-reset']) * 1000) - Date.now()) + (Math.random() * 10000);

			console.log(`Rate limit reached. Waiting ${Math.floor(timeout / 1000)} seconds.`);
			await new Promise(resolve => setTimeout(resolve, timeout));

			// retry
			return getGithubEndpoint(...args);
		}

		throw error;
	}
}

async function getRepos({ username }) {
	const repos = [];

	// pull repository pages
	for(let i = 1; ; i++) {
		const {data} = await getGithubEndpoint(`https://api.github.com/users/${username}/repos`, {
			params: {
				page: i,
				per_page: 100,
				client_id,
				client_secret
			}
		});

		// if page is empty break
		if(data.length === 0) {
			break;
		}

		repos.push(...data);
	}

	return repos;
}

async function cloneUser({ username, lastSynced }) {
	// get list of repositories from Github API
	const repos = await getRepos({ username });
	let storageDelta = 0;

	console.log(username, 'has', repos.length, 'repositories');

	for(const repo of repos) {
		const lastUpdated = new Date(repo.updated_at);

		console.log(repo.full_name, { lastUpdated, lastSynced, updated_at: repo.updated_at });

		// skip if repository hasn't been updated since last sync
		if(lastUpdated < lastSynced) {
			continue;
		}

		const repoPath = `${__dirname}/repos/${repo.full_name}`;

		try {
			await fs.stat(repoPath);
			await execa('rm', [ '-rf', repoPath ]);
		} catch(err) {

		}

		console.log(repo.full_name, 'cloning');

		try {
			await execa('git', [ 'clone', '-q', repo.git_url, repoPath]);
		} catch(err) {
			console.log(repo.full_name, 'clone failed');
		}

		const repoZip = `${repoPath}.zip`;

		// delete if zip already exists
		try {
			await fs.stat(repoZip);
			await fs.unlink(repoZip)
		} catch(err) {

		}

		// only create zip if repo not empty
		let cloned = false;

		try {
			await fs.stat(repoPath);
			cloned = true;
		} catch(err) {

		}

		// make zip
		if(cloned === true) {
			console.log(repo.full_name, 'zipping');
			await execa('zip', [ '-r', repoZip, './' ], {
				cwd: repoPath
			});
		}

		console.log(repo.full_name, 'mkdir storj parent directory');

		const storjZip = `github.com/${repo.full_name}.zip`;

		try {
			// remove old zip from total storage usage
			const [ {size} ] = await storj.ls(storjZip);

			if(typeof size === 'number') {
				storageDelta -= size;
			}
		} catch(err) {

		}

		for (let retries = 3; retries > 0; retries--) {
			try {
				const stat = await fs.stat(repoZip);
				const rate = 1000.0 / (100 * 1024); // 100KiB per second
				const minT = 60 * 1000; // Give at least 60 seconds to finish
				const maxT = 4 * 60 * 60 * 1000; // No more than 4 hours

				const timeout = Math.min(stat.size * rate + minT, maxT);

				console.log(repo.full_name, 'copy zip to storj', retries, stat.size, timeout);

				const copy = storj.cp(repoZip, storjZip);

				setTimeout(() => {
					copy.cancel();
				}, timeout);

				await copy;

				break;
			} catch(err) {
				console.log(repo.full_name, 'failed, retrying...', err);

				if(retries === 1) {
					throw new Error('Failed to copy to Storj');
				}
			}
		}

		// add new zip to total storage usage
		const {size} = await fs.stat(repoZip);
		storageDelta += size;

		console.log(repo.full_name, 'cleaning up');
		await execa('rm', [ '-rf', repoZip ]);
		await execa('rm', [ '-rf', repoPath ]);

		console.log(repo.full_name, 'done');
	}

	// wait 5 seconds after each user
	await new Promise(resolve => setTimeout(resolve, 5000));

	return {
		totalRepos: repos.length,
		storageDelta
	};
}

(async () => {
	// wait random amount to avoid instantaneous parallel requests
	await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 60000)));

	const lockClient = axios.create({
		baseURL: process.env.SERVER_URL || 'http://localhost:8000',
		timeout: 1000,
		headers: {
			'X-Worker-Token': process.env.WORKER_TOKEN
		}
	});

	for(; ;) {
		// get already locked user
		const username = (await lockClient.post('/lock')).data;

		try {
			// make loop in background to re-instantiate lock every 5 seconds
			const updateLock = setInterval(async () => {
				await lockClient.post(`/lock/${username}`);
			}, 5000);

			// find out when user was last synced
			const _lastSynced = (await lockClient.get(`/lock/${username}/last_synced`)).data;
			const lastSynced = new Date(_lastSynced);

			// sync user
			const {
				totalRepos,
				storageDelta
			} = await (async () => {
				try {
					return await cloneUser({ username, lastSynced })
					await execa('rm', [ '-rf', `${__dirname}/repos/${username}` ]);
				} catch(error) {
					console.log(`Caught sync failure of '${username}', cleaning up`);
					await execa('rm', [ '-rf', `${__dirname}/repos/${username}` ]);

					throw error;
				}
			})();

			// stop updating lock
			clearInterval(updateLock);

			// free lock and submit total amount of repositories
			await lockClient.post(`/lock/${username}/complete`, null, {
				params: {
					totalRepos,
					storageDelta
				}
			});
		} catch(error) {
			console.log(error);

			// set user to 'error' status
			await lockClient.post(`/lock/${username}/error`);
		}
	}
})();
