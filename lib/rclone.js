const execa = require('execa');

const binaryPath = `/usr/bin/rclone`;

module.exports = {
	async ls(path) {
		path = path.slice(5);

		const {stdout} = await execa(binaryPath, [ path ]);

		const data = JSON.parse(stdout);
	}
};
