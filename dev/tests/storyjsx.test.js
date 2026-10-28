// Runs jsx/host.jsx + jsx/tools/story.jsx against a small fake of Premiere's ExtendScript object model, to check the
// control flow of the colour/label-layer code (labels restored, fallbacks, track choice). It cannot prove what real
// Premiere does – those points are listed in the report and checked by dev/e2e/22-story.e2e.js.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');
const TICKS = 254016000000;

function makePremiere({ clipColours = false, adjustment = false, qeMethods = ['newTransparentVideo'], transparentArgs = 5, clipNameWritable = true, endWritable = true, tracks = 3, overwriteThrows = false, trackNamesWritable = true } = {}) {
  let nextId = 1;
  const id = () => 'n' + (nextId++);
  class Time { constructor() { this.ticks = '0'; } get seconds() { return Number(this.ticks) / TICKS; } set seconds(s) { this.ticks = String(Math.round(s * TICKS)); } }
  const T = s => { const t = new Time(); t.seconds = s; return t; };
  function coll(arr, key) { const c = { get [key]() { return arr.length; } }; return new Proxy(c, { get: (o, p) => (p in o ? o[p] : /^\d+$/.test(p) ? arr[+p] : undefined) }); }
  function item(name, { type = 1, duration = 90, label = 0, path: p = '/media/' + name, adj = false, kids = null } = {}) {
    const children = kids || [];
    const it = {
      nodeId: id(), name, type, label, dur: duration, inPt: 0, outPt: duration, adj, path: p, parent: null, children: coll(children, 'numItems'), _kids: children,
      get treePath() { return '\\P.prproj\\' + (it.parent && it.parent.type === 2 ? it.parent.name + '\\' : '') + name; },
      getColorLabel() { return it.label; }, setColorLabel(n) { it.label = n; return true; },
      getInPoint() { return T(it.inPt); }, getOutPoint() { return T(it.outPt); },
      setInPoint(s) { it.inPt = s; return true; }, setOutPoint(s) { it.outPt = s; return true; }, clearInPoint() { it.inPt = 0; }, clearOutPoint() { it.outPt = it.dur; },
      getMediaPath() { return it.path; }, isSequence() { return false; }, isAdjustmentLayer() { return it.adj; }, isOffline() { return false; },
      getProjectColumnsMetadata() { return JSON.stringify([{ ColumnID: 'Column.Intrinsic.MediaDuration', ColumnValue: String(it.dur * TICKS) }]); },
      moveBin(bin) { if (it.parent) it.parent._kids.splice(it.parent._kids.indexOf(it), 1); bin._kids.push(it); it.parent = bin; },
      createBin(n) { const b = item(n, { type: 2, kids: [] }); it._kids.push(b); b.parent = it; return b; },
      createSubClip(n, a, b) { const sc = item(n, { duration: (Number(b) - Number(a)) / TICKS, path: it.path }); sc.subOf = it; sc.subStart = Number(a) / TICKS; root._kids.push(sc); sc.parent = root; return sc; }
    };
    return it;
  }
  const root = item('root', { type: 3, kids: [] });
  const add = (it, parent = root) => { parent._kids.push(it); it.parent = parent; return it; };
  const interview = add(item('I001.mp4', { label: 3 }));
  if (adjustment) add(item('Adjustment Layer', { adj: true, duration: 5, label: 1 }));
  const logs = [];
  function track(kind, n) {
    const clips = [];
    return {
      name: (kind === 'v' ? 'Video ' : 'Audio ') + n,
      _clips: clips, clips: coll(clips, 'numItems'),
      overwriteClip(it, at) {
        if (overwriteThrows) throw new Error('boom');
        const src = it.subOf || it, off = it.subOf ? it.subStart : 0;
        const len = it.outPt - it.inPt;
        const ti = { projectItem: it, label: it.label, _name: it.name, start: T(at), _end: at + len, inPoint: T(off + it.inPt), outPoint: T(off + it.outPt), nodeId: id() };
        ti.remove = () => { const i = clips.indexOf(ti); if (i >= 0) clips.splice(i, 1); return true; };
        // newer Premiere: a timeline clip's own colour label can be read and set by script
        if (clipColours) { ti.getColorLabel = () => ti.label; ti.setColorLabel = n => { ti.label = n; return true; }; }
        Object.defineProperty(ti, 'end', { get: () => T(ti._end), set: v => { if (!endWritable) throw new Error('read only'); ti._end = typeof v === 'object' ? v.seconds : Number(v) / TICKS; } });
        Object.defineProperty(ti, 'name', { get: () => ti._name, set: v => { if (!clipNameWritable) throw new Error('read only'); ti._name = v; } });
        for (let i = clips.length - 1; i >= 0; i--) if (clips[i].start.seconds < ti._end && clips[i]._end > at) clips.splice(i, 1);
        clips.push(ti); clips.sort((a, b) => a.start.seconds - b.start.seconds);
        if (kind === 'v' && !it.adj && src !== null && it.name !== 'Ultra Studio theme label' && !/transparent/i.test(it.name)) seq._a[0].overwriteClipAudio(ti);
        return true;
      },
      overwriteClipAudio(vti) { clips.push(Object.assign({}, vti)); }
    };
  }
  const seq = { sequenceID: 's1', name: 'Seq', timebase: String(TICKS / 25), frameSizeHorizontal: 1920, frameSizeVertical: 1080, videoDisplayFormat: 101, _v: [], _a: [] };
  for (let i = 0; i < tracks; i++) { seq._v.push(track('v', i + 1)); seq._a.push(track('a', i + 1)); }
  seq.videoTracks = coll(seq._v, 'numTracks'); seq.audioTracks = coll(seq._a, 'numTracks');
  Object.defineProperty(seq, 'end', { get: () => String(Math.round(Math.max(0, ...seq._v.flatMap(t => t._clips.map(c => c._end))) * TICKS)) });
  // sequence In/Out (seconds, like Premiere 26) and a Media Encoder that records what it was given
  seq._io = [0, 0];
  seq.setInPoint = s => { if (typeof s !== 'number') throw new Error('seconds only'); seq._io[0] = s; };
  seq.setOutPoint = s => { if (typeof s !== 'number') throw new Error('seconds only'); seq._io[1] = s; };
  seq.getInPointAsTime = () => T(seq._io[0]); seq.getOutPointAsTime = () => T(seq._io[1]);
  seq.getExportFileExtension = () => 'mov';
  const encoded = [];
  const encoder = { launchEncoder() {}, encodeSequence(s, out, preset, area) { encoded.push({ out, preset, area, io: s._io.slice() }); return String(encoded.length); } };
  const project = { rootItem: root, path: '/x/P.prproj', name: 'P.prproj', activeSequence: seq, sequences: coll([seq], 'numSequences'), openSequence() { return true; } };
  const qeProject = {
    reflect: { methods: qeMethods.map(n => ({ name: n })) },
    getActiveSequence: () => ({
      addTracks(nv) { for (let i = 0; i < nv; i++) { seq._v.push(track('v', seq._v.length + 1)); seq._a.push(track('a', seq._a.length + 1)); } return true; },
      getVideoTrackAt: i => ({ setName(n) { if (!trackNamesWritable) throw new Error('no'); seq._v[i].name = n; return true; } })
    }),
    newTransparentVideo(...args) { logs.push('newTransparentVideo/' + args.length); if (args.length !== transparentArgs) throw new Error('bad args'); add(item('Transparent Video', { duration: 5 })); return true; },
    newAdjustmentLayer(...args) { logs.push('newAdjustmentLayer/' + args.length); if (args.length !== 5) throw new Error('bad args'); add(item('Adjustment Layer', { adj: true, duration: 5 })); return true; }
  };
  const ctx = { app: { project, enableQE() {}, path: '/Applications/Premiere/', encoder }, qe: { project: qeProject }, Time, $: { os: 'Macintosh' }, File: function () { return { exists: false }; }, JSON };
  vm.createContext(ctx);
  // alphabetical, as Premiere loads them: finish.jsx comes first and only reaches story.jsx's label-clip helpers when called
  for (const f of ['jsx/host.jsx', 'jsx/tools/finish.jsx', 'jsx/tools/story.jsx']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const call = (fn, args) => { const r = JSON.parse(ctx.UStudio.run(fn, JSON.stringify(args))); if (!r.ok) { const e = new Error(r.error.detail); e.code = r.error.code; e.title = r.error.title; throw e; } return r.data; };
  return { call, seq, root, interview, logs, encoded, findAll: name => { const out = []; ctx.UStudio.walk(root, c => { if (c.name === name) out.push(c); }); return out; } };
}

test('relabel: timeline clips get the theme colour, the source clip keeps its own', () => {
  const P = makePremiere();
  const r = P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 1, out: 4, label: 7 }, { id: P.interview.nodeId, in: 10, out: 12, label: 5 }, { id: P.interview.nodeId, in: 20, out: 21 }] });
  const v = P.seq._v[0]._clips;
  assert.deepStrictEqual(v.map(c => c.label), [7, 5, 3]);
  assert.deepStrictEqual(r.placed.map(p => [p.start, p.end]), [[0, 3], [3, 5], [5, 6]]);
  assert.strictEqual(P.interview.label, 3, 'label restored');
  assert.strictEqual(P.interview.inPt, 0); assert.strictEqual(P.interview.outPt, 90);
  assert.strictEqual(r.method, 'relabel');
});
test('relabel: the source label is restored even when Premiere refuses to place', () => {
  const P = makePremiere({ overwriteThrows: true });
  assert.throws(() => P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 1, out: 4, label: 7 }] }));
  assert.strictEqual(P.interview.label, 3);
});
test('subclips fallback: labelled subclips placed whole, in their own bin', () => {
  const P = makePremiere();
  const r = P.call('storyPlace', { seqId: 's1', cursor: 2, method: 'subclips', binPath: 'Test/Story clips', clips: [{ id: P.interview.nodeId, in: 1, out: 4, label: 7, name: '01 Ruth' }, { id: P.interview.nodeId, in: 30, out: 35, label: 9, name: '02 Ruth' }] });
  const v = P.seq._v[0]._clips;
  assert.deepStrictEqual(v.map(c => [c.label, c.start.seconds, c.inPoint.seconds, c.outPoint.seconds]), [[7, 2, 1, 4], [9, 5, 30, 35]]);
  assert.strictEqual(r.cursor, 10);
  assert.strictEqual(P.findAll('01 Ruth')[0].parent.name, 'Story clips');
  assert.strictEqual(P.interview.label, 3);
});
test('theme layers: uses the project’s adjustment layer, on the track above the clips, named per theme', () => {
  const P = makePremiere({ adjustment: true });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 10 }, { id: P.interview.nodeId, in: 20, out: 26 }] });
  const r = P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Family', start: 0, end: 10, label: 7 }, { name: 'Faith', start: 10, end: 16, label: 5 }] });
  assert.strictEqual(r.kind, 'adjustment'); assert.strictEqual(r.track, 1); assert.strictEqual(r.placed, 2); assert.strictEqual(r.renamed, 2);
  const layer = P.seq._v[1]._clips;
  assert.deepStrictEqual(layer.map(c => [c.name, c.start.seconds, c.end.seconds, c.label]), [['Family', 0, 10, 7], ['Faith', 10, 16, 5]]);
  const adj = P.findAll('Adjustment Layer')[0];
  assert.ok(adj && adj.label === 1 && adj.inPt === 0 && adj.outPt === 5, 'adjustment layer item left as it was');
});
test('theme layers: no adjustment layer → tries an adjustment creator, then transparent video; reuses it next time', () => {
  const P = makePremiere({ qeMethods: ['newBarsAndTone', 'newTransparentVideo'], transparentArgs: 3 });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 8 }] });
  const r = P.call('storyThemeLayers', { seqId: 's1', binPath: 'Test/Story', sections: [{ name: 'Hope', start: 0, end: 8 }] });
  assert.strictEqual(r.kind, 'transparent'); assert.ok(/newTransparentVideo\(3/.test(r.how), r.how);
  assert.deepStrictEqual(P.logs, ['newTransparentVideo/5', 'newTransparentVideo/5', 'newTransparentVideo/3'], 'fullest call first, never a bare call');
  const made = P.findAll('Ultra Studio theme label');
  assert.strictEqual(made.length, 1); assert.strictEqual(made[0].parent.name, 'Story');
  assert.strictEqual(P.seq._v[1]._clips[0].name, 'Hope');
  const r2 = P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Again', start: 0, end: 8 }] });
  assert.strictEqual(r2.how, 'reused label clip');
  assert.strictEqual(P.findAll('Ultra Studio theme label').length, 1);
});
test('theme layers: an adjustment-layer creator, if Premiere has one, wins', () => {
  const P = makePremiere({ qeMethods: ['newAdjustmentLayer', 'newTransparentVideo'] });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 8 }] });
  const r = P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Hope', start: 0, end: 8 }] });
  assert.strictEqual(r.kind, 'adjustment'); assert.ok(/newAdjustmentLayer/.test(r.how));
});
test('theme layers: clip names come from the item even when timeline names are read-only; adds a track when all are used', () => {
  const P = makePremiere({ adjustment: true, clipNameWritable: false, tracks: 1 });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 8 }] });
  const r = P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Gratitude', start: 0, end: 8 }] });
  assert.strictEqual(r.track, 1); assert.strictEqual(P.seq._v.length, 2);
  assert.strictEqual(r.renamed, 1); assert.strictEqual(P.seq._v[1]._clips[0].name, 'Gratitude');
});
test('theme layers: length fixed after placing when the in/out route falls short', () => {
  const P = makePremiere({ adjustment: true });
  // pretend Premiere caps the adjustment layer at its 5 s default: honour setOutPoint only up to 5 s
  const adj = P.findAll('Adjustment Layer')[0]; const so = adj.setOutPoint; adj.setOutPoint = s => so(Math.min(5, s));
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 12 }] });
  const r = P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Long', start: 0, end: 12 }] });
  assert.strictEqual(P.seq._v[1]._clips[0].end.seconds, 12, r.log.join('; '));
});
test('theme layers: plain message when nothing can be made', () => {
  const P = makePremiere({ qeMethods: [], transparentArgs: 99 });
  let e = null; try { P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'X', start: 0, end: 2 }] }); } catch (x) { e = x; }
  assert.ok(e && /Couldn’t add the theme layer/.test(e.title));
});

