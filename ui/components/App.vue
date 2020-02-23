<template>
	<div>
		<github-login></github-login>

		<div class="text-center mb-4">
			<router-link to="/">
				<img class="mb-4" src="./assets/logo.svg" alt="" width="72" height="72">
				<h1 class="h3 mb-3 font-weight-normal">GitBackup</h1>
			</router-link>

			<p>We backup and archive <a href="https://github.com">GitHub</a>. Currently tracking <span v-if="stats">{{stats.total}}</span> users/orgs.</p>
		</div>

		<router-view></router-view>

		<p class="mt-5 mb-3 text-muted text-center">
			<span v-if="stats">Storing {{stats.storage}}, {{stats.repos}} repositories, and {{stats.users}} users<br></span>
			<span v-if="stats">{{stats.bytesPerMinute}}/min, {{stats.reposPerMinute}} repos/min, {{stats.usersPerMinute}} users/min<br></span>
			<span>Built by <a href="https://github.com/super3">@super3</a>, <a href="https://github.com/montyanderson">@montyanderson</a>, and <a href="https://github.com/calebcase">@calebcase</a><br></span>
		</p>
	</div>
</template>

<script>
const axios = require('axios');

const GithubLogin = require('./GithubLogin.vue');

module.exports = {
	data: () => ({
		stats: null
	}),
	methods: {
		async loadStats() {
			const {data} = await axios.get('/stats');

			this.stats = data;
		}
	},
	components: {
		GithubLogin
	},
	async created() {
		this.loadStats();

		setInterval(() => {
			this.loadStats();
		}, 10 * 1000);
	}
};
</script>
