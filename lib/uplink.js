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

		return stdout.split('\n')
			.map(line => line.split(' ').filter(part => part.length > 0))
			.map(([type, date, time, size, path]) => ({
				type,
				date: new Date(`${date} ${time}`),
				size: Number(size),
				path
			}));
	},

	cat(path) {
		const args = [
			'cat',
			path
		];

		return execa(binaryPath, args).stdout;
	}
};
