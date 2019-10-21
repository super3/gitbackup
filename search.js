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

	async indexTrackedUsers() {
		for(let cursor = 0; ;) {
			const [newCursor, _users] = await redis.zscan('tracked', cursor)

			const users = _users.filter((element, index) => index % 2 === 0);

			for(const user of users) {
				await this.index(user);
			}
		}
	}

	async query(input) {
		const key = `search:${this.name}:q:${input}`;

		return await redis.smembers(key);
	}
}

module.exports = new Search({
	name: 'tu',
	results: 6
});
