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