test('highlights on a string-out: a “Selects” track above the interviews, one named, coloured clip per selected line', () => {
  const P = makePremiere({ adjustment: true });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 30 }] });
  const r = P.call('storyHighlights', { seqId: 's1', sections: [{ name: 'Family · My name is Ruth', start: 0.6, end: 5.3, label: 7 }, { name: 'Faith · When I was twelve', start: 12.5, end: 19, label: 5 }] });
  assert.deepStrictEqual([r.track, r.named, r.placed, r.renamed, r.removed], [1, true, 2, 2, 0]);
  assert.strictEqual(P.seq._v[1].name, 'Selects');
  assert.deepStrictEqual(P.seq._v[1]._clips.map(c => [c.name, c.label, c.start.seconds, c.end.seconds]), [['Family · My name is Ruth', 7, 0.6, 5.3], ['Faith · When I was twelve', 5, 12.5, 19]]);
});
test('highlights: running again replaces them (your own clips on that track stay); Remove clears them', () => {
  const P = makePremiere({ adjustment: true });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 30 }] });
  P.call('storyHighlights', { seqId: 's1', sections: [{ name: 'A', start: 1, end: 2 }, { name: 'B', start: 3, end: 4 }] });
  P.seq._v[1].overwriteClip(P.interview, 20); // the editor put something of their own on the Selects track
  const r = P.call('storyHighlights', { seqId: 's1', sections: [{ name: 'C', start: 5, end: 6, label: 2 }] });
  assert.deepStrictEqual([r.track, r.removed, r.placed], [1, 2, 1]);
  assert.deepStrictEqual(P.seq._v[1]._clips.map(c => c.name), ['C', 'I001.mp4']);
  const x = P.call('storyRemoveHighlights', { seqId: 's1', trackName: 'Selects' });
  assert.strictEqual(x.removed, 1);
  assert.deepStrictEqual(P.seq._v[1]._clips.map(c => c.name), ['I001.mp4']);
});
test('highlights: when the track can’t be renamed, the remembered track is reused only if it holds nothing but highlights', () => {
  const P = makePremiere({ adjustment: true, trackNamesWritable: false });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 30 }] });
  const r1 = P.call('storyHighlights', { seqId: 's1', sections: [{ name: 'A', start: 1, end: 2 }] });
  assert.strictEqual(r1.named, false);
  const r2 = P.call('storyHighlights', { seqId: 's1', trackIndex: r1.track, sections: [{ name: 'B', start: 3, end: 4 }] });
  assert.deepStrictEqual([r2.track, r2.removed], [r1.track, 1]);
  P.seq._v[r1.track].overwriteClip(P.interview, 20);
  const r3 = P.call('storyHighlights', { seqId: 's1', trackIndex: r1.track, sections: [{ name: 'C', start: 5, end: 6 }] });
  assert.notStrictEqual(r3.track, r1.track, 'a track with the editor’s own clips is never treated as ours');
});

