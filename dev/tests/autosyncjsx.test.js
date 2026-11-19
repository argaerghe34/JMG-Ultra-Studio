// Runs jsx/host.jsx + jsx/tools/sync.jsx against a small stand-in for Premiere's ExtendScript objects. Premiere lays
// both halves of a clip and picks the other half's track itself; which track isn't something we could try from here,
// so the stand-in is run under three rules – the other half lands on the FIRST track, on the SAME-numbered track, or
// on the LAST – and overwriting cuts whatever is in the way, as Premiere does. Under each rule syncBuild has to end
// with every clip whole on its own track and nothing else on the sequence. What real Premiere does is checked by
// dev/e2e/60-autosync.e2e.js.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');
const TICKS = 254016000000;

function makePremiere(rule) {
  let nextId = 1;
  const coll = (arr, key = 'numItems') => new Proxy({}, { get: (o, p) => (p === key ? arr.length : /^\d+$/.test(String(p)) ? arr[+p] : undefined) });
  const time = s => ({ seconds: s, ticks: String(Math.round(s * TICKS)) });
  const log = [];
  function item(name, o = {}) {
    const k = [];
    const it = { nodeId: 'n' + (nextId++), name, type: o.type || 1, children: coll(k), _kids: k, _in: 0, _out: o.dur || 0, _label: o.label == null ? 3 : o.label, hasVideo: o.video !== false, hasAudio: o.audio !== false, dur: o.dur || 0, tc: o.tc,
      getMediaPath: () => '/m/' + name, isSequence: () => false, isOffline: () => false,
      getInPoint: () => time(it._in), getOutPoint: () => time(it._out), setInPoint(s) { it._in = s; }, setOutPoint(s) { it._out = s; }, clearInPoint() { it._in = 0; }, clearOutPoint() { it._out = it.dur; },
      getColorLabel: () => it._label, setColorLabel(l) { it._label = l; },
      getProjectColumnsMetadata: () => JSON.stringify([{ ColumnID: 'Column.Intrinsic.MediaDuration', ColumnValue: String(Math.round(it.dur * TICKS)) }, { ColumnID: 'Column.Intrinsic.MediaTimebase', ColumnValue: '25.00 fps' }].concat(it.tc === undefined ? [] : [{ ColumnID: 'Column.Intrinsic.MediaStart', ColumnValue: it.tc }])),
      createBin(n) { const b = item(n, { type: 2 }); k.push(b); return b; } };
    return it;
  }
  const root = item('root', { type: 3 });
  const seqs = [];
  function track(seq, isVideo, index) {
    const clips = [];
    const tr = { clips: coll(clips), _clips: clips, name: (isVideo ? 'Video ' : 'Audio ') + (index + 1), _mute: 0, setMute(m) { tr._mute = m; },
      overwriteClip(it, at) { lay(seq, isVideo, seq[isVideo ? '_v' : '_a'].indexOf(tr), it, at, true); return true; } };
    return tr;
  }
  /** Put a piece on a track, cutting whatever was in the way (Premiere's overwrite). */
  function put(seq, isVideo, index, it, at) {
    const tr = seq[isVideo ? '_v' : '_a'][index], len = it._out - it._in, end = at + len, keep = [];
    for (const c of tr._clips) {
      if (c.end.seconds <= at + 1e-9 || c.start.seconds >= end - 1e-9) { keep.push(c); continue; }
      if (c.start.seconds < at - 1e-9) keep.push(piece(tr, c.projectItem, c.start.seconds, at, c._label));
      if (c.end.seconds > end + 1e-9) keep.push(piece(tr, c.projectItem, end, c.end.seconds, c._label));
    }
    keep.push(piece(tr, it, at, end, it._label));
    keep.sort((a, b) => a.start.seconds - b.start.seconds);
    tr._clips.length = 0; tr._clips.push(...keep);
  }
  function piece(tr, it, s, e, label) { const c = { nodeId: 't' + (nextId++), projectItem: it, start: time(s), end: time(e), _label: label, remove() { tr._clips.splice(tr._clips.indexOf(c), 1); } }; return c; }
  function lay(seq, isVideo, index, it, at) {
    log.push([isVideo ? 'V' : 'A', index, it.name, at]);
    const has = isVideo ? it.hasVideo : it.hasAudio;
    if (!has) { // an audio file dropped on a video track (or the other way) – Premiere puts it where it can go
      const other = seq[isVideo ? '_a' : '_v']; return put(seq, !isVideo, Math.min(index, other.length - 1), it, at);
    }
    put(seq, isVideo, index, it, at);
    const otherHas = isVideo ? it.hasAudio : it.hasVideo;
    if (!otherHas) return;
    const others = seq[isVideo ? '_a' : '_v'];
    const where = rule === 'first' ? 0 : rule === 'last' ? others.length - 1 : Math.min(index, others.length - 1);
    put(seq, !isVideo, where, it, at);
  }
  function sequence(name) {
    const marks = [];
    const seq = { sequenceID: 's' + (nextId++), name, timebase: String(TICKS / 25), _v: [], _a: [], videoDisplayFormat: 101,
      markers: { getFirstMarker: () => marks[0] || null, getNextMarker: m => marks[marks.indexOf(m) + 1] || null, deleteMarker(m) { marks.splice(marks.indexOf(m), 1); },
        createMarker(s) { const m = { start: time(s), end: time(s), name: '', comments: '', guid: 'g' + (nextId++), setColorByIndex(c) { m.color = c; }, getColorByIndex: () => m.color || 0 }; marks.push(m); return m; } },
      _marks: marks, get end() { let e = 0; for (const t of seq._v.concat(seq._a)) for (const c of t._clips) e = Math.max(e, c.end.seconds); return String(Math.round(e * TICKS)); } };
    seq.videoTracks = coll(seq._v, 'numTracks'); seq.audioTracks = coll(seq._a, 'numTracks');
    for (let i = 0; i < 3; i++) { seq._v.push(track(seq, true, i)); seq._a.push(track(seq, false, i)); }
    return seq;
  }
  let active = null;
  const project = { rootItem: root, path: '/p/P.prproj', get sequences() { return coll(seqs, 'numSequences'); }, get activeSequence() { return active; },
    openSequence(id) { active = seqs.find(s => s.sequenceID === id); return true; },
    createNewSequenceFromClips(name, clips) { const s = sequence(name); seqs.push(s); lay(s, true, 0, clips[0], 0); return s; } };
  const qe = { project: { getActiveSequence: () => ({ addTracks(nv, vi, na) { for (let i = 0; i < nv; i++) active._v.push(track(active, true, active._v.length)); for (let i = 0; i < na; i++) active._a.push(track(active, false, active._a.length)); } }) } };
  const ctx = { app: { project, path: '/Applications/Premiere/', enableQE() {} }, qe, $: { os: 'Macintosh' }, JSON, File: function (p) { return { exists: fs.existsSync(p) }; }, Time: function () { this.seconds = 0; } };
  vm.createContext(ctx);
  for (const f of ['jsx/host.jsx', 'jsx/tools/sync.jsx']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const add = (name, o) => { const it = item(name, o); root._kids.push(it); return it; };
  // results come from another JavaScript world: through JSON, so they compare as plain values here
  const fn = new Proxy({}, { get: (o, name) => a => JSON.parse(JSON.stringify(ctx.UStudio.fn[name](a))) });
  return { fn, add, seqs, log, root };
}
const shape = seq => ({
  v: seq._v.map(t => t._clips.map(c => `${c.projectItem.name}@${c.start.seconds}-${c.end.seconds}`)),
  a: seq._a.map(t => t._clips.map(c => `${c.projectItem.name}@${c.start.seconds}-${c.end.seconds}`)) });

for (const rule of ['first', 'same', 'last']) {
  test(`auto sync in Premiere (the other half lands on the ${rule} track): every clip whole on its own track, nothing else, the bin clips as they were`, () => {
    const P = makePremiere(rule);
    const A1 = P.add('A1.mp4', { dur: 40 }), A2 = P.add('A2.mp4', { dur: 60 }), B1 = P.add('B1.mp4', { dur: 80 }), C1 = P.add('C1-mute.mp4', { dur: 50, audio: false }), W = P.add('F6.wav', { dur: 120, video: false });
    A2._in = 5; A2._out = 55;   // the editor's own In and Out on a clip in the bin
    const r = P.fn.syncBuild({ name: 'Wedding – synced', likeId: A1.nodeId, layers: [
      { id: A1.nodeId, in: 0, out: 40, at: 10, v: 0, a: 0, label: 4 }, { id: A2.nodeId, in: 10, out: 40, at: 70, v: 0, a: 0, label: 4 },
      { id: B1.nodeId, in: 0, out: 80, at: 20, v: 1, a: 1, label: 7 }, { id: C1.nodeId, in: 0, out: 50, at: 30, v: 2, a: null, label: 5 },
      { id: W.nodeId, in: 0, out: 120, at: 0, v: null, a: 3, label: 6 }],
      videoNames: ['A cam', 'B cam', 'C cam'], audioNames: ['A cam', 'B cam', '', 'Zoom'], mute: [0, 1], markers: [{ start: 0, name: 'Synced group 1', color: 0 }] });
    assert.deepStrictEqual(r.missing, [], 'nothing missing');
    assert.strictEqual(r.placed, 5); assert.ok(r.passes <= 5);
    const seq = P.seqs[0];
    assert.strictEqual(seq.name, 'Wedding – synced'); assert.strictEqual(r.id, seq.sequenceID);
    assert.deepStrictEqual(shape(seq), {
      v: [['A1.mp4@10-50', 'A2.mp4@70-100'], ['B1.mp4@20-100'], ['C1-mute.mp4@30-80']],
      a: [['A1.mp4@10-50', 'A2.mp4@70-100'], ['B1.mp4@20-100'], [], ['F6.wav@0-120']] });
    // each camera's colour on the sequence; the clips in the bin keep their own label and their own In and Out
    assert.deepStrictEqual(seq._v.map(t => t._clips[0]._label), [4, 7, 5]); assert.strictEqual(seq._a[3]._clips[0]._label, 6);
    for (const it of [A1, A2, B1, C1, W]) assert.strictEqual(it._label, 3, it.name + ' label');
    assert.deepStrictEqual([A2._in, A2._out, A1._in, A1._out], [5, 55, 0, 40]);
    assert.deepStrictEqual(seq._a.map(t => t._mute), [1, 1, 0, 0]);
    assert.deepStrictEqual(seq._marks.map(m => m.name), ['Synced group 1']);
    assert.deepStrictEqual(seq._v.map(t => t.name), ['A cam', 'B cam', 'C cam']);
  });
}

test('auto sync in Premiere: a layer that can’t be laid is reported, not hidden; timecodes read as ticks or as text, none when there isn’t one', () => {
  const P = makePremiere('first');
  const A = P.add('A.mp4', { dur: 40, tc: String(3600 * TICKS) }), B = P.add('B.mp4', { dur: 40, tc: '01:00:10:00' }), C = P.add('C.mp4', { dur: 40 }), D = P.add('D.mp4', { dur: 40, tc: '' });
  assert.deepStrictEqual(P.fn.syncTimecodes({ ids: [A.nodeId, B.nodeId, C.nodeId, D.nodeId, 'gone'] }), [{ id: A.nodeId, start: 3600 }, { id: B.nodeId, start: 3610 }, { id: C.nodeId, start: null }, { id: D.nodeId, start: null }, { id: 'gone', start: null }]);
  // two layers wanting the same place on one track: only one can be there
  const r = P.fn.syncBuild({ name: 'Clash', likeId: A.nodeId, layers: [{ id: A.nodeId, in: 0, out: 40, at: 0, v: 0, a: 0 }, { id: B.nodeId, in: 0, out: 40, at: 10, v: 0, a: 0 }] });
  assert.strictEqual(r.missing.length, 1); assert.strictEqual(r.placed, 1); assert.strictEqual(r.passes, 5);
});
