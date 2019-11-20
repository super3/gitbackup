const assert = require('assert');
const axios = require('axios');
const redis = require('../redis');
const uplink = require('../lib/uplink');
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

/*
test('/isvaliduser blank username', async () => {
	const response = await client.get('/isvaliduser/ ');
	expect(response.data).toBe(false);
});
*/

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

test('/adduser real user #1 (duplicate)', async () => {
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

test('/userlist search with exact match', async () => {
	const response = await client.get('/userlist/0', {
		params: {
			filter: 'super3'
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

// locks

async function removeAllLocks() {
	for(const lock of await redis.keys('lock:*')) {
		await redis.del(lock);
	}
}

async function getWorkerToken() {
	const [token] = Object.keys(await redis.hgetall('worker-token'));

	return token;
}

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

test('/lock throw error after all users locked', async () => {
	const token = await getWorkerToken();
	await removeAllLocks();

	for(let i = 0; i < await redis.zcard('tracked'); i++) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		expect(response.status).toBe(200);
	}

	const response = await client.post('/lock', null, {
		headers: {
			'X-Worker-Token': token
		}
	});

	expect(response.status).toBe(500);
});

test('/lock/:username', async () => {
	const token = await getWorkerToken();
	await removeAllLocks();

	const username = (await client.post('/lock', null, {
		headers: {
			'X-Worker-Token': token
		}
	})).data;

	await new Promise(resolve => setTimeout(resolve, 2000));
	const oldTTL = await redis.ttl(`lock:${username}`);

	await client.post(`/lock/${username}`, null, {
		headers: {
			'X-Worker-Token': token
		}
	});

	const newTTL = await redis.ttl(`lock:${username}`);

	expect(oldTTL).toBeLessThan(newTTL);
});

test('/lock/:username/success', async () => {
	const token = await getWorkerToken();
	await removeAllLocks();

	const lockedUsername = (await client.post('/lock', null, {
		headers: {
			'X-Worker-Token': token
		}
	})).data;

	for(;;) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		if(response.status === 500) {
			break;
		}

		expect(response.data).not.toBe(lockedUsername);
	}

	await client.post(`/lock/${lockedUsername}/complete`, null, {
		headers: {
			'X-Worker-Token': token
		}
	});

	let matches = 0;

	for(;;) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		if(response.status === 500) {
			break;
		}

		if(response.data === lockedUsername) {
			matches++;
		}
	}

	expect(matches).toBe(1);
});

test('/lock/:username/error', async () => {
	const token = await getWorkerToken();
	await removeAllLocks();

	const lockedUsername = (await client.post('/lock', null, {
		headers: {
			'X-Worker-Token': token
		}
	})).data;

	for(;;) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		if(response.status === 500) {
			break;
		}

		expect(response.data).not.toBe(lockedUsername);
	}

	await client.post(`/lock/${lockedUsername}/error`, null, {
		headers: {
			'X-Worker-Token': token
		}
	});

	let matches = 0;

	for(;;) {
		const response = await client.post('/lock', null, {
			headers: {
				'X-Worker-Token': token
			}
		});

		if(response.status === 500) {
			break;
		}

		if(response.data === lockedUsername) {
			matches++;
		}
	}

	expect(matches).toBe(1);
});

test('/user/:user/repos', async () => {
	uplink.ls = () => ([
		{ path: 'file-a.zip' },
		{ path: 'file-b.zip' },
		{ path: 'file-c.zip' },
		{ path: 'file-c.bundle' }
	]);

	const response = await client.get('/user/fake_user/repos');

	expect(response.data).toStrictEqual([
		'file-a',
		'file-b',
		'file-c'
	]);
});

test('/user/:user/repos', async () => {
	uplink.ls = () => ([
		{ path: 'file-a.zip' },
		{ path: 'file-b.zip' },
		{ path: 'file-c.zip' },
		{ path: 'file-c.bundle' }
	]);

	const response = await client.get('/user/fake_user/repos');

	expect(response.data).toStrictEqual([
		'file-a',
		'file-b',
		'file-c'
	]);
});

test('/repos/:user/:repo', async () => {
	const testValue = 'hello!';

	uplink.cat = () => testValue;

	const response = await client.get('/repos/fake_user/fake_repo');

	expect(response.data).toBe(testValue);
});
