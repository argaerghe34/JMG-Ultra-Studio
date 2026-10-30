// Ask › Edit: the timeline as text, which clips a query picks, the plan checked, run on a copy, and the result read
// back for the AI to check (stage 2). Then Resolve's side against the stand-in Resolve.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'js/tools/41-edit.js']);
const E = US.editAsk;
const job = { set() { return job; }, progress() {}, check() {}, log() {} };

const clip = (start, end, name, extra = {}) => Object.assign({ start, end, in: 0, out: end - start, name, path: '/m/' + name, itemId: 'it-' + name, disabled: false, effects: [], label: 3 }, extra);
const INFO = { id: 's1', name: 'Cut', fps: 25, duration: 30, markers: [{ start: 12, end: 12, name: 'Chapter 2', color: 6 }],
  video: [{ index: 0, name: 'V1', clips: [clip(0, 5, 'RUTH.MP4'), clip(5, 9, 'SAM.MP4'), clip(9, 15, 'RUTH.MP4', { effects: ['Lumetri Color'] }), clip(15, 30, 'DRONE.MP4', { label: 5 })] }, { index: 1, name: 'V2', clips: [clip(3, 6, 'BROLL.MP4')] }],
  audio: [{ index: 0, name: 'A1', clips: [clip(0, 5, 'RUTH.MP4'), clip(5, 9, 'SAM.MP4'), clip(9, 15, 'RUTH.MP4')] }, { index: 1, name: 'A2', clips: [clip(15, 30, 'Song.wav')] }] };
const HEARD = [{ start: 0.5, end: 4.5, speaker: 'Ruth', text: 'My grandmother baked every Friday.', lineId: 'a2' }, { start: 5.2, end: 8.8, speaker: 'Sam', text: 'She spoke four languages.', lineId: 'b1' }, { start: 9.5, end: 14, speaker: 'Ruth', text: 'We moved in 1962.', lineId: 'a5' }];

