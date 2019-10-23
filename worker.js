const fs = require('fs').promises;
const axios = require('axios');
const git = require('nodegit');
const execa = require('execa');

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const STORJ = 'STORJ' in process.env;

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

	console.log(username, 'has', repos.length, 'repositories');

	for(const repo of repos) {
		const lastUpdated = new Date(repo.updated_at);

		console.log({ lastUpdated, lastSynced, updated_at: repo.updated_at });

		// skip if repository hasn't been updated since last sync
		if(lastUpdated < lastSynced) {
			continue;
		}

		const repoPath = `${__dirname}/repos/${repo.full_name}`;

		let exists = true;

		// check if repository has been cloned before
		try {
			await fs.stat(repoPath);
		} catch(err) {
			exists = false;
		}

		if(exists === true) {
			// already exists
			console.log(repo.full_name, 'already exists, fetching');

			const gitRepo = await git.Repository.open(`${repoPath}/.git`);

			// fetch
			try {
				await gitRepo.fetchAll();
			} catch(err) {
				console.log('fetch failed');
			}
		} else {
			// clone from fresh
			console.log(repo.full_name, 'cloning from fresh');

			try {
				await git.Clone(repo.git_url, repoPath);
			} catch(err) {
				console.log('clone failed');
			}
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
			await execa('zip', [ '-r', repoZip, './' ], {
				cwd: repoPath
			});
		}

		// push to Storj
		if(STORJ === true) {
			await execa(`${__dirname}/uplink_linux_amd64`, [ 'cp', repoZip, `sj://gitbackup/${repo.full_name}.zip` ])
		}
	}

	// wait 5 seconds after each user
	await new Promise(resolve => setTimeout(resolve, 5000));

	return {
		totalRepos: repos.length
	};
}

(async () => {
	// wait random amount to avoid instantaneous parallel requests
	await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 60000)));

	const lockClient = axios.create({
		baseURL: 'http://localhost:8000',
		timeout: 1000
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
				totalRepos
			} = await cloneUser({ username, lastSynced });

			// stop updating lock
			clearInterval(updateLock);

			// free lock and submit total amount of repositories
			await lockClient.post(`/lock/${username}/complete`, null, {
				params: {
					totalRepos
				}
			});
		} catch(error) {
			console.log(error);

			// set user to 'error' status
			await lockClient.post(`/lock/${username}/error`);
		}
	}
})();
