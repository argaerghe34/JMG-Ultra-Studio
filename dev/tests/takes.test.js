// Take Sets: retakes grouped (AI answer tidied, or near-identical lines without AI), the last complete take chosen,
// the others cut from a copy with the pause after them, and a marker on each kept take.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/27-takes.js']);
const K = US.takeSets;
const e = (start, end, text, speaker = 'A') => ({ start, end, text, speaker, speakerKey: speaker, exact: true, words: [{ start, end: start + 0.3, text: text.split(' ')[0] }] });
const ENTRIES = [e(0, 4, 'Welcome to the bakery, where we have'), e(5, 9, 'Welcome to the bakery, where we have baked since 1962.'), e(10, 14, 'Today we make challah.'),
  e(15, 19, 'Our bread is the best in town.', 'B'), e(20, 24, 'Welcome to our bakery – we’ve baked here since 1962.'), e(25, 28, 'Today we make challah, the Friday bread.')];

test('the AI’s sets tidied: known ids, same speaker, no line twice, at least two takes; the last complete take chosen', () => {
  const lines = K.linesOf(ENTRIES);
  const sets = K.organise({ sets: [
    { name: 'Welcome', takes: [{ from: 'L1', to: 'L1', complete: false, note: 'cut off' }, { from: 'L2', to: 'L2', complete: true, note: '' }, { from: 'L5', to: 'L5', complete: true, note: 'reworded' }] },
    { name: 'Challah', takes: [{ from: 'L3', to: 'L3', complete: true, note: '' }, { from: 'L6', to: 'L6', complete: true, note: 'longer' }] },
    { name: 'Dupe', takes: [{ from: 'L2', to: 'L2', complete: true, note: '' }, { from: 'L9', to: 'L9', complete: true, note: '' }] },
    { name: 'Across speakers', takes: [{ from: 'L3', to: 'L4', complete: true, note: '' }] }] }, lines);
  assert.deepStrictEqual(sets.map(s => [s.name, s.takes.length, s.chosen]), [['Welcome', 3, 2], ['Challah', 2, 1]], 'a line already used or unknown ids: dropped; a single take isn’t a set');
  const cut = K.cuts(sets, lines);
  assert.deepStrictEqual(cut.map(c => [c.start, c.end]), [[-0 + 0, 4.95], [4.95, 9.95], [9.95, 14.95]].map(([a, b], i) => [Math.max(0, [0, 5, 10][i] - 0.05), b]));
  sets[0].chosen = 0; sets[1].chosen = -1;
  assert.deepStrictEqual(K.cuts(sets, lines).map(c => c.title), ['“Welcome” – take 2 of 3', '“Welcome” – take 3 of 3'], 'another take chosen; a set kept whole loses nothing');
});

test('without AI: retakes by the same speaker that share most of their words (reworded ones too); short ones count as incomplete', () => {
  const sets = K.basic(K.linesOf(ENTRIES));
  assert.deepStrictEqual(sets.map(s => s.takes.map(t => t.from)), [['L1', 'L2', 'L5'], ['L3', 'L6']], 'B’s line is never in A’s set');
  assert.deepStrictEqual(sets[0].takes.map(t => t.complete), [false, true, true]);
  assert.strictEqual(sets[0].chosen, 2, 'the last complete take');
});

test('the request carries only text, with the script when given', () => {
  const r = K.request(K.linesOf(ENTRIES), { script: 'Welcome to the bakery.' });
  assert.ok(/L2\tA\t5s\tWelcome to the bakery, where we have baked since 1962\./.test(r.user[0]) && /SCRIPT:\nWelcome to the bakery\./.test(r.user[0]) && r.schema === K.SCHEMA);
});

test('“keep the best takes”: unchosen takes cut from a copy (last first), a marker on each kept take where it now sits', async () => {
  const calls = [], was = { call: US.host.call, ctx: US.ctx, story: US.story, ai: US.ai, refresh: US.refreshContext };
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'lockedTracksWithClips') return []; if (fn === 'cloneSequence') return { id: 'c', name: a.name }; if (fn === 'extractRanges') return { removed: a.ranges.reduce((n, r) => n + r[1] - r[0], 0), duration: 10 }; return true; };
  US.ctx = { project: { name: 'P' }, sequence: { id: 's', name: 'Bakery', duration: 30, fps: 25 } };
  US.refreshContext = async () => {};
  US.story = { timelineTranscript: async () => ({ result: { entries: ENTRIES } }), namesFor: () => new Map() };
  US.ai = { available: () => false };
  const job = { set() { return job; }, progress() {}, check() {} };
  try {
    const done = await US.actions.get('takes.cut').run({ script: '' }, job);
    assert.strictEqual(calls.find(c => c[0] === 'cloneSequence')[1].name, 'Bakery – best takes');
    const ex = calls.filter(c => c[0] === 'extractRanges').flatMap(c => c[1].ranges);
    assert.deepStrictEqual(ex.map(r => r[0]), [9.95, 4.95, 0], 'L3, L2 and L1 cut, last first');
    const mk = calls.find(c => c[0] === 'addSequenceMarkers')[1].markers;
    assert.deepStrictEqual(mk.map(m => m.name.slice(0, 11)), ['Take 3 of 3', 'Take 2 of 2']);
    assert.ok(mk[0].start < 20 && mk[0].start > 0, 'the kept take moved up by what was cut before it');
    assert.ok(/3 takes cut/.test(done.summary), done.summary);
  } finally { US.host.call = was.call; US.ctx = was.ctx; US.story = was.story; US.ai = was.ai; US.refreshContext = was.refresh; }
});
