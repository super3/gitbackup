/* istanbul ignore file */
const execa = require('execa');
const log = require('./worker-logger');

const binaryPath = `rclone`;

module.exports = {
	async ls(path) {
		const {stdout} = await execa(binaryPath, [ 'lsjson', `${path}`, '-R' ]);

		return JSON.parse(stdout).map(file => ({
			type: file.isDir === true ? 'PRE' : 'OBJ',
			date: new Date(file.ModTime),
			size: file.Size,
			path: file.Path
		}));
	},

	cat(path, stream = true) {
		const args = [
			'cat',
			path
		];

		const process = execa(binaryPath, args);

		return stream === true
			? process.stdout
			: process.then(({stdout}) => stdout);
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
