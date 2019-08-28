const scraper = require('../');
const redis = require('../redis');

jest.setTimeout(30 * 1000);

test('toSubstrings', () => {
	expect(scraper.toSubstrings('test')).toStrictEqual([ '', 't', 'te', 'tes' ])
});

test('indexUser', async () => {
	await scraper.indexUser('testusername');

	expect(await redis.sismember('index:t:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:te:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:tes:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:test:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testu:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testus:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testuse:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testuser:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testusern:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testuserna:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testusernam:users', 'testusername')).toBe(1);
	expect(await redis.sismember('index:testusername:users', 'testusername')).toBe(1);

	await scraper.indexUser('testusername-1');
	await scraper.indexUser('testusername-2');
	await scraper.indexUser('testusername-3');
	await scraper.indexUser('testusername-4');
	await scraper.indexUser('testusername-5');

	expect(await redis.sismember('index:testusername-5:users', 'testusername')).toBe(0);
});

test('getUsers', async () => {
	const users = await scraper.getUsers(new Date('2019-07-25'));

	expect(users instanceof Set).toBe(true);
});
