const axios = require('axios');
const app = require('../server');

const client = axios.create({
	baseURL: 'http://localhost:8000/',
	timeout: 10000
});

jest.setTimeout(30 * 1000);

test('/', async () => {
	const response = await client.get('/');

	expect(response.status).toBe(200);
});

test('/isvaliduser', async () => {
	const response = await client.get('/isvaliduser/not_real_user_');

	expect(response.data).toBe(false);
});

test('/isvaliduser', async () => {
	const response = await client.get('/isvaliduser/super3');

	expect(response.data).toBe(true);
});

test('/isvaliduser', async () => {
	const response = await client.get('/isvaliduser/not_valid_user__');

	expect(response.data).toBe(false);
});

test('/adduser', async () => {
	const response = await client.get('/adduser/super3');

	expect(response.status).toBe(200);
});

test('/userlist', async () => {
	const response = await client.get('/userlist/0');

	expect(response.status).toBe(200);
});

test('/actorlogins', async () => {
	const response = await client.get('/actorlogins');

	expect(response.status).toBe(200);
});

test('/stats', async () => {
	const response = await client.get('/actorlogins');

	expect(response.status).toBe(200);
});
