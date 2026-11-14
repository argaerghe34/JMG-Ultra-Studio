// Story › Build while working on a sequence (Premiere): each line is taken from the sequence it's heard in – the
// multicam clip from a multicam's own sequence, or everything on every track of any other sequence. Runs jsx/host.jsx
// and jsx/tools/story.jsx against a small fake of Premiere where, as in Premiere, placing over a clip trims or splits it,
// and a clip with picture and sound lays both halves (on the tracks with the same number). It can't prove what real
// Premiere does – that's for a test in Premiere.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');
const TICKS = 254016000000;

function makePremiere({ multicam = false } = {}) {
  let next = 1;
  const nid = () => 'n' + (next++);
  class Time { constructor(s = 0) { this.ticks = String(Math.round(s * TICKS)); } get seconds() { return Number(this.ticks) / TICKS; } }
  const coll = (arr, key) => new Proxy({ get [key]() { return arr.length; } }, { get: (o, p) => (p in o ? o[p] : /^\d+$/.test(p) ? arr[+p] : undefined) });
  const kids = [];
  const root = { nodeId: 'root', type: 3, name: 'root', children: coll(kids, 'numItems') };
  function item(name, { video = true, audio = true, dur = 600 } = {}) {
    const it = { nodeId: nid(), name, type: 1, video, audio, dur, inPt: 0, outPt: dur, mc: false,
      getInPoint: () => new Time(it.inPt), getOutPoint: () => new Time(it.outPt), setInPoint(s) { it.inPt = s; }, setOutPoint(s) { it.outPt = s; },
      clearInPoint() { it.inPt = 0; }, clearOutPoint() { it.outPt = it.dur; }, isMulticamClip: () => it.mc, isSequence: () => false,
      getProjectColumnsMetadata: () => JSON.stringify([{ ColumnID: 'Column.Intrinsic.MediaDuration', ColumnValue: String(it.dur * TICKS) }]) };
    kids.push(it); return it;
  }
  function clip(it, start, end, inPt) {
    const c = { nodeId: nid(), projectItem: it, name: it.name, disabled: false, _s: start, _e: end, _in: inPt, getSpeed: () => 1 };
    Object.defineProperty(c, 'start', { get: () => new Time(c._s) }); Object.defineProperty(c, 'end', { get: () => new Time(c._e) });
    Object.defineProperty(c, 'inPoint', { get: () => new Time(c._in) }); Object.defineProperty(c, 'outPoint', { get: () => new Time(c._in + c._e - c._s) });
    return c;
  }
  function makeSeq(id, name, nv, na) {
    const s = { sequenceID: id, name, timebase: String(TICKS / 25), _v: [], _a: [] };
    const track = kind => {
      const clips = [];
      const tr = { clips: coll(clips, 'numItems'), _clips: clips, kind,
        // lay a clip: what's under it is trimmed or split, as in Premiere
        _lay(c) {
          for (let i = clips.length - 1; i >= 0; i--) {
            const o = clips[i];
            if (o._e <= c._s || o._s >= c._e) continue;
            if (o._s >= c._s && o._e <= c._e) { clips.splice(i, 1); continue; }
            if (o._s < c._s && o._e > c._e) { const tail = clip(o.projectItem, c._e, o._e, o._in + (c._e - o._s)); tail.remove = rm(tail); clips.push(tail); o._e = c._s; continue; }
            if (o._s < c._s) o._e = c._s; else { o._in += c._e - o._s; o._s = c._e; }
          }
          c.remove = rm(c); clips.push(c); clips.sort((a, b) => a._s - b._s);
        },
        overwriteClip(it, at) {
          const len = it.outPt - it.inPt, idx = (kind === 'v' ? s._v : s._a).indexOf(tr);
          if (kind === 'v' ? it.video : it.audio) tr._lay(clip(it, at, at + len, it.inPt));
          const other = kind === 'v' ? s._a[idx] : s._v[idx];   // the other half, on the track with the same number
          if (other && (kind === 'v' ? it.audio : it.video)) other._lay(clip(it, at, at + len, it.inPt));
          return true;
        } };
      const rm = c => () => { const i = clips.indexOf(c); if (i >= 0) clips.splice(i, 1); return true; };
      tr._add = c => { c.remove = rm(c); clips.push(c); clips.sort((a, b) => a._s - b._s); };
      return tr;
    };
    for (let i = 0; i < nv; i++) s._v.push(track('v'));
    for (let i = 0; i < na; i++) s._a.push(track('a'));
    s.videoTracks = coll(s._v, 'numTracks'); s.audioTracks = coll(s._a, 'numTracks');
    Object.defineProperty(s, 'end', { get: () => String(Math.round(Math.max(0, ...s._v.concat(s._a).flatMap(t => t._clips.map(c => c._e))) * TICKS)) });
    return s;
  }
  // the edit: camera A (with its own sound) on V1/A1, a room mic on A2, the interview mic on A3, a title on V2 from 40 to 60
  const camA = item('Cam A.mp4'), room = item('Room.wav', { video: false }), lav = item('Lav.wav', { video: false }), title = item('Title', { audio: false });
  const src = makeSeq('src', 'Concert edit', 2, 3), out = makeSeq('out', 'Selects', 1, 1);
  src._v[0]._add(clip(camA, 0, 300, 10)); src._a[0]._add(clip(camA, 0, 300, 10));
  src._a[1]._add(clip(room, 0, 300, 0)); src._a[2]._add(clip(lav, 0, 300, 3)); src._v[1]._add(clip(title, 40, 60, 0));
  const mcItem = item('Concert MC', { dur: 300 }); mcItem.mc = multicam;
  src.projectItem = mcItem;
  const seqs = [src, out];
  let active = out;
  const ctx = {
    app: { project: { rootItem: root, sequences: coll(seqs, 'numSequences'), get activeSequence() { return active; }, openSequence(id) { active = seqs.find(x => x.sequenceID === id); return true; } }, enableQE() {} },
    qe: { project: { getActiveSequence: () => ({ addTracks(nv, vi, na) { for (let i = 0; i < nv; i++) active._v.push(makeSeq('x', 'x', 1, 0)._v[0]); for (let i = 0; i < na; i++) active._a.push(makeSeq('x', 'x', 0, 1)._a[0]); return true; } }) } },
    Time, $: { os: 'Windows' }, File: function () { return { exists: false }; }, JSON
  };
  // tracks added by addTracks must belong to "out" so their overwriteClip finds the other half
  ctx.qe.project.getActiveSequence = () => ({ addTracks(nv, vi, na) { const tmp = makeSeq('tmp', 'tmp', active._v.length + nv, active._a.length + na); for (let i = active._v.length; i < tmp._v.length; i++) { const t = tmp._v[i]; active._v.push(t); } for (let i = active._a.length; i < tmp._a.length; i++) active._a.push(tmp._a[i]); rebind(active); return true; } });
  function rebind(s) {
    // the new tracks' "other half" lookups use their own sequence: point them at s
    for (const tr of s._v.concat(s._a)) {
      const kind = s._v.includes(tr) ? 'v' : 'a';
      tr.overwriteClip = (it, at) => {
        const len = it.outPt - it.inPt, idx = (kind === 'v' ? s._v : s._a).indexOf(tr);
        if (kind === 'v' ? it.video : it.audio) tr._lay(clip(it, at, at + len, it.inPt));
        const other = kind === 'v' ? s._a[idx] : s._v[idx];
        if (other && (kind === 'v' ? it.audio : it.video)) other._lay(clip(it, at, at + len, it.inPt));
        return true;
      };
    }
  }
  vm.createContext(ctx);
  for (const f of ['jsx/host.jsx', 'jsx/tools/story.jsx']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const call = (fn, a) => { const r = JSON.parse(ctx.UStudio.run(fn, JSON.stringify(a))); if (!r.ok) throw new Error(r.error.detail); return r.data; };
  return { call, src, out, camA, room, lav, title, mcItem };
}
const lay = tr => tr._clips.map(c => [c.projectItem.name, +c._s.toFixed(2), +c._e.toFixed(2), +c._in.toFixed(2)]);

test('every track of the sequence comes with each line: the camera with its own sound, both mics, the title where it is', () => {
  const P = makePremiere();
  const r = P.call('storyPlaceFromSequence', { seqId: 'out', srcSeqId: 'src', cursor: 0, ranges: [{ start: 10, end: 20 }, { start: 50, end: 55 }] });
  assert.strictEqual(r.how, 'tracks');
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.placed, [{ start: 0, end: 10 }, { start: 10, end: 15 }]);
  assert.strictEqual(r.cursor, 15);
  assert.deepStrictEqual(lay(P.out._v[0]), [['Cam A.mp4', 0, 10, 20], ['Cam A.mp4', 10, 15, 60]], 'camera picture, from the same moments');
  assert.deepStrictEqual(lay(P.out._v[1]), [['Title', 10, 15, 10]], 'the title only where it was on (50–55 s)');
  assert.deepStrictEqual(lay(P.out._a[0]), [['Cam A.mp4', 0, 10, 20], ['Cam A.mp4', 10, 15, 60]], 'the camera’s own sound on A1');
  assert.deepStrictEqual(lay(P.out._a[1]), [['Room.wav', 0, 10, 10], ['Room.wav', 10, 15, 50]]);
  assert.deepStrictEqual(lay(P.out._a[2]), [['Lav.wav', 0, 10, 13], ['Lav.wav', 10, 15, 53]]);
  assert.strictEqual(P.out._v.length, 2); assert.strictEqual(P.out._a.length, 3);
  assert.ok(P.camA.inPt === 0 && P.camA.outPt === 600 && P.room.inPt === 0, 'the clips’ own In/Out points are put back');
});

