// Clip Finder: the AI's clips tidied (parts of whole sentences, joined parts, lengths, best first, no repeats), the
// basic version without AI, and building: one sequence per clip with its hook marker, then vertical and captions.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-clips.js', 'js/tools/22-story.js']);
const C = US.storyClips, S = US.story;
const mk = (id, start, end, text, speaker = 'Ruth') => ({ id, start, end, speaker, text });
const LINES = [mk('a1', 0, 8, 'I never told anyone this'), mk('a2', 8, 20, 'but my grandmother was a spy in the war.'), mk('a3', 20, 30, 'She carried messages in her bread.'),
  mk('a4', 30, 42, 'We found the letters after she died.'), mk('a5', 42, 50, 'Nobody believed us.'), mk('q1', 50, 54, 'What did you do then?', 'Interviewer'), mk('a6', 54, 70, 'We took them to the museum and they cried.')];
const at = new Map(LINES.map((l, i) => [l.id, { list: LINES, i }]));

test('the AI’s clips tidied: sentences finished, joined parts kept, lengths measured, out-of-range and repeated clips dropped, best first', () => {
  const r = { clips: [
    { title: 'Grandma the spy', hook: 'My grandmother was a spy', parts: [{ from: 'a1', to: 'a1' }], scores: { hook: 9, standalone: 8, payoff: 7, length: 8 }, reason: 'A surprising reveal', caption: 'x' },
    { title: 'The letters', hook: 'We found the letters', parts: [{ from: 'a5', to: 'a4' }, { from: 'a6', to: 'a6' }], scores: { hook: 6, standalone: 7, payoff: 9, length: 9 }, reason: 'Set-up and payoff', caption: 'y' },
    { title: 'Too long', hook: '', parts: [{ from: 'a1', to: 'a6' }], scores: { hook: 10, standalone: 10, payoff: 10, length: 10 }, reason: '', caption: '' },
    { title: 'Unknown', hook: '', parts: [{ from: 'zz', to: 'zz' }], scores: {}, reason: '', caption: '' }] };
  const out = C.organise(r, at, { min: 15, max: 30 });
  assert.deepStrictEqual(out.map(c => c.title), ['Grandma the spy', 'The letters']);
  assert.deepStrictEqual(out[0].parts[0].lineIds, ['a1', 'a2'], 'runs on to the end of the sentence');
  assert.deepStrictEqual(out[1].parts.map(p => p.lineIds), [['a4', 'a5'], ['a6']], 'turned round; the second part joined');
  assert.strictEqual(out[1].seconds, 20 + 16);
  assert.ok(out[0].score > out[1].score);
  const req = C.request(LINES, { count: 3, min: 15, max: 30, brief: 'for TikTok' });
  assert.ok(/a2\tRuth\t8s\+12\.0\tbut my grandmother was a spy/.test(req.user[0].text) && /up to 3 clips of 15–30 seconds/.test(req.user[1]) && /for TikTok/.test(req.user[1]));
});

test('without AI: one speaker’s strong stretches of the right length, never sharing lines', () => {
  const out = C.basic([LINES], l => (l.text.length > 30 ? 0.8 : 0.4), { count: 5, min: 15, max: 30 });
  assert.ok(out.length >= 1 && out.every(c => c.seconds >= 12 && c.seconds <= 30));
  const ids = out.flatMap(c => c.parts[0].lineIds);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('finding and building: interviewer lines aren’t offered; each clip its own sequence with a hook marker, then vertical and captions', async () => {
  const st = S._useState({ transcripts: [{ key: 't', name: 'Ruth', path: '/m/r.mov', itemId: 'item1', lines: JSON.parse(JSON.stringify(LINES)) }] });
  const was = { ai: US.ai, call: US.host.call }, calls = [];
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { calls.push(['ai', req.user[0].text]); return { clips: [{ title: 'Spy', hook: 'My grandmother was a spy', parts: [{ from: 'a1', to: 'a2' }], scores: { hook: 9, standalone: 9, payoff: 8, length: 9 }, reason: 'Reveal', caption: 'Wow' }] }; } };
  US.host.call = async (fn, a) => {
    calls.push([fn, a]);
    if (fn === 'storyClips') return [{ id: 'item1', path: '/m/r.mov', name: 'r.mov' }];
    if (fn === 'itemsInfo') return [{ id: 'item1', duration: 100 }];
    if (fn === 'newSequence') return { id: 'seqC', name: a.name };
    if (fn === 'storyPlace') return { placed: a.clips.map((c, i) => ({ start: i * 5, end: i * 5 + 5 })), cursor: a.clips.length * 5 };
    if (fn === 'sequenceInfo') return { width: 1920, height: 1080, video: [], audio: [], markers: [] };
    if (fn === 'autoReframe') return { id: 'seqR', name: 'r' };
    if (fn === 'fitToSize') return { id: 'seqV', name: 'v' };
    return {};
  };
  try {
    const job = { set() { return job; }, progress() {}, check() {}, log() {}, range() { return job; } };
    const f = await S.findClips(job, { source: 'interviews', min: 15, max: 30 });
    assert.ok(!/q1\t/.test(calls.find(c => c[0] === 'ai')[1]), 'the interviewer’s question isn’t offered');
    assert.strictEqual(st.clips.items.length, 1); assert.strictEqual(f.clips[0].on, true);
    calls.length = 0;
    const b = await S.buildClips(job, f.clips, { vertical: true, aspect: '4:5', captions: '' });
    assert.strictEqual(calls.find(c => c[0] === 'newSequence')[1].name, 'Clip 1 – Spy');
    assert.strictEqual(calls.find(c => c[0] === 'addSequenceMarkers' && c[1].seqId === 'seqC')[1].markers[0].name, 'My grandmother was a spy');
    const rf = calls.find(c => c[0] === 'autoReframe')[1];
    assert.deepStrictEqual([rf.num, rf.den], [4, 5]);
    assert.deepStrictEqual([calls.find(c => c[0] === 'fitToSize')[1].width, calls.find(c => c[0] === 'fitToSize')[1].height], [1080, 1350]);
    assert.ok(/1 clip built with 4:5 versions/.test(b.summary), b.summary);
  } finally { US.ai = was.ai; US.host.call = was.call; }
});
