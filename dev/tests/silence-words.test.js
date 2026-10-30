// Silence Cut › Fillers and false starts: found from the words (fillers, doubled small words, restarted sentences,
// soft fillers only when asked), suggested only with exact timings, joined with pauses into one cut copy.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/20-silence-words.js', 'js/tools/20-silence.js']);
const C = US.speechCleanup;

// words at 0.3 s each, with tiny gaps; exact timings
function entry(text, t0 = 0, { speaker = 'A', exact = true } = {}) {
  const ws = text.split(' ').map((w, i) => ({ start: t0 + i * 0.4, end: t0 + i * 0.4 + 0.3, text: w }));
  return { start: ws[0].start, end: ws[ws.length - 1].end, text, speaker, speakerKey: speaker, exact, words: ws };
}

test('fillers, doubled small words and restarts are found; “very very” is left alone; soft fillers only between commas and when asked', () => {
  const e = [entry('So um we went to the the shop and uh it was very very good.'), entry('We drove to the – we drove to the coast, you know, on Friday.', 10)];
  const f = C.find(e);
  assert.deepStrictEqual(f.map(x => [x.kind, x.text]), [['filler', 'um'], ['repeat', 'the'], ['filler', 'uh'], ['restart', 'We drove to the –']]);
  assert.ok(f.every(x => x.on && x.exact));
  assert.ok(/…So \[um\] we went to/.test(f[0].context), f[0].context);
  // the cut runs from the word to just before the next one (its pause goes too), inside the same speaker
  assert.ok(Math.abs(f[0].start - 0.38) < 0.01 && Math.abs(f[0].end - (0.8 - 0.04)) < 0.02, JSON.stringify(f[0]));
  assert.deepStrictEqual(C.find(e, { soft: true }).filter(x => x.kind === 'soft').map(x => x.text), ['you know,']);
  assert.strictEqual(C.find(e, { fillers: false, falseStarts: false }).length, 0);
});

test('estimated timings (no word timings) are listed but not ticked; a restart never crosses to another speaker or a sentence end', () => {
  const a = C.find([entry('I uh think so.', 0, { exact: false })]);
  assert.deepStrictEqual(a.map(x => [x.text, x.on]), [['uh', false]]);
  const b = C.find([entry('We went home.', 0, { speaker: 'A' }), entry('We went home too.', 1.3, { speaker: 'B' })]);
  assert.strictEqual(b.length, 0, 'B repeating A is not a false start');
  const c = C.find([entry('We went home. We went home again.')]);
  assert.strictEqual(c.length, 0, 'a new sentence that repeats isn’t a restart');
});

test('ranges: ticked finds and pauses joined, unticked left out', () => {
  const items = [{ start: 1, end: 1.4, on: true }, { start: 1.35, end: 1.6, on: true }, { start: 5, end: 5.3, on: false }];
  assert.deepStrictEqual(C.ranges(items, [{ start: 3, end: 4 }]), [[1, 1.6], [3, 4]]);
});

test('a cut copy of only the fillers: one copy, cuts from the end, the summary says what went', async () => {
  const calls = [], was = US.host.call;
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'cloneSequence') return { id: 'c1', name: a.name }; if (fn === 'extractRanges') return { removed: a.ranges.reduce((n, r) => n + r[1] - r[0], 0), duration: 50 }; return true; };
  try {
    const an = { target: { id: 's1', name: 'Interview', duration: 60, fps: 25 }, locked: [] };
    const words = [{ start: 2, end: 2.5, on: true }, { start: 10, end: 10.4, on: true }, { start: 20, end: 20.3, on: false }];
    const r = await US.silenceCut.cutCopy(an, {}, { set() { return this; }, progress() {}, check() {} }, { words, pauses: false });
    assert.strictEqual(calls.find(c => c[0] === 'cloneSequence')[1].name, 'Interview – fillers cut');
    assert.deepStrictEqual(calls.filter(c => c[0] === 'extractRanges').flatMap(c => c[1].ranges), [[10, 10.4], [2, 2.5]], 'last first, unticked left');
    assert.ok(/Cut 2 fillers and false starts/.test(r.summary), r.summary);
    await assert.rejects(US.silenceCut.cutCopy(an, {}, { set() { return this; }, progress() {}, check() {} }, { words: [{ start: 1, end: 2, on: false }], pauses: false }), e => e.code === 'NOTHING_FOUND');
  } finally { US.host.call = was; }
});
