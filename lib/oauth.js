const axios = require('axios');

module.exports = {
	async getAccessToken(code) {
		const {data:{access_token}} = await axios.post('https://github.com/login/oauth/access_token', {
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET,
			code
		}, {
			headers: {
				Accept: 'application/json'
			}
		});

		return access_token;
	},

	async getUser(accessToken) {
		 const {data} = await axios.get('https://api.github.com/user', {
			 headers: {
				 Authorization: `token ${accessToken}`
			 }
		 });

		 return data;
	}
};
