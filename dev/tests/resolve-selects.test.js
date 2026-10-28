// resolve/host/selects.js, broll.js and tidy.js against the stand-in Resolve (dev/tests/resolve-fake.js).
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { test } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');

function setup(opts) {
  const F = Fake.make(opts);
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw Object.assign(new Error(`${name}: ${r.error.code} ${r.error.detail}`), { res: r }); return r.data; };
  const fail = async (name, args) => { const r = await host.run(name, args); assert.ok(!r.ok, name + ' should fail'); return r.error; };
  return { F, host, run, fail };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'us-rsel-'));
const touch = f => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); return f; };
const geo = (tl, type, t) => tl.GetItemListInTrack(type, t).map(i => [i._start - tl._start, i._end - tl._start, i._srcStart]);

test('resolve selects/broll/tidy: every command is there', () => {
  const { host } = setup();
  for (const n of ['selectsPlaceWhole', 'selectsSequenceUses', 'selectsAttachProxy', 'selectsStills', 'brollPlace', 'tidyAudit', 'tidyMove']) assert.strictEqual(typeof host.fns[n], 'function', n);
});

test('resolve selects: selectsPlaceWhole lays subclips whole, one after another, in their colours', async () => {
  const { F, run } = setup();
  F.addMedia('/m/A.mp4', { frames: 2500 });
  const subs = F.resolve.GetMediaStorage().AddItemListToMediaPool([{ media: '/m/A.mp4', startFrame: 100, endFrame: 149 }, { media: '/m/A.mp4', startFrame: 1000, endFrame: 1074 }]);
  subs[0].SetClipColor('Yellow');
  const tl = F.addTimeline('Selects');
  const r = await run('selectsPlaceWhole', { seqId: tl.GetUniqueId(), ids: [subs[0].GetUniqueId(), 'gone', subs[1].GetUniqueId()], cursor: 0 });
  assert.deepStrictEqual(r, { cursor: 5, placed: [{ start: 0, end: 2 }, null, { start: 2, end: 5 }] });
  assert.deepStrictEqual(geo(tl, 'video', 1), [[0, 50, 100], [50, 125, 1000]]);
  assert.deepStrictEqual(tl.GetItemListInTrack('video', 1).map(i => i._color), ['Yellow', '']);
  assert.deepStrictEqual(tl.GetItemListInTrack('audio', 1).map(i => i._color), ['Yellow', '']);
  // no cursor: from the end
  const r2 = await run('selectsPlaceWhole', { seqId: tl.GetUniqueId(), ids: [subs[0].GetUniqueId()] });
  assert.deepStrictEqual(r2.placed, [{ start: 5, end: 7 }]);
});

test('resolve selects: selectsSequenceUses – camera clips only, with their times; the rest counted', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), b = F.addMedia('/m/B.mp4', { frames: 2500 }), st = F.addMedia('/m/logo.png', { type: 'Still', audioCh: 0 });
  const nested = F.addTimeline('Nested');
  const tl = F.addTimeline('Cut', [{ item: a, in: 250, out: 500 }, { item: b, in: 0, out: 100 }, { item: st, in: 0, out: 50 }, { item: nested.GetMediaPoolItem(), in: 0, out: 25, mediaType: 1 }, { item: a, in: 1000, out: 1050, track: 2, at: 0, mediaType: 1 }]);
  tl.GetItemListInTrack('video', 1)[1].SetClipEnabled(false);
  const r = await run('selectsSequenceUses', { seqId: tl.GetUniqueId() });
  assert.strictEqual(r.name, 'Cut');
  assert.deepStrictEqual(r.uses, [{ itemId: a.GetUniqueId(), name: 'A.mp4', track: 0, start: 0, end: 10, in: 10, out: 20, speed: 1 }]);
  assert.deepStrictEqual(r.skipped, { graphics: 0, adjustment: 0, nested: 1, stills: 1, disabled: 1 });
  const all = await run('selectsSequenceUses', { seqId: tl.GetUniqueId(), allTracks: true });
  assert.deepStrictEqual(all.uses.map(u => [u.track, u.in, u.out]), [[0, 10, 20], [1, 40, 42]]);
});

