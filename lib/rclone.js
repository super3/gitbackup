/* istanbul ignore file */
const execa = require('execa');

const binaryPath = `/usr/bin/rclone`;

module.exports = {
	async ls(path) {
		path = path.slice(5);

		const {stdout} = await execa(binaryPath, [ 'lsjson', `gitbackup:${path}`, '-R' ]);

		return JSON.parse(stdout).map(file => ({
			//type: file.isDir === true ? '',
			date: new Date(file.ModTime),
			size: file.Size,
			path: file.Path
		}));
	},

	/*
	cat(path) {
		const args = [
			'cat',
			`sj://${path}`
		];

		return execa(binaryPath, args).stdout;
	},
	*/

	cp(file, dest) {
		const args = [
			'copy',
			file,
			`gitbackup:${dest.split('/').slice(0, -1).join('/')}/`
		];

		console.log('execa', 'rclone', args);

		return execa(binaryPath, args);
	}
};
