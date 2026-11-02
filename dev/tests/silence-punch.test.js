// Punch-ins: only pieces of one shot that meet at a cut (the source jumping forward) alternate 100 % / pushed in; a new
// shot starts again at 100 %; applied to the talking track of a cut copy through the clip's own Motion.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/20-silence-words.js', 'js/tools/20-silence-punch.js', 'js/tools/20-silence.js']);
const P = US.punchIns;
const c = (name, start, end, inn, out, disabled = false) => ({ name, start, end, in: inn, out, disabled });
const V1 = [c('A.mov', 0, 4, 10, 14), c('A.mov', 4, 7, 15, 18), c('A.mov', 7, 9, 20, 22), c('A.mov', 9, 12, 22.5, 25.5), c('B.mov', 12, 15, 0, 3), c('B.mov', 15, 18, 5, 8), c('A.mov', 18, 20, 30, 32), c('A.mov', 25, 27, 40, 42)];

test('which pieces: every other piece of a shot cut together; a new shot, a gap or a source going back resets', () => {
  assert.deepStrictEqual(P.plan(V1).map(x => x.start), [4, 9, 15]);
  assert.deepStrictEqual(P.plan([c('A.mov', 0, 2, 5, 7), c('A.mov', 2, 4, 1, 3)]), [], 'source going back: not a jump cut (another take)');
  assert.deepStrictEqual(P.plan([c('A.mov', 0, 2, 0, 2), c('A.mov', 2, 4, 2, 4)]), [], 'continuous: an edit, not a cut');
});

test('applied to the lowest video track with pieces (B-roll above left alone), through the clip’s own Motion', async () => {
  const was = US.host.call, calls = [];
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'sequenceInfo') return { frame: 0.04, video: [{ index: 0, clips: V1 }, { index: 1, clips: [c('Broll.mov', 3, 6, 0, 3)] }] }; if (fn === 'editApply') return { done: a.targets.length, skipped: [] }; return {}; };
  try {
    const r = await P.apply('seq1', { scale: 112 });
    const e = calls.find(x => x[0] === 'editApply')[1];
    assert.deepStrictEqual([e.op, e.params.scale, e.targets.map(t => [t.kind, t.track, t.start])], ['motion', 112, [['video', 0, 4], ['video', 0, 9], ['video', 0, 15]]]);
    assert.deepStrictEqual([r.done, r.jumps, r.track], [3, 3, 0]);
    US.ctx.sequence = { id: 'seq1', name: 'Cut' };
    const act = US.actions.list().find(x => x.id === 'silence.punch');
    assert.ok(act.match('punch in on the jump cuts') && act.match('hide the jump cuts with zooms') && !act.match('cover the jump cuts with b-roll'));
    assert.strictEqual(act.match('add punch-ins at 115%').scale, 115);
    assert.ok(/Pushed in 3 of 3 jump cuts to 110 % on V1/.test((await act.run({ scale: 110 }, { set() {} })).summary));
  } finally { US.host.call = was; }
});
