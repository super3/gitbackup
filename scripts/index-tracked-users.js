const redis = require('../redis');
const search = require('../search');

(async () => {
	let counter = 0;

	for(let cursor = 0; ;) {
		const [newCursor, _users] = await redis.zscan('tracked', cursor, 'COUNT', '1000');

		const users = _users.filter((element, index) => index % 2 === 0);

		for(const user of users) {
			await search.index(user);
		}

		cursor = newCursor;
		counter += users.length;

		console.log(`Indexed ${counter} users`);

		if(cursor === 0) {
			return;
		}
	}
})();
