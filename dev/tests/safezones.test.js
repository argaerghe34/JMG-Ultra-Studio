const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/30-safezones.js']);
test('letterbox bars to a picture shape', () => {
  const r = US.safezones.letterboxRect(1920, 1080, 2.39);
  assert.deepStrictEqual([r.x, r.w], [0, 1920]); assert.strictEqual(r.h, Math.round(1920 / 2.39)); assert.strictEqual(r.y, Math.round((1080 - r.h) / 2));
  const p = US.safezones.letterboxRect(1920, 1080, 4 / 3);
  assert.deepStrictEqual([p.y, p.h, p.w], [0, 1080, 1440]); assert.strictEqual(p.x, 240);
  const v = US.safezones.letterboxRect(1080, 1920, 1);
  assert.deepStrictEqual([v.w, v.h, v.y], [1080, 1080, 420]);
});
test('assistant phrases route to letterbox, plain guides and hide', () => {
  const lb = US.actions.get('safezones.letterbox').match('letterbox it to 2.39:1');
  assert.ok(Math.abs(lb.ratio - 2.39) < 1e-9 && lb.mode === 'bars');
  assert.ok(Math.abs(US.actions.get('safezones.letterbox').match('pillarbox to 4:3').ratio - 4 / 3) < 1e-9);
  assert.strictEqual(US.actions.get('safezones.add').match('plain grey safe zones for reels').style, 'simple');
  assert.strictEqual(US.actions.get('safezones.add').match('hide the guides'), null);
});
