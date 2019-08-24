const scraper = require('../');
const redis = require('../redis');

test('toSubstrings', () => {
	expect(scraper.toSubstrings('test')).toStrictEqual([ '', 't', 'te', 'tes' ])
});

test('indexUser', async () => {
	await scraper.indexUser('testusername');
});
