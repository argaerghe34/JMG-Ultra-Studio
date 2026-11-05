// Resolve: mVFX's commands against the stand-in Resolve (resolve/host/mvfx.js) – templates written where Resolve
// reads them, a title inserted at the playhead with its words set, a generator with its blend, a held frame, a look's
// LUT on the first node, and moves refused plainly.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { load, test } = require('./harness');
const { setup } = require('./resolve-render-kit');
const US = load(['time', 'js/tools/36-quickfx.js', 'js/tools/39-mvfx-fusion.js', 'js/tools/39-mvfx-looks.js', 'js/tools/39-mvfx-pack.js']);
const P = US.mvfxPack, F = US.mvfxFusion;

function withTimeline() {
  const S = setup();
  const file = path.join(S.dir, 'I001.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);   // 10 s at 25 fps
  return Object.assign(S, { clip, tl, seqId: tl.GetUniqueId() });
}
const titlesDir = () => path.join(os.homedir(), 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'Fusion', 'Templates', 'Edit', 'Titles', 'JMG Ultra Studio');

test('mvfxTemplates: the files go to Resolve’s own Templates › Edit › Titles / Generators › JMG Ultra Studio; a new file means a restart', async () => {
  const S = withTimeline(), tpl = F.title(P.byId('hairline'), P.defaults(P.byId('hairline'))), gen = F.generator(P.byId('grain'), null);
  const r = await S.run('mvfxTemplates', { write: [tpl, gen] });
  assert.deepStrictEqual(r.written, ['JMG Hairline', 'JMG Film grain']);
  if (process.platform === 'darwin') {
    assert.ok(fs.existsSync(path.join(titlesDir(), 'JMG Hairline.setting')), 'title written');
    assert.ok(fs.existsSync(path.join(path.dirname(path.dirname(titlesDir())), 'Generators', 'JMG Ultra Studio', 'JMG Film grain.setting')), 'generator written');
    assert.strictEqual(fs.readFileSync(path.join(titlesDir(), 'JMG Hairline.setting'), 'utf8'), tpl.body);
  }
  assert.strictEqual(r.restart, true);
  const again = await S.run('mvfxTemplates', { write: [tpl] });
  assert.strictEqual(again.restart, false, 'rewriting a template needs no restart');
});

test('mvfxApply: a title inserted at the playhead on the Edit page, its words set again in the Fusion comp; a generator with its blend; unknown names say what to do', async () => {
  const S = withTimeline(), tpl = F.title(P.byId('hairline'), Object.assign(P.defaults(P.byId('hairline')), { text: { name: 'Mira Haddad', role: 'Nurse' } }));
  S.F.resolve.OpenPage('color');
  const r = await S.run('mvfxApply', { seqId: S.seqId, start: 4, seconds: 5, name: 'Hairline', title: { name: tpl.name, inputs: tpl.inputs, kind: 'titles' } });
  assert.strictEqual(r.placed, 1); assert.strictEqual(r.start, 4); assert.strictEqual(r.end, 9);
  assert.deepStrictEqual(S.tl._inserted, [['title', 'JMG Hairline']]);
  assert.strictEqual(S.tl._playhead, 86400 + 100, 'the playhead was put at 4 s');
  assert.strictEqual(S.F.resolve.GetCurrentPage(), 'color', 'the page is put back');
  const ti = S.tl.GetItemListInTrack('video', 2)[0];
  assert.ok(ti && ti._mpi._name === 'JMG Hairline', 'on the first track with room above the clip');
  assert.strictEqual(r.track, 1);
  assert.ok(r.log.includes('no tool T2'), 'the inserted comp had no tools to set – said in the log: ' + r.log.join('; '));
  // a comp with the tools: the words are set again
  const S2 = withTimeline();
  const wasInsert = S2.tl.InsertFusionTitleIntoTimeline;
  S2.tl.InsertFusionTitleIntoTimeline = n => { const t = wasInsert(n); if (t) { t._comp._add('T2', { StyledText: 'Ruth Adler' }); t._comp._add('T3', { StyledText: 'x' }); } return t; };
  const r2 = await S2.run('mvfxApply', { seqId: S2.seqId, start: 0, seconds: 5, name: 'Hairline', title: { name: tpl.name, inputs: tpl.inputs, kind: 'titles' } });
  const t2 = S2.tl.GetItemListInTrack('video', 2)[0]._comp;
  assert.strictEqual(t2.FindTool('T2').GetInput('StyledText'), 'Mira Haddad'); assert.strictEqual(t2.FindTool('T3').GetInput('StyledText'), 'NURSE');
  assert.ok(!r2.log.some(l => /not set/.test(l)), r2.log.join('; '));
  // a generator, on a track above the title
  const g = await S2.run('mvfxApply', { seqId: S2.seqId, start: 0, seconds: 5, name: 'Film grain', generator: { name: 'JMG Film grain', blend: 'overlay', kind: 'generators' } });
  assert.strictEqual(g.track, 2); assert.deepStrictEqual(S2.tl._inserted.slice(-1), [['generator', 'JMG Film grain']]);
  assert.strictEqual(S2.tl.GetItemListInTrack('video', 3)[0].GetProperty('CompositeMode'), 'Overlay');
  // nothing in the library
  let err = null;
  try { await S2.run('mvfxApply', { seqId: S2.seqId, start: 0, seconds: 5, name: 'x', title: { name: 'No such title', inputs: {}, kind: 'titles' } }); } catch (e) { err = e; }
  assert.ok(err && /couldn’t find “No such title”/.test(err.title || err.message) && /Install the whole pack/.test(err.action || ''), String(err && (err.title + ' | ' + err.action)));
  // Premiere's layers mean nothing here
  const none = await S2.run('mvfxApply', { seqId: S2.seqId, start: 0, seconds: 5, name: 'x', layers: [{ kind: 'text' }] });
  assert.strictEqual(none.placed, 0);
});

test('mvfxFreeze: the frame at the playhead exported, imported into the mVFX bin and laid on an "mVFX 1" track (5 s, as Resolve does)', async () => {
  const S = withTimeline();
  const r = await S.run('mvfxFreeze', { seqId: S.seqId, at: 3, seconds: 3, outBase: path.join(S.dir, 'freeze-3000'), binPath: 'JMG Ultra Studio/mVFX' });
  assert.ok(fs.existsSync(r.path) && /freeze-3000\.png$/.test(r.path));
  assert.strictEqual(r.start, 3); assert.ok(r.end > 3);
  assert.strictEqual(S.tl.GetTrackName('video', r.track + 1), 'mVFX 1');
  assert.strictEqual(S.tl.GetItemListInTrack('video', r.track + 1).length, 1);
  assert.ok(S.F.pool.GetRootFolder().GetSubFolderList().some(f => f.GetName() === 'JMG Ultra Studio'), 'the mVFX bin');
});

test('mvfxLook: the .cube on the first node of each clip; a missing file or clip is said', async () => {
  const S = withTimeline(), lut = path.join(S.dir, 'JMG Faded memory.cube'); fs.writeFileSync(lut, US.mvfxLooks.cube('faded', 3));
  const r = await S.run('mvfxLook', { seqId: S.seqId, targets: [{ kind: 'video', track: 0, start: 0 }, { kind: 'video', track: 0, start: 7 }], look: { id: 'faded', lut, label: 'Faded memory' } });
  assert.strictEqual(r.done, 1); assert.deepStrictEqual(r.skipped.map(s => s.why), ['not on the timeline any more']);
  assert.strictEqual(S.tl.GetItemListInTrack('video', 1)[0].GetLUT(1), lut);
  let err = null; try { await S.run('mvfxLook', { seqId: S.seqId, targets: [], look: { id: 'faded', lut: lut + '.missing' } }); } catch (e) { err = e; }
  assert.ok(err && /LUT file isn’t there/.test(err.title || err.message));
});

test('mvfxMove: refused plainly (no keyframes by script)', async () => {
  const S = withTimeline();
  const r = await S.run('mvfxMove', { seqId: S.seqId, targets: [{ kind: 'video', track: 0, start: 0 }], keys: [] });
  assert.ok(r.unsupported && /Resolve doesn’t let add-ons keyframe/.test(r.why));
});
