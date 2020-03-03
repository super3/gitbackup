<template>
	<div>
		<div v-if="repoList === false" style="text-align: center; padding: 2rem;">
			<p>Fetching {{username}}'s repos...</p>
			<div class="spinner-border" ></div>
		</div>

		<div v-else class="card">
			<div class="card-header justify-content-between align-items-center">
				<div class="row">
					<div class="col">
						<router-link to="/">
							<button class="btn btn-sm btn-outline-dark">
								<i class="fas fa-long-arrow-alt-left"></i>
								Back
							</button>
						</router-link>

						<!--<router-link v-bind:to="'/user/' + username + '/log'">-->
						<a v-bind:href="'/user/' + username + '/log'">
							<button class="btn btn-sm btn-outline-dark">
								View Log
							</button>
						</a>
						<!--</router-link>-->
					</div>

					<div class="col" style="text-align: center; padding-top: 3px;">
						<i class="fas fa-user"></i> {{username}}
					</div>

					<div class="col">
						<div class="btn-group float-right" role="group" aria-label="Basic example">
							<button type="button" class="btn btn-sm" v-bind:class="{
								'btn-outline-success': user.status === 'synced',
								'btn-outline-warning': user.status === 'syncing',
								'btn-outline-danger': user.status === 'unsynced',
								'btn-outline-dark': user.status === 'error'
								}">
								<i class="fas fa-sync-alt"></i> {{user.status | capitalize}}
							</button>
						</div>
					</div>
				</div>
			</div>

			<div class="col" style="text-align: center; padding-top: 10px;">
				<p>
					last synced
					<span v-if="user.lastSynced > 0">{{user.lastSynced | relativeDate }}</span>
					<span v-else>never</span>
				</p>
			</div>

			<ul class="list-group list-group-flush" style="padding-bottom: 0;">
				<li class="list-group-item" v-for="repo in repoList">
					{{repo}}

					<div class="float-right">
						<div>
							<a v-bind:href="repoZip(repo)">
								<button class="btn btn-sm btn-outline-dark"><i class="fas fa-download"></i> Download ZIP</button>
							</a>

							<a>
								<button class="btn btn-sm btn-outline-dark" v-on:click="cloneRepo = cloneRepo === repo ? false : repo"><i class="fas fa-download"></i> Clone Repo</button>
							</a>
						</div>
					</div>

					<div v-if="cloneRepo === repo" style="margin-bottom: 1rem">
						<hr>

						<label for="linuxCommand"><i class="fab fa-linux"></i> Linux / <i class="fab fa-apple"></i> Mac</label>

						<input id="linuxCommand" class="form-control" v-bind:value="linuxCommand(repo)">

						<label for="windowsCommand" style="margin-top: 0.5rem;"><i class="fab fa-windows"></i> Windows</label>
						<input id="windowsCommand" class="form-control" v-if="cloneRepo === repo" v-bind:value="windowsCommand(repo)">
					</div>
				</li>
			</ul>
		</div>
	</div>
</template>

<script>
const axios = require('axios');
const relativeDate = require('relative-date');

const capitalize = require('../lib/capitalize');

module.exports = {
	methods: {
		repoZip(repo) {
			return `/repos/${this.user.username}/${repo}.zip`;
		},
		linuxCommand(repo) {
			return `wget https://gitbackup.org/repos/${this.user.username}/${repo}.bundle && git clone ${repo}.bundle`;
		},
		windowsCommand(repo) {
			return `wget https://gitbackup.org/repos/${this.user.username}/${repo}.bundle -o ${repo}.bundle; git clone ${repo}.bundle`;
		}
	},
	computed: {
		username() {
			return this.$route.params.username;
		}
	},
	data: (() => ({
		cloneRepo: false,
		repoList: false,
		user: false,
		lastSynced: false
	})),
	filters: {
		capitalize,
		relativeDate
	},
	async created() {
		const {data: {users, exists, total, totalPages}} = await axios.get(`/userlist/0`, {
			params: {
				filter: this.username
			}
		});

		const reposResponse = await axios.get(`/user/${this.username}/repos`);

		this.user = users[0];
		this.repoList = reposResponse.data;
	}
};
</script>
