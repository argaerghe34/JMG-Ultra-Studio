// Seeing and hearing the footage, in the real editor (no AI cost, nothing downloaded, nothing sent anywhere).
// With no model on the computer it must be graceful: Settings has the section, the built-in listener hears a real clip
// (or says plainly that its sound needs a render – it never starts one), the status says what's missing, the cloud is
// refused until chosen, and Selects still works from the picture alone. A stand-in vision model then looks at REAL
// stills taken in the panel, so the whole path – stills, record, search, digest, Selects – runs for real. If a vision
// model IS on this computer (downloaded in Settings, or your own in Ollama), it really describes the two test clips.
// Everything made here (records for the test clips, the project's choice) is put back afterwards.
const U = US.understand, M = US.models, F = US.footage; T.assert(U && M && F && US.understandUI, 'understanding, the models list and its Settings section are loaded');
const fs = require('fs');
const BIN = 'Test – Understand';
await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C003_dark.mp4')], BIN);
const bins = await US.host.call('listBins'), bin = bins.find(b => b.path === BIN);
const clips = F.describable(await F.listClips(null, { binId: bin.id }));
T.assert(clips.length === 2 && clips.every(c => c.path && c.duration > 1), 'the two clips are listed: ' + JSON.stringify(clips.map(c => [c.name, c.duration])));
const encoders = () => require('child_process').execSync(process.platform === 'win32' ? 'tasklist' : 'ps -axo comm').toString().split('\n').filter(l => /Media Encoder/i.test(l)).length;
const encodersBefore = encoders();
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
// the background queue may have been at work since the panel opened: hold it (after the request in hand), and say what it had kept
const release = await U.pause();
const before = U.kept().filter(r => clips.some(c => c.path === r.path));

