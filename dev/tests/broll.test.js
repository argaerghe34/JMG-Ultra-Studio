const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/23-broll.js']);
const B = US.broll;

// an interview cut from two people: Ruth (r) 0–5, 5–9 (jump), Sam (s) 9–14, Ruth again 14–20 (cut back), a gap, Ruth 22–40
const clip = (itemId, start, end, extra) => Object.assign({ name: itemId === 'r' ? 'Ruth.mp4' : 'Sam.mp4', itemId, path: '/x/' + itemId, start, end, in: 0, out: end - start }, extra);
const seq = (video) => ({ id: 's1', name: 'Cut', frame: 0.04, duration: 40, video, audio: [] });
const v1 = { index: 0, name: 'Video 1', clips: [clip('r', 0, 5), clip('r', 5, 9), clip('s', 9, 14), clip('r', 14, 20), clip('r', 22, 40)] };

test('jump cuts: only cuts inside the same interview', () => {
  const { spots } = B.findSpots(seq([v1]), { mode: 'jump', len: 3, lead: 1 });
  assert.deepStrictEqual(spots.map(s => [s.at, s.len, s.kind]), [[4, 3, 'jump']]);
});

test('cuts between people too, but a new person stays on screen when first seen', () => {
  const { spots, skipped } = B.findSpots(seq([v1]), { mode: 'cuts', len: 3, lead: 1 });
  assert.deepStrictEqual(spots.map(s => [s.at, s.kind]), [[4, 'jump'], [13, 'cut']]);
  assert.strictEqual(skipped.intro, 1, 'the first cut to Sam is left alone');
});

test('long stretches: a cutaway every N seconds, not over the first seconds', () => {
  const { spots } = B.findSpots(seq([v1]), { mode: 'every', every: 10, len: 3, intro: 4 });
  // runs: 0–20 (touching clips) and 22–40
  assert.deepStrictEqual(spots.map(s => s.at), [6, 16, 28]);
});

test('close cuts merge into one cutaway; spots already covered are skipped', () => {
  const v = { index: 0, name: 'V1', clips: [clip('r', 0, 5), clip('r', 5, 6.5), clip('r', 6.5, 12), clip('r', 12, 20)] };
  const above = { index: 1, name: 'Video 2', clips: [clip('b', 11, 14, { name: 'Drone.mp4' })] };
  const { spots, skipped } = B.findSpots(seq([v, above]), { mode: 'jump', len: 3, lead: 1 });
  assert.deepStrictEqual(spots.map(s => [s.at, +s.len.toFixed(2)]), [[4, 4.5]]);
  assert.strictEqual(skipped.covered, 1);
  // label tracks (Story's Selects, guides) don't count as B-roll
  const labels = { index: 1, name: 'Selects', clips: [clip('L', 0, 40, { name: 'Family' })] };
  assert.strictEqual(B.findSpots(seq([v1, labels]), { mode: 'jump' }).spots.length, 1);
});

test('shots: best moments first, each once, not the same clip twice in a row, shorter if needed', () => {
  const spots = [{ at: 4, len: 3 }, { at: 13, len: 3 }, { at: 30, len: 3 }, { at: 35, len: 3 }];
  const moments = [
    { clipId: 'a', name: 'A', start: 2, end: 8, score: 90 },
    { clipId: 'a', name: 'A', start: 10, end: 14, score: 88 },
    { clipId: 'b', name: 'B', start: 0, end: 4, score: 70 },
    { clipId: 'c', name: 'C', start: 1, end: 3, score: 95 }       // best, but only 2 s long
  ];
  const { shots, uncovered } = B.assignShots(spots, moments);
  assert.deepStrictEqual(shots.map(s => s.clipId), ['a', 'b', 'a', 'c']);
  assert.deepStrictEqual([shots[0].in, shots[0].out], [3.5, 6.5], 'the middle of the moment');
  assert.strictEqual(+(shots[3].out - shots[3].in).toFixed(2), 2, 'the last one is shortened to fit');
  assert.strictEqual(uncovered.length, 0);
  assert.strictEqual(B.assignShots(spots, moments.slice(0, 1)).uncovered.length, 3);
});

test('plain moments spread through each clip, first of every clip first', () => {
  const m = B.plainMoments([{ id: 'a', name: 'A', duration: 20 }, { id: 'b', name: 'B', duration: 6 }, { id: 'c', name: 'C', duration: 1.5 }], 3);
  assert.ok(m.every(x => x.end - x.start >= 1 && x.start >= 0.5));
  const order = m.slice().sort((x, y) => y.score - x.score).map(x => x.clipId);
  assert.deepStrictEqual(order.slice(0, 2), ['a', 'b']);
  assert.ok(!m.some(x => x.clipId === 'c'), 'too short to use');
});

test('assistant phrases', () => {
  const a = US.actions.get('broll.cover');
  assert.deepStrictEqual(a.match('cover the jump cuts with b-roll'), { mode: 'jump' });
  assert.deepStrictEqual(a.match('put cutaways over the long talking heads'), { mode: 'every' });
  assert.strictEqual(a.match('cut the silences'), null);
});

test('subclips: moments stay inside the subclip, and the same footage is never used twice', () => {
  const sub = { id: 's', name: 'Sub', path: '/f/A.mov', duration: 60, subclip: true, rangeStart: 20, rangeEnd: 30 };
  const m = B.plainMoments([sub], 3);
  assert.ok(m.length && m.every(x => x.start >= 20 && x.end <= 30), JSON.stringify(m));
  // a master clip and its subclip offer the same stretch: it's used once
  const moments = [{ clipId: 'master', path: '/f/A.mov', name: 'A', start: 20, end: 26, score: 90 }, { clipId: 'sub', path: '/f/A.mov', name: 'A sub', start: 21, end: 27, score: 89 }, { clipId: 'b', path: '/f/B.mov', name: 'B', start: 0, end: 6, score: 50 }];
  const { shots } = B.assignShots([{ at: 4, len: 3 }, { at: 20, len: 3 }], moments);
  assert.deepStrictEqual(shots.map(x => x.clipId), ['master', 'b']);
});
