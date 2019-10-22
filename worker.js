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

async function cloneUser({ username, lastSynced }) {
	const repos = [];

	// get all repositories

	for(let i = 1; ; i++) {
		try {
			const {data} = await axios.get(`https://api.github.com/users/${username}/repos`, {
				params: {
					page: i,
					per_page: 100,
					client_id,
					client_secret
				}
			});
		} catch(error) {
			console.log(error);

			const timeout = 5000 + Math.floor(Math.random() * 5000);
			console.log(`Request to Github failed. Waiting ${timeout / 1000} seconds.`);

			await new Promise(resolve => setTimeout(resolve, timeout));
			throw new Error('Request to Github failed');
		}

		if(data.length === 0) {
			break;
		}

		repos.push(...data);
	}

	console.log(username, 'has', repos.length, 'repositories');

	lastSynced = new Date(lastSynced);

	for(const repo of repos) {
		const lastUpdated = new Date(repo.updated_at);

		if(lastUpdated < lastSynced) {
			continue;
		}

		const repoPath = `${__dirname}/repos/${repo.full_name}`;

		let exists = true;

		try {
			await fs.stat(repoPath);
		} catch(err) {
			exists = false;
		}

		if(exists === true) {
			// already exists
			console.log(repo.full_name, 'already exists, fetching');

			const gitRepo = await git.Repository.open(`${repoPath}/.git`);

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

		try {
			await fs.stat(repoZip);
			await fs.unlink(repoZip)
		} catch(err) {

		}

		// only create zip if repo cloned (not empty)
		let cloned = false;

		try {
			await fs.stat(repoPath);
			cloned = true;
		} catch(err) {

		}

		if(cloned === true) {
			await execa('zip', [ '-r', repoZip, './' ], {
				cwd: repoPath
			});
		}

		if(STORJ === true) {
			await execa(`${__dirname}/uplink_linux_amd64`, [ 'cp', repoZip, `sj://gitbackup/${repo.full_name}.zip` ])
		}
	}

	/*
	const userPath = `${__dirname}/repos/${username}`;

	const totalSize = Number((await execa('du', [ '-sb', './' ], {
		cwd: userPath
	})).stdout.split('\t')[0]);

	console.log({totalSize});
	*/

	return {
		totalRepos: repos.length
	};
}

(async () => {
	await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 60000)));

	for(; ;) {
		const username = (await axios.post('http://localhost:8000/lock')).data;

		try {
			const lastSynced = (await axios.get(`http://localhost:8000/lock/${username}/last_synced`)).data;

			const updateLock = setInterval(async () => {
				await axios.post(`http://localhost:8000/lock/${username}`);
			}, 5000);

			const {
				totalRepos
			} = await cloneUser({ username, lastSynced });

			clearInterval(updateLock);

			await axios.post(`http://localhost:8000/lock/${username}/complete`, null, {
				params: {
					totalRepos
				}
			});
		} catch(error) {
			console.log(error);

			await axios.post(`http://localhost:8000/lock/${username}/error`);
		}
	}
})();
