const fs = require('fs');
const redis = require('../redis');

(async () => {
	const users = await redis.zrangebyscore('tracked', '-inf', '+inf');
	const json = JSON.stringify(users);

	fs.writeFileSync(process.argv[2], json);

	process.exit(0);
})();
