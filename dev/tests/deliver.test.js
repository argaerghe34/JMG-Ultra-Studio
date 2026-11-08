const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/33-deliver.js']);
test('parses pasted client notes in many styles', () => {
  const n = US.deliver.parseNotes('0:12 lose the cough\n01:05 – swap the music here\n  and make it quieter\n[1:20-1:32] tighten this bit\n• 00:02:03:12: colour too warm\nGeneral: love it!\n@2:30 end card', 25);
  assert.strictEqual(n.length, 5);
  assert.deepStrictEqual(n.map(x => x.t), [12, 65, 80, 123.48, 150]);
  assert.strictEqual(n[1].text, 'swap the music here and make it quieter');
  assert.strictEqual(n[2].end, 92);
  assert.strictEqual(n[3].text, 'colour too warm General: love it!');
});
test('parses a Frame.io style CSV', () => {
  const n = US.deliver.parseNotes('Comment Number,Timecode,Name,Comment\n1,00:00:05:00,Sarah,"Cut this, please"\n2,00:01:00:12,Tom,Logo bigger', 25);
  assert.strictEqual(n.length, 2);
  assert.strictEqual(n[0].text, 'Sarah: Cut this, please');
  assert.ok(Math.abs(n[1].t - 60.48) < 1e-9);
});
test('detects notes written against a 01:00:00:00 start', () => {
  const n = US.deliver.parseNotes('01:00:12:00 a\n01:02:00:00 b', 25);
  assert.strictEqual(US.deliver.autoOffset(n, 300), -3600);
  assert.strictEqual(US.deliver.autoOffset(n, 7200), 0);
});
test('YouTube chapters start at 0:00 and flag short ones', () => {
  const c = US.deliver.chapters([{ start: 30, name: 'Family' }, { start: 95, name: 'Faith' }, { start: 100, name: '' }, { start: 200, name: 'Thanks' }], 260, 'named');
  assert.strictEqual(c.text, '0:00 Intro\n0:30 Family\n1:35 Faith\n3:20 Thanks');
  assert.strictEqual(c.problems.length, 0);
  const d = US.deliver.chapters([{ start: 0, name: 'A' }, { start: 5, name: 'B' }], 30, 'named');
  assert.ok(d.problems.length >= 2);
});
test('render ranges: named after their layer, in timeline order, switched-off ones left out, same names kept apart', () => {
  const p = US.deliver.rangePlan([
    { name: 'Teaser: 30s', start: 40, end: 70 }, { name: 'Adjustment Layer', start: 0, end: 10 },
    { name: 'Skip me', start: 80, end: 90, disabled: true }, { name: 'teaser- 30s', start: 100, end: 110 }, { name: 'Empty', start: 5, end: 5 }
  ], 'Wedding', 'mp4', '/out');
  assert.deepStrictEqual(p.map(x => x.name), ['Wedding - Render 1', 'Teaser- 30s', 'teaser- 30s (2)']);
  assert.deepStrictEqual(p.map(x => [x.start, x.end]), [[0, 10], [40, 70], [100, 110]]);
  assert.ok(p[1].out.endsWith('Teaser- 30s.mp4'));
  const q = US.deliver.rangePlan([{ name: 'Promo', start: 0, end: 1 }, { name: 'Promo', start: 1, end: 2 }, { name: 'Promo (2)', start: 2, end: 3 }, { name: 'Einstellungsebene', start: 3, end: 4 }], 'S', 'mp4', '');
  assert.deepStrictEqual(q.map(x => x.name), ['Promo', 'Promo (2)', 'Promo (2) (2)', 'S - Render 4'], 'every file name different');
});
test('render ranges: one colour only, and a file-name ending on every render', () => {
  const ranges = [{ name: '1', start: 0, end: 30, label: 5 }, { name: 'Talk', start: 30, end: 35, label: 4 }, { name: '2 Hallelujah', start: 35, end: 70, label: 5 }, { name: 'Applause', start: 70, end: 75, label: 7 }];
  const songs = US.deliver.rangePlan(ranges, 'Gig', 'mp4', '/out', { colour: '5', suffix: '_1' });
  assert.deepStrictEqual(songs.map(x => x.name), ['1_1', '2 Hallelujah_1']);
  assert.ok(songs[0].out.endsWith('1_1.mp4'));
  assert.strictEqual(US.deliver.rangePlan(ranges, 'Gig', 'mp4', '', { colour: '' }).length, 4, 'all colours');
  assert.strictEqual(US.deliver.rangePlan(ranges, 'Gig', 'mp4', '', { colour: 11 }).length, 0);
  assert.deepStrictEqual(US.deliver.rangePlan([{ name: 'Adjustment Layer', start: 0, end: 1, label: 5 }], 'Gig', 'mp4', '', { suffix: ' v2' }).map(x => x.name), ['Gig - Render 1 v2']);
  assert.strictEqual(US.deliver.cleanSuffix('_v2/: *final. '), '_v2 final', 'only characters a file name can take');
  assert.strictEqual(US.deliver.cleanSuffix(undefined), '');
});
test('render ranges: colours Ultra Studio gave are remembered (Premiere can’t say), found by times, else by a unique name', () => {
  const C = US.deliver.layerColours, data = {};
  C.store = () => ({ get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; } });
  C.remember('s1', 'Songs', [{ name: '1', start: 0, end: 30, label: 5 }, { name: 'Talk', start: 30, end: 35, label: 4 }, { name: '2', start: 35, end: 70, label: 5 }], { replace: true });
  const got = C.apply('s1', 'songs', [{ name: '1', start: 0, end: 30, label: null }, { name: 'Talk', start: 30, end: 36, label: null }, { name: '2 Hallelujah', start: 35, end: 70, label: null }, { name: 'Mine', start: 80, end: 90, label: null }, { name: 'X', start: 0, end: 1, label: 9 }]);
  assert.deepStrictEqual(got.map(r => r.label), [5, 4, 5, null, 9], 'times; trimmed but same name; renamed but same times; unknown; the editor’s own');
  assert.strictEqual(C.apply('s2', 'Songs', [{ name: '1', start: 0, end: 30, label: null }])[0].label, null, 'per sequence');
  C.forget('s1', 'Songs', { start: 0, end: 30 });
  assert.strictEqual(C.apply('s1', 'Songs', [{ name: '1', start: 0, end: 30 }])[0].label, undefined);
  C.remember('s1', 'Songs', [{ name: '1', start: 0, end: 30, label: 7 }]);
  assert.strictEqual(C.apply('s1', 'Songs', [{ name: '1', start: 0, end: 30 }])[0].label, 7);
});
test('render ranges: a new one spans In/Out when set, else 10 s from the playhead', () => {
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: 5, outPoint: 20, duration: 60 }, 0), { start: 5, end: 20 });
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: 0, outPoint: 60, duration: 60 }, 12), { start: 12, end: 22 });
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: 0, outPoint: 0, duration: 60 }, 55), { start: 55, end: 60 });
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: -400000, outPoint: 30, duration: 60 }, 50), { start: 0, end: 30 }, 'only an Out point');
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: 20, outPoint: -400000, duration: 60 }, 0), { start: 20, end: 60 }, 'only an In point');
  assert.deepStrictEqual(US.deliver.newRangeSpan({ inPoint: -400000, outPoint: -400000, duration: 60 }, 5), { start: 5, end: 15 }, 'neither');
});
test('render ranges: your own Media Encoder and Premiere presets are found, newest version first, ingest presets left out', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'us-presets-'));
  const put = (...p) => { const f = path.join(docs, 'Adobe', ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '<x/>'); };
  put('Adobe Media Encoder', '25.0', 'Presets', 'Old.epr'); put('Adobe Media Encoder', '26.0', 'Presets', 'ProRes HQ.epr'); put('Adobe Media Encoder', '25.0', 'Presets', 'ProRes HQ.epr');
  put('Premiere Pro', '26.0', 'Profile-me', 'Settings', 'Export', 'Client 4K.epr'); put('Premiere Pro', '26.0', 'Profile-me', 'Settings', 'IngestPresets', 'Proxy.epr');
  const p = US.deliver.userPresets(docs);
  assert.deepStrictEqual(p.map(x => [x.name, x.from]), [['ProRes HQ', 'Media Encoder'], ['Old', 'Media Encoder'], ['Client 4K', 'Premiere Pro']]);
  assert.ok(p[0].path.includes('26.0'));
  fs.rmSync(docs, { recursive: true, force: true });
});

