const bunyan = require('bunyan');

module.exports = bunyan.createLogger({
	name: `worker${typeof process.env.pm_id === 'string' ? `-${process.env.pm_id}` : ''}`
});
