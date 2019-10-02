const fs = require('fs').promises;
const axios = require('axios');
const git = require('nodegit');
const execa = require('execa');
const redis = require('./redis');

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

if(typeof client_id !== 'string' || typeof client_secret !== 'string') {
	throw new Error('No API keys set!');
}

(async () => {
	for(; ;) {
		const username = (await axios.post('http://localhost:8000/lock')).data;

		const updateLock = setInterval(async () => {
			await axios.post(`http://localhost:8000/lock/${username}`)
		}, 5000);

		const repos = [];

		// get all repositories

		for(let i = 1; ; i++) {
			const {data} = await axios.get(`https://api.github.com/users/${username}/repos`, {
				params: {
					page: i,
					per_page: 100,
					client_id,
					client_secret
				}
			});

			if(data.length === 0) {
				break;
			}

			repos.push(...data);
		}

		console.log(username, 'has', repos.length, 'repositories');

		for(const repo of repos) {
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
				await gitRepo.fetchAll();
			} else {
				// clone from fresh
				console.log(repo.full_name, 'cloning from fresh');
				await git.Clone(repo.git_url, repoPath);
			}

			const repoZip = `${repoPath}.zip`;

			try {
				await fs.stat(repoZip);
				await fs.unlink(repoZip)
			} catch(err) {

			}

			await execa('zip', [ '-r', repoZip, './' ], {
				cwd: repoPath
			});
		}

		await redis.set(`user:${username}:total_repos`, repos.length);

		clearTimeout(updateLock);
		await axios.post(`http://localhost:8000/lock/${username}/complete`);
	}
})();