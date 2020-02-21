<template>
	<div class="login">
		<a v-if="user === undefined" v-bind:href="authorizeUrl" v-bind:disabled="loading" class="btn btn-large btn-success"><i class="fab fa-github"></i> Login with GitHub</a>
		<a v-else class="btn btn-large btn-primary white-text"><i class="fab fa-github"></i> {{user.login}}</a>
	</div>
</template>

<style scoped>
.login {
	position: fixed;
	top: 0;
	right: 0;

	padding: 5rem;
}
</style>

<script>
const axios = require('axios');

module.exports = {
	data: () => ({
		clientId: 'd907d5253811062b6d1f',
		redirectUri: window.location.href.split('?')[0],
		loading: false,
		user: undefined
	}),
	computed: {
		authorizeUrl() {
			return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectUri}`;
		}
	},
	async created() {
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');

		if(typeof code === 'string' && code.length > 0) {
			this.loading = true;

			const { data: { user } } = await axios.post('/login', undefined, {
				params: {
					code
				}
			});

			this.loading = false;
			this.user = user;
		}
	}
};
</script>
