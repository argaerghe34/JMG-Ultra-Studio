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
test('guide file names change with the shade (a changed guide never overwrites an imported one)', () => {
  const o = { crops: ['9x16'], apps: ['tiktok'], titleSafe: false, dim: 0.45, style: 'detailed' };
  const a = US.safezones.guideName(1920, 1080, o), b = US.safezones.guideName(1920, 1080, Object.assign({}, o, { dim: 0.6 }));
  assert.notStrictEqual(a, b); assert.ok(/^Ultra Guide /.test(a) && / 1920x1080$/.test(a));
  const g = d => US.safezones.letterboxName(1920, 1080, { ratio: 2.39, mode: 'guide', dim: d });
  assert.notStrictEqual(g(0.6), g(0.75)); assert.ok(/^Ultra Guide letterbox /.test(g(0.6)));
  // black bars look the same at any shade, so their name doesn't carry it
  const bars = d => US.safezones.letterboxName(1920, 1080, { ratio: 2.39, mode: 'bars', dim: d });
  assert.strictEqual(bars(0.6), bars(0.75)); assert.ok(/^Ultra Letterbox /.test(bars(0.6)));
});
test('assistant phrases route to letterbox, plain guides and hide', () => {
  const lb = US.actions.get('safezones.letterbox').match('letterbox it to 2.39:1');
  assert.ok(Math.abs(lb.ratio - 2.39) < 1e-9 && lb.mode === 'bars');
  assert.ok(Math.abs(US.actions.get('safezones.letterbox').match('pillarbox to 4:3').ratio - 4 / 3) < 1e-9);
  assert.strictEqual(US.actions.get('safezones.add').match('plain grey safe zones for reels').style, 'simple');
  assert.strictEqual(US.actions.get('safezones.add').match('hide the guides'), null);
});
