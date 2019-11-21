const os = require('os');
const fs = require('fs').promises;
const {createWriteStream} = require('fs');
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

async function storjUpload(source, target) {
	var err = null;

	let retries;

	for(retries = 3; retries > 0; retries--) {
		err = null;

		try {
			const stat = await fs.stat(source);
			const rate = 1000.0 / (100 * 1024); // 100KiB per second
			const minT = 60 * 1000; // Give at least 60 seconds to finish
			const maxT = 4 * 60 * 60 * 1000; // No more than 4 hours

			const timeout = Math.min(stat.size * rate + minT, maxT);

			const copy = storj.cp(source, target);

			setTimeout(() => {
				copy.cancel();
			}, timeout);

			await copy;

			break;
		} catch(e) {
			err = e;
		}
	}

	if (err != null || retries === 0) {
		console.log(err);
		throw new Error('Failed to copy to Storj');
	}
}

async function storjSize(path) {
	try {
		const [{size}] = await storj.ls(path);

		if(typeof size === 'number') {
			return size;
		}
	} catch(err) {

	}

	return 0;
}

async function cloneUser({ username, lastSynced }) {
	// get list of repositories from Github API
	const repos = await getRepos({ username });
	let storageDelta = 0;
	let totalUpload = 0;

	console.log(username, 'has', repos.length, 'repositories');

	for(const repo of repos) {
		const lastUpdated = new Date(repo.updated_at);

		console.log(repo.full_name, { lastUpdated, lastSynced, updated_at: repo.updated_at });

		// skip if repository hasn't been updated since last sync
		if(lastUpdated < lastSynced) {
			continue;
		}

		const repoPath = `${__dirname}/repos/${repo.full_name}`;
		const repoBundlePath = `${repoPath}.bundle`;
		const repoZipPath = `${repoPath}.zip`;

		// Purge any existing data if it exists.
		await execa('rm', ['-rf', repoZipPath]);
		await execa('rm', ['-rf', repoBundlePath]);
		await execa('rm', ['-rf', repoPath]);

		// Create bundle:
		console.log(repo.full_name, 'cloning');

		try {
			await execa('git', ['clone', '--mirror', repo.git_url, repoPath]);
			await execa('git', ['bundle', 'create', repoBundlePath, '--all'], {
				cwd: repoPath,
			});
		} catch(err) {
			console.log(repo.full_name, 'clone failed');
			continue;
		}

		// Download zip:
		console.log(repo.full_name, 'downloading zip');

		const {data} = await axios.get(`${repo.html_url}/archive/master.zip`, {
			responseType: 'stream',
		});

		data.pipe(createWriteStream(repoZipPath));

		console.log(repo.full_name, 'mkdir storj parent directory');

		const storjBundlePath = `github.com/${repo.full_name}.bundle`;
		const storjZipPath = `github.com/${repo.full_name}.zip`;

		// Remove old sizes from total storage delta:
		storageDelta -= await storjSize(storjBundlePath);
		storageDelta -= await storjSize(storjZipPath);

		// Try to upload the files:
		await storjUpload(repoBundlePath, storjBundlePath);
		await storjUpload(repoZipPath, storjZipPath);

		// Update total storage usage delta:
		storageDelta += (await fs.stat(repoBundlePath)).size;
		storageDelta += (await fs.stat(repoZipPath)).size;

		// Update total upload
		totalUpload += (await fs.stat(repoBundlePath)).size;
		totalUpload += (await fs.stat(repoZipPath)).size;

		console.log(repo.full_name, 'cleaning up');
		await execa('rm', [ '-rf', repoBundlePath ]);
		await execa('rm', [ '-rf', repoZipPath ]);
		await execa('rm', [ '-rf', repoPath ]);

		console.log(repo.full_name, 'done');
	}

	// wait 5 seconds after each user
	await new Promise(resolve => setTimeout(resolve, 5000));

	return {
		totalRepos: repos.length,
		storageDelta,
		totalUpload
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
			const startTime = Date.now();

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
				storageDelta,
				totalUpload
			} = await (async () => {
				try {
					return await cloneUser({ username, lastSynced })
				} catch(error) {
					console.log(`Caught sync failure of '${username}', cleaning up`);
					await execa('rm', [ '-rf', `${__dirname}/repos/${username}` ]);

					throw error;
				}
			})();

			await execa('rm', [ '-rf', `${__dirname}/repos/${username}` ]);

			// stop updating lock
			clearInterval(updateLock);

			// free lock and submit total amount of repositories
			await lockClient.post(`/lock/${username}/complete`, null, {
				params: {
					totalRepos,
					storageDelta
				}
			});

			const userTime = Date.now() - startTime;

			const worker_id = `${os.hostname()}-${process.env.pm_id}`;

			const users_per_minute = 60000 / userTime;
			const repos_per_minute = users_per_minute * totalRepos;
			const bytes_per_minute = users_per_minute * totalUpload;

			await lockClient.post('/worker/push_stats', null, {
				params: {
					worker_id,
					users_per_minute,
					repos_per_minute,
					bytes_per_minute
				}
			});
		} catch(error) {
			console.log(error);

			// set user to 'error' status
			await lockClient.post(`/lock/${username}/error`);
		}
	}
})();
