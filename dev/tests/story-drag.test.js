// Dragging lines from Story › Find onto the timeline: the silent stand-in (a WAV exactly as long as the lines), which
// lines a drag carries, and the ranges placed.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/22-story-drag.js']);
const D = US.storyDrag;

test('the stand-in: a valid silent WAV exactly as long as the lines', () => {
  const b = D.wav(2.5);
  assert.strictEqual(b.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(b.toString('ascii', 8, 12), 'WAVE');
  const rate = b.readUInt32LE(24), bytes = b.readUInt32LE(40), perSec = b.readUInt32LE(28);
  assert.strictEqual(rate, 16000);
  assert.strictEqual(bytes / perSec, 2.5);
  assert.strictEqual(b.length, 44 + bytes);
  assert.ok(b.subarray(44).every(x => x === 0), 'silence');
  assert.ok(D.wav(0).length > 44, 'never empty');
});

test('a drag carries the line – or every ticked line, in the order ticked, when it is one of them', () => {
  const L = { a: { id: 'a', start: 1, end: 4, text: 'one' }, b: { id: 'b', start: 10, end: 12, text: 'two' }, c: { id: 'c', start: 20, end: 21, text: 'three' }, x: { id: 'x', start: 5, end: 5 } };
  const of = id => L[id];
  assert.deepStrictEqual(D.linesFor(L.a, [], of).map(l => l.id), ['a']);
  assert.deepStrictEqual(D.linesFor(L.a, ['c', 'a'], of).map(l => l.id), ['c', 'a'], 'ticked: all of them');
  assert.deepStrictEqual(D.linesFor(L.b, ['c', 'a'], of).map(l => l.id), ['b'], 'not ticked: just this one');
  assert.deepStrictEqual(D.linesFor(L.a, ['a', 'x', 'gone'], of).map(l => l.id), ['a'], 'no zero-length or missing lines');
  assert.strictEqual(D.seconds([L.a, L.b]), 5);
  assert.deepStrictEqual(D.ranges([L.a, L.b, L.c], l => (l.id === 'b' ? null : 'item-' + l.id)), [{ id: 'item-a', in: 1, out: 4 }, { id: 'item-c', in: 20, out: 21 }], 'the line’s own In and Out; unlinked lines left out');
});

test('what gets placed: extra either side (never before the start, never past the end) and the colour', () => {
  const ls = [{ id: 'a', start: 0.2, end: 4 }, { id: 'b', start: 10, end: 12 }];
  const ps = D.spans(ls, { handles: 0.5, labelOf: l => (l.id === 'b' ? 7 : null) });
  assert.deepStrictEqual(ps, [{ lineId: 'a', start: 0, end: 4.5, label: null }, { lineId: 'b', start: 9.5, end: 12.5, label: 7 }]);
  assert.deepStrictEqual(D.spans(ls).map(p => [p.start, p.end]), [[0.2, 4], [10, 12]], 'no handles: exactly the line');
  const r = D.ranges(ps, () => 'clip', () => 12.2);
  assert.deepStrictEqual(r, [{ id: 'clip', in: 0, out: 4.5 }, { id: 'clip', in: 9.5, out: 12.2, label: 7 }], 'stops at the end of the media; label only when there is one');
  assert.strictEqual(D.seconds(ps), 7.5);
});
