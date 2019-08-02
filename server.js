const Koa = require('koa');
const Router = require('koa-router');
const redis = require('./redis.js');

const app = new Koa();
const router = new Router();
const PORT = 8000;

async function partialUserSearch(input) {
	return redis.smembers(`index:${input}:users`);
}

router.get('/', ctx => {
	ctx.body = 'Hello World!';
});

router.get('/users/:partialUser', async ctx => {
	ctx.body = await partialUserSearch(ctx.params.partialUser);
});

app
	.use(router.routes())
	.use(router.allowedMethods());

app.listen(PORT, () => {
	console.log('Server running on port ' + PORT + '...');
});
