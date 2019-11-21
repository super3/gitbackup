const Koa = require('koa');
const Router = require('koa-router');
const axios = require('axios');
const prettyBytes = require('pretty-bytes');
const humanNumber = require('human-number');
const df = require('@sindresorhus/df');
const redis = require('./redis');
const search = require('./search');
const uplink = require('./lib/uplink');

const app = module.exports = new Koa();
const router = new Router();
const PORT = process.env.PORT || 8000;

async function githubUserExists(partialUser) {
	/* istanbul ignore next */
	if(partialUser.trim() === '') {
		return false;
	}

	try {
		await axios.get(`https://github.com/${partialUser}`);
		return true;
	} catch(error) {
		return false;
	}
}

router.get('/isvaliduser/:partialUser', async ctx => {
	ctx.body = await githubUserExists(ctx.params.partialUser);
});

router.get('/adduser/:user', async ctx => {
	const userExists = await githubUserExists(ctx.params.user);

	if(userExists === true) {
		 const added = await redis.zadd('tracked', 'NX', -1, ctx.params.user) === 1;
		 await search.index(ctx.params.user);
		 ctx.body = added ? 'added' : 'exists';
	} else {
		ctx.throw(500, "User/organization doesn't exist!");
	}
});

router.get('/user/:user/repos', async ctx => {
	const files = await uplink.ls(`sj://github.com/${ctx.params.user}`);
	const repos = new Set(files.map(file => file.path.split('.').slice(0, -1).join('.')));

	ctx.body = [...repos];
});

router.get('/repos/:user/:repo', async ctx => {
	ctx.set('Content-Type', 'application/zip');

	const path = `sj://github.com/${ctx.params.user}/${ctx.params.repo}`;
	console.log(path);

	if(path.endsWith('.zip') === true) {
		ctx.set('Content-Type', 'application/zip');
	}

	if(path.endsWith('.bundle') === true) {
		ctx.set('Content-Type', 'application/x-git');
	}

	ctx.body = uplink.cat(path);
});

router.get('/userlist/:page', async ctx => {
	const total = Number(await redis.zcard('tracked'));

	const perPage = 6;
	const page = Number(ctx.params.page);

	const filter = typeof ctx.query.filter === 'string' ? ctx.query.filter : '';
	const exists = typeof await redis.zscore('tracked', filter) === 'string';

	const getSearchResults = async () => {
		const results = await search.query(filter);

		if(exists === true) {
			results.unshift(filter);
		}

		return results;
	};

	const getPage = async () => await redis.zrevrangebyscore('tracked', '+inf', '-inf', 'LIMIT', page * perPage, perPage);

	const filteredUsers = filter.trim().length > 0
		? await getSearchResults()
		: await getPage();

	const totalPages = filter.trim().length > 0
		? 1
		: Math.ceil(total / perPage);

	const users = await Promise.all(filteredUsers.map(async username => ({
		username,
		totalRepos: Number(await redis.get(`user:${username}`)),
		status:
			// if locked
			await redis.exists(`lock:${username}`)
				? 'syncing'
				: (Number(await redis.zscore('tracked', username)) <= 0
					? 'unsynced'
					: ((await redis.exists(`user:${username}:error`))
						? 'error'
						: 'synced'
					)
				)
	})));

	ctx.body = JSON.stringify({
		users,
		exists,
		total,
		totalPages,
		perPage
	}, null, '\t');
});

router.get('/actorlogins', async ctx => {
	const users = await await redis.zrange('tracked', 0, -1);
	users.sort();

	ctx.body = users.map(actor_login => JSON.stringify({actor_login})).join('\n');
});