test('the multicam’s own sequence: each line is the multicam clip itself, cut to the line (its sound with it)', () => {
  const P = makePremiere({ multicam: true });
  const r = P.call('storyPlaceFromSequence', { seqId: 'out', srcSeqId: 'src', cursor: 4, ranges: [{ start: 10, end: 20 }, { start: 50, end: 55 }] });
  assert.strictEqual(r.how, 'multicam');
  assert.deepStrictEqual(lay(P.out._v[0]), [['Concert MC', 4, 14, 10], ['Concert MC', 14, 19, 50]]);
  assert.deepStrictEqual(lay(P.out._a[0]), [['Concert MC', 4, 14, 10], ['Concert MC', 14, 19, 50]]);
  assert.strictEqual(r.cursor, 19);
});

test('the multicam clips used in an edit, with their own sequence – most used first; a multicam’s own sequence says so', () => {
  const P = makePremiere({ multicam: true });
  // the edit ("out") uses the multicam clip twice (60 s in all) and camera A once (10 s)
  const mk = (it, s, e) => ({ nodeId: 'e' + s, projectItem: it, name: it.name, start: { seconds: s }, end: { seconds: e } });
  P.out._v[0]._clips.push(mk(P.mcItem, 0, 40), mk(P.camA, 40, 50), mk(P.mcItem, 50, 70));
  const r = P.call('storyMulticamsIn', { seqId: 'out' });
  assert.strictEqual(r.self, false);
  assert.deepStrictEqual(r.multicams.map(m => [m.id, m.name, m.uses, m.seconds]), [['src', 'Concert edit', 2, 60]]);
  assert.strictEqual(P.call('storyMulticamsIn', { seqId: 'src' }).self, true);
});
