const Vue = require('vue');
const Router = require('vue-router');

const App = require('./components/App.vue');
const UserList = require('./components/UserList.vue');
const UserPage = require('./components/UserPage.vue');

Vue.use(Router);

const router = new Router({
	routes: [
		{
			path: '/',
			component: UserList
		},
		{
			path: '/user/:username',
			component: UserPage
		}
	]
});

new Vue({
	el: '#app',
	components: {
		App
	},
	render: createElement => createElement('app'),
	router
});
