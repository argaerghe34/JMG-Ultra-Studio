// Deliver › Other editors: the pane's logic (js/tools/33-deliver-move.js), the Resolve commands (resolve/host/nle.js)
// against the stand-in Resolve, and the Premiere commands' shape (jsx/tools/nle.jsx).
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { load, test, ROOT } = require('./harness');
const { setup, asResolve, fakeJob } = require('./resolve-render-kit');
const { connect } = require('../../resolve/host');
const US = load(['js/tools/33-deliver-nlexml.js', 'js/tools/33-deliver-move.js']);
const N = US.nleXml, M = US.deliverMove;
const FIX = path.join(ROOT, 'dev', 'tests', 'fixtures', 'nle');
const fixture = f => fs.readFileSync(path.join(FIX, f), 'utf8');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'us-move-'));

/** The panel as if in Premiere, with host commands stubbed. */
function asPremiere(stub) {
  const keep = { is: US.app.is, call: US.host.call }, calls = [];
  US.app.is = w => w === 'premiere';
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (!stub[fn]) throw new Error('unexpected host call ' + fn); return stub[fn](a); };
  return { calls, restore() { US.app.is = keep.is; US.host.call = keep.call; } };
}

test('deliver-move: what gets written – Premiere’s own XML for Premiere and Resolve, FCPXML for Final Cut Pro, EDL and OTIO when asked', () => {
  const xml = fixture('premiere-wedding.xml'), tl = N.readXmeml(xml);
  const p = M.plan(tl, { targets: ['premiere', 'resolve', 'fcp'], edl: true, otio: true, native: xml });
  assert.deepStrictEqual(p.map(f => f.file), ['Wedding – first look – for Premiere Pro.xml', 'Wedding – first look – for DaVinci Resolve.xml', 'Wedding – first look – for Final Cut Pro.fcpxml', 'Wedding – first look.edl', 'Wedding – first look.otio']);
  assert.strictEqual(p[0].text, xml, 'the editor’s own export, untouched');
  assert.ok(/<fcpxml version="1.10">/.test(p[2].text));
  const q = M.plan(tl, { targets: ['resolve', 'premiere'] });
  assert.ok(/<fcpxml/.test(q[0].text) && /<xmeml/.test(q[1].text), 'no native export: FCPXML for Resolve, FCP 7 XML for Premiere');
  assert.ok(q[0].file.endsWith('.fcpxml') && q[1].file.endsWith('.xml'));
});

test('deliver-move: Premiere – sends the sequence (its own XML read, the files saved, what was lost listed); nothing else asked of Premiere', async () => {
  const dir = tmpDir();
  const P = asPremiere({ nleExport: a => { fs.mkdirSync(path.dirname(a.path), { recursive: true }); fs.writeFileSync(a.path, fixture('premiere-wedding.xml')); return { path: a.path, native: 'xmeml', report: 'FCP Translation Results\nSequence: Wedding\nEffect "Lumetri Color" not translated.\n' }; } });
  try {
    const r = await M.sendTo({ seqId: 'S1', targets: ['fcp', 'resolve'], edl: true, folder: dir }, fakeJob());
    assert.deepStrictEqual(P.calls.map(c => c[0]), ['nleExport']);
    assert.deepStrictEqual(r.files.map(f => f.key), ['fcp', 'resolve', 'edl']);
    for (const f of r.files) assert.ok(fs.existsSync(f.path), f.file);
    assert.ok(/<fcpxml/.test(fs.readFileSync(r.files[0].path, 'utf8')));
    assert.strictEqual(fs.readFileSync(r.files[1].path, 'utf8'), fixture('premiere-wedding.xml'));
    assert.ok(r.lost.some(l => /Lumetri/.test(l)) && r.lost.some(l => /transitions/.test(l)));
    assert.ok(r.notes.includes('Premiere: Effect "Lumetri Color" not translated.'), r.notes.join(' | '));
    assert.strictEqual(r.stats.clips, 6);
    assert.ok(/^3 files saved \(\.fcpxml, \.xml, \.edl\) – 6 clips/.test(r.summary), r.summary);
  } finally { P.restore(); }
  await assert.rejects(() => M.sendTo({ seqId: 'S1', targets: [], folder: dir }, fakeJob()), /Nothing to make/);
});

