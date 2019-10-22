const redis = require('./redis');

class Search {
	static toChunks(item) {
		item = item.toLowerCase();

		const chunks = [];

		for(let i = 0; i < item.length; i++) {
			chunks.push(item.slice(0, i));
		}

		return chunks;
	}

	constructor({ name, results }) {
		this.name = name;
		this.results = results;
	}

	async index(item) {
		const chunks = Search.toChunks(item);

		for(const chunk of chunks) {
			const key = `search:${this.name}:q:${chunk}`;

			if(await redis.scard(key) < this.results) {
				await redis.sadd(key, item);
			}
		}
	}

	async query(input) {
		const key = `search:${this.name}:q:${input.toLowerCase()}`;

		return await redis.smembers(key);
	}
}

module.exports = new Search({
	name: 'tu',
	results: 6
});
