const crypto = require('crypto');
const redis = require('../redis');

const commands = {
	async generate(name = '') {
		const raw = crypto.randomBytes(32);
		const hash = crypto.createHash('sha256');
		hash.update(raw);

		const token = hash.digest('base64');

		await redis.hset('worker-token', token, name);

		console.log(token);
	},

	async list() {
		const tokens = await redis.hgetall('worker-token');

		for(const token in tokens) {
			console.log(token, tokens[token]);
		}
	},

	async delete(token) {
		await redis.hdel('worker-token', token);
	},

	async flush() {
		await redis.del('worker-token');
	}
};

commands[process.argv[2]](...process.argv.slice(3))
	.then(() => process.exit(0));
