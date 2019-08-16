const Koa = require('koa');
const Router = require('koa-router');
const axios = require('axios');
const redis = require('./redis.js');

const app = new Koa();
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

router.get('/users/:partialUser', async ctx => {
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

router.get('/userlist/:page', async ctx => {
	ctx.body = await redis.smembers('tracked');
});

app
	.use(router.routes())
	.use(router.allowedMethods())
	.use(require('koa-static')(`./`));

app.listen(PORT, () => {
	console.log('Server running on port ' + PORT + '...');
});
