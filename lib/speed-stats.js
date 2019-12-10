const redis = require('../redis');

module.exports = {
	async setWorkerStat(stat, worker, value) {
		await redis.multi()
			.lpush(`speed-stats:${stat}:${worker}`, value)
			.ltrim(`speed-stats:${stat}:${worker}`, 0, 9)
			.exec();
	},

	async getWorkerStat(stat, worker) {
		const values = await redis.lrange(`speed-stats:${stat}:${worker}`, 0, -1);

		let smoothValue = 0;

		for(const value of values) {
			smoothValue += Number(value);
		}

		smoothValue /= values.length;

		return smoothValue;
	},

	async getStat(stat) {
		const workers = await redis.zrangebyscore('active-workers', Date.now() - 3600000, '+inf');

		const values = await Promise.all(workers.map(worker => this.getWorkerStat(stat, worker)));

		let sum = 0;

		for(const value of values) {
			sum += Number(value);
		}

		return sum;
	}
}
