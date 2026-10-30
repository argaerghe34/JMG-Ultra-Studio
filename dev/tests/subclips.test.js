// Subclip Maker: names in filming order with the original file name, and what happens when names are already taken.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'js/tools/26-subclips.js']);
const read = (existing = []) => ({ target: 'Roam – Subclips', existing, clips: [
  { id: 'b', name: 'C0013.MP4', start: 200, in: 10, out: 20, whole: false },
  { id: 'a', name: 'C0012.MP4', start: 100, in: 0, out: 600, whole: true },
  { id: 'c', name: 'C0014.MP4', start: 200, in: 5, out: 6, whole: false }] });

test('numbered in filming order (timecode, then name), original file name kept', () => {
  const p = US.subclipMaker.plan(read(), 'replace');
  assert.deepStrictEqual(p.items.map(x => [x.name, x.whole]), [['01 – C0012.MP4', true], ['02 – C0013.MP4', false], ['03 – C0014.MP4', false]]);
  assert.strictEqual(p.conflicts.length, 0);
});
test('names already in the subclip bin: listed as conflicts; "add alongside" numbers the new ones', () => {
  const r = US.subclipMaker.plan(read(['02 – C0013.MP4']), 'replace');
  assert.deepStrictEqual(r.conflicts, ['02 – C0013.MP4']);
  assert.strictEqual(r.items[1].name, '02 – C0013.MP4', 'replace keeps the name (the earlier one is moved aside)');
  const a = US.subclipMaker.plan(read(['02 – C0013.MP4', '02 – C0013.MP4 (2)']), 'add');
  assert.strictEqual(a.items[1].name, '02 – C0013.MP4 (3)');
});
test('handles (off by default): each side widened, never past the ends of the clip; whole clips unchanged', () => {
  const r = { target: 'T', existing: [], clips: [
    { id: 'a', name: 'A.MP4', start: 0, in: 0.5, out: 20, whole: false, dur: 21, inTicks: '1', outTicks: '2' },
    { id: 'b', name: 'B.MP4', start: 1, in: 0, out: 600, whole: true, dur: 600, inTicks: '0', outTicks: '9' },
    { id: 'c', name: 'C.MP4', start: 2, in: 10, out: 12, whole: false, dur: 0, inTicks: '3', outTicks: '4' }] };
  const none = US.subclipMaker.plan(r, 'replace');
  assert.deepStrictEqual(none.items.map(x => [x.inTicks, x.outTicks]), [['1', '2'], ['0', '9'], ['3', '4']], 'no handles: the host’s own ticks');
  const p = US.subclipMaker.plan(r, 'replace', 2);
  assert.deepStrictEqual(p.items.map(x => [x.in, x.out]), [[0, 21], [0, 600], [8, 14]]);
  assert.strictEqual(p.items[0].inTicks, '0'); assert.strictEqual(p.items[2].outTicks, String(14 * 254016000000));
  assert.ok(!p.items[1].handles, 'a whole clip keeps its length');
});