/* ---------- Deliver › Render ranges (finish.jsx) ---------- */
test('render ranges: added on a new top track named “Renders”, named, listed in order; the track is reused', () => {
  const P = makePremiere({ adjustment: true });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 60 }] });
  const a = P.call('addRenderRange', { seqId: 's1', name: 'Teaser 30s', start: 10, end: 40 });
  const b = P.call('addRenderRange', { seqId: 's1', name: 'Hook', start: 0, end: 5 });
  assert.strictEqual(a.kind, 'adjustment'); assert.strictEqual(a.track, 3); assert.strictEqual(b.track, 3, 'same track the second time');
  assert.strictEqual(P.seq._v[3].name, 'Renders');
  const r = P.call('renderRanges', { seqId: 's1' });
  assert.strictEqual(r.track, 3);
  assert.deepStrictEqual(r.ranges.map(x => [x.name, x.start, x.end]), [['Hook', 0, 5], ['Teaser 30s', 10, 40]]);
  assert.strictEqual(P.findAll('Adjustment Layer').length, 1, 'the project’s adjustment layer keeps its name');
});
test('render ranges: no adjustment layer → an invisible clip, still found as a range', () => {
  const P = makePremiere();
  const a = P.call('addRenderRange', { seqId: 's1', name: 'Clip A', start: 2, end: 4 });
  assert.strictEqual(a.kind, 'transparent');
  assert.deepStrictEqual(P.call('renderRanges', { seqId: 's1' }).ranges.map(x => x.name), ['Clip A']);
  assert.throws(() => P.call('addRenderRange', { seqId: 's1', name: 'Empty', start: 4, end: 4 }), e => e.code === 'BAD_INPUT');
});
test('render ranges: only a track named “Renders” counts – grading layers and Story’s theme layers never export', () => {
  const P = makePremiere({ adjustment: true });
  const adj = P.findAll('Adjustment Layer')[0];
  P.seq._v[2].overwriteClip(adj, 3);   // a look over the edit, on the top track
  P.call('storyThemeLayers', { seqId: 's1', sections: [{ name: 'Family', start: 0, end: 2 }] });
  assert.strictEqual(P.call('renderRanges', { seqId: 's1' }).track, -1);
  P.seq._v[2].name = ' renders ';   // you named the track yourself
  assert.deepStrictEqual(P.call('renderRanges', { seqId: 's1' }).ranges.map(x => [x.start, x.end]), [[3, 8]]);
  const a = P.call('addRenderRange', { seqId: 's1', name: 'Hook', start: 10, end: 12 });
  assert.strictEqual(a.track, 2, 'your track is used, not a new one');
});
test('render ranges: says so when Premiere won’t name the new track', () => {
  const P = makePremiere({ adjustment: true, trackNamesWritable: false });
  assert.strictEqual(P.call('addRenderRange', { seqId: 's1', name: 'Hook', start: 0, end: 2 }).named, false);
});
test('render ranges: each is queued with In/Out set to it, and the editor’s In/Out come back', () => {
  const P = makePremiere({ adjustment: true });
  P.seq._io = [1, 9];
  P.call('queueRangeExport', { seqId: 's1', out: '/out/A.mov', preset: '/p.epr', start: 10, end: 40 });
  P.call('queueRangeExport', { seqId: 's1', out: '/out/B.mov', preset: '/p.epr', start: 0, end: 5 });
  assert.deepStrictEqual(P.encoded.map(e => [e.out, e.area, e.io]), [['/out/A.mov', 1, [10, 40]], ['/out/B.mov', 1, [0, 5]]]);
  assert.deepStrictEqual(P.seq._io, [1, 9], 'In/Out put back');
  P.seq._io = [-400000, -400000];   // how Premiere reports “no In/Out”
  P.call('queueRangeExport', { seqId: 's1', out: '/out/C.mov', preset: '/p.epr', start: 2, end: 4 });
  assert.deepStrictEqual(P.seq._io, [-400000, -400000], 'no In/Out before, none after');
  P.seq._io = [-400000, 30];   // only an Out point
  const r = P.call('queueRangeExport', { seqId: 's1', out: '/out/D.mov', preset: '/p.epr', start: 2, end: 4 });
  assert.deepStrictEqual(P.seq._io, [-400000, 30], 'a lone Out point survives');
  assert.strictEqual(r.restored, true); assert.strictEqual(r.id, '4');
  assert.strictEqual(P.call('presetExtension', { seqId: 's1', preset: '/p.epr' }), 'mov');
});

