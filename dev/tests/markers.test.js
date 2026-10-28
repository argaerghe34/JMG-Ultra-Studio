// Settings › Markers: sequence markers on the timeline, on the clips under them, or both – in Premiere (jsx/host.jsx
// against a small fake of Premiere) and the panel passing the setting to every tool.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { load, test, ROOT } = require('./harness');

function markerColl() {
  const list = [];
  let n = 0;
  return {
    _list: list,
    createMarker(s) {
      // like Premiere: the end is set in seconds and read back as a Time
      let end = s;
      const m = { guid: 'g' + (++n) + '-x', start: { seconds: s }, get end() { return { seconds: end }; }, set end(v) { end = v; }, name: '', comments: '', setColorByIndex(c) { m.color = c; }, getColorByIndex() { return m.color; } };
      list.push(m); return m;
    },
    getFirstMarker() { return list[0] || null; },
    getNextMarker(m) { return list[list.indexOf(m) + 1] || null; },
    deleteMarker(m) { list.splice(list.indexOf(m), 1); }
  };
}
function premiere() {
  const item = (id, name) => ({ nodeId: id, name, type: 1, _m: markerColl(), getMarkers() { return this._m; } });
  const a = item('item-a', 'A.mp4'), b = item('item-b', 'B.mp4'), music = item('item-m', 'Music.wav');
  const T = s => ({ seconds: s });
  const clip = (pi, start, end, inP, { disabled = false, speed = 1 } = {}) => ({ projectItem: pi, start: T(start), end: T(end), inPoint: T(inP), outPoint: T(inP + (end - start) * speed), disabled, getSpeed: () => speed });
  const coll = (arr, key) => Object.assign(arr.slice(), { [key]: arr.length });
  const tracks = (list, key) => coll(list.map(clips => ({ clips: coll(clips, 'numItems') })), key);
  // V1: A 0–10 (from 5 s into A), B 10–20 at double speed; V2: B again 4–6 but disabled; A1: music 0–30
  const seq = { sequenceID: 's1', name: 'Cut', markers: markerColl(),
    videoTracks: tracks([[clip(a, 0, 10, 5), clip(b, 10, 20, 0, { speed: 2 })], [clip(b, 4, 6, 50, { disabled: true })]], 'numTracks'),
    audioTracks: tracks([[clip(music, 0, 30, 0)]], 'numTracks') };
  const root = { nodeId: 'root', type: 3, children: coll([a, b, music], 'numItems') };
  const ctx = { app: { project: { rootItem: root, sequences: coll([seq], 'numSequences'), activeSequence: seq } }, JSON };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx', 'host.jsx'), 'utf8') + '\n;this.UStudio = UStudio;', ctx);
  const call = (fn, args) => { const r = JSON.parse(ctx.UStudio.run(fn, JSON.stringify(args))); if (!r.ok) throw new Error(JSON.stringify(r.error)); return r.data; };
  return { call, seq, a, b, music };
}

test('markers: “Timeline” (the default) leaves them on the sequence only', () => {
  const P = premiere();
  const g = P.call('addSequenceMarkers', { seqId: 's1', markers: [{ start: 2, name: 'one' }] });
  assert.strictEqual(P.seq.markers._list.length, 1);
  assert.strictEqual(P.a._m._list.length, 0);
  assert.ok(!g[0].startsWith('clip:'));
});

test('markers: “Clips” puts each marker on the source clip under it, at the clip’s own time and length', () => {
  const P = premiere();
  const g = P.call('addSequenceMarkers', { seqId: 's1', where: 'clips', markers: [
    { start: 2, end: 4, name: 'in A', color: 3 },     // A starts 5 s into its media: 7–9 s of A
    { start: 5, name: 'under a disabled clip' },     // V2's B is disabled, so A (V1) at 10 s
    { start: 12, end: 14, name: 'in B fast' },       // B at double speed: 4 s into B, 4 s long
    { start: 25, name: 'music only' }                // no video: the music clip
  ] });
  assert.strictEqual(P.seq.markers._list.length, 0, 'nothing on the timeline');
  const am = P.a._m._list, bm = P.b._m._list, mm = P.music._m._list;
  assert.deepStrictEqual(am.map(m => [m.start.seconds, m.end.seconds, m.name]), [[7, 9, 'in A'], [10, 10, 'under a disabled clip']]);
  assert.strictEqual(am[0].color, 3);
  assert.deepStrictEqual(bm.map(m => [m.start.seconds, m.end.seconds]), [[4, 8]]);
  assert.deepStrictEqual(mm.map(m => m.start.seconds), [25]);
  assert.ok(g.every(x => /^clip:item-[abm]:g\d+-x$/.test(x)), g.join());
  // the Remove buttons pass the same ids back
  assert.strictEqual(P.call('removeSequenceMarkers', { seqId: 's1', guids: g }), 4);
  assert.strictEqual(am.length + bm.length + mm.length, 0);
});

test('markers: “Clips” keeps a marker with no clip under it on the timeline; “Both” puts it in both places', () => {
  const P = premiere();
  const g = P.call('addSequenceMarkers', { seqId: 's1', where: 'clips', markers: [{ start: 40, name: 'past the end' }] });
  assert.strictEqual(P.seq.markers._list.length, 1);
  assert.ok(!g[0].startsWith('clip:'));
  const g2 = P.call('addSequenceMarkers', { seqId: 's1', where: 'both', markers: [{ start: 1, name: 'both' }] });
  assert.strictEqual(g2.length, 2);
  assert.strictEqual(P.a._m._list.length, 1);
  assert.strictEqual(P.seq.markers._list.length, 2);
  assert.strictEqual(P.call('removeSequenceMarkers', { seqId: 's1', guids: g.concat(g2) }), 3);
  assert.strictEqual(P.seq.markers._list.length + P.a._m._list.length, 0);
});

test('markers: the panel sends the Settings choice with every sequence marker request', async () => {
  const US = load();
  const sent = [];
  const keep = US.host.rawEval;
  global.__adobe_cep__ = window.__adobe_cep__ = { evalScript(script, cb) { sent.push(script); cb(JSON.stringify({ ok: true, data: [] })); } };
  try {
    US.settings.set('markers.where', 'clips');
    await US.host.call('addSequenceMarkers', { seqId: 's1', markers: [] });
    await US.host.call('addSequenceMarkers', { seqId: 's1', markers: [], where: 'sequence' });
    assert.ok(sent[0].includes('\\"where\\":\\"clips\\"'), sent[0]);
    assert.ok(sent[1].includes('\\"where\\":\\"sequence\\"'), 'a tool can still ask for the timeline');
  } finally { US.settings.set('markers.where', 'sequence'); delete window.__adobe_cep__; US.host.rawEval = keep; }
});
