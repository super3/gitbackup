const fs = require('fs');
const redis = require('../redis');

(async () => {
	const json = fs.readFileSync(process.argv[2], 'utf8');

	const users = JSON.parse(json);

	for(const user of users) {
		await redis.zadd('tracked', 0, user);
	}

	process.exit(0);
})();