/* ---------- bin export ---------- */
test('bin export: one file per sequence, named after it plus the ending; no two alike (Windows ignores case)', () => {
  const path = require('path');
  const p = US.deliver.binPlan([{ id: 'a', name: 'Song 1' }, { id: 'b', name: 'Song: 2/live' }, { id: 'c', name: 'song 1' }], 'mp4', '/out', { suffix: '_v2' });
  assert.deepStrictEqual(p.map(x => [x.seqId, x.name, x.out]), [['a', 'Song 1_v2', path.join('/out', 'Song 1_v2.mp4')], ['b', 'Song- 2-live_v2', path.join('/out', 'Song- 2-live_v2.mp4')], ['c', 'song 1_v2 (2)', path.join('/out', 'song 1_v2 (2).mp4')]]);
});
test('bin export: the ticked sequences go to Media Encoder whole (no range), guides hidden first; plain errors', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'binexp-')), preset = path.join(dir, 'H264.epr');
  fs.writeFileSync(preset, 'x');
  const host = [], was = { call: US.host.call, enc: US.encoder, fsx: US.fsx };
  US.host.call = async (fn, a) => { host.push([fn, a]); if (fn === 'binSequences') return [{ id: 's1', name: 'Song 1' }, { id: 's2', name: 'Song 2' }, { id: 's3', name: 'Song 3' }]; if (fn === 'presetExtension') return 'mp4'; if (fn === 'guideStatus') return [{ hidden: a.seqId !== 's2' }]; return true; };
  let sent = null;
  US.encoder = { run: async (tasks, job, opts) => { sent = { tasks, opts }; tasks.forEach(t => { t.ok = true; }); return tasks; } };
  US.fsx = Object.assign({}, was.fsx, { ensureDir() {}, exportsDir: () => dir });
  const job = { set() { return job; }, progress() {}, check() {} };
  try {
    const r = await US.deliver.exportBin({ binId: 'b1', binName: 'Concerts / All Songs', skip: ['s3'], preset, folder: path.join(dir, 'Out'), suffix: '_1' }, job);
    assert.deepStrictEqual(host.find(h => h[0] === 'binSequences')[1], { binId: 'b1', recursive: false });
    assert.deepStrictEqual(sent.tasks.map(t => [t.seqId, path.basename(t.out), t.range, t.preset === preset]), [['s1', 'Song 1_1.mp4', undefined, true], ['s2', 'Song 2_1.mp4', undefined, true]], 'whole sequences; the unticked one left out');
    assert.deepStrictEqual(host.filter(h => h[0] === 'showGuides').map(h => h[1].seqId), ['s2'], 'guides hidden where they show');
    assert.strictEqual(r.summary, '2 sequences exported');
    await assert.rejects(US.deliver.exportBin({ binId: 'b1', skip: ['s1', 's2', 's3'], preset }, job), e => e.code === 'NOTHING_FOUND');
    await assert.rejects(US.deliver.exportBin({ binId: '' }, job), e => e.code === 'BAD_INPUT');
  } finally { US.host.call = was.call; US.encoder = was.enc; US.fsx = was.fsx; }
});
test('bin export in Resolve: the timelines in a bin (and the bins inside it, when asked)', async () => {
  const Fake = require('./resolve-fake'), HOST = require('../../resolve/host');
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/A.mp4', { frames: 2500 });
  const t1 = F.addTimeline('Song 1', [{ item: a, in: 0, out: 250 }]), t2 = F.addTimeline('Song 2', [{ item: a, in: 0, out: 100 }]);
  const bin = F.bin('All Songs'), sub = F.bin('All Songs/Encores');
  F.pool.MoveClips([t1.GetMediaPoolItem()], bin); F.pool.MoveClips([t2.GetMediaPoolItem()], sub);
  const bins = await run('listBins'), id = bins.find(b => b.path === 'All Songs').id;
  assert.deepStrictEqual((await run('binSequences', { binId: id })).map(x => [x.id, x.name, x.duration]), [[t1.GetUniqueId(), 'Song 1', 10]]);
  assert.deepStrictEqual((await run('binSequences', { binId: id, recursive: true })).map(x => [x.name, x.bin]), [['Song 1', 'All Songs'], ['Song 2', 'All Songs / Encores']]);
});
