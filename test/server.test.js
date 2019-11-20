const assert = require('assert');
const axios = require('axios');
const redis = require('../redis');
const app = require('../server');

const client = axios.create({
	baseURL: 'http://localhost:8000/',
	timeout: 10000
});

client.defaults.validateStatus = function () {
    return true;
};

jest.setTimeout(30 * 1000);

test('/', async () => {
	const response = await client.get('/');
	expect(response.status).toBe(200);
});

test('/isvaliduser bad user', async () => {
	const response = await client.get('/isvaliduser/not_real_user___');
	expect(response.data).toBe(false);
});

test('/isvaliduser real user #1', async () => {
	const response = await client.get('/isvaliduser/super3');
	expect(response.data).toBe(true);
});

test('/adduser bad user', async () => {
	const response = await client.get('/adduser/not_valid_user__');
	expect(response.status).toBe(500);
});

test('/adduser real user #1', async () => {
	const response = await client.get('/adduser/super3');
	expect(response.status).toBe(200);
});

test('/adduser real user #2', async () => {
	const response = await client.get('/adduser/montyanderson');
	expect(response.status).toBe(200);
});

test('/adduser real user #3', async () => {
	const response = await client.get('/adduser/calebcase');
	expect(response.status).toBe(200);
});

test('/adduser real user #4', async () => {
	const response = await client.get('/adduser/stefanbenten');

	expect(response.status).toBe(200);
});

test('/userlist', async () => {
	const response = await client.get('/userlist/0');
	expect(response.status).toBe(200);
});

test('/userlist', async () => {
	const response = await client.get('/userlist/0');
	expect(response.status).toBe(200);
});

test('/userlist search', async () => {
	const response = await client.get('/userlist/0', {
		params: {
			filter: 'super'
		}
	});

	expect(response.data.users).toStrictEqual([
		{
			"username": "super3",
			"totalRepos": 0,
			"status": "unsynced"
		}
	]);
});

test('/actorlogins', async () => {
	const response = await client.get('/actorlogins');
	expect(response.status).toBe(200);
});

test('/stats', async () => {
	const response = await client.get('/actorlogins');
	expect(response.status).toBe(200);
});

test('/lock bad worker key', async () => {
	const response = await client.post('/lock', null, {
		headers: {
			'X-Worker-Token': 'bad token here'
		}
	});

	expect(response.status).toBe(400);
});

test('/lock good worker key', async () => {
	// Bad worker key

	const tokens = await redis.hgetall('worker-token');

	for(const token in tokens) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		expect(response.status).toBe(200);

		return;
	}
});