test('resolve selects: selectsAttachProxy links the proxy; a missing file is a plain error', async () => {
  const { F, run, fail } = setup();
  const a = F.addMedia('/m/A.mp4'), p = touch(path.join(tmp(), 'A_proxy.mp4'));
  assert.strictEqual(await run('selectsAttachProxy', { id: a.GetUniqueId(), path: p }), true);
  assert.strictEqual(a.GetClipProperty('Proxy Media Path'), p);
  assert.strictEqual((await fail('selectsAttachProxy', { id: a.GetUniqueId(), path: '/nowhere.mp4' })).code, 'NOT_FOUND');
});

test('resolve selects: selectsStills – a still per frame from a scratch timeline the clip’s size, cleaned up after', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 2500, width: 3840, height: 2160 }), b = F.addMedia('/m/B.mp4', { frames: 250 });
  const mine = F.addTimeline('Mine'); F.pool.SetCurrentFolder(F.bin('Shoot'));
  const sizes = [], at = [];
  const exp = F.project.ExportCurrentFrameAsStill;
  F.project.ExportCurrentFrameAsStill = f => { const tl = F.currentTimeline, v = tl.GetCurrentVideoItem(); sizes.push(tl.GetSetting('timelineResolutionWidth')); at.push(v ? v._srcStart : null); return exp(f); };
  const dir = tmp(), outs = [path.join(dir, 'us-still-0.png'), path.join(dir, 'us-still-1.png'), path.join(dir, 'us-still-2.png'), path.join(dir, 'us-still-3.png')];
  const r = await run('selectsStills', { stills: [{ id: a.GetUniqueId(), seconds: 10, out: outs[0] }, { id: a.GetUniqueId(), seconds: 20, out: outs[1] }, { id: b.GetUniqueId(), seconds: 2, out: outs[2] }, { id: 'gone', seconds: 1, out: outs[3] }] });
  assert.deepStrictEqual(r, [outs[0], outs[1], outs[2], null]);
  assert.ok(fs.existsSync(outs[0]) && fs.existsSync(outs[2]));
  assert.deepStrictEqual(at, [250, 500, 50], 'the frame asked for');
  assert.deepStrictEqual(sizes, ['3840', '3840', '1920'], 'the clip’s own size');
  assert.deepStrictEqual(F.timelines.map(t => t.GetName()), ['Mine'], 'scratch timelines deleted');
  assert.strictEqual(F.currentTimeline, mine); assert.strictEqual(F.pool.GetCurrentFolder().GetName(), 'Shoot');
  assert.ok(!F.bin('JMG Ultra Studio').GetSubFolderList().some(f => f.GetName() === '.stills'), '.stills bin gone');
  assert.strictEqual(F.resolve.GetCurrentPage(), 'edit');
  // a Resolve that only exports from the Color page: tried there, then back to the page it was on
  F.project.ExportCurrentFrameAsStill = f => (F.resolve.GetCurrentPage() === 'color' ? exp(f) : false);
  const r2 = await run('selectsStills', { stills: [{ id: b.GetUniqueId(), seconds: 1, out: path.join(dir, 'c.png') }] });
  assert.deepStrictEqual(r2, [path.join(dir, 'c.png')]);
  assert.strictEqual(F.resolve.GetCurrentPage(), 'edit');
});

