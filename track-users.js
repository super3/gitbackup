const fs = require('fs');
const ndjson = require('iterable-ndjson');
const redis = require('./redis');

const file = process.argv[2];
const limit = Number(process.argv[3]) || Infinity;

(async () => {
	let i = 0;

	const source = fs.createReadStream(file);

	for await (const obj of ndjson.parse(source)) {
		if(i++ > limit) {
			break;
		}

		await redis.zadd('tracked', 'NX', 0, obj.actor_login);
	}

	process.exit(0);
})();
