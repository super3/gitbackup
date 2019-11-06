const fs = require('fs').promises;
const execa = require('execa');
const redis = require('../redis');

(async () => {
	let syncedUsers;

	const chunkSize = 100;
	let total = 0;

	for(let i = 0; ; i += chunkSize) {
		syncedUsers = await redis.zrangebyscore('tracked', '1', '+inf', 'LIMIT', i, chunkSize);

		if(syncedUsers.length === 0) {
			break;
		}

		for(const user of syncedUsers) {
			const {stdout} = await execa('du', ['-sb', `/storj/github.com/${user}`]);
			const size = Number(stdout.split(' ')[0]);

			if(isNaN(size) === true) {
				throw new Error(`bad du output: ${stdout}`);
			}

			output += total;

			// rate limit
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		console.log('running total', total);
	}

	await redis.set('stats:storage', total);

	process.exit(0);
})();
