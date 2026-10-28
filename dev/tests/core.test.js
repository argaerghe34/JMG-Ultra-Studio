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
test('path keys match the way samePath does (Windows: any case, either slash)', () => {
  const k = US.pathKey;
  if (process.platform === 'win32') {
    assert.strictEqual(k('E:/Footage/Day1/C0001.MP4'), k('e:\\footage\\DAY1\\c0001.mp4'));
  } else {
    assert.notStrictEqual(k('/Volumes/T7/C0001.MP4'), k('/Volumes/T7/c0001.mp4'));
  }
  assert.notStrictEqual(k('/Footage/Day1/C0001.MP4'), k('/Footage/Day2/C0001.MP4'));
  assert.strictEqual(k(''), k(null));
});
test('renameRetry moves a file (and rethrows errors that are not a lock)', () => {
  const fs = require('fs'), path = require('path'), d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'us-ren-'));
  const a = path.join(d, 'a.txt'), b = path.join(d, 'b.txt');
  fs.writeFileSync(a, 'x'); US.fsx.renameRetry(a, b);
  assert.ok(!fs.existsSync(a) && fs.readFileSync(b, 'utf8') === 'x');
  assert.throws(() => US.fsx.renameRetry(path.join(d, 'missing.txt'), b), e => e.code === 'ENOENT');
});
test('plain errors never leak raw text into the title', () => {
  const x = US.errors.explain(new Error('ENOSPC: no space left on device'));
  assert.strictEqual(x.code, 'DISK');
  assert.ok(!/ENOSPC/.test(x.title));
  const y = US.errors.explain(new US.UserError('OFFLINE', { detail: '/x/y.mp4' }));
  assert.ok(/drive/.test(y.action));
});
