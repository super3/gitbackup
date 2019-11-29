/* istanbul ignore file */
const execa = require('execa');
const log = require('./worker-logger');

const binaryPath = `/usr/bin/rclone`;

module.exports = {
	async ls(path) {
		path = path.slice(5);

		const {stdout} = await execa(binaryPath, [ 'lsjson', `${path}`, '-R' ]);

		return JSON.parse(stdout).map(file => ({
			type: file.isDir === true ? 'PRE' : 'OBJ',
			date: new Date(file.ModTime),
			size: file.Size,
			path: file.Path
		}));
	},

	cat(path) {
		const args = [
			'cat',
			path
		];

		return execa(binaryPath, args).stdout;
	},

	cp(file, dest) {
		const args = [
			'copy',
			file,
			`${dest.split('/').slice(0, -1).join('/')}/`
		];

		log.info('execa', 'rclone', args);

		return execa(binaryPath, args);
	}
};
