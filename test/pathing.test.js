const pathing = require('../lib/pathing');

test('encode', async () => {
	expect(pathing.encode('montyanderson')).toBe('us-central-1:/bc/be/22/6e/montyanderson');
	expect(pathing.encode('calebcase')).toBe('europe-west-1:/70/d1/ea/99/calebcase');
});

test('decode', async () => {
	expect(pathing.decode('us-central-1:/bc/be/22/6e/montyanderson')).toBe('montyanderson');
	expect(pathing.decode('europe-west-1:/70/d1/ea/99/calebcase')).toBe('calebcase');

	expect(() => {
		pathing.decode('us-central-1:/be/be/22/6e/montyanderson');
	}).toThrow(Error);
});
