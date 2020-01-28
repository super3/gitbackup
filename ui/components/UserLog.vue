<template>
	<div class="card">
		<div class="card-header justify-content-between align-items-center">
			<div class="row">
				<div class="col">
					<router-link v-bind:to="'/user/' + username">
						<button class="btn btn-sm btn-outline-dark">
							<i class="fas fa-long-arrow-alt-left"></i>
							Back
						</button>
					</router-link>
				</div>

				<div class="col" style="text-align: center; padding-top: 3px;">
					<i class="fas fa-user"></i> {{username}}
				</div>

				<div class="col">
				</div>
			</div>
		</div>

		<pre>{{log}}</pre>
	</div>
</template>

<script>
const axios = require('axios');

module.exports = {
	computed: {
		username() {
			return this.$route.params.username;
		}
	},
	data: () => ({
		log: ''
	}),
	async created() {
		const {data} = await axios.get(`/user/${this.username}/log`);

		this.log = data;
	}
};
</script>
