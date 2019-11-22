const pathing = require('../lib/pathing');

test('encode', async () => {
	expect(pathing.encode('montyanderson')).toBe('/bc/be/22/6e/montyanderson');
	expect(pathing.encode('calebcase')).toBe('/70/d1/ea/99/calebcase');
});

test('decode', async () => {
	expect(pathing.decode('/bc/be/22/6e/montyanderson')).toBe('montyanderson');
	expect(pathing.decode('/70/d1/ea/99/calebcase')).toBe('calebcase');

	expect(() => {
		pathing.decode('/be/be/22/6e/montyanderson')
	}).toThrow(Error);
});