test('deliver-move: Premiere – brings in an FCPXML as FCP 7 XML, media that moved found by name, never Resolve’s import', async () => {
  const dir = tmpDir(), media = path.join(dir, 'Moved'); fs.mkdirSync(path.join(media, 'Day 1'), { recursive: true });
  for (const f of ['A001_interview.mov', 'B002_hands.mov']) fs.writeFileSync(path.join(media, 'Day 1', f), 'x');
  const file = path.join(dir, 'Interview cut.fcpxml'); fs.writeFileSync(file, fixture('fcp11-interview.fcpxml'));
  let imported = '';
  let added = null;
  const P = asPremiere({ nleImport: a => { imported = fs.readFileSync(a.path, 'utf8'); return { seqId: 'NEW', name: a.name, clips: 7 }; }, openSequence: () => true,
    sequenceInfo: () => ({ markers: [{ start: 24 / (24000 / 1001), name: 'Good line' }] }), addSequenceMarkers: a => { added = a; return []; } });
  try {
    const r = await M.bringIn({ file, mediaFolder: media }, fakeJob());
    assert.deepStrictEqual(P.calls.map(c => c[0]), ['nleImport', 'sequenceInfo', 'addSequenceMarkers', 'openSequence']);
    assert.deepStrictEqual(added.markers.map(m => [m.name, Math.round(m.start * 24), m.color]), [['Intro', 0, 2], ['Laugh', 192, 1]], 'markers the import missed are added; one it brought is not added twice');
    assert.strictEqual(added.where, 'sequence'); assert.strictEqual(r.markersAdded, 2);
    assert.strictEqual(r.name, 'Interview cut (from Final Cut Pro)');
    assert.ok(/<xmeml version="4">/.test(imported));
    assert.ok(imported.includes(N.pathToUrl(path.join(media, 'Day 1', 'A001_interview.mov'), true)), 'relinked path in the XML');
    assert.strictEqual(r.found, 2);
    assert.deepStrictEqual(r.missing.sort(), ['C001_wide', 'C002_close', 'Music bed']);
    assert.ok(r.lost.some(l => /multicam/.test(l)));
    assert.strictEqual(r.expected, 6, '3 pictures, 3 sounds');
  } finally { P.restore(); }
});

