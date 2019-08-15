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

router.get('/users/:partialUser', async ctx => {
	ctx.body = await partialUserSearch(ctx.params.partialUser);
});

router.get('/isvaliduser/:partialUser', async ctx => {
	try {
		await axios.get(`https://github.com/${ctx.params.partialUser}`);
		ctx.body = 'true';
	} catch(error) {
		ctx.body = 'false';
	}
});

app
	.use(router.routes())
	.use(router.allowedMethods())
	.use(require('koa-static')(`./`));

app.listen(PORT, () => {
	console.log('Server running on port ' + PORT + '...');
});
