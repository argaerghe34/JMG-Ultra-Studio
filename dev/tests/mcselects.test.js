// MC Selects: which camera each multicam cut shows (read from a saved project's XML) and the pieces for the new sequence.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'js/tools/25-mcselects.js']);
const M = US.mcSelects, T = 254016000000;

// the shape Premiere 26.5 saves: Sequence -> video track group -> track 0 -> track items -> SubClip -> VideoClip
function project(cuts) {
  let id = 100, items = '', objs = '';
  cuts.forEach(([s, e, sel, mc = true], k) => {
    const ti = ++id, sub = ++id, vc = ++id;
    items += `<TrackItem Index="${k}" ObjectRef="${ti}"/>`;
    objs += `<VideoClipTrackItem ObjectID="${ti}"><ClipTrackItem><TrackItem>${s ? `<Start>${s * T}</Start>` : ''}<End>${e * T}</End></TrackItem><SubClip ObjectRef="${sub}"/></ClipTrackItem></VideoClipTrackItem>`
      + `<SubClip ObjectID="${sub}"><Clip ObjectRef="${vc}"/></SubClip>`
      + `<VideoClip ObjectID="${vc}"><Clip>${mc ? '<IsMulticam>true</IsMulticam>' : ''}<SelectedTrackIndex>${sel}</SelectedTrackIndex></Clip></VideoClip>`;
  });
  return `<Sequence ObjectUID="seq-1"><TrackGroups><TrackGroup><Second ObjectRef="1"/></TrackGroup><TrackGroup><Second ObjectRef="2"/></TrackGroup></TrackGroups></Sequence>`
    + `<VideoTrackGroup ObjectID="1"><Tracks><Track Index="0" ObjectURef="trk-1"/></Tracks></VideoTrackGroup><AudioTrackGroup ObjectID="2"></AudioTrackGroup>`
    + `<VideoClipTrack ObjectUID="trk-1"><ClipItems><TrackItems>${items}</TrackItems></ClipItems></VideoClipTrack>` + objs;
}
const cut = (start, end, inn, extra = {}) => Object.assign({ start, end, in: inn, out: inn + end - start, startTicks: String(start * T), endTicks: String(end * T), mcId: 'mc' }, extra);
const read = {
  name: 'Concert', cuts: [cut(0, 2, 0), cut(2, 4, 2), cut(4, 6, 4), cut(6, 8, 6), cut(8, 10, 8)],
  multicams: { mc: { name: 'MC', angles: [
    { index: 0, clips: [{ itemId: 'stage', name: 'Stage.mp4', start: 0, end: 100, in: 0 }] },
    { index: 1, clips: [{ itemId: 'r1a', name: 'Roam1_A.mp4', start: 0, end: 5, in: 10 }, { itemId: 'r1b', name: 'Roam1_B.mp4', start: 5, end: 100, in: 0 }] },
    { index: 2, clips: [{ itemId: 'r2', name: 'Roam2.mp4', start: 1, end: 100, in: 3 }] }] } }
};

test('reads the active camera of every multicam cut on V1 from the saved project', () => {
  const a = M.activeAngles(project([[0, 2, 0], [2, 4, 1], [4, 6, 2], [6, 8, 1], [8, 10, 0], [10, 12, 2, false]]), 'seq-1');
  assert.deepStrictEqual([...a.values()], [0, 1, 2, 1, 0], 'a cut that isn’t multicam is left out');
  assert.strictEqual(a.get(String(2 * T) + '|' + String(4 * T)), 1);
  assert.strictEqual(M.activeAngles(project([[0, 2, 0]]), 'nope').size, 0);
});
test('keeps only the chosen cameras, each cut exactly as on screen, in edit order; a cut over two files gives two clips', () => {
  const angles = M.activeAngles(project([[0, 2, 0], [2, 4, 1], [4, 6, 2], [6, 8, 1], [8, 10, 0]]), 'seq-1');
  const keep = n => !/^Stage/.test(n);
  const p = M.plan(read, angles, keep, n => (/^Roam2/.test(n) ? 7 : null));
  // Roam1 2–4 s is file A 12–14; Roam2 4–6 s is 6–8; Roam1 6–8 s is file B 1–3
  assert.deepStrictEqual(p.pieces.map(x => [x.itemId, x.in, x.out, x.label]), [['r1a', 12, 14, null], ['r2', 6, 8, 7], ['r1b', 1, 3, null]]);
  const over = M.plan({ name: 'C', cuts: [cut(3, 7, 3)], multicams: read.multicams }, new Map([[String(3 * T) + '|' + String(7 * T), 1]]), () => true);
  assert.deepStrictEqual(over.pieces.map(x => [x.itemId, x.in, x.out]), [['r1a', 13, 15], ['r1b', 0, 2]]);
  assert.strictEqual(M.plan(read, new Map(), () => true).unknown, 5, 'cuts with no camera found are counted, not guessed');
});
test('cameras are named by file, with how much of the edit each one has', () => {
  const angles = M.activeAngles(project([[0, 2, 0], [2, 4, 1], [4, 6, 2], [6, 8, 1], [8, 10, 0]]), 'seq-1');
  assert.deepStrictEqual(M.cameras(read, angles).map(c => [c.name, c.cuts, c.seconds]), [['Stage.mp4', 2, 4], ['Roam1_A.mp4 +1 more', 2, 4], ['Roam2.mp4', 1, 2]]);
});