// what is put back at the end: each clip's record (cache, the project's Footage.json copy and index), and the project's choice
const store = US.projectStore(US.ctx.project.path || US.ctx.project.name);
const keep = { route: store.get('understand.route'), index: store.get('understand.index'), media: US.ai.mediaOn(), background: US.settings.get('understand.background'), routes: Object.assign({}, U.routes) };
const log = [];
try {
  US.settings.set('understand.background', false);   // the test does the work itself, so nothing races it
  U.reset();
  const saved = clips.map(c => U.forget(c.path));
  keep.saved = saved;
  if (before.length) log.push('kept before the test (by the background): ' + before.map(r => `${r.name} – seen: ${r.seen}; heard: ${r.heard}${r.sounds.length ? ' (' + r.sounds.join(', ') + ')' : ''}`).join(' / '));
  U.setRoute('local');

  // 1. Settings has the section, with sizes before any download, and nothing is on the computer that wasn't asked for
  const sec = US.settingsSections.list().find(s => s.id === 'understand');
  T.assert(sec && sec.title === 'Vision & listening models', 'registered as a Settings section');
  const el = sec.create(), text = el.textContent;
  T.assert(/On this computer/.test(text) && /Cloud/.test(text) && /Update models automatically/.test(text) && /Kept in: /.test(text), 'the section shows both routes, the update toggle and where models are kept');
  const downloads = Array.from(el.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /^Download \(/.test(t));
  T.assert(downloads.every(t => /\d (MB|GB)/.test(t)), 'every Download button says its size first: ' + downloads.join(' | '));
  T.assert(M.autoUpdate() === false || US.settings.get('understand.autoUpdate') === true, 'automatic updates are off unless you switched them on');
  const P = U.plan();
  log.push(`vision: ${P.vision.kind}${P.vision.label ? ' (' + P.vision.label + ')' : ''}; listening: ${P.listening.label}${P.listenModel ? ' + ' + P.listenModel.label : ''}`);

  // 2. nothing known yet: null, not something made up
  const none = await U.forClip(clips[0].path);
  T.assert(none === null || none.fromLook, 'nothing is known about a clip before it is looked at (after forgetting it): ' + JSON.stringify(none && { vision: none.vision, listening: none.listening }));
  T.assert(typeof (await U.context({ paths: [clips[0].path] })) === 'string', 'the digest is a string even when empty');
  T.assert(Array.isArray(await U.search('people laughing')), 'search answers with a list');

  // 3. the built-in listener on a real clip – from the file, never a render
  const heard = await U.analyse(clips[0], { only: ['listening'] });
  const rec1 = U.peek(clips[0].path);
  if (heard.did.listening) {
    T.assert(rec1.listening.done && Array.isArray(rec1.sounds) && rec1.sound && rec1.sound.label, 'listened to: ' + JSON.stringify({ how: rec1.listening.how, sounds: rec1.sounds.map(s => s.type), quality: rec1.sound }));
    log.push(`listened via ${rec1.listening.how}: ${rec1.sounds.map(s => s.type).join(', ') || 'nothing notable'}; sound ${rec1.sound.label}`);
  } else {
    T.assert(rec1.listening && rec1.listening.waiting === 'render' && heard.skipped === 'sound', 'its sound can’t be read here, so it waits for Overnight prep: ' + JSON.stringify(rec1.listening));
    log.push('sound couldn’t be read without a render (no ffmpeg; the panel can’t decode it) – it waits, as it should');
  }
  T.assert(encoders() === encodersBefore, 'Media Encoder was not started');

  // 4. the cloud: refused until chosen for the project, and nothing is sent
  if (!US.ai.projectOffline()) {
    US.ai.setMedia(false);
    let refused = '';
    try { await US.ai.media({ system: 's', user: ['x', { media: { kind: 'audio', data: 'AAAA', mime: 'audio/wav', seconds: 1 } }] }); } catch (e) { refused = e.title || e.message; }
    T.assert(/isn’t switched on for this project/.test(refused), 'cloud seeing and hearing is refused until chosen: ' + refused);
    T.assert(U.route() === 'local', 'the project is on this computer');
  }

  // 5. with no vision model: said plainly, and Selects still works from the picture
  if (P.vision.kind === 'none') {
    U.queue.items = clips.map(c => ({ id: c.id, path: c.path, name: c.name, duration: c.duration })); U.queue.listed = true; U.queue.project = US.ctx.project.path || US.ctx.project.name;
    const st = U.status();
    T.assert(st.state === 'needs-model' || st.state === 'working' || st.state === 'paused' || st.state === 'scheduled', 'the status is one a person can act on: ' + JSON.stringify(st));
    T.assert((await U.describe({ path: clips[1].path, start: 0, end: 3 })) === null, 'no description without a model – not an invented one');
    T.assert(US.selects.known({ clipId: 'none', start: 0, end: 2 }, null) === null, 'Selects falls back to its picture analysis');
    log.push('no vision model on this computer: the graceful path was checked – ' + st.text);
  }

  // 6. a stand-in vision model looks at REAL stills taken here (no Media Encoder), and everything downstream works
  const seen = [];
  U.routes.vision = async (plan, req) => { const stills = req.user.filter(b => b.image); seen.push(stills); const jpg = Buffer.from(stills[0].image.data, 'base64'); if (!(jpg[0] === 0xFF && jpg[1] === 0xD8 && jpg.length > 1500)) throw new Error('not a JPEG still'); return /C003/.test(stills[0].image.note) ? { shots: [{ from: 0, to: 99, description: 'A dim stage with a few faint lights.', shot: 'wide', setting: 'a concert hall', people: 'no one clear', tags: ['dark', 'stage'] }], events: [] } : { shots: [{ from: 0, to: 99, description: 'A band plays on a lit stage.', shot: 'wide', setting: 'a concert hall', people: 'a band', tags: ['band', 'stage', 'lights'] }], events: [{ at: 1, kind: 'gesture', what: 'the singer raises an arm' }] }; };
  const standIn = Object.assign(U.plan(), { vision: { kind: 'own', id: 'e2e-stand-in@1', label: 'Stand-in model' } });
  try {
    for (const c of clips) { const r = await U.analyse(c, { only: ['vision'], plan: standIn }); T.assert(r.did.vision, 'looked at ' + c.name + ': ' + JSON.stringify({ skipped: r.skipped, vision: U.peek(c.path).vision })); }
    T.assert(seen.length >= 2 && seen.every(s => s.length >= 1 && s.every(b => b.image.w <= 512)), 'small stills, taken in the panel: ' + seen.map(s => s.length));
    T.assert(encoders() === encodersBefore, 'still no Media Encoder');
    const d = await U.describe({ path: clips[0].path, start: 0, end: 3 });
    T.assert(d && /band plays/.test(d.text) && /raises an arm/.test(d.text), 'a moment is described from what was seen: ' + JSON.stringify(d));
    const found = await U.search('dark stage', { paths: clips.map(c => c.path) });
    T.assert(found.length && /C003/.test(found[0].name), 'found by what it shows: ' + JSON.stringify(found.slice(0, 2)));
    const ctx = await U.context({ paths: clips.map(c => c.path), maxChars: 1500 });
    T.assert(/WHAT IS IN THE FOOTAGE/.test(ctx) && /C001_sharp_static\.mp4/.test(ctx) && /A dim stage/.test(ctx) && ctx.length <= 1500, 'the digest for Ask and Story: ' + ctx.slice(0, 200));
    const k = US.selects.known({ clipId: 'x', start: 0, end: 3 }, U.peek(clips[1].path));
    T.assert(k && k.shot === 'wide' && /dim stage/.test(k.text), 'Selects reads it: a shot size without a face, and what’s in it');
    T.assert(F.lookOf(clips[0]) && /band plays/.test(F.lookOf(clips[0]).description), 'Ask’s footage tool reads it too');
  } finally { Object.assign(U.routes, keep.routes); }

  // 7. a real model, when there is one on this computer: it really describes the test clips
  if (P.vision.kind === 'helper' || P.vision.kind === 'own') {
    clips.forEach(c => U.forget(c.path)); U.reset();
    const t0 = Date.now();
    const r = await U.analyse(clips[0], { only: ['vision'], job: US.jobs.testJob('understand') });
    const rec = U.peek(clips[0].path);
    T.assert(r.did.vision && rec.shots.length >= 1 && rec.shots[0].text.length > 10, 'a real description: ' + JSON.stringify(rec.shots));
    log.push(`REAL describe with ${P.vision.label} in ${((Date.now() - t0) / 1000).toFixed(1)} s: “${rec.shots[0].text}”`);
  } else log.push('no real model here, so the real describe was not run (download one in Settings › Vision & listening models to test it)');
} finally {
  Object.assign(U.routes, keep.routes);
  U.reset();
  (keep.saved || []).forEach(s => U.unforget(s));
  store.set('understand.route', keep.route); store.set('understand.index', keep.index);
  US.ai.setMedia(keep.media);
  US.settings.set('understand.background', keep.background);
  U.reset(); M.stop(); release();
}
return log.join(' | ');
