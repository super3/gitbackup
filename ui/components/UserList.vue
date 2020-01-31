<template>
	<div>
		<div class="form-label-group">
			<input v-model="search" v-on:keydown="loadPage(0); checkUser();"  class="form-control search" required="" autofocus="" autocomplete="off" type="text" onsubmit="return false">

			<label for="inputEmail">Type in a GitHub username or organization...</label>
		</div>

		<ul class="list-group">
			<li v-if="search && exists !== true" class="list-group-item d-flex justify-content-between align-items-center">
				<span><i class="fas fa-user"></i> {{search}}</span>
				<button type="button" class="btn btn-sm btn-success" v-bind:disabled="!isValidUser" v-on:click="addUser">
					<i class="fas fa-plus"></i> Add
				</button>
			</li>

			<li v-for="user in users" class="list-group-item ">
				<div class="d-flex justify-content-between align-items-center">
					<span><i class="fas fa-user"></i> {{user.username | truncateUsername}}</span>

					<div class="btn-group" role="group" aria-label="Basic example">
						<router-link v-bind:to="'/user/' + user.username" tag="button" class="btn btn-sm btn-outline-dark">
							<i class="fas fa-code-branch"></i> View {{user.totalRepos}}/{{user.reportedRepos}} Repos
						</router-link>

						<button type="button" class="btn btn-sm" v-bind:class="{
							'btn-outline-success': user.status === 'synced',
							'btn-outline-warning': user.status === 'syncing',
							'btn-outline-danger': user.status === 'unsynced',
							'btn-outline-dark': user.status === 'error'
							}">
							<i class="fas fa-sync-alt"></i>

							<span v-if="user.status !== 'error' || user.error === 'true'">{{user.status | capitalize}}</span>
							<span v-else>{{user.error}}</span>
						</button>
					</div>
				</div>
			</li>
		</ul>

		<nav aria-label="Page navigation example">
			<ul class="pagination justify-content-center">
				<li class="page-item" v-bind:class="{ disabled: page === 0}">
					<a v-on:click="loadPage(page - 1)" class="page-link" href="#" tabindex="-1">Previous</a>
				</li>

				<li v-if="page === 0" class="page-item disabled"><a class="page-link" href="#">0</a></li>
				<li v-if="page === 0 && totalPages > 1" class="page-item"><a class="page-link" v-on:click="loadPage(1)" href="#">1</a></li>
				<li v-if="page === 0 && totalPages > 2" class="page-item"><a class="page-link" v-on:click="loadPage(2)" href="#">2</a></li>

				<li v-if="page !== 0 && page !== totalPages - 1" class="page-item"><a class="page-link" v-on:click="loadPage(page - 1)" href="#">{{page - 1}}</a></li>
				<li v-if="page !== 0 && page !== totalPages - 1 && totalPages > 1" class="page-item disabled"><a class="page-link" v-on:click="loadPage(page)" href="#">{{page}}</a></li>
				<li v-if="page !== 0 && page !== totalPages - 1 && totalPages > 2" class="page-item"><a class="page-link" v-on:click="loadPage(page + 1)" href="#">{{page + 1}}</a></li>

				<li v-if="page !== 0 && page === totalPages - 1" class="page-item"><a class="page-link" v-on:click="loadPage(page - 2)" href="#">{{page - 2}}</a></li>
				<li v-if="page !== 0 && page === totalPages - 1 && totalPages > 1" class="page-item"><a class="page-link" v-on:click="loadPage(page - 1)" href="#">{{page - 1}}</a></li>
				<li v-if="page !== 0 && page === totalPages - 1 && totalPages > 2" class="page-item disabled"><a class="page-link" v-on:click="loadPage(page)" href="#">{{page}}</a></li>

				<li class="page-item" v-bind:class="{ disabled: page + 1 == totalPages}">
					<a v-on:click="loadPage(page + 1)"  class="page-link" href="#">Next</a>
				</li>
			</ul>
		</nav>
	</div>
</template>

<script>
const axios = require('axios');

const capitalize = require('../lib/capitalize');

const CancelToken = axios.CancelToken;
const urlParams = new URLSearchParams(location.search);

let repoListTimeout;

module.exports = {
	data: () => ({
		search: '',
		isValidUser: false,
		users: [],
		page: 0,
		totalPages: 0,
		exists: false,
		cloneRepo: false,
		cancelPreviousCheckUser: null
	}),
	methods: {
		async checkUser() {
			if(this.search.trim().length < 1) {
				return;
			}

			if(this.cancelPreviousCheckUser !== null) {
				this.cancelPreviousCheckUser();
			}

			const {data} = await axios.get(`/isvaliduser/${this.search}`, {
				cancelToken: new CancelToken(c => this.cancelPreviousCheckUser = c)
			});

			this.isValidUser = data;
		},
		async addUser() {
			await axios.get(`/adduser/${this.search}`);
			await this.loadPage(this.page);
		},
		async loadPage(i) {
			i = typeof i !== 'undefined' ? i : this.page;

			const {data: {users, exists, total, totalPages}} = await axios.get(`/userlist/${i.toString()}`, {
				params: {
					filter: this.search
				}
			});

			this.users = users;
			this.exists = exists;
			this.page = i;
			this.totalPages = totalPages;
			this.totalUsers = total;
		}
	},
	filters: {
		capitalize,
		truncateUsername: function (value) {
			const length = 15;

			if(!value) return '';

			if(value.length < length) {
				return value;
			}

			return `${value.slice(0, length)}...`;
		}
	},
	async created() {
		this.loadPage(0);

		setInterval(() => {
			this.loadPage();
		}, 10 * 1000);
	}
};
</script>
