// Ask › Undo and dictation, Resolve side (resolve/host/edit.js against the stand-in Resolve): where timelines stand
// now (askStamp), bins taken away only when empty (askRemoveBins), and a recording put into words by Resolve's own
// transcription, with nothing left behind in the Media Pool (dictateTranscribe). Same names and results as the
// Premiere commands in jsx/tools/edit.jsx.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { test, ROOT } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require(path.join(ROOT, 'resolve', 'host', 'index.js'));

function setup() {
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), b = F.addMedia('/m/B.mp4', { frames: 2500 });
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }, { item: b, in: 0, out: 50 }]);
  return { F, host, run, tl, seqId: tl.GetUniqueId() };
}

test('askStamp: a timeline’s length, clips and markers as they are now; one that is gone says so', async () => {
  const S = setup();
  let st = await S.run('askStamp', { seqIds: [S.seqId, 'gone'] });
  assert.deepStrictEqual([st[0].id, st[0].name, st[0].duration, st[0].markers, st[0].guids.length, st[1]], [S.seqId, 'Cut', 6, 0, 0, { id: 'gone', missing: true }]);
  const clips = st[0].clips;
  assert.ok(clips >= 2, 'its clips are counted: ' + clips);
  const g = await S.run('addSequenceMarkers', { seqId: S.seqId, markers: [{ start: 1, end: 1, name: 'x', comment: '', color: 1 }] });
  st = await S.run('askStamp', { seqIds: [S.seqId] });
  assert.deepStrictEqual([st[0].markers, st[0].guids, st[0].clips], [1, g, clips], 'a marker added since shows');
  assert.deepStrictEqual(await S.run('askStamp', {}), []);
});

test('askRemoveBins: only bins with nothing in them go – the deepest first, so an emptied parent goes too; anything else stays and says why', async () => {
  const S = setup();
  S.F.bin('JMG Ultra Studio/Ask/Versions'); S.F.bin('Footage');
  const keep = S.F.bin('Interviews'); keep._clips.push({ GetUniqueId: () => 'c9', GetName: () => 'x', GetClipProperty: () => '' });
  const r = await S.run('askRemoveBins', { paths: ['JMG Ultra Studio / Ask', 'JMG Ultra Studio / Ask / Versions', 'Interviews', 'No / Such'] });
  assert.deepStrictEqual(r.removed, ['JMG Ultra Studio / Ask / Versions', 'JMG Ultra Studio / Ask']);
  assert.deepStrictEqual(r.kept.slice().sort((x, y) => x.path.localeCompare(y.path)), [{ path: 'Interviews', why: 'not empty' }, { path: 'No / Such', why: 'not there any more' }]);
  const paths = (await S.run('listBins')).map(b => b.path);
  assert.ok(paths.includes('JMG Ultra Studio') && paths.includes('Interviews') && paths.includes('Footage') && !paths.some(p => /Ask/.test(p)), paths.join());
  assert.deepStrictEqual(await S.run('askRemoveBins', { paths: [] }), { removed: [], kept: [] });
});

test('dictateTranscribe: the recording is transcribed by Resolve itself and taken out of the Media Pool again; an older Resolve says so plainly', async () => {
  const S = setup();
  const wav = path.join(require('os').tmpdir(), `us-dictate-test-${Date.now()}.wav`);
  fs.writeFileSync(wav, Buffer.alloc(64));
  try {
    const pool = S.F.resolve.GetProjectManager().GetCurrentProject().GetMediaPool(), real = pool.ImportMedia;
    let made = null, asked = 0;
    pool.ImportMedia = items => { const out = real(items); made = out[0]; if (made) { made.TranscribeAudio = () => { asked++; return true; }; made.GetTranscription = () => (asked ? { language: 'en', segments: [{ words: [{ text: 'cut' }, { text: 'the' }, { text: '(...)' }, { text: 'silences' }] }] } : null); } return out; };
    S.host.R.transcribeTiming = { poll: 1 };
    const r = await S.run('dictateTranscribe', { path: wav, maxMs: 500 });
    assert.deepStrictEqual(r, { text: 'cut the silences' });
    assert.strictEqual(asked, 1);
    assert.ok(!(await S.run('listBins')).some(b => /dictation/.test(b.path)), 'the bin it used is gone again');
    assert.ok(made._dead, 'and so is the recording');
    // a Resolve that can't transcribe for add-ons
    pool.ImportMedia = items => { const out = real(items); made = out[0]; if (made) { delete made.TranscribeAudio; delete made.GetTranscription; } return out; };
    const old = await S.run('dictateTranscribe', { path: wav });
    assert.ok(old.unsupported === true && /21\.1 or later/.test(old.why) && made._dead, JSON.stringify(old));
    pool.ImportMedia = () => [];
    assert.ok((await S.run('dictateTranscribe', { path: wav })).unsupported, 'a file Resolve won’t take');
  } finally { try { fs.unlinkSync(wav); } catch (e) { /* gone */ } }
});