test('song layers: numbered, colour-coded layers on a “Songs” track above the edit; running again replaces them', () => {
  const P = makePremiere({ adjustment: true, clipColours: true });
  P.call('storyPlace', { seqId: 's1', cursor: 0, method: 'relabel', clips: [{ id: P.interview.nodeId, in: 0, out: 80 }] });
  const sections = [{ name: '1', start: 0, end: 30, label: 5 }, { name: 'Talk', start: 30, end: 35, label: 4 }, { name: '2 Hallelujah', start: 35, end: 70, label: 5 }, { name: 'Applause', start: 70, end: 75, label: 7 }];
  const r = P.call('labelLayers', { seqId: 's1', trackName: 'Songs', sections, binPath: 'JMG Ultra Studio/Song Splitter' });
  assert.strictEqual(r.placed, 4); assert.strictEqual(P.seq._v[r.track].name, 'Songs');
  const got = P.call('renderRanges', { seqId: 's1', track: 'Songs' });
  assert.deepStrictEqual(got.ranges.map(x => [x.name, x.start, x.end, x.label]), [['1', 0, 30, 5], ['Talk', 30, 35, 4], ['2 Hallelujah', 35, 70, 5], ['Applause', 70, 75, 7]]);
  assert.strictEqual(got.colours, true);
  const again = P.call('labelLayers', { seqId: 's1', trackName: 'Songs', sections: sections.slice(0, 1) });
  assert.strictEqual(again.track, r.track); assert.strictEqual(again.removed, 4);
  assert.strictEqual(P.call('renderRanges', { seqId: 's1', track: 'songs' }).ranges.length, 1, 'any case');
  assert.strictEqual(P.call('removeLabelLayers', { seqId: 's1', trackName: 'Songs' }).removed, 1);
});
test('render ranges: every layer track is offered; ranges from the chosen one, with their colours', () => {
  const P = makePremiere({ adjustment: true, clipColours: true });
  P.call('labelLayers', { seqId: 's1', trackName: 'Songs', sections: [{ name: '1', start: 0, end: 30, label: 5 }] });
  P.call('addRenderRange', { seqId: 's1', name: 'Teaser', start: 10, end: 20, label: 11 });
  const t = P.call('rangeTracks', { seqId: 's1' }).tracks;
  assert.deepStrictEqual(t.map(x => [x.name, x.count]), [['Renders', 1], ['Songs', 1]], 'top first');
  assert.deepStrictEqual(P.call('renderRanges', { seqId: 's1' }).ranges.map(x => [x.name, x.label]), [['Teaser', 11]], 'Renders by default');
  const b = P.call('addRenderRange', { seqId: 's1', name: 'Encore', start: 40, end: 50, track: 'Songs', label: 5 });
  assert.strictEqual(P.seq._v[b.track].name, 'Songs');
  assert.deepStrictEqual(P.call('renderRanges', { seqId: 's1', track: 'Songs' }).ranges.map(x => x.name), ['1', 'Encore']);
});
test('render ranges: renamed, moved, recoloured and deleted from the panel', () => {
  const P = makePremiere({ adjustment: true, clipColours: true });
  P.call('addRenderRange', { seqId: 's1', name: 'Hook', start: 10, end: 20, label: 5 });
  let r = P.call('renderRanges', { seqId: 's1' }).ranges[0];
  P.call('editRenderRange', { seqId: 's1', track: 'Renders', nodeId: r.nodeId, name: 'Hook 15s' });
  r = P.call('renderRanges', { seqId: 's1' }).ranges[0];
  assert.deepStrictEqual([r.name, r.start, r.end, r.label], ['Hook 15s', 10, 20, 5]);
  P.call('editRenderRange', { seqId: 's1', track: 'Renders', nodeId: r.nodeId, label: 7 });
  r = P.call('renderRanges', { seqId: 's1' }).ranges[0];
  assert.strictEqual(r.label, 7, 'colour set on the clip itself');
  const moved = P.call('editRenderRange', { seqId: 's1', track: 'Renders', nodeId: r.nodeId, start: 4, end: 19 });
  const all = P.call('renderRanges', { seqId: 's1' }).ranges;
  assert.deepStrictEqual(all.map(x => [x.name, x.start, x.end, x.label]), [['Hook 15s', 4, 19, 7]], 'laid again earlier, same name and colour');
  assert.strictEqual(moved.range.nodeId, all[0].nodeId);
  assert.strictEqual(P.findAll('Adjustment Layer').length, 1, 'the project’s adjustment layer keeps its name');
  assert.throws(() => P.call('editRenderRange', { seqId: 's1', track: 'Renders', nodeId: all[0].nodeId, start: 9, end: 9 }), e => e.code === 'BAD_INPUT');
  P.call('removeRenderRange', { seqId: 's1', track: 'Renders', nodeId: all[0].nodeId });
  assert.strictEqual(P.call('renderRanges', { seqId: 's1' }).ranges.length, 0);
  assert.throws(() => P.call('removeRenderRange', { seqId: 's1', track: 'Renders', nodeId: all[0].nodeId }), e => e.code === 'NOT_FOUND');
});
test('render ranges: a Premiere that can’t read clip colours says so, and recolouring lays the layer again in the new colour', () => {
  const P = makePremiere({ adjustment: true });
  P.call('addRenderRange', { seqId: 's1', name: 'Hook', start: 10, end: 20, label: 5 });
  const got = P.call('renderRanges', { seqId: 's1' });
  assert.strictEqual(got.colours, false); assert.strictEqual(got.ranges[0].label, null);
  P.call('editRenderRange', { seqId: 's1', track: 'Renders', nodeId: got.ranges[0].nodeId, label: 9 });
  const v = P.seq._v[got.track]._clips;
  assert.strictEqual(v.length, 1); assert.strictEqual(v[0].label, 9, 'placed in the new colour');
  assert.deepStrictEqual([v[0].start.seconds, v[0]._end], [10, 20]);
});
test('song layers without an adjustment layer in the project: invisible label clips, still render ranges on their track', () => {
  const P = makePremiere();
  const r = P.call('labelLayers', { seqId: 's1', trackName: 'Songs', sections: [{ name: '1', start: 0, end: 30, label: 5 }, { name: 'Talk', start: 30, end: 35, label: 4 }] });
  assert.strictEqual(r.kind, 'transparent');
  assert.deepStrictEqual(P.call('renderRanges', { seqId: 's1', track: 'Songs' }).ranges.map(x => x.name), ['1', 'Talk']);
  assert.deepStrictEqual(P.call('rangeTracks', { seqId: 's1' }).tracks.map(t => t.name), ['Songs']);
});
test('an adjustment layer or a generated clip (no media file) isn’t footage', () => {
  const P = makePremiere({ adjustment: true });
  const adj = P.findAll('Adjustment Layer')[0];
  const info = P.call('itemsInfo', { ids: [adj.nodeId, P.interview.nodeId] });
  assert.strictEqual(info[0].kind, 'adjustment');
  assert.notStrictEqual(info[1].kind, 'adjustment');
});
