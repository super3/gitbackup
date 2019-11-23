const crypto = require('crypto');

module.exports = {
	encode(username) {
		const hash = crypto.createHash('sha256');

		hash.update(username);

		const digest = hash.digest('hex');

		const dirs = [];

		for(let i = 0; i < 4; i++) {
			dirs.push(digest.slice(i * 2, (i + 1) * 2));
		}

		dirs.push(username);

		return dirs.join('/');
	},

	decode(path) {
		const username = path.split('/').pop();
		const derivedPath = this.encode(username);

		if(path !== derivedPath) {
			throw new Error(`Failed to recreate same path: ${JSON.stringify(path)} => ${JSON.stringify(derivedPath)}`);
		}

		return username;
	}
};
