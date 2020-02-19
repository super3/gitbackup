<template>
	<div class="login">
		<a v-bind:href="authorizeUrl" class="btn btn-large btn-success"><i class="fab fa-github"></i> Login with GitHub</a>
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
module.exports = {
	data: () => ({
		clientId: 'd907d5253811062b6d1f',
		redirectUri: window.location.href
	}),
	computed: {
		authorizeUrl() {
			return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectUri}`;
		}
	}
};
</script>