test('the timeline as text: video tracks top first, then audio; who speaks and what they say; lines and markers', () => {
  const m = E.timelineModel(INFO, HEARD);
  assert.deepStrictEqual(m.clips.map(c => c.id + ' ' + c.trackName + ' ' + c.name), ['c1 V2 BROLL.MP4', 'c2 V1 RUTH.MP4', 'c3 V1 SAM.MP4', 'c4 V1 RUTH.MP4', 'c5 V1 DRONE.MP4', 'c6 A1 RUTH.MP4', 'c7 A1 SAM.MP4', 'c8 A1 RUTH.MP4', 'c9 A2 Song.wav']);
  assert.deepStrictEqual([m.clips[1].speaker, m.clips[2].speaker, m.clips[4].speaker], ['Ruth', 'Sam', undefined]);
  const t = E.outline(m);
  assert.ok(/SEQUENCE “Cut”/.test(t) && /c4\tV1\t0:09.00–0:15.00\t6s\tRUTH.MP4\t3\tLumetri Color\tRuth: We moved in 1962\./.test(t), t);
  assert.ok(/MARKERS\n0:12.00\tcolour 6\tChapter 2/.test(t) && /l2\t0:05.20–0:08.80\tSam\tShe spoke four languages\./.test(t));
  assert.ok(!/\/m\//.test(t), 'no file paths sent – only names');
});

test('which clips: tracks, kinds, length, label, effects, speakers, words, where the speaker changes, the joins; lines; ids', () => {
  const m = E.timelineModel(INFO, HEARD), ids = q => E.select(m, q).map(x => x.id || x.line);
  assert.deepStrictEqual(ids({ tracks: ['V1'] }), ['c2', 'c3', 'c4', 'c5']);
  assert.deepStrictEqual(ids({ tracks: ['V1'], every: 'cuts' }), ['c3', 'c4', 'c5'], 'every join: all but the first');
  assert.deepStrictEqual(ids({ kind: 'video', speakerChange: true }), ['c3', 'c4']);
  assert.deepStrictEqual(ids({ speakers: ['ruth'], kind: 'video' }), ['c2', 'c1', 'c4'], 'B-roll over Ruth talking counts as Ruth');
  assert.deepStrictEqual(ids({ says: 'languages' }), ['c1', 'c7', 'c3']);
  assert.deepStrictEqual(ids({ minSeconds: 6, tracks: ['V1', 'A2'] }), ['c4', 'c9', 'c5'], 'in time order');
  assert.deepStrictEqual(ids({ label: 5 }), ['c5']);
  assert.deepStrictEqual(ids({ effect: 'lumetri' }), ['c4']);
  assert.deepStrictEqual(ids({ noEffect: 'lumetri', tracks: ['V1'], every: 'first' }), ['c2']);
  assert.deepStrictEqual(ids({ nameContains: 'drone' }), ['c5']);
  assert.deepStrictEqual(ids({ lines: true, speakers: ['Ruth'] }), ['l1', 'l3']);
  assert.deepStrictEqual(ids({ ids: ['c9', 'zz'] }), ['c9']);
  const items = E.itemsModel([{ id: 'p1', name: 'DJI_0001.MP4', kind: 'video', bin: 'Footage / Drone', duration: 40, label: 1 }, { id: 'p2', name: 'Song.wav', kind: 'audio', bin: 'Music', duration: 200 }], 'the whole project');
  assert.deepStrictEqual(E.select(items, { bin: 'drone' }).map(x => x.itemId), ['p1']);
  assert.deepStrictEqual(E.select(items, { kind: 'audio' }).map(x => x.name), ['Song.wav']);
});

test('the plan checked: unknown edits and empty picks left out (and said); cuts first, deletions last', () => {
  const m = E.timelineModel(INFO, HEARD);
  const p = E.checkPlan({ reply: 'Dissolves on the joins.', done: false, steps: [
    { op: 'remove', targetsJson: '{"nameContains":"drone"}', paramsJson: '{"ripple":true}', why: 'no drone' },
    { op: 'transition', targetsJson: '{"tracks":["V1"],"every":"cuts"}', paramsJson: '{"name":"Cross Dissolve","at":"start","frames":12}', why: 'smooth joins' },
    { op: 'teleport', targetsJson: '{}', paramsJson: '{}', why: '' },
    { op: 'label', targetsJson: '{"nameContains":"nothing like this"}', paramsJson: '{"label":2}', why: '' },
    { op: 'razor', targetsJson: '{"lines":["l2"]}', paramsJson: '{}', why: 'cut around Sam' }] }, m);
  assert.deepStrictEqual(p.steps.map(s => [s.op, s.targets.length]), [['remove', 1], ['transition', 3], ['razor', 1]]);
  assert.deepStrictEqual(p.dropped, ['teleport: not something I can do here', 'Colour label: nothing matched']);
  assert.deepStrictEqual(E.runOrder(p.steps).map(s => s.op), ['razor', 'transition', 'remove']);
  assert.strictEqual(E.describe(p.steps[1]), 'Cross Dissolve at the start (12 frames) · 3 clips on V1');
  assert.deepStrictEqual(E.clipTargets(m, { op: 'label', targets: [{ start: 5.2, end: 8.8, line: 'l2' }] }).map(t => t.id), ['c1', 'c3', 'c7'], 'a line stands for the clips under it');
  assert.ok(E.opsFor('timeline', true).every(k => E.OPS[k].resolve) && !E.opsFor('timeline', true).includes('transition'), 'Resolve: only what Resolve allows');
  assert.ok(E.opsFor('items', false).includes('move') && !E.opsFor('items', false).includes('transition'));
});

test('plan → run on a copy (made once) → read back → the AI checks and plans what’s left; the outline is cached and sent once', async () => {
  const calls = [], host = [], was = { ai: US.ai, call: US.host.call, ctx: US.ctx, story: US.story };
  US.ctx = { sequence: { id: 's1', name: 'Cut' } };
  US.story = { timelineTranscript: async () => ({ result: { entries: HEARD } }), namesFor: () => new Map() };
  US.host.call = async (fn, a) => {
    host.push([fn, a]);
    if (fn === 'editRead') return JSON.parse(JSON.stringify(a.seqId === 's1' ? INFO : Object.assign({}, INFO, { id: a.seqId, name: 'Cut – Ask' })));
    if (fn === 'cloneSequence') return { id: 's2', name: 'Cut – Ask' };
    if (fn === 'editApply') return { done: a.targets.length, skipped: [], log: [] };
    return {};
  };
  const answers = [
    { reply: 'A dissolve on each join and a lower third for each speaker.', done: false, steps: [{ op: 'transition', targetsJson: '{"tracks":["V1"],"every":"cuts"}', paramsJson: '{"name":"Cross Dissolve","at":"start"}', why: '' }, { op: 'text', targetsJson: '{"lines":["l1","l2"]}', paramsJson: '{"text":"{speaker}","style":"lowerThird"}', why: '' }] },
    { reply: 'Also audio fades on A1.', done: false, steps: [{ op: 'transition', targetsJson: '{"tracks":["A1"],"every":"cuts"}', paramsJson: '{"name":"Constant Power","at":"start"}', why: '' }] }];
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { calls.push(req); return answers[calls.length - 1]; } };
  try {
    const p1 = await E.plan(job, { request: 'dissolves on every cut and name the speakers', scope: { where: 'sequence' } });
    assert.strictEqual(calls[0].user[0].cache, '1h'); assert.ok(/SEQUENCE “Cut”/.test(calls[0].user[0].text));
    assert.ok(/The editor asks: “dissolves on every cut/.test(calls[0].user[1]));
    assert.deepStrictEqual(p1.plan.steps.map(s => s.op), ['transition', 'text'], JSON.stringify(p1.plan.dropped));
    const out = await E.run(job, p1.conv, p1.plan.steps, { copy: true });
    assert.deepStrictEqual(host.filter(h => h[0] === 'cloneSequence').length, 1);
    const applies = host.filter(h => h[0] === 'editApply');
    assert.ok(applies.every(h => h[1].seqId === 's2'), 'edits go to the copy');
    assert.deepStrictEqual(applies.filter(h => h[1].op === 'text').map(h => h[1].params.text), ['Ruth', 'Sam'], 'each text says its own speaker');
    assert.strictEqual(out.copyName, 'Cut – Ask');
    const c = await E.check(job, p1.conv, out);
    assert.strictEqual(calls[1].user[0].text, calls[0].user[0].text, 'the same cached outline');
    assert.strictEqual(calls[1].turns.length, 1);
    assert.ok(/RESULT of your plan \(run on the copy “Cut – Ask”\)/.test(calls[1].turns[0].user) && /The sequence now/.test(calls[1].turns[0].user));
    assert.deepStrictEqual(c.plan.steps.map(s => s.op), ['transition']);
    host.length = 0;
    await E.run(job, c.conv, c.plan.steps, { copy: true });
    assert.strictEqual(host.filter(h => h[0] === 'cloneSequence').length, 0, 'the second round edits the same copy');
    assert.ok(host.filter(h => h[0] === 'editApply').every(h => h[1].seqId === 's2'));
  } finally { Object.assign(US, { ai: was.ai, ctx: was.ctx, story: was.story }); US.host.call = was.call; }
});