test('resolve broll: brollPlace – a new top track whose audio track is free too, named, sound kept if asked', async () => {
  const { F, run } = setup();
  const talk = F.addMedia('/m/Talk.mp4', { frames: 5000 }), music = F.addMedia('/m/Music.wav', { type: 'Audio', frames: 5000 }), br = F.addMedia('/m/BR.mp4', { frames: 2500 });
  const tl = F.addTimeline('Interview', [{ item: talk, in: 0, out: 2500 }, { item: music, in: 0, out: 2500, track: 2, at: 0 }]);
  const r = await run('brollPlace', { seqId: tl.GetUniqueId(), shots: [{ id: br.GetUniqueId(), in: 4, out: 7, at: 10 }, { id: br.GetUniqueId(), in: 20, out: 22, at: 40 }, { id: 'gone', in: 0, out: 1, at: 50 }], keepSound: false });
  assert.deepStrictEqual(r, { track: 2, placed: 2, sound: false }, 'V2 is free but A2 holds music: V3');
  assert.deepStrictEqual(geo(tl, 'video', 3), [[250, 325, 100], [1000, 1050, 500]]);
  assert.strictEqual(tl.GetTrackName('video', 3), 'B-roll');
  assert.strictEqual(tl.GetItemListInTrack('audio', 2).length, 1, 'the music is untouched');
  assert.strictEqual(tl.GetTrackCount('audio'), 2, 'no sound placed');
  const copy = tl.DuplicateTimeline('Interview 2');
  const r2 = await run('brollPlace', { seqId: copy.GetUniqueId(), shots: [{ id: br.GetUniqueId(), in: 4, out: 7, at: 10 }], keepSound: true, trackName: 'Cutaways' });
  assert.deepStrictEqual(r2, { track: 3, placed: 1, sound: true });
  assert.deepStrictEqual(geo(copy, 'audio', 4), [[250, 325, 100]]);
  assert.strictEqual(copy.GetTrackName('video', 4), 'Cutaways');
});

test('resolve tidy: tidyAudit – used, unused, offline, subclips, timelines; tidyMove into a bin and back', async () => {
  const dir = tmp();
  const { F, run } = setup();
  const used = F.addMedia(touch(path.join(dir, 'used.mp4'))), spare = F.addMedia(touch(path.join(dir, 'spare.mp4')), { bin: 'Shoot/Day 1' }), gone = F.addMedia('/nowhere/gone.mp4');
  const sub = F.resolve.GetMediaStorage().AddItemListToMediaPool([{ media: path.join(dir, 'spare.mp4'), startFrame: 10, endFrame: 59 }])[0];
  F.addTimeline('Cut', [{ item: used, in: 0, out: 50 }, { item: sub, in: 10, out: 60 }]);
  const r = await run('tidyAudit');
  assert.strictEqual(r.sequences, 1);
  const by = id => r.items.find(x => x.id === id);
  assert.deepStrictEqual(by(used.GetUniqueId()), { id: used.GetUniqueId(), name: 'used.mp4', path: path.join(dir, 'used.mp4'), bin: '(Project root)', offline: false, used: true, subclip: false, sequence: false });
  assert.strictEqual(by(spare.GetUniqueId()).used, true, 'its subclip is used');
  assert.strictEqual(by(spare.GetUniqueId()).bin, 'Shoot / Day 1');
  assert.strictEqual(by(sub.GetUniqueId()).subclip, true);
  assert.deepStrictEqual([by(gone.GetUniqueId()).offline, by(gone.GetUniqueId()).used], [true, false]);
  const seq = r.items.find(x => x.sequence); assert.strictEqual(seq.name, 'Cut'); assert.strictEqual(seq.path, '');
  // move into a bin, then back where it came from ("Shoot / Day 1" as the audit reports it), and to the root
  assert.strictEqual(await run('tidyMove', { ids: [gone.GetUniqueId(), 'nope'], binPath: 'Unused 28 Oct' }), 1);
  assert.deepStrictEqual(F.bin('Unused 28 Oct').GetClipList(), [gone]);
  assert.strictEqual(await run('tidyMove', { ids: [gone.GetUniqueId()], binPath: 'Shoot / Day 1' }), 1);
  assert.ok(F.bin('Shoot/Day 1').GetClipList().includes(gone));
  assert.strictEqual(await run('tidyMove', { ids: [gone.GetUniqueId()], binPath: '' }), 1);
  assert.ok(F.root.GetClipList().includes(gone));
  assert.strictEqual(await run('tidyMove', { ids: [], binPath: 'X' }), 0);
});
