// Quick effects: which clips an edit goes on, where transitions go (at the cuts, or each clip's ends), the calls made,
// what Resolve can't do, and the report.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'ui', 'app', 'js/tools/36-quickfx.js']);
const Q = US.quickfx;
const READ = { fps: 25, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 10, end: 12 }] }, { index: 1, locked: true, clips: [{ start: 0, end: 3 }] }], audio: [{ index: 0, clips: [{ start: 0, end: 4 }] }] };

test('targets: the selected clips of the kind the edit needs, never on a locked track; every clip when nothing is picked', () => {
  const sel = [{ kind: 'video', track: 0, start: 4, end: 9 }, { kind: 'video', track: 1, start: 0, end: 3 }];
  assert.deepStrictEqual(Q.targetsFor(READ, sel, 'video'), [{ kind: 'video', track: 0, start: 4, end: 9 }]);
  assert.strictEqual(Q.targetsFor(READ, null, 'video').length, 3);
  assert.deepStrictEqual(Q.targetsFor(READ, null, 'audio'), [{ kind: 'audio', track: 0, start: 0, end: 4 }]);
  assert.deepStrictEqual(Q.targetsFor(READ, sel, 'audio'), []);
});

test('transitions at the cuts: only where one clip meets the next (not across a gap); the outer ends when asked', () => {
  const ts = Q.targetsFor(READ, null, 'video');
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'cuts').map(p => [p.target.start, p.at]), [[4, 'start']]);
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'cuts', { ends: true }).map(p => [p.target.start, p.at]), [[0, 'start'], [4, 'start'], [4, 'end'], [10, 'start'], [10, 'end']]);
  assert.deepStrictEqual(Q.transitionPlaces([ts[0]], 'cuts').map(p => p.at), ['start', 'end'], 'one clip: both ends');
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'end').map(p => p.at), ['end', 'end', 'end']);
});

test('calls: a transition’s length in frames, grouped by where it goes; a fade keeps its own place; other edits in one call', () => {
  const P = id => Q.PRESETS.find(p => p.id === id), ts = Q.targetsFor(READ, null, 'video');
  const c = Q.calls(P('dissolve'), ts, { where: 'both', seconds: 1, fps: 25 });
  assert.deepStrictEqual(c.map(x => [x.params.at, x.params.frames, x.targets.length, x.params.name]), [['start', 25, 3, 'Cross Dissolve'], ['end', 25, 3, 'Cross Dissolve']]);
  assert.deepStrictEqual(Q.calls(P('fadeOut'), ts, { where: 'cuts', seconds: 0.5 }).map(x => [x.params.at, x.targets.length]), [['end', 3]]);
  assert.deepStrictEqual(Q.calls(P('punch110'), ts, {}).map(x => [x.op, x.params.scale, x.targets.length]), [['motion', 110, 3]]);
  assert.deepStrictEqual(Q.calls(P('dissolve'), [], {}), []);
});

test('Resolve: moves and opacity work; transitions, effects, speed and volume don’t', () => {
  const ok = Q.PRESETS.filter(p => Q.works(p, true)).map(p => p.op);
  assert.ok(ok.length && ok.every(op => op === 'motion' || op === 'opacity'), ok.join());
  assert.ok(Q.PRESETS.every(p => Q.works(p, false)));
  assert.strictEqual(new Set(Q.PRESETS.map(p => p.id)).size, Q.PRESETS.length, 'ids are unique');
});

test('the report: done, skipped, and why when nothing was done', () => {
  const P = Q.PRESETS[0];
  assert.strictEqual(Q.report(P, { done: 2, skipped: [] }), 'Cross Dissolve: 2 transitions added');
  assert.strictEqual(Q.report(P, { done: 0, skipped: [{ why: 'Premiere has no transition called “Push”.' }] }), 'Cross Dissolve: Premiere has no transition called “Push”.');
  assert.strictEqual(Q.report(Q.PRESETS.find(p => p.id === 'bw'), { done: 3, skipped: [{ why: 'x' }] }), 'Black & White: 3 clips · 1 skipped');
});
