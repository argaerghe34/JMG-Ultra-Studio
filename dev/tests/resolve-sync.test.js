// resolve/host/sync.js against the stand-in Resolve (dev/tests/resolve-fake.js): the same syncBuild and syncTimecodes
// as Premiere's – a new timeline, each camera's picture and sound on its own tracks at the right frame, a recorder's
// sound only on its audio track, names, colours, the muted tracks and the markers.
'use strict';
const assert = require('assert');
const { test } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');

function setup() {
  const F = Fake.make({});
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.detail}`); return r.data; };
  return { F, host, run };
}
const geo = (tl, type, t) => tl.GetItemListInTrack(type, t).map(i => [i._start - tl._start, i._end - tl._start, i._srcStart]);

test('resolve auto sync: the commands are there, with Premiere’s names', () => {
  const { host } = setup();
  for (const n of ['syncBuild', 'syncTimecodes']) assert.strictEqual(typeof host.fns[n], 'function', n);
});

test('resolve auto sync: a new timeline with each camera and recorder on its own tracks, at the right frames', async () => {
  const { F, run } = setup();
  const A = F.addMedia('/m/A1.mp4', { frames: 1000 }), B = F.addMedia('/m/B1.mp4', { frames: 2000 }), W = F.addMedia('/m/F6.wav', { frames: 3000, type: 'Audio' });
  const id = x => x.GetUniqueId();
  const before = F.timelines.length;
  const r = await run('syncBuild', { name: 'Wedding – synced', likeId: id(A), layers: [
    { id: id(A), in: 0, out: 40, at: 10, v: 0, a: 0, label: 4 }, { id: id(B), in: 2, out: 80, at: 20, v: 1, a: 1, label: 7 }, { id: id(W), in: 0, out: 120, at: 0, v: null, a: 2, label: null }],
    videoNames: ['A cam', 'B cam'], audioNames: ['A cam', 'B cam', 'Zoom'], mute: [0], markers: [{ start: 0, name: 'Synced group 1', color: 0 }] });
  assert.strictEqual(F.timelines.length, before + 1, 'one new timeline');
  assert.deepStrictEqual(r.missing, []); assert.strictEqual(r.placed, 3); assert.strictEqual(r.name, 'Wedding – synced');
  const tl = F.timelines[F.timelines.length - 1];
  assert.deepStrictEqual(geo(tl, 'video', 1), [[250, 1250, 0]]);
  assert.deepStrictEqual(geo(tl, 'audio', 1), [[250, 1250, 0]]);
  assert.deepStrictEqual(geo(tl, 'video', 2), [[500, 2450, 50]]);
  assert.deepStrictEqual(geo(tl, 'audio', 2), [[500, 2450, 50]]);
  assert.deepStrictEqual(geo(tl, 'audio', 3), [[0, 3000, 0]]);
  assert.strictEqual(tl.GetItemListInTrack('video', 3).length, 0, 'the recorder has no picture layer');
  assert.deepStrictEqual([tl._vName[0], tl._vName[1], tl._aName[2]], ['A cam', 'B cam', 'Zoom']);
  assert.strictEqual(tl.GetItemListInTrack('video', 1)[0]._color, 'Blue'); assert.strictEqual(tl.GetItemListInTrack('audio', 2)[0]._color, 'Orange');
  assert.ok(!tl.GetItemListInTrack('audio', 3)[0]._color, 'no colour asked, none set');
  assert.strictEqual(r.named, 5);
  assert.strictEqual(Object.keys(tl.GetMarkers()).length, 1);
});

test('resolve auto sync: start timecodes in seconds; none when the clip has none', async () => {
  const { F, run } = setup();
  const A = F.addMedia('/m/A.mp4', { frames: 500 }), B = F.addMedia('/m/B.mp4', { frames: 500 });
  const pa = A._props, pb = B._props;
  A._props = () => Object.assign(pa(), { 'Start TC': '01:00:10:00' });
  B._props = () => Object.assign(pb(), { 'Start TC': '' });
  const r = await run('syncTimecodes', { ids: [A.GetUniqueId(), B.GetUniqueId(), 'gone'] });
  assert.deepStrictEqual(r, [{ id: A.GetUniqueId(), start: 3610 }, { id: B.GetUniqueId(), start: null }, { id: 'gone', start: null }]);
});
