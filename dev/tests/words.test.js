// Word cloud: words and phrases counted (forms together, stop words and fillers left out, phrases never across a
// comma), every mention found with its own word times, and building: just the words, whole lines or full sentences.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js', 'js/tools/29-words.js']);
const W = US.wordCloud, S = US.story;
// w: word timings, in hundredths from the line's start, two per word
const mk = (id, start, end, text, speaker = 'Ruth', w) => Object.assign({ id, start, end, speaker, text }, w ? { w } : {});
const LINES = [
  mk('a1', 0, 4, 'The local community, it saved us.', 'Ruth', [0, 20, 25, 60, 65, 150, 160, 190, 200, 260, 270, 400]),
  mk('a2', 10, 14, 'Our local community built the bakery.'),
  mk('a3', 20, 25, 'Um, communities like ours, you know, need a bakery'),
  mk('a4', 30, 33, 'The local community came every Friday.'),
  mk('q1', 40, 42, 'What did the community mean to you?', 'Interviewer'),
  mk('a5', 50, 60, 'Community. Bakery. Community bakery!')
];

test('counting: word forms together, stop words and fillers out, phrases from two lines up, most said first', () => {
  const items = W.count(LINES, { interviewOf: () => 'r' });
  const by = k => items.find(x => x.key === k);
  assert.strictEqual(items[0].key, 'w:community', 'the word said most comes first');
  assert.strictEqual(by('w:community').n, 7, 'community and communities counted together');
  assert.strictEqual(by('w:community').text, 'community', 'shown in the form said most');
  assert.ok(!items.some(x => /^w:(um|the|you|like|know)$/.test(x.key)), 'fillers and small words left out');
  assert.strictEqual(by('p:local community').n, 3, 'a phrase said in three lines');
  assert.ok(!by('p:community bakery'), 'a phrase never runs across a full stop – and one said in one line only isn’t a phrase');
  const plain = W.count(LINES, { forms: false });
  assert.strictEqual(plain.find(x => x.key === 'w:community').n, 6, 'forms apart: communities is its own word');
  assert.ok(!W.count(LINES, { hidden: ['w:community'] }).some(x => x.key === 'w:community'), 'hidden words stay out');
  assert.ok(!W.count(LINES, { phrases: false }).some(x => x.kind === 'phrase'));
});

test('mentions: every time, with context, the words’ own times when the line has them (estimated otherwise)', () => {
  const ms = W.mentions(LINES, W.keyForText('Local Community'));
  assert.deepStrictEqual(ms.map(m => m.lineId), ['a1', 'a2', 'a4']);
  assert.deepStrictEqual([ms[0].start, ms[0].end, ms[0].exact], [0.25, 1.5, true], 'from “local” to “community,”');
  assert.strictEqual(ms[0].hit, 'local community,');
  assert.strictEqual(ms[1].exact, false);
  assert.strictEqual(W.mentions(LINES, W.keyForText('community')).length, 7, 'two in one line are two mentions');
  assert.deepStrictEqual(W.mentions(LINES, W.keyForText('community bakery')).map(m => m.lineId), ['a5'], 'only where said together, not across the full stop');
});

test('groups to build: just the words (air each side, one clip per line), whole lines, one group per word', () => {
  const sets = [{ text: 'community', mentions: W.mentions(LINES, 'w:community') }, { text: 'bakery', label: 9, mentions: W.mentions(LINES, 'w:bakery') }];
  const [g, b] = W.groupsFor(sets, { clip: 'words' });
  assert.deepStrictEqual(g.lineIds, ['a1', 'a2', 'a3', 'a4', 'q1', 'a5'], 'each line once, in the order given');
  assert.deepStrictEqual(g.trims.a1, { start: 0.65 - 0.12, end: 1.5 + 0.22 }, 'exact times: a little air');
  assert.ok(g.trims.a5.start < 51 && g.trims.a5.end > 57, 'two mentions in one line: one clip from the first to the last');
  assert.strictEqual(g.lineMarks.a1.name, '“community”');
  assert.strictEqual(b.label, 9);
  const whole = W.groupsFor(sets, { clip: 'line' });
  assert.deepStrictEqual(whole[0].trims, {}, 'whole lines: no trims');
  assert.ok(W.sizeFor(10, 2, 10) > W.sizeFor(3, 2, 10) && W.sizeFor(5, 5, 5) > 0);
});

test('“build every time they say community”: a sequence of just the words, in interview order, interviewer left out', async () => {
  S._useState({ transcripts: [{ key: 't', name: 'Ruth', path: '/m/r.mov', itemId: 'item1', lines: JSON.parse(JSON.stringify(LINES)) }] });
  const was = { call: US.host.call }, calls = [];
  US.host.call = async (fn, a) => {
    calls.push([fn, a]);
    if (fn === 'storyClips') return [{ id: 'item1', path: '/m/r.mov', name: 'r.mov' }];
    if (fn === 'itemsInfo') return [{ id: 'item1', duration: 100 }];
    if (fn === 'newSequence') return { id: 'seqW', name: a.name };
    if (fn === 'storyPlace') return { placed: a.clips.map((c, i) => ({ start: i * 2, end: i * 2 + 2 })), cursor: a.clips.length * 2 };
    return {};
  };
  try {
    const action = US.actions.list().find(x => x.id === 'words.build');
    const m = action.match('build every time they say “community”');
    assert.deepStrictEqual([m.text, m.clip], ['community', 'words']);
    assert.strictEqual(action.match('a sequence of each mention of hope, whole sentences').clip, 'sentence');
    const job = { set() { return job; }, progress() {}, check() {}, log() {}, range() { return job; } };
    await action.run({ text: 'community', clip: 'words' }, job);
    const seq = calls.find(c => c[0] === 'newSequence')[1], placed = calls.filter(c => c[0] === 'storyPlace').flatMap(c => c[1].clips);
    assert.ok(/^Words – “community” \(6\)$/.test(seq.name), seq.name);
    assert.strictEqual(placed.length, 5, 'one clip per line, the interviewer’s question left out');
    assert.ok(placed[0].in > 0.4 && placed[0].out < 1.8, `just the words: ${placed[0].in}–${placed[0].out}`);
  } finally { US.host.call = was.call; }
});
