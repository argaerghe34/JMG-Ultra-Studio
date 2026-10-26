const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time']);
test('timecode round trip', () => {
  assert.strictEqual(US.time.toTC(3725.5, 25), '01:02:05:13');
  assert.ok(Math.abs(US.time.parseTC('01:02:05:12', 25) - 3725.48) < 1e-9);
  assert.strictEqual(US.time.parseTC('2:03'), 123);
  assert.strictEqual(US.time.parseTC('1h2m3s'), 3723);
  assert.ok(isNaN(US.time.parseTC('abc')));
  assert.strictEqual(US.time.toYouTube(3725), '1:02:05');
});
test('plain errors never leak raw text into the title', () => {
  const x = US.errors.explain(new Error('ENOSPC: no space left on device'));
  assert.strictEqual(x.code, 'DISK');
  assert.ok(!/ENOSPC/.test(x.title));
  const y = US.errors.explain(new US.UserError('OFFLINE', { detail: '/x/y.mp4' }));
  assert.ok(/drive/.test(y.action));
});
