const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/22-story-captions.js']);
const C = US.storyCaptions;
const words = (text, t0, step = 0.3) => text.split(' ').map((w, i) => ({ start: t0 + i * step, end: t0 + i * step + step * 0.8, text: w }));
const entry = (name, text, t0, opts = {}) => { const w = words(text, t0, opts.step); return Object.assign({ name, text, start: w[0].start, end: w[w.length - 1].end, words: opts.noWords ? null : w }, opts.noWords ? { words: undefined } : {}); };

test('subtitles: two lines of up to 42 characters, broken near the middle, split at sentence ends', () => {
  const e = [entry('Ruth', 'I came here when I was nineteen and I had no idea what to expect. Everyone was so kind to me from the first day.', 10)];
  const c = C.cues(e, { style: 'subtitles' });
  assert.ok(c.length >= 2);
  for (const x of c) for (const line of x.text.split('\n')) assert.ok(line.length <= 46, line);
  assert.ok(c[0].text.replace('\n', ' ').endsWith('expect.'), 'first caption ends at the sentence: ' + c[0].text);
  assert.ok(c.every(x => x.text.split('\n').length <= 2));
  assert.strictEqual(c[0].start, 10);
});

test('social: a few words at a time, upper case, following the word times', () => {
  const c = C.cues([entry('Ruth', 'we all looked after each other every single day', 0)], { style: 'social', upper: true });
  assert.ok(c.every(x => x.text.split(' ').length <= 3 && !x.text.includes('\n')), c.map(x => x.text).join(' | '));
  assert.strictEqual(c[0].text, 'WE ALL LOOKED');
  assert.ok(Math.abs(c[1].start - 0.9) < 1e-9, 'second caption starts on its first word');
  for (let i = 1; i < c.length; i++) assert.ok(c[i].start >= c[i - 1].end - 1e-9, 'no overlaps');
});

test('one word at a time, with a minimum time on screen and no flicker gaps', () => {
  const c = C.cues([entry('Ruth', 'thank you so much', 5, { step: 0.12 })], { style: 'words' });
  assert.deepStrictEqual(c.map(x => x.text), ['thank', 'you', 'so', 'much']);
  for (let i = 0; i < c.length - 1; i++) assert.strictEqual(c[i].end, c[i + 1].start, 'each word stays until the next');
  assert.ok(c[3].end - c[3].start >= 0.2 - 1e-9);
});

test('names open each speaker’s turn when more than one person speaks; partial lines lose their …', () => {
  const e = [entry('Ruth', 'It changed my life.', 0), entry('Sam', '…and mine too', 3), entry('Sam', 'Every day.', 5)];
  const c = C.cues(e, { style: 'subtitles', names: true });
  assert.deepStrictEqual(c.map(x => x.text), ['Ruth: It changed my life.', 'Sam: and mine too', 'Every day.']);
  assert.ok(!C.cues([entry('Ruth', 'Hello there.', 0)], { names: true })[0].text.includes('Ruth'), 'one speaker: no names');
});

test('lines without word times are spread evenly; SRT format', () => {
  const e = [{ name: 'Ruth', text: 'one two three four', start: 0, end: 4 }];
  const c = C.cues(e, { style: 'social' });
  assert.deepStrictEqual(c.map(x => [x.text, x.start]), [['one two', 0], ['three four', 2]], 'slow speech: fewer words so a caption is never on for more than 2.5 s');
  assert.strictEqual(C.toSRT([{ start: 61.5, end: 63.25, text: 'Hi' }]), '1\n00:01:01,500 --> 00:01:03,250\nHi\n');
});
