const fs = require('fs');
const redis = require('../redis');

(async () => {
	await redis.multi()
		.zunionstore('tracked', 1, 'tracked', 'WEIGHTS', 0);
		.eval("local keys = redis.call('keys', ARGV[1]) \n for i=1,#keys,5000 do \n redis.call('del', unpack(keys, i, math.min(i+4999, #keys))) \n end \n return keys", 0, "user:*")
		.del("active-workers")
		.exec()

	process.exit(0);
})();
