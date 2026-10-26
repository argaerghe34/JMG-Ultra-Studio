const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'vision', 'js/tools/10-selects.js']);

test('the best frame of a select: sharp, still, faces, not blown out', () => {
  const samples = [
    { t: 1.0, sh: 0.5, vx: 0, vy: 0, fc: 0, hi: 0 },
    { t: 1.5, sh: 0.9, vx: 0.04, vy: 0, fc: 0, hi: 0 },     // sharpest number, but moving fast (motion blur)
    { t: 2.0, sh: 0.7, vx: 0, vy: 0.001, fc: 1, hi: 0 },    // sharp, still, a face
    { t: 2.5, sh: 0.8, vx: 0, vy: 0, fc: 0, hi: 0.2 },      // blown out
    { t: 4.0, sh: 1.5, vx: 0, vy: 0, fc: 2, hi: 0 }         // outside the select
  ];
  assert.strictEqual(US.selects.bestFrame({ samples }, { start: 1, end: 3 }), 2.0);
  assert.strictEqual(US.selects.bestFrame({ samples: [] }, { start: 1, end: 3 }), 2, 'no samples: the middle');
});

test('Selects starts on Any footage; “strict” keeps your footage type; “b-roll” means any footage', () => {
  const S = US.selects.state.settings, a = US.actions.get('selects.find');
  assert.strictEqual(S.footage, 'any');
  assert.strictEqual(a.match('find the selects in the b-roll bin').preset, 'any');
  S.footage = 'wedding';
  US.selects.applyType({ preset: 'strict' });
  assert.deepStrictEqual([S.footage, S.picky], ['wedding', 'strict']);
  US.selects.applyType({ preset: 'interview' });
  assert.strictEqual(S.footage, 'interview');
  Object.assign(S, { footage: 'any', picky: 'normal' });
});
