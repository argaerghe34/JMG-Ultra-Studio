// Ask's general editor commands. Premiere side: jsx/host.jsx + jsx/tools/edit.jsx run against a small stand-in of
// Premiere's object model – trim, move in time, an effect's setting and keyframes (editApply), a sequence's name and
// In/Out (seqSet), tracks added, named, locked and switched off (trackSet), the selection (selectClips), bins with
// counts and clips by name / file / bin (askBins, askFind). It checks the control flow and the arguments; what real
// Premiere accepts is checked by dev/e2e/40g-assistant-editor.e2e.js. Resolve side: the same commands against the
// stand-in Resolve – and the ones Resolve's scripting can't do say so plainly.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');
const TICKS = 254016000000;

function premiere() {
  class Time { constructor() { this.ticks = '0'; } get seconds() { return Number(this.ticks) / TICKS; } set seconds(s) { this.ticks = String(Math.round(s * TICKS)); } }
  const T = s => { const t = new Time(); t.seconds = s; return t; };
  const coll = (arr, key) => new Proxy({ get [key]() { return arr.length; } }, { get: (o, p) => (p in o ? o[p] : /^\d+$/.test(String(p)) ? arr[+p] : undefined) });
  const prop = (name, value) => { const p = { displayName: name, value, keys: [], varying: false, getValue: () => p.value, setValue: v => { p.value = v; return true; }, isTimeVarying: () => p.varying, setTimeVarying: b => { p.varying = !!b; if (!b) p.keys = []; }, addKey: t => { p.keys.push({ t: t.seconds, v: null }); }, setValueAtKey: (t, v) => { p.keys.find(k => Math.abs(k.t - t.seconds) < 1e-6).v = v; } }; return p; };
  const comp = (name, props) => ({ displayName: name, matchName: name, properties: coll(props, 'numItems') });
  const clip = (name, start, end, inPt = 0) => {
    const c = { name, _s: start, _e: end, _i: inPt, selected: false, disabled: false, moved: [],
      get start() { return T(c._s); }, set start(t) { c._s = t.seconds; }, get end() { return T(c._e); }, set end(t) { c._e = t.seconds; },
      get inPoint() { return T(c._i); }, set inPoint(t) { c._i = t.seconds; }, get outPoint() { return T(c._i + (c._e - c._s)); },
      getSpeed: () => 1, move(t) { c.moved.push(t.seconds); c._s += t.seconds; c._e += t.seconds; }, setSelected(on) { c.selected = !!on; },
      components: null };
    c._comps = [comp('Motion', [prop('Position', [0.5, 0.5]), prop('Scale', 100)]), comp('Opacity', [prop('Opacity', 100)]), comp('Crop', [prop('Left', 0), prop('Top', 0)])];
    c.components = coll(c._comps, 'numItems');
    return c;
  };
  const track = (n, kind, clips, { nameable = true, lockable = true } = {}) => { const t = { _name: (kind === 'v' ? 'Video ' : 'Audio ') + n, _clips: clips, clips: coll(clips, 'numItems'), muted: 0, locked: 0, isMuted: () => !!t.muted, isLocked: () => !!t.locked, setMute(x) { t.muted = x; } }; Object.defineProperty(t, 'name', { get: () => t._name, set: v => { if (nameable) t._name = v; } }); if (lockable) t.setLocked = x => { t.locked = x; }; return t; };
  const v1 = [clip('A.mp4', 0, 4), clip('B.mp4', 4, 6, 10), clip('C.mp4', 6, 10)], a1 = [clip('A.mp4', 0, 4)];
  const V = [track(1, 'v', v1), track(2, 'v', [], { nameable: false, lockable: false })], Au = [track(1, 'a', a1)];
  const item = (name, type, kids, p) => { const it = { nodeId: 'n' + name, name, type, _kids: kids || [], children: null, treePath: '', getMediaPath: () => p || '', isSequence: () => false }; it.children = coll(it._kids, 'numItems'); return it; };
  const clipsBin = item('B-roll', 2, [item('boat one.mp4', 1, null, '/dl/big ships at sea/boat one.mp4'), item('music.wav', 1, null, '/m/music.wav')]);
  const empty = item('Empty', 2, []), root = item('root', 3, [clipsBin, empty, item('IV_1.mp4', 1, null, '/m/IV_1.mp4')]);
  const paths = (it, pre) => { it.treePath = pre + '\\' + it.name; for (const k of it._kids) paths(k, it.type === 3 ? '\\P.prproj' : it.treePath); };
  root.treePath = '\\P.prproj'; for (const k of root._kids) paths(k, '\\P.prproj');
  const seq = { sequenceID: 's1', name: 'Cut', timebase: String(TICKS / 25), videoTracks: coll(V, 'numTracks'), audioTracks: coll(Au, 'numTracks'), markers: {}, inPt: -1, outPt: -1, get end() { return String(10 * TICKS); }, setInPoint(s) { seq.inPt = s; }, setOutPoint(s) { seq.outPt = s; } };
  const added = [];
  const qeSeq = { addTracks(nv, vi, na, type, ai) { added.push([nv, vi, na, type, ai]); for (let i = 0; i < nv; i++) V.push(track(V.length + 1, 'v', [])); for (let i = 0; i < na; i++) Au.push(track(Au.length + 1, 'a', [])); } };
  const ctx = { app: { version: '27.0', path: '/Applications/Adobe Premiere Pro 2027', project: { rootItem: root, sequences: coll([seq], 'numSequences'), activeSequence: seq, openSequence() {}, path: '/p/P.prproj' }, enableQE() {} }, qe: { project: { getActiveSequence: () => qeSeq } }, File: function (p) { this.exists = true; this.fsName = p; }, Folder: function () {}, Time, JSON, $: { writeln() {}, os: 'Macintosh' } };
  vm.createContext(ctx);
  for (const f of ['host.jsx', 'tools/edit.jsx']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx', f), 'utf8'), ctx, { filename: f });
  const U = ctx.UStudio;
  return { U, fn: U.fn, seq, v1, V, Au, added, propOf: (c, e, p) => c._comps.find(x => x.displayName === e).properties[['Position', 'Scale', 'Opacity', 'Left', 'Top'].filter(n => c._comps.find(x => x.displayName === e)._p === undefined).length ? Array.from({ length: c._comps.find(x => x.displayName === e).properties.numItems }, (_, i) => i).find(i => c._comps.find(x => x.displayName === e).properties[i].displayName === p) : 0] };
}
const tg = (start, track = 0, kind = 'video') => ({ kind, track, start });
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('Premiere – trim: a new length, time added or taken off either end (the picture stays in step, never before the clip’s first frame); nothing left is refused', () => {
  const P = premiere(), [a, b] = P.v1;
  let r = P.fn.editApply({ seqId: 's1', op: 'trim', params: { length: 2.5 }, targets: [tg(0)] });
  assert.ok(r.done === 1 && near(a._e, 2.5) && near(a._s, 0), JSON.stringify([r, a._s, a._e]));
  r = P.fn.editApply({ seqId: 's1', op: 'trim', params: { tail: 1, head: 0.5 }, targets: [tg(4)] });
  assert.ok(r.done === 1 && near(b._s, 3.5) && near(b._e, 7) && near(b._i, 9.5), JSON.stringify([b._s, b._e, b._i]));
  r = P.fn.editApply({ seqId: 's1', op: 'trim', params: { head: 20 }, targets: [tg(3.5)] });
  assert.ok(near(b._s, 0) && near(b._i, 6), 'the start stops at the timeline’s start: ' + JSON.stringify([b._s, b._i]));
  P.v1[2]._i = 1; P.fn.editApply({ seqId: 's1', op: 'trim', params: { head: 3 }, targets: [tg(6)] });
  assert.ok(near(P.v1[2]._i, 0) && near(P.v1[2]._s, 5), 'and at the clip’s first frame: ' + JSON.stringify([P.v1[2]._s, P.v1[2]._i]));
  r = P.fn.editApply({ seqId: 's1', op: 'trim', params: { length: 0 }, targets: [tg(5)] });
  assert.ok(r.done === 0 && r.skipped.length === 1 && /Nothing would be left of the clip/.test(r.skipped[0].why), JSON.stringify(r));
  r = P.fn.editApply({ seqId: 's1', op: 'trim', params: { length: 1 }, targets: [tg(99)] });
  assert.strictEqual(r.skipped[0].why, 'not on the timeline any more');
});

test('Premiere – move in time: later clips first when moving later, never before the start; a setting of an effect set, keyframed, and plain words when the effect or setting isn’t there', () => {
  const P = premiere(), [a, b, c] = P.v1;
  let r = P.fn.editApply({ seqId: 's1', op: 'shift', params: { seconds: 2 }, targets: [tg(0), tg(6)] });
  assert.ok(r.done === 2 && near(a._s, 2) && near(c._s, 8));
  r = P.fn.editApply({ seqId: 's1', op: 'shift', params: { seconds: -5 }, targets: [tg(2)] });
  assert.ok(near(a._s, 0) && near(a.moved[1], -2), 'stopped at the start of the timeline');
  assert.ok(/Say how many seconds/.test(P.fn.editApply({ seqId: 's1', op: 'shift', params: {}, targets: [tg(4)] }).skipped[0].why));
  const p = (clip, e, n) => { const cm = clip._comps.find(x => x.displayName === e); for (let i = 0; i < cm.properties.numItems; i++) if (cm.properties[i].displayName === n) return cm.properties[i]; };
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'crop', property: 'left', value: 12 }, targets: [tg(4)] });
  assert.ok(r.done === 1 && p(b, 'Crop', 'Left').value === 12, 'names are matched whatever the capitals');
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'Opacity', property: 'Opacity', keys: [{ at: 0, value: 0 }, { at: 1, value: 100 }] }, targets: [tg(4)] });
  const op = p(b, 'Opacity', 'Opacity');
  assert.ok(r.done === 1 && op.varying && op.keys.length === 2 && near(op.keys[0].t, 10) && near(op.keys[1].t, 11) && op.keys[1].v === 100, 'keyframes at the clip’s own media times: ' + JSON.stringify(op.keys));
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'Lumetri Color', property: 'Exposure', value: 1 }, targets: [tg(4)] });
  assert.ok(/has no “Lumetri Color” \(it has: Motion, Opacity, Crop\) – add the effect first/.test(r.skipped[0].why), r.skipped[0].why);
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'Crop', property: 'Feather', value: 1 }, targets: [tg(4)] });
  assert.ok(/“Crop” has no setting called “Feather”\. It has: Left, Top\./.test(r.skipped[0].why), r.skipped[0].why);
  // an effect as Premiere 27 can hand it over: hidden settings (“_ …”) and a nameless “Error occurred” one are never offered;
  // the effect is found by the name Effect Controls shows before its internal name, the last one added when it is there twice
  const mkProp = (n, val) => { const q = { displayName: n, value: val, getValue: () => q.value, setValue: x => { q.value = x; }, isTimeVarying: () => false, setTimeVarying() {} }; return q; };
  const fx = (name, match, props) => ({ displayName: name, matchName: match, properties: new Proxy({ numItems: props.length }, { get: (o, k) => (k in o ? o[k] : props[+k]) }) });
  b._comps.push(fx('Blur A', 'AE.ADBE Gaussian Blur 2', [mkProp('Error occurred', 0), mkProp('Amount', 5), mkProp('_ Applied Version', 2)]), fx('Gaussian Blur', 'AE.Other', [mkProp('Blurriness', 0)]), fx('Gaussian Blur', 'AE.Other', [mkProp('Blurriness', 0)]));
  b.components = new Proxy({ numItems: b._comps.length }, { get: (o, k) => (k in o ? o[k] : b._comps[+k]) });
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'Gaussian Blur', property: 'Blurriness', value: 30 }, targets: [tg(4)] });
  assert.deepStrictEqual([r.done, b._comps[4].properties[0].value, b._comps[5].properties[0].value], [1, 0, 30], 'the one added last');
  r = P.fn.editApply({ seqId: 's1', op: 'set', params: { effect: 'AE.ADBE Gaussian Blur 2', property: 'Nope', value: 1 }, targets: [tg(4)] });
  assert.ok(/“AE\.ADBE Gaussian Blur 2” has no setting called “Nope”\. It has: Amount\.$/.test(r.skipped[0].why), 'found by its internal name too; only real settings listed: ' + r.skipped[0].why);
  const read = JSON.parse(JSON.stringify(P.fn.clipEffects({ seqId: 's1', targets: [tg(4), tg(99)] })));
  assert.deepStrictEqual([read[0].found, read[0].name, read[0].effects.map(e => e.name), read[0].effects[3], read[1].found], [true, 'B.mp4', ['Motion', 'Opacity', 'Crop', 'Blur A', 'Gaussian Blur', 'Gaussian Blur'], { name: 'Blur A', matchName: 'AE.ADBE Gaussian Blur 2', settings: [{ name: 'Amount', value: 5 }] }, false]);
  assert.deepStrictEqual(read[0].effects[0].settings, [{ name: 'Position', value: [0.5, 0.5] }, { name: 'Scale', value: 100 }]);
});