router.get('/stats', async ctx => {
	const {used} = await df.file(__dirname);

	const sumHash = async key => Object.values(await redis.hgetall(key)).reduce((a, b) => a + b);

	ctx.body = {
		storage: prettyBytes(Number(await redis.get('stats:storage')), n => Number.parseFloat(n).toFixed(1)),
		files: humanNumber(Number(await redis.get('stats:files')), n => Number.parseFloat(n).toFixed(1)),
		repos: humanNumber(Number(await redis.get('stats:repos')), n => Number.parseFloat(n).toFixed(1)),
		// users: humanNumber(Number(await redis.get('stats:users')), n => Number.parseFloat(n).toFixed(1))
		users: (await redis.zrangebyscore('tracked', 1, '+inf')).length,
		usersPerMinute: await sumHash('speed-stats:users_per_minute'),
		reposPerMinute: await sumHash('speed-stats:repos_per_minute'),
		bytesPerMinute: await sumHash('speed-stats:bytes_per_minute')
	};
});

router.use('/lock', async (ctx, next) => {
	const token = ctx.request.headers['x-worker-token'];

	if(await redis.hexists('worker-token', token) !== 1) {
		ctx.throw(400, 'Bad Worker Token');
	}

	await next();
});

router.post('/lock', async ctx => {
	let username;

	for(let i = 0; ; i++) {
		const [ _username ] = await redis.zrangebyscore('tracked', '-inf', '+inf', 'LIMIT', i, 1);

		if(typeof _username !== 'string') {
			throw new Error('All users synced!');
		}

		const locked = await redis.set(`lock:${_username}`, '1', 'EX', 10, 'NX') === 'OK';

		if(locked === true) {
			username = _username;
			break;
		}
	}

	ctx.set('Content-Type', 'application/json');
	ctx.body = JSON.stringify(username);
});

router.post('/lock/:username', async ctx => {
	await redis.expire(`lock:${ctx.params.username}`, 10);

	ctx.set('Content-Type', 'application/json');
	ctx.body = JSON.stringify(true);
});

router.post('/lock/:username/complete', async ctx => {
	await redis.multi()
		.del(`lock:${ctx.params.username}`)
		.zadd('tracked', 'XX', Date.now(), ctx.params.username)
		.del(`user:${ctx.params.username}:error`)
		.exec();

	const {totalRepos, storageDelta} = ctx.query;
	const oldTotal = await redis.getset(`user:${ctx.params.username}`, totalRepos) || 0;

	await redis.multi()
		.decrby('stats:repos', Number(oldTotal))
		.incrby('stats:repos', Number(totalRepos))
		.incrby('stats:storage', Number(storageDelta))
		.exec();

	ctx.set('Content-Type', 'application/json');
	ctx.body = JSON.stringify(true);
});

router.get('/lock/:username/last_synced', async ctx => {
	ctx.set('Content-Type', 'application/json');
	ctx.body = JSON.stringify(Math.max(Number(await redis.zscore('tracked', ctx.params.username)), 0));
});

router.post('/lock/:username/error', async ctx => {
	await redis.multi()
		.del(`lock:${ctx.params.username}`)
		.zadd('tracked', 'XX', Date.now(), ctx.params.username)
		.set(`user:${ctx.params.username}:error`, 'true')
		.exec();

	ctx.set('Content-Type', 'application/json');
	ctx.body = JSON.stringify(true);
});

router.post('/lock/push_stats', async ctx => {
	const {
		worker_id,
		users_per_minute,
		repos_per_minute,
		bytes_per_minute
	} = ctx.query;

	await redis.hset(`speed-stats:users_per_minute`, worker_id, users_per_minute);
	await redis.hset(`speed-stats:repos_per_minute`, worker_id, repos_per_minute);
	await redis.hset(`speed-stats:bytes_per_minute`, worker_id, bytes_per_minute);

	ctx.body = "";
});

app
	.use(router.routes())
	//.use(router.allowedMethods())
	.use(require('koa-static')(`${__dirname}/www`));

app.listen(PORT, '127.0.0.1', () => {
	console.log('Server running on port ' + PORT + '...');
});
