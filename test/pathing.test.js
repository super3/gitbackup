const pathing = require('../lib/pathing');

test('encode', async () => {
	expect(pathing.encode('montyanderson')).toBe('/bc/be/22/6e/montyanderson');
});

test('decode', async () => {
	expect(pathing.decode('/bc/be/22/6e/montyanderson')).toBe('montyanderson');
});