test('project edits: labels, names and bins put back with Undo', async () => {
  const host = [], was = US.host.call;
  US.host.call = async (fn, a) => { host.push([fn, a]); return fn === 'setLabels' ? a.items.length : true; };
  try {
    const m = E.itemsModel([{ id: 'p1', name: 'A.MP4', kind: 'video', bin: 'Footage', label: 4 }, { id: 'p2', name: 'B.MP4', kind: 'video', bin: 'Footage', label: 2 }], 'the bin Footage');
    const p = E.checkPlan({ reply: '', done: true, steps: [{ op: 'label', targetsJson: '{}', paramsJson: '{"label":13}', why: '' }, { op: 'rename', targetsJson: '{}', paramsJson: '{"name":"Roam {n}"}', why: '' }, { op: 'move', targetsJson: '{"ids":["i2"]}', paramsJson: '{"bin":"Selects / Roaming"}', why: '' }] }, m);
    const out = await E.run(job, { model: m }, p.steps);
    assert.deepStrictEqual(host.filter(h => h[0] === 'renameItem').map(h => h[1].name), ['Roam 1', 'Roam 2']);
    assert.deepStrictEqual(host.find(h => h[0] === 'moveItems')[1], { ids: ['p2'], binPath: 'Selects/Roaming' });
    host.length = 0;
    await E.undoItems(out.undo);
    assert.deepStrictEqual(host.map(h => h[0]), ['moveItems', 'renameItem', 'renameItem', 'setLabels']);
    assert.deepStrictEqual(host[3][1].items, [{ id: 'p1', label: 4 }, { id: 'p2', label: 2 }]);
    assert.deepStrictEqual(host[0][1], { ids: ['p2'], binPath: 'Footage' });
  } finally { US.host.call = was; }
});

