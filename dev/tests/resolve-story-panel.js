// Story's panel side as it runs in Resolve (run on its own by resolve-story.test.js: the harness loads the panel once,
// as Premiere, so Resolve needs a fresh Node). Against the stand-in Resolve: where Story is kept, and "Transcribe with
// Resolve" reading subtitles into Story. Prints "ok" or throws.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
global.window = global; global.__ULTRA_RESOLVE__ = true;
global.addEventListener = () => {}; global.ResizeObserver = function () { return { observe() {} }; };
const { load } = require('./harness');
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-sync.js', 'js/tools/22-story.js']);
const Fake = require('./resolve-fake'), HOST = require('../../resolve/host');

(async () => {
  assert.ok(US.app.is('resolve'));
  const F = Fake.make({ projectName: 'Harbour' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-rpanel-')), media = path.join(dir, 'Harbour', 'Cards');
  fs.mkdirSync(media, { recursive: true });
  const file = path.join(media, 'Ruth.mp4'); fs.writeFileSync(file, 'x');
  const clip = F.addMedia(file, { frames: 25 * 60 });
  const host = HOST.connect({ api: F.resolve });
  // subtitles as Resolve would make them (the host side is tested in resolve-story.test.js)
  host.fns.storyTranscribe = a => ({ id: a.id, name: 'Ruth.mp4', path: file, language: '', items: [{ text: 'I grew up by the sea.', start: 1, end: 3.5 }, { text: 'My father fished every day of his life.', start: 4, end: 8 }] });
  US.host.call = async (fn, args) => { const r = await host.run(fn, args); if (!r.ok) throw new US.UserError(r.error.code, { detail: r.error.detail }); return r.data; };
  US.ctx = { project: { name: 'Harbour', path: path.join(dir, 'db', 'Harbour [project1].drp') }, sequence: null, selection: 0 };

  // until Resolve has said where Story goes, nothing is loaded or saved
  US.story.loadState();
  assert.strictEqual(US.story.state().transcripts.length, 0);
  const job = { set() { return job; }, progress() { return job; }, check() {}, log() {}, range() { return job; } };
  // nothing selected, nothing read before: a plain error
  await assert.rejects(US.story.readPremiereTranscripts(job), e => e.code === 'NO_SELECTION');
  F.selected = [clip];
  const r = await US.story.readPremiereTranscripts(job);
  assert.ok(/1 interview transcribed by Resolve/.test(r.summary), r.summary);
  const st = US.story.state();
  assert.strictEqual(st.transcripts.length, 1);
  const t = st.transcripts[0];
  assert.deepStrictEqual([t.source, t.itemId, t.path], ['resolve', clip.GetUniqueId(), file]);
  assert.ok(t.lines.length >= 1 && /sea/.test(t.lines[0].text));
  // this computer's copy is keyed on Resolve's project id; the travelling copy goes next to the media
  US.story.flushShared();   // the shared copy is written a few seconds after a change – now
  const local = path.join(US.fsx.dataDir, 'projects', US.fsx.hash('resolve:project-1') + '-story.json');
  assert.ok(fs.existsSync(local), 'local copy ' + local);
  const shared = path.join(media, 'JMG Ultra Studio', 'Harbour – Story.json');
  assert.ok(fs.existsSync(shared), 'shared copy ' + shared);
  assert.strictEqual(JSON.parse(fs.readFileSync(shared, 'utf8')).transcripts.length, 1);
  assert.deepStrictEqual(US.story.syncStatus(), { where: 'project', reason: '' });
  // remembered for the project, so it doesn't move
  assert.strictEqual(US.projectStore(US.ctx.project.path).get('storyFolder'), media);
  console.log('ok');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
