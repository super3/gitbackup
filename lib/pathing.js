const crypto = require('crypto');

module.exports = {
	hash(input) {
		const hash = crypto.createHash('sha256');

		hash.update(input);

		return hash.digest();
	},
	getSatellite(digest) {
		const satellites = [
			[ 'asia-east-1', 0x55 ],
			[ 'europe-west-1', 0xaa ],
			[ 'us-central-1', 0xff ]
		];

		for(const [satellite, max] of satellites) {
			if(digest[0] <= max) {
				return satellite;
			}
		}
	},
	getDirectory(digest) {
		return [...digest.slice(0, 4)]
			.map(byte => byte.toString(16)).join('/');
	},
	encode(username) {
		const digest = this.hash(username);

		const satellite = this.getSatellite(digest);
		const directory = this.getDirectory(digest);

		return `${satellite}:/${directory}/${username}`;
	},
	decode(path) {
		const username = path.split('/').pop();
		const derivedPath = this.encode(username);

		if(path !== derivedPath) {
			throw new Error(`Failed to recreate path: ${JSON.stringify(path)} => ${JSON.stringify(derivedPath)}`);
		}

		return username;
	}
};
