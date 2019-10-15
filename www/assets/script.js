const CancelToken = axios.CancelToken;
const urlParams = new URLSearchParams(location.search);

const app = new Vue({
  el: '#app',
  data: {
	search: urlParams.get('q') || '',
	isValidUser: false,
	users: [],
	repos: {},
	page: 0,
	totalPages: 0,
	totalUsers: 0,
	cancelPreviousCheckUser: null,
	stats: null
  },
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

	  const {data: {users, total, totalPages}} = await axios.get(`/userlist/${i.toString()}`, {
		  params: {
			  filter: this.search
		  }
	  });

	  this.users = users;
	  this.page = i;
	  this.totalPages = totalPages;
	  this.totalUsers = total;
	},
	async loadRepos(user) {
		if(typeof this.repos[user.username] !== 'undefined') {
			this.repos = {};
			return;
		}

		const {data} = await axios.get(`/user/${user.username}/repos`);

		this.repos = {};
		this.repos[user.username] = data;
	},
	async loadStats() {
		const {data} = await axios.get('/stats');

		this.stats = data;
	}
},
filters: {
  capitalize: function (value) {
	  if (!value) return ''
	  value = value.toString()
	  return value.charAt(0).toUpperCase() + value.slice(1)
  },
  truncateUsername: function (value) {
	  const length = 50;

	  if(!value) return '';

	  if(value.length < length) {
		  return value;
	  }

	  return `${value.slice(0, length)}...`;
  }
}
});

app.loadPage(0);
app.loadStats();

setInterval(() => {
	app.loadPage(app.page);
	app.loadStats();
}, 10 * 1000);
