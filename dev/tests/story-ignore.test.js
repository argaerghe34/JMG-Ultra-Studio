// Story › Leave out songs and other languages: sung, repeated and Hebrew lines found without AI, the AI's answer
// read safely, and lines moved out of the transcript (and back) without losing them.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'transcript', 'js/tools/22-story-ignore.js']);
const I = US.storyIgnore;

// word timings: n words, each held `hold` seconds, `gap` between
const line = (id, start, text, hold = 0.25, gap = 0.08) => {
  const n = text.split(' ').length, w = [];
  for (let i = 0; i < n; i++) { const s = i * (hold + gap); w.push(Math.round(s * 100), Math.round((s + hold) * 100)); }
  return { id, start, end: start + n * (hold + gap), text, speaker: '', w };
};
const concert = () => [
  line('a', 0, 'Good evening everyone and thank you so much for coming out tonight to support the choir.'),
  line('b', 10, 'Light of the world shine on me now', 0.9, 0.2),
  line('c', 16, 'Oh', 0.9),
  line('d', 18, 'Light of the world shine on me now', 0.9, 0.2),
  line('e', 30, 'שלום עליכם מלאכי השרת'),
  line('f', 40, 'Our next piece was written by a young composer from Haifa, and it means a great deal to us.'),
  line('g', 50, 'Light of the world shine on me now', 0.9, 0.2),
];

test('found without AI: sung (slow, held, repeated), Hebrew, and a few words between two sung lines; the speeches stay', () => {
  const r = I.detect(concert());
  assert.deepStrictEqual(Object.fromEntries(r), { b: 'song', c: 'between', d: 'song', e: 'language', g: 'song' });
  assert.deepStrictEqual(Object.fromEntries(I.detect(concert(), { songs: false })), { e: 'language' });
});

test('left out and back: kept lines, the AI’s finds, lines left out by hand, and turned off again', () => {
  const t = { name: 'Concert', lines: concert() };
  assert.strictEqual(I.partition([t], { on: true, songs: true, language: true, ai: { f: 'garbled' } }), 6);
  assert.deepStrictEqual(t.lines.map(l => l.id), ['a']);
  assert.deepStrictEqual(t.ignored.map(l => [l.id, l.left]), [['b', 'song'], ['c', 'between'], ['d', 'song'], ['e', 'language'], ['f', 'garbled'], ['g', 'song']]);
  I.partition([t], { on: true, songs: true, language: true, ai: { f: 'garbled' }, keep: ['f', 'e'], drop: ['a'] });
  assert.deepStrictEqual(t.lines.map(l => l.id), ['e', 'f']);
  I.partition([t], { on: true, songs: true, language: true, ai: { f: 'garbled' }, useAi: false });
  assert.deepStrictEqual(t.lines.map(l => l.id), ['a', 'f']);
  I.partition([t], { on: false });
  assert.deepStrictEqual(t.lines.map(l => l.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'all back, in order');
  assert.ok(!t.ignored && t.lines.every(l => l.left === undefined));
});

test('the AI is told what to leave out and only its answers for lines it was sent count', () => {
  const ls = concert(), req = I.aiRequest(ls, { speech: 'English' });
  assert.ok(/sung lyrics/.test(req.system) && /when unsure keep it/.test(req.system));
  assert.ok(req.user.includes('f\t0:40\t'));
  assert.deepStrictEqual(I.aiFrom({ lines: [{ id: 'f', why: 'garbled' }, { id: 'zz', why: 'song' }, { id: 'a', why: 'nonsense' }] }, ls), { f: 'garbled' });
});