/* ---------- Resolve ---------- */
const Fake = require('./resolve-fake'), HOST = require('../../resolve/host');
test('Ask › Edit in Resolve: framing, opacity, colour, on/off, markers, delete; transitions and effects said to be Premiere only', async () => {
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), b = F.addMedia('/m/B.mp4', { frames: 2500 });
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }, { item: b, in: 0, out: 50 }]), seqId = tl.GetUniqueId();
  const info = await run('editRead', { seqId });
  assert.deepStrictEqual(info.video[0].clips.map(c => [c.name, c.start, c.end, c.scale]), [['A.mp4', 0, 4, 100], ['B.mp4', 4, 6, 100]]);
  const v1 = start => ({ kind: 'video', track: 0, start });
  assert.strictEqual((await run('editApply', { seqId, op: 'motion', params: { scale: 110, x: 0.5, y: 0.5 }, targets: [v1(0)] })).done, 1);
  const it0 = tl.GetItemListInTrack('video', 1)[0];
  assert.deepStrictEqual([it0.GetProperty('ZoomX'), it0.GetProperty('ZoomY'), it0.GetProperty('Pan'), it0.GetProperty('Tilt')], [1.1, 1.1, 0, 0]);
  await run('editApply', { seqId, op: 'opacity', params: { value: 50 }, targets: [v1(4)] });
  await run('editApply', { seqId, op: 'label', params: { label: 7 }, targets: [v1(4)] });
  await run('editApply', { seqId, op: 'enable', params: { on: false }, targets: [v1(0)] });
  const it1 = tl.GetItemListInTrack('video', 1)[1];
  assert.deepStrictEqual([it1.GetProperty('Opacity'), it1.GetClipColor(), it0.GetClipEnabled()], [50, 'Orange', false]);
  assert.strictEqual((await run('editApply', { seqId, op: 'marker', params: { name: 'Look', color: 1 }, targets: [v1(4)] })).done, 1);
  const no = await run('editApply', { seqId, op: 'transition', params: { name: 'Cross Dissolve' }, targets: [v1(0)] });
  assert.ok(no.unsupported && /Resolve doesn’t let add-ons add transitions/.test(no.why) && no.done === 0);
  assert.strictEqual((await run('editApply', { seqId, op: 'remove', params: { ripple: false }, targets: [v1(4)] })).done, 1);
  assert.strictEqual(tl.GetItemListInTrack('video', 1).length, 1);
  assert.deepStrictEqual((await run('editSelection', { seqId })).map(x => [x.name, x.underPlayhead]), [['A.mp4', true]], 'Resolve has no timeline selection: the clip under the playhead');
});
