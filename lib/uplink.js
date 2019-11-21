/* istanbul ignore file */
const execa = require('execa');

const binaryPath = `${__dirname}/../bin/uplink_linux_amd64`;

module.exports = {
	async ls(path, recursive = true) {
		const args = [
			'ls',
			path
		];

		if(recursive === true) {
			args.push('--recursive');
		}

		const {stdout} = await execa(binaryPath, args);

		console.log('uplink ls output', stdout);

		return stdout.trim().split('\n')
			.map(line => line.split(' ').filter(part => part.length > 0))
			.map(([type, date, time, size, path]) => ({
				type,
				date: new Date(`${date} ${time}`),
				size: Number(size),
				path
			}))
			.filter(file => typeof file.path === 'string');
	},

	cat(path) {
		const args = [
			'cat',
			path
		];

		return execa(binaryPath, args).stdout;
	},

	async cp(file, dest) {
		const args = [
			'cp',
			file,
			path
		];

		return execa(binaryPath, args);
	}
};
