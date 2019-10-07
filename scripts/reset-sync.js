const fs = require('fs');
const redis = require('../redis');

(async () => {
	await redis.zunionstore('tracked', 1, 'tracked', 'WEIGHTS', 0);

	process.exit(0);
})();