test('Premiere – a sequence’s name and In/Out; tracks added, named, locked, switched off – and said plainly when Premiere won’t; the selection; bins with counts; clips by name, file or bin', () => {
  const P = premiere();
  let r = P.fn.seqSet({ seqId: 's1', name: 'Cut v2', inPoint: 1, outPoint: 5 });
  const plain = x => JSON.parse(JSON.stringify(x));
  assert.deepStrictEqual([r.done.join(), r.was.name, P.seq.name, P.seq.inPt, P.seq.outPt], ['name,out,in', 'Cut', 'Cut v2', 1, 5]);
  r = P.fn.trackSet({ seqId: 's1', kind: 'video', add: 2 });
  assert.deepStrictEqual(plain([r.done, r.video, r.audio, P.added]), [['added 2'], 4, 1, [[2, 2, 0, 1, 1]]]);
  r = P.fn.trackSet({ seqId: 's1', kind: 'video', index: 0, name: 'Interview', locked: true, muted: true });
  assert.deepStrictEqual(plain([r.done, r.failed, P.V[0].name, P.V[0].locked, P.V[0].muted]), [['name', 'off', 'locked'], [], 'Interview', 1, 1]);
  r = P.fn.trackSet({ seqId: 's1', kind: 'video', index: 1, name: 'B-roll', locked: true });
  assert.deepStrictEqual(plain(r.failed), ['name: Premiere does not let a script name a track', 'lock: this Premiere does not let a script lock a track']);
  assert.deepStrictEqual(plain(P.fn.trackSet({ seqId: 's1', kind: 'audio', index: 9, muted: true }).failed), ['there is no such track']);
  assert.strictEqual(P.fn.selectClips({ seqId: 's1', targets: [tg(4), tg(77)] }), 1);
  assert.deepStrictEqual(P.v1.map(c => c.selected), [false, true, false]);
  const bins = P.fn.askBins({});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(bins)), { total: 2, bins: [{ id: 'nB-roll', path: 'B-roll', clips: 2, bins: 0 }, { id: 'nEmpty', path: 'Empty', clips: 0, bins: 0 }] });
  assert.deepStrictEqual(plain(P.fn.askBins({ filter: 'empt' }).bins).map(b => b.path), ['Empty']);
  const f = x => JSON.parse(JSON.stringify(P.fn.askFind(x)));
  assert.deepStrictEqual(f({ path: 'big ships' }), { total: 1, items: [{ id: 'nboat one.mp4', name: 'boat one.mp4', bin: 'B-roll', path: '/dl/big ships at sea/boat one.mp4', kind: 'video' }] });
  assert.deepStrictEqual([f({ kinds: ['audio'] }).items.map(i => i.name), f({ name: 'iv_' }).items.map(i => i.bin), f({ bin: 'b-roll', limit: 1 }).total, f({ idsOnly: true }).ids.length], [['music.wav'], ['(Project root)'], 2, 3]);
});

