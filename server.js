const fs = require('fs').promises;
const Koa = require('koa');
const Router = require('koa-router');
const axios = require('axios');
const koaSend = require('koa-send');
const prettyBytes = require('pretty-bytes');
const humanNumber = require('human-number');
const redis = require('./redis.js');

const app = module.exports = new Koa();
const router = new Router();
const PORT = 8000;

async function partialUserSearch(input) {
	return redis.smembers(`index:${input}:users`);
}

async function githubUserExists(partialUser) {
	try {
		await axios.get(`https://github.com/${partialUser}`);
		return true;
	} catch(error) {
		return false;
	}
}

router.get('/autocomplete/:partialUser', async ctx => {
	ctx.body = await partialUserSearch(ctx.params.partialUser);
});

router.get('/isvaliduser/:partialUser', async ctx => {
	ctx.body = await githubUserExists(ctx.params.partialUser);
});

router.get('/adduser/:user', async ctx => {
	const userExists = await githubUserExists(ctx.params.user);

	if (userExists) {
		 const added = await redis.sadd('tracked', ctx.params.user) === 1;
		 ctx.body = added ? 'added' : 'exists';
	} else {
		ctx.throw(500, "User/organization doesn't exist!");
	}
});

router.get('/user/:user/repos', async ctx => {
	const path = `${__dirname}/repos/${ctx.params.user}`;

	const files = await fs.readdir(`${__dirname}/repos/${ctx.params.user}`);

	// filter only directories
	const repos = (await Promise.all(files.map(async file => {
		const stat = await fs.stat(`${path}/${file}`);

		return stat.isDirectory() ? file : false;
	}))).filter(file => file !== false);

	ctx.body = repos;
});

router.get('/userlist/:page', async ctx => {
	const allUsers = await redis.smembers('tracked');
	const total = Number(await redis.scard('tracked'));

	const perPage = 6;
	const totalPages = Math.ceil(total / perPage);
	const page = Number(ctx.params.page);

	allUsers.sort();

	const {filter} = ctx.query;

	const filteredUsers = typeof filter === 'string' ? allUsers.filter(user => user.includes(filter)) : allUsers;

	const users = await Promise.all(filteredUsers.slice(page * perPage, (page + 1) * perPage).map(async username => ({
		username,
		totalRepos: Number(await redis.get(`user:${username}:total_repos`)),
		status: await redis.get(`user:${username}:status`) || 'unsynced'
	})));

	ctx.body = JSON.stringify({
		users,
		total,
		totalPages,
		perPage
	}, null, '\t');
});

router.get('/actorlogins', async ctx => {
	const users = await redis.smembers('tracked');

	users.sort();

	ctx.body = users.map(actor_login => JSON.stringify({actor_login})).join('\n');
});

router.get('/adduser/:user', async ctx => {
	if(await githubUserExists(ctx.params.user)) {
		await redis.sadd('tracked', ctx.params.user);
	}
});

router.get('/stats', async ctx => {
	ctx.body = {
		storage: prettyBytes(Number(await redis.get('stats:storage'))),
		files: humanNumber(Number(await redis.get('stats:files')), n => Number.parseFloat(n).toFixed(1)),
		repos: humanNumber(Number(await redis.get('stats:repos')), n => Number.parseFloat(n).toFixed(1)),
		users: humanNumber(Number(await redis.get('stats:users')), n => Number.parseFloat(n).toFixed(0))
	};
});

router.get('/repos/*/(.*)', async ctx => koaSend(ctx, ctx.path.slice(6), {
	root: `${__dirname}/repos`,
	maxAge: 0
}));

app
	.use(router.routes())
	//.use(router.allowedMethods())
	.use(require('koa-static')(`${__dirname}/www`));

app.listen(PORT, () => {
	console.log('Server running on port ' + PORT + '...');
});