test('deliver-move: an .fcpxmld bundle is read from its Info.fcpxml; AAF is Resolve’s; other files are refused plainly', async () => {
  const dir = tmpDir(), b = path.join(dir, 'Cut.fcpxmld'); fs.mkdirSync(b); fs.writeFileSync(path.join(b, 'Info.fcpxml'), fixture('fcp11-interview.fcpxml'));
  const r = M.readTimelineFile(b);
  assert.strictEqual(r.kind, 'fcpxml'); assert.strictEqual(path.basename(r.path), 'Info.fcpxml');
  const txt = path.join(dir, 'notes.txt'); fs.writeFileSync(txt, 'hello');
  assert.throws(() => M.readTimelineFile(txt), /isn’t a timeline file/);
  const aaf = path.join(dir, 'Cut.aaf'); fs.writeFileSync(aaf, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  const P = asPremiere({});
  try { await assert.rejects(() => M.bringIn({ file: aaf }, fakeJob()), /Premiere opens AAF files itself/); } finally { P.restore(); }
});

/* ---------- Resolve ---------- */
function resolveSetup() {
  const S = setup(), dir = tmpDir();
  const a = path.join(dir, 'A001.mov'), b = path.join(dir, 'B002.mov'); fs.writeFileSync(a, 'x'); fs.writeFileSync(b, 'x');
  const ca = S.F.addMedia(a, { frames: 500 }), cb = S.F.addMedia(b, { frames: 500, audioCh: 0, type: 'Video' });
  const tl = S.F.addTimeline('Doc cut', [{ item: ca, in: 100, out: 200 }, { item: cb, in: 50, out: 100 }, { item: ca, in: 300, out: 325, track: 2, at: 20 }]);
  tl.AddMarker(30, 'Blue', 'Chapter 1', 'note', 1, 'us-x');
  tl.GetItemListInTrack('video', 1)[0].SetClipColor('Navy');
  tl.InsertFusionTitleIntoTimeline('Text+');
  const host = connect({ api: S.F.resolve });
  return { S, F: S.F, tl, host, dir, a, b, seqId: tl.GetUniqueId() };
}

test('deliver-move: Resolve – nleExport reads the timeline (clips, in points, tracks, colours, markers) and lists the titles it leaves out', async () => {
  const R = resolveSetup();
  const r = (await R.host.run('nleExport', { seqId: R.seqId, path: path.join(R.dir, 'x.xml') })).data;
  assert.ok(r.model && !r.path, 'no FCP 7 XML export on the JavaScript API: the timeline comes back');
  const tl = N.finish(Object.assign(N.blank(), r.model));
  assert.strictEqual(tl.name, 'Doc cut'); assert.strictEqual(tl.tcStart, 86400);
  assert.deepStrictEqual(tl.video[0].clips.map(c => [c.name, c.at, c.len, c.in]), [['A001.mov', 0, 100, 100], ['B002.mov', 100, 50, 50]]);
  assert.deepStrictEqual(tl.video[1].clips.map(c => [c.at, c.len, c.in]), [[20, 25, 300]]);
  assert.strictEqual(tl.video[0].clips[0].colour, 'Navy');
  assert.strictEqual(tl.media[tl.video[0].clips[0].media].path, R.a);
  assert.deepStrictEqual(tl.markers.map(m => [m.at, m.name, m.colour]), [[30, 'Chapter 1', 'Blue']]);
  assert.ok(N.lostLines(tl).some(l => /titles and generated clips/.test(l)), N.lostLines(tl).join(' | '));
  // and through the panel: FCPXML for Final Cut Pro, FCP 7 XML for Premiere (Navy → Iris)
  const X = asResolve(US, R.host);
  try {
    const s = await M.sendTo({ seqId: R.seqId, targets: ['fcp', 'premiere'], otio: true, folder: R.dir }, fakeJob());
    assert.deepStrictEqual(s.files.map(f => path.extname(f.file)), ['.fcpxml', '.xml', '.otio']);
    const x = fs.readFileSync(s.files[1].path, 'utf8');
    assert.ok(x.includes('<label2>Iris</label2>'));
    const back = N.readXmeml(x);
    assert.deepStrictEqual(back.video[0].clips.map(c => [c.at, c.len, c.in]), [[0, 100, 100], [100, 50, 50]]);
  } finally { X.restore(); }
});

test('deliver-move: Resolve – nleImport makes a new timeline in “From other editors” with Resolve’s import; refusals are plain errors', async () => {
  const R = resolveSetup();
  const file = path.join(R.dir, 'Cut.fcpxml'); fs.writeFileSync(file, fixture('fcp11-interview.fcpxml'));
  let asked = null;
  R.F.pool.ImportTimelineFromFile = (p, o) => { asked = { p, o, folder: R.F.pool.GetCurrentFolder().GetName() }; return R.F.pool.CreateEmptyTimeline(o.timelineName); };
  const before = R.F.pool.GetCurrentFolder();
  const r = (await R.host.run('nleImport', { path: file, name: 'Doc cut', mediaFolder: R.dir })).data;
  assert.strictEqual(r.name, 'Doc cut 2', 'a name not used yet');
  assert.deepStrictEqual(asked.o, { timelineName: 'Doc cut 2', importSourceClips: true, sourceClipsPath: R.dir });
  assert.strictEqual(asked.folder, 'From other editors');
  assert.strictEqual(R.F.pool.GetCurrentFolder(), before, 'the Media Pool folder is put back');
  R.F.pool.ImportTimelineFromFile = () => { throw new Error('Execute: ImportTimelineFromFile: Error response (errorStr:Failed)'); };
  const e = await R.host.run('nleImport', { path: file });
  assert.ok(!e.ok && /couldn’t read that timeline file/.test(e.error.title));
  assert.ok(!(await R.host.run('nleImport', { path: path.join(R.dir, 'gone.fcpxml') })).ok);
});

test('deliver-move: Resolve – the panel uses Resolve’s own import, and the converted FCP 7 XML if Resolve refuses', async () => {
  const R = resolveSetup();
  const file = path.join(R.dir, 'Promo.otio'); fs.writeFileSync(file, fixture('resolve-short.otio'));
  const seen = [];
  R.F.pool.ImportTimelineFromFile = (p, o) => { seen.push(path.extname(p)); if (/\.otio$/.test(p)) throw new Error('Execute: ImportTimelineFromFile: Error response (errorStr:Unsupported)'); return R.F.pool.CreateEmptyTimeline(o.timelineName); };
  const X = asResolve(US, R.host);
  try {
    const r = await M.bringIn({ file }, fakeJob());
    assert.deepStrictEqual(seen, ['.otio', '.xml']);
    assert.strictEqual(r.how, 'converted to FCP 7 XML');
    assert.strictEqual(r.name, 'Short 9x16 (from OTIO)');
    assert.ok(X.calls.some(c => c[0] === 'openSequence' && c[1].seqId === r.seqId), 'the new timeline is opened');
  } finally { X.restore(); }
});

test('deliver-move: both editors have the commands, Premiere’s never saves the project', () => {
  const jsx = fs.readFileSync(path.join(ROOT, 'jsx', 'tools', 'nle.jsx'), 'utf8');
  const res = require('../../resolve/host/nle.js')({});
  for (const f of ['nleExport', 'nleImport']) { assert.ok(jsx.includes(`fn.${f} = function`), 'Premiere ' + f); assert.strictEqual(typeof res[f], 'function', 'Resolve ' + f); }
  assert.ok(jsx.includes('exportAsFinalCutProXML(f.fsName, 1)'), 'Premiere’s own XML, without its dialog');
  assert.ok(!/\.save\(|saveAs\(/.test(jsx), 'never saves');
  const deliver = fs.readFileSync(path.join(ROOT, 'js', 'tools', '33-deliver.js'), 'utf8');
  assert.ok(/'nleExport', 'nleImport'/.test(deliver), 'listed in Deliver’s commands (Check my setup)');
});

test('deliver-move: the Assistant knows “send this to Final Cut” and “import an FCPXML”', () => {
  const to = US.actions.get('deliver.toEditor'), from = US.actions.get('deliver.fromEditor');
  assert.deepStrictEqual(Object.assign({}, to.match('send this to Final Cut Pro'), { _score: undefined }), { editors: 'fcp', edl: false, otio: false, _score: undefined });
  assert.strictEqual(to.match('export an EDL for the colourist').edl, true);
  assert.strictEqual(to.match('render the master'), null);
  assert.ok(from.match('import an FCPXML from my editor'));
  assert.strictEqual(from.match('import the interviews'), null);
});