test('Resolve – the same commands: a timeline renamed, tracks added, named and switched off; and what its scripting can’t do (trim, move in time, an effect’s setting, the selection, In/Out on an older Resolve) says so plainly', async () => {
  const Fake = require('./resolve-fake'), HOST = require(path.join(ROOT, 'resolve', 'host', 'index.js'));
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }]), seqId = tl.GetUniqueId();
  for (const op of ['trim', 'shift', 'set']) { const r = await run('editApply', { seqId, op, params: { length: 1, seconds: 1 }, targets: [{ kind: 'video', track: 0, start: 0 }] }); assert.ok(r.unsupported && /Resolve doesn’t let add-ons add (trims|slides of a clip along the timeline|effect settings by name)/.test(r.why), op + ': ' + r.why); }
  assert.strictEqual(await run('selectClips', { seqId, targets: [{ kind: 'video', track: 0, start: 0 }] }), 0);
  assert.ok(/Resolve doesn’t let add-ons read an effect’s settings/.test((await run('clipEffects', { seqId, targets: [{ kind: 'video', track: 0, start: 0 }] }))[0].unsupported));
  let r = await run('seqSet', { seqId, name: 'Cut v2', inPoint: 1 });
  assert.ok(r.done.includes('name') && r.was.name === 'Cut' && tl.GetName() === 'Cut v2');
  assert.ok(r.done.includes('in') || /this Resolve doesn’t let add-ons set them/.test(r.failed.join()), JSON.stringify(r));
  const before = tl.GetTrackCount('video');
  r = await run('trackSet', { seqId, kind: 'video', add: 1 });
  assert.deepStrictEqual([r.done, r.video], [['added 1'], before + 1]);
  r = await run('trackSet', { seqId, kind: 'video', index: 0, name: 'Interview', muted: true });
  assert.ok(r.done.includes('off') || r.failed.length, JSON.stringify(r));
  assert.deepStrictEqual((await run('trackSet', { seqId, kind: 'audio', index: 40, muted: true })).failed, ['there is no such track']);
  const bins = await run('askBins', {}), found = await run('askFind', { name: 'a.mp4' }), ids = await run('askFind', { idsOnly: true });
  assert.ok(bins.total >= 0 && found.items.length === 1 && found.items[0].kind === 'video' && ids.ids.includes(found.items[0].id));
  // the panel's side of it: Resolve isn't offered these edits, and is told why
  const US = require('./harness').load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/36-quickfx.js', 'js/tools/41-edit.js']);
  assert.ok(!US.editAsk.opsFor('timeline', true, '21.2').some(k => ['trim', 'shift', 'set'].includes(k)) && ['trim', 'shift', 'set'].every(k => US.editAsk.opsFor('timeline', false).includes(k)));
  assert.ok(/Resolve doesn’t let add-ons make trims/.test(US.resolveEdits.why('trim')));
});
