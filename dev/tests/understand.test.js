// Seeing and hearing the footage (US.understand, US.models, US.ai.media): when to look and listen; a model's answer
// tidied into shots, moments and sounds with times; the record kept per file, searched, quoted and digested for an AI
// that reads text; the built-in listener on made-up sound; models downloaded only in checked pieces; the helper
// started hidden on this computer; sound refused for the cloud until chosen for the project and never for a project
// kept here; the background queue that only works when the computer is calm and schedules what would be heavy; honest
// estimates; and Selects reading it all. No model, no network beyond 127.0.0.1, no AI cost.
const assert = require('assert'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), EventEmitter = require('events');
const { load, test, ROOT } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
const US = load(['time', 'audio', 'dsp', 'vision', 'transcript', 'ai', 'understand-models', 'understand', 'js/tools/14-footage.js', 'js/tools/01-overnight.js', 'js/tools/10-selects.js', 'js/tools/99-understand.js']);
const U = US.understand, P = U._pure, M = US.models;
const job = { set() { return job; }, progress() { return job; }, busy() { return job; }, range() { return job; }, check() {}, log() {} };
const CTX0 = US.ctx;
const tmp = name => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-und-')), name); fs.writeFileSync(p, 'x' + Math.random()); return p; };
const project = name => { US.ctx = { project: { name, path: '/p/' + name + '.prproj' } }; U.reset(); };
const STILL = t => ({ t, data: 'QUJD', w: 512, h: 288 });
// stand-ins for the routes: what a vision model and a listening model would answer
function fakeRoutes({ sound = null, vision = null, listen = null, grab = null } = {}) {
  const keep = Object.assign({}, U.routes), calls = { vision: [], listen: [], grab: [], sound: 0 };
  U.routes.grab = async (item, times) => { calls.grab.push(times); return grab ? grab(item, times) : { stills: times.map(STILL), how: 'panel' }; };
  U.routes.vision = async (Pl, req) => { calls.vision.push(req); const ts = req.user.filter(b => b.image).map(b => b.image.note); return vision ? vision(req, ts) : { shots: [{ from: 0, to: 999, description: 'A woman laughs behind a market stall.', shot: 'medium', setting: 'a street market', people: 'one woman', tags: ['market', 'stall', 'fruit'] }], events: [{ at: 4, kind: 'reaction', what: 'she laughs and looks away' }] }; };
  U.routes.listen = async (Pl, req) => { calls.listen.push(req); return listen ? listen(req) : { sounds: [{ from: 2, to: 5, type: 'laughter', what: 'a woman laughs' }], tone: 'warm and amused' }; };
  U.routes.sound = async () => { calls.sound++; if (sound === 'fail') { const e = new Error('no'); e.code = 'NOT_FROM_FILES'; throw e; } const sr = 16000, data = sound || new Float32Array(sr * 12); return { data, sr, duration: data.length / sr, how: 'ffmpeg' }; };
  return { calls, restore() { Object.assign(U.routes, keep); } };
}
// a tiny catalogue that checks out, with a model whose files are a few bytes – as if downloaded
function tinyCatalogue(id = 'tiny', name = 'Tiny') {
  const f = (name, body) => ({ role: /mmproj/.test(name) ? 'mmproj' : 'model', name, url: 'https://huggingface.co/x/y/resolve/main/' + name, bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex'), body });
  const files = [f('tiny.gguf', 'model-bytes'), f('mmproj-tiny.gguf', 'proj')];
  const man = { version: 5, runtime: { id: 'llama-server', version: 't1', builds: { [M.platformKey()]: { name: 'h.tar.gz', url: 'https://github.com/x/h.tar.gz', bytes: 3, sha256: 'a'.repeat(64), exe: 'bin/llama-server' } } },
    models: [{ id, name, use: ['vision', 'listening'], version: '1', licence: 'MIT', source: 'https://huggingface.co/x/y', memory: 'little', stillsPerAsk: 2, chunkSec: 30, assume: [1, 2], what: 'test', files: files.map(x => ({ role: x.role, name: x.name, url: x.url, bytes: x.bytes, sha256: x.sha256 })) }] };
  US.settings.set('understand.modelsDir', fs.mkdtempSync(path.join(os.tmpdir(), 'us-models-')));
  US.settings.set('understand.manifest', man);
  const m = M.get(id);
  fs.mkdirSync(M.modelDir(m), { recursive: true });
  for (const x of files) fs.writeFileSync(path.join(M.modelDir(m), x.name), x.body);
  const exe = path.join(M.runtime.info().dir, 'bin', 'llama-server'); fs.mkdirSync(path.dirname(exe), { recursive: true }); fs.writeFileSync(exe, '#!');
  US.settings.set('understand.visionModel', id);
  return { man, files, undo() { M.stop(); US.settings.set('understand.manifest', null); US.settings.set('understand.modelsDir', ''); US.settings.set('understand.visionModel', ''); US.settings.set('understand.listenModel', 'builtin'); } };
}

test('when to look and listen: about a still every ten seconds (1–24 a clip); sound in pieces a model can take', () => {
  assert.deepStrictEqual(P.visionTimes(0), [0]);
  assert.deepStrictEqual(P.visionTimes(5), [2.5]);
  assert.deepStrictEqual(P.visionTimes(30), [5, 15, 25]);
  assert.strictEqual(P.visionTimes(3600).length, 24, 'an hour-long clip is still 24 stills');
  assert.deepStrictEqual(P.listenChunks(70, { chunk: 30 }), [{ start: 0, end: 30 }, { start: 30, end: 60 }, { start: 60, end: 70 }]);
  const long = P.listenChunks(3600, { chunk: 30, max: 20 });
  assert.ok(long.length === 20 && long[0].start === 0 && long[19].end === 3600, 'a long clip is sampled evenly, start to end');
});

test('a vision model’s answer is tidied: times inside the clip and in order, no gaps, events kept, nonsense dropped', () => {
  const t = P.tidyVision({ shots: [{ from: 12, to: 40, description: 'Hands knead dough.', shot: 'detail', setting: 'a bakery', people: 'hands', tags: ['Dough', 'dough', 'flour'] }, { from: -5, to: 9, description: 'A baker walks in.', shot: 'nonsense', setting: '', people: 'a man', tags: [] }, { from: 1, to: 2, description: '', shot: 'wide' }],
    events: [{ at: 99, kind: 'gesture', what: 'he waves' }, { at: 3, kind: 'made-up', what: '' }] }, [5, 15, 25], 30, 10);
  assert.deepStrictEqual(t.shots.map(s => [s.start, s.end, s.shot]), [[0, 12, 'other'], [12, 30, 'detail']]);
  assert.deepStrictEqual(t.shots[1].tags, ['dough', 'flour']);
  assert.deepStrictEqual(t.events, [{ t: 30, kind: 'gesture', text: 'he waves' }]);
  // a tiny model answers still by still: neighbours that say the same thing become one shot
  const merged = P.mergeShots([{ start: 0, end: 10, text: 'A beach.', shot: 'wide', setting: 'a beach', people: '', tags: ['beach', 'sea', 'sand'] }, { start: 10, end: 20, text: 'A wide beach at dusk.', shot: 'wide', setting: '', people: '', tags: ['beach', 'sea', 'dusk'] }, { start: 20, end: 30, text: 'A face.', shot: 'close-up', setting: '', people: 'a girl', tags: ['face'] }]);
  assert.deepStrictEqual(merged.map(s => [s.start, s.end, s.text]), [[0, 20, 'A wide beach at dusk.'], [20, 30, 'A face.']]);
});

test('the built-in listener: silence, wind and a burst of noise are found in made-up sound, with the sound’s quality', async () => {
  const sr = 16000, data = new Float32Array(sr * 22);
  for (let i = sr * 5; i < sr * 13; i++) { const t = i / sr; data[i] = 0.3 * (0.6 + 0.4 * Math.sin(t * 3.1)) * (Math.sin(2 * Math.PI * 31 * t) + 0.7 * Math.sin(2 * Math.PI * 47 * t + 1) + 0.5 * Math.sin(2 * Math.PI * 23 * t + 2)); }   // 5–13 s: low rumble (wind)
  for (let i = sr * 16; i < sr * 20; i++) data[i] = (Math.random() - 0.5) * 0.5;                                 // 16–20 s: a bright burst
  const r = await US.dsp.soundEvents(data, sr);
  const of = t => r.events.filter(e => e.type === t);
  assert.ok(of('silence').some(e => e.start <= 1 && e.end >= 4), 'the silent start: ' + JSON.stringify(r.events));
  assert.ok(of('wind').some(e => e.start < 8 && e.end > 10), 'the rumble is wind: ' + JSON.stringify(r.events));
  assert.ok(r.events.every(e => e.end > e.start && e.end <= 22.01 && e.conf > 0 && e.conf <= 1), 'every event has a time and how sure it is');
  assert.ok(['clean', 'some noise', 'noisy', 'no speech'].includes(r.quality.label));
  assert.deepStrictEqual((await US.dsp.soundEvents(new Float32Array(100), sr)).events, [], 'too short to say anything');
  // 16-bit WAV bytes for a model that listens
  const wav = US.audio.wavBytes(Float32Array.from([0, 0.5, -1, 2]), 16000);
  assert.strictEqual(wav.toString('ascii', 0, 4) + wav.toString('ascii', 8, 12), 'RIFFWAVE');
  assert.deepStrictEqual([wav.length, wav.readUInt32LE(24), wav.readInt16LE(46), wav.readInt16LE(48), wav.readInt16LE(50)], [52, 16000, 16384, -32767, 32767]);
});

test('the models’ list: every file is HTTPS from its makers with a size and checksum; models.json in the repository is the same list', () => {
  assert.ok(M.validManifest(M.BUILTIN));
  for (const m of M.BUILTIN.models) { assert.ok(/^(Apache-2\.0|MIT)$/.test(m.licence), m.id + ' has a licence that allows this use'); assert.ok(m.files.find(f => f.role === 'model') && m.files.find(f => f.role === 'mmproj') && m.what && m.memory && m.source); }
  assert.ok(M.BUILTIN.models.some(m => m.use.includes('vision')) && M.BUILTIN.models.some(m => m.use.includes('listening')));
  assert.deepStrictEqual(Object.keys(M.BUILTIN.runtime.builds).sort(), ['darwin-arm64', 'darwin-x64', 'win32-x64']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8')), JSON.parse(JSON.stringify(M.BUILTIN)), 'models.json (what “Check for updates” reads) matches the list built in');
  // a list that doesn't check out is never believed
  const bad = JSON.parse(JSON.stringify(M.BUILTIN)); bad.version = 9; bad.models[0].files[0].url = 'http://example.com/x.gguf';
  assert.strictEqual(M.validManifest(bad), false);
  const bad2 = JSON.parse(JSON.stringify(M.BUILTIN)); bad2.runtime.builds['darwin-arm64'].exe = '../../evil';
  assert.strictEqual(M.validManifest(bad2), false);
  US.settings.set('understand.manifest', bad); assert.strictEqual(M.manifest(), M.BUILTIN, 'the built-in list is used instead'); US.settings.set('understand.manifest', null);
  assert.strictEqual(M.autoUpdate(), false, '“Update models automatically” is off until switched on');
  assert.strictEqual(M.BUILTIN.models.some(m => M.installed(m.id)), false, 'nothing is on the computer until Download is pressed');
});

test('a download: carries on from where it stopped, is only kept when its checksum matches, and only starts from a trusted place', async () => {
  const body = crypto.randomBytes(200000), sum = crypto.createHash('sha256').update(body).digest('hex'), seen = [];
  const s = await new Promise(res => { const x = http.createServer((req, rs) => { seen.push(req.headers.range || ''); if (req.url === '/moved') { rs.writeHead(302, { location: '/file' }); return rs.end(); } const m = /bytes=(\d+)-/.exec(req.headers.range || ''); if (m) { rs.writeHead(206); rs.end(body.subarray(+m[1])); } else { rs.writeHead(200); rs.end(body); } }); x.listen(0, '127.0.0.1', () => res(x)); });
  const base = `http://127.0.0.1:${s.address().port}`, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-dl-'));
  try {
    const f = { name: 'a.gguf', url: base + '/moved', bytes: body.length, sha256: sum }, dest = path.join(dir, 'a.gguf'), prog = [];
    fs.writeFileSync(dest + '.part', body.subarray(0, 50000));   // an earlier try got this far
    await M.fetchFile(f, dest, { allowLocal: true, onProgress: (d, t) => prog.push([d, t]) });
    assert.ok(fs.readFileSync(dest).equals(body) && !fs.existsSync(dest + '.part'), 'the whole file, checked, under its own name');
    assert.ok(seen.includes('bytes=50000-'), 'only the rest was asked for: ' + seen);
    assert.deepStrictEqual(prog[prog.length - 1], [body.length, body.length]);
    // the wrong bytes: thrown away, said plainly
    const dest2 = path.join(dir, 'b.gguf');
    await assert.rejects(() => M.fetchFile({ name: 'b.gguf', url: base + '/file', bytes: body.length, sha256: 'f'.repeat(64) }, dest2, { allowLocal: true }), e => /isn’t the one expected/.test(e.title));
    assert.ok(!fs.existsSync(dest2) && !fs.existsSync(dest2 + '.part'));
    // Stop: what came down is kept for next time
    const dest3 = path.join(dir, 'c.gguf');
    await assert.rejects(() => M.fetchFile({ name: 'c.gguf', url: base + '/file', bytes: body.length, sha256: sum }, dest3, { allowLocal: true, check: () => { throw new US.UserError('CANCELLED'); } }), e => e.code === 'CANCELLED');
    assert.ok(!fs.existsSync(dest3));
    // not from just anywhere
    await assert.rejects(() => M.fetchFile({ name: 'd', url: 'https://example.com/d', bytes: 1, sha256: sum }, path.join(dir, 'd')), e => /trusts/.test(e.title));
    await assert.rejects(() => M.fetchFile({ name: 'd', url: base + '/file', bytes: 1, sha256: sum }, path.join(dir, 'd')), e => /trusts/.test(e.title), 'plain http is refused outside the tests');
  } finally { s.close(); }
});

test('the helper starts hidden on this computer only, at its own address, and a model on disk can be deleted', async () => {
  const T = tinyCatalogue(), spawned = [];
  try {
    assert.ok(M.installed('tiny') && M.runtime.installed());
    const spawn = (exe, args, opts) => {
      const p = new EventEmitter(); p.pid = 0; p.stderr = new EventEmitter(); p.kill = () => { srv.close(); p.emit('exit'); };
      const srv = http.createServer((req, rs) => { rs.writeHead(req.url === '/health' ? 200 : 404); rs.end('{"status":"ok"}'); });
      srv.listen(+args[args.indexOf('--port') + 1], '127.0.0.1');
      spawned.push({ exe, args, opts, p }); return p;
    };
    const url = await M.start('tiny', { spawn });
    assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(url));
    const a = spawned[0].args;
    assert.strictEqual(a[a.indexOf('--host') + 1], '127.0.0.1', 'this computer only');
    assert.ok(a.includes('--no-webui') && a[a.indexOf('-m') + 1].endsWith('tiny.gguf') && a[a.indexOf('--mmproj') + 1].endsWith('mmproj-tiny.gguf'));
    assert.strictEqual(spawned[0].opts.windowsHide, true, 'no window');
    assert.strictEqual(await M.start('tiny', { spawn }), url, 'already running: the same one');
    assert.strictEqual(spawned.length, 1);
    M.remove('tiny');
    assert.ok(!M.installed('tiny') && !M.helper.proc, 'deleted, and the helper stopped');
    await assert.rejects(() => M.start('tiny', { spawn }), e => /isn’t on this computer/.test(e.title));
  } finally { T.undo(); }
});

test('model updates: found from a short list, told – and only downloaded when asked', async () => {
  const T = tinyCatalogue();
  try {
    const next = JSON.parse(JSON.stringify(T.man)); next.version = 6; next.models[0].version = '2';
    const r = await M.checkUpdates({ fetch: async () => JSON.stringify(next) });
    assert.ok(r.checked && r.updates.length === 1 && r.updates[0].id === 'tiny' && r.updates[0].to === '2');
    assert.strictEqual(M.pendingUpdates().length, 1, 'kept as “updates available”');
    assert.strictEqual(M.manifest().version, 5, 'nothing changes until the editor takes it');
    assert.ok(M.installed('tiny'));
    const same = await M.checkUpdates({ fetch: async () => JSON.stringify(T.man) });
    assert.deepStrictEqual([same.checked, same.updates.length], [true, 0]);
    const off = await M.checkUpdates({ fetch: async () => { throw new Error('offline'); } });
    assert.strictEqual(off.checked, false);
    const junk = await M.checkUpdates({ fetch: async () => '{"version":99,"models":[{"id":"x","files":[{"url":"http://evil"}]}]}' });
    assert.strictEqual(junk.checked, false, 'a list that doesn’t check out is ignored');
  } finally { US.settings.set('understand.pending', null); T.undo(); }
});

test('sound and stills for the cloud: refused until “Cloud” is chosen for the project, never for a project kept here; the record keeps sizes, not the sound', async () => {
  US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
  US.secrets.set('geminiKey', 'g-test'); US.secrets.set('anthropicKey', 'sk-test');
  const SOUND = { media: { kind: 'audio', data: Buffer.alloc(96000).toString('base64'), mime: 'audio/wav', bytes: 96000, seconds: 3, note: 'C001.mp4 0:00–0:03' } };
  const req = { system: 's', user: ['A piece of sound:', SOUND], schema: { type: 'object' } };
  try {
    assert.strictEqual(US.ai.mediaOn(), false, 'off until chosen');
    await assert.rejects(() => US.ai.media(req), e => /isn’t switched on for this project/.test(e.title) && /Vision & listening models/.test(e.action));
    US.ai.setMedia(true); assert.strictEqual(US.ai.mediaOn(), true);
    US.ai.setProjectOffline(true);
    assert.strictEqual(US.ai.mediaOn(), false, 'a project kept on this computer never sends');
    await assert.rejects(() => US.ai.media(req), e => /nothing leaves this computer/.test(e.title));
    US.ai.setProjectOffline(false);
    // Claude looks but can't listen
    await assert.rejects(() => US.ai.media(Object.assign({ use: 'claude:claude-haiku-5-5' }, req)), e => /can’t listen/.test(e.title));
    assert.deepStrictEqual([US.ai.mediaModel().provider, US.ai.mediaModel().hears], ['gemini', true]);
    assert.deepStrictEqual([US.ai.mediaModel('claude:claude-haiku-5-5').provider, US.ai.mediaModel('claude:claude-haiku-5-5').hears], ['claude', false]);
    // what the record of what was sent keeps: a line with the length and size
    const parts = US.ai._stills.partsOf(req);
    assert.strictEqual(parts[2].text, '[sound: C001.mp4 0:00–0:03 – 3 s, 94 KB; the sound itself isn’t kept here]');
    assert.ok(!JSON.stringify(parts).includes(SOUND.media.data.slice(0, 40)));
    // prices for the estimates carry their date
    assert.ok(/2026/.test(US.ai.MEDIA_PRICES.date) && US.ai.mediaPrice('gemini-flash-lite-latest').in > 0 && US.ai.mediaPrice('gemini-3.8-flash').out === 3.75);
  } finally { US.ai.setMedia(false); US.ai.setProjectOffline(false); US.secrets.set('geminiKey', ''); US.secrets.set('anthropicKey', ''); US.ctx = CTX0; }
});

test('a model on this computer at the helper’s address gets stills and sound; anything but localhost is refused', async () => {
  const seen = [];
  const s = await new Promise(res => { const x = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { seen.push(JSON.parse(b)); rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify({ choices: [{ message: { content: '{"sounds":[],"tone":"calm"}' } }] })); }); }); x.listen(0, '127.0.0.1', () => res(x)); });
  try {
    const r = await US.ai.localAt({ url: `http://127.0.0.1:${s.address().port}`, model: 'tiny', system: 's', user: ['Listen:', { media: { kind: 'audio', data: 'UklGRg==', mime: 'audio/wav', seconds: 1 } }, { image: { data: 'QUJD', w: 8, h: 8 } }], schema: { type: 'object' }, feature: 'Hearing footage' });
    assert.deepStrictEqual(r, { sounds: [], tone: 'calm' });
    const c = seen[0].messages[1].content;
    assert.deepStrictEqual(c[1], { type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } });
    assert.ok(c[2].image_url.url.startsWith('data:image/jpeg;base64,QUJD') && seen[0].model === 'tiny');
    await assert.rejects(() => US.ai.localAt({ url: 'http://example.com:9000', system: 's', user: 'x' }), e => /must run on this computer/.test(e.title));
  } finally { s.close(); }
});

test('a clip is looked at and listened to once: the record has shots, moments and sounds with times, and is found, quoted and digested', async () => {
  project('Market film');
  const T = tinyCatalogue(), R = fakeRoutes();
  US.settings.set('understand.listenModel', 'tiny');
  const item = { id: 'i1', path: tmp('C001_market.mp4'), name: 'C001_market.mp4', duration: 28 };
  try {
    assert.strictEqual(await U.forClip(item.path), null, 'nothing known yet');
    assert.strictEqual(await U.describe({ path: item.path, start: 0, end: 5 }), null, 'and nothing made up');
    const pl = U.plan();
    assert.deepStrictEqual([pl.route, pl.vision.kind, pl.listening.kind, pl.listenModel.kind], ['local', 'helper', 'builtin', 'helper']);
    const r = await U.analyse(item, { job });
    assert.deepStrictEqual(r.did, { vision: true, listening: true, listenModel: true });
    assert.deepStrictEqual(R.calls.grab, [[4.67, 14], [23.33]], 'three stills, two to a request for this model');
    assert.ok(R.calls.vision[0].user.filter(b => b.image).every(b => b.image.w <= 512) && !JSON.stringify(R.calls.vision[0].user.filter(b => !b.image)).includes(path.dirname(item.path)), 'small stills, no file paths');
    assert.strictEqual(R.calls.listen[0].user[1].media.mime, 'audio/wav');
    const rec = await U.forClip(item.path);
    assert.deepStrictEqual([rec.name, rec.shot, rec.setting, rec.shots.length, rec.shots[0].start, rec.shots[0].end], ['C001_market.mp4', 'medium', 'a street market', 1, 0, 28]);
    assert.ok(rec.events.some(e => e.kind === 'reaction' && /laughs/.test(e.text)) && rec.sounds.some(s => s.type === 'laughter' && s.start === 2 && s.by === 'Tiny') && rec.tone === 'warm and amused');
    assert.ok(rec.vision.done && rec.listening.done && rec.listenModel.done);
    // once: nothing is asked again
    const again = await U.analyse(item, { job });
    assert.deepStrictEqual([again.did, R.calls.vision.length], [{ vision: false, listening: false, listenModel: false }, 2]);
    assert.deepStrictEqual(U.needs(rec), { vision: false, listening: false, listenModel: false });
    // quoted for a moment with no speech
    const d = await U.describe({ path: item.path, start: 1, end: 6 });
    assert.ok(/market stall/.test(d.text) && /laughs and looks away/.test(d.text) && /Sound: laughter \(a woman laughs\)/.test(d.text), d.text);
    assert.deepStrictEqual(d.sounds, ['laughter']);
    // found by what is seen and by what is heard
    const seen = await U.search('the market'), heard = await U.search('people laughing');
    assert.ok(seen.length && seen[0].path === item.path && seen[0].kind === 'shot' && seen[0].score >= 0.9, JSON.stringify(seen));
    assert.ok(heard.some(x => x.kind === 'sound' && x.start === 2 && x.end === 5) && heard.some(x => x.kind === 'event'), JSON.stringify(heard));
    assert.deepStrictEqual(await U.search('helicopter'), []);
    // the digest for Ask, Producer and Story
    const ctx = await U.context({ maxChars: 800 });
    assert.ok(/^WHAT IS IN THE FOOTAGE/.test(ctx) && /C001_market\.mp4 \(0:28, medium, a street market\)/.test(ctx) && /seen: 0:00–0:28 A woman laughs/.test(ctx) && /heard: .*0:02–0:05 laughter \(a woman laughs\)/.test(ctx) && ctx.length <= 800, ctx);
    assert.strictEqual(await U.context({ paths: ['/nowhere.mp4'] }), '');
    assert.ok((await U.context({ maxChars: 200 })).length <= 200);
    // Ask's existing footage tool reads it too
    const look = US.footage.lookOf(item);
    assert.ok(look && look.understood && /market stall/.test(look.description) && /Heard: laughter/.test(look.description) && look.shot === 'medium' && look.tags.includes('laughter'));
  } finally { R.restore(); T.undo(); US.ctx = CTX0; }
});

test('with no vision model: the built-in listener still works, the status says what’s missing, and Selects falls back', async () => {
  project('No model film');
  const sr = 16000, data = new Float32Array(sr * 12); for (let i = sr * 6; i < sr * 12; i++) data[i] = (Math.random() - 0.5) * 0.3;
  const R = fakeRoutes({ sound: data });
  const item = { id: 'i2', path: tmp('C002.mp4'), name: 'C002.mp4', duration: 12 };
  try {
    const pl = U.plan();
    assert.deepStrictEqual([pl.vision.kind, !!pl.vision.needsModel, pl.listening.kind, pl.listenModel], ['none', true, 'builtin', null]);
    const r = await U.analyse(item, { job });
    assert.deepStrictEqual([r.did.listening, r.did.vision, R.calls.vision.length, R.calls.grab.length], [true, false, 0, 0]);
    const rec = U.peek(item.path);
    assert.ok(rec.sounds.some(s => s.type === 'silence' && s.by === 'built-in') && rec.sound && rec.shots.length === 0);
    U.queue.items = [item]; U.queue.listed = true; U.queue.project = '/p/No model film.prproj';
    const st = U.status();
    assert.deepStrictEqual([st.state, st.offers[0]], ['needs-model', 'settings']);
    assert.ok(/download a vision model/.test(st.note));
    assert.strictEqual(US.selects.known({ clipId: 'zz', start: 0, end: 4 }, null), null, 'Selects: nothing known – the picture analysis alone, as before');
  } finally { R.restore(); US.ctx = CTX0; }
});

test('background first: it only works when the computer is calm, stops between requests, picks up where it stopped, and never renders', async () => {
  assert.deepStrictEqual(U.calm({ job: null, cpu: 0.1, lag: 5, load1: 1, cores: 8, battery: null }), { ok: true, why: '' });
  assert.ok(/“Exporting” is running/.test(U.calm({ job: { title: 'Exporting' }, cpu: 0, lag: 0, load1: 0, cores: 8 }).why));
  assert.ok(/processor at 85%/.test(U.calm({ job: null, cpu: 0.85, lag: 0, load1: 0, cores: 8 }).why));
  assert.ok(/slow to respond/.test(U.calm({ job: null, cpu: 0.1, lag: 400, load1: 0, cores: 8 }).why));
  assert.ok(/battery is at 20%/.test(U.calm({ job: null, cpu: 0.1, lag: 0, load1: 0, cores: 8, battery: { charging: false, level: 0.2 } }).why));
  assert.strictEqual(U.calm({ job: null, cpu: 0.1, lag: 0, load1: 0, cores: 8, battery: { charging: true, level: 0.2 } }).ok, true);
  project('Slices film');
  const T = tinyCatalogue(), R = fakeRoutes();
  const item = { id: 'i3', path: tmp('C003_long.mp4'), name: 'C003_long.mp4', duration: 95 };
  try {
    let asks = 0;
    const first = await U.analyse(item, { only: ['vision'], keepGoing: () => asks++ < 3 });
    assert.deepStrictEqual([first.more, first.did.vision, R.calls.vision.length], [true, false, 2], 'stopped after two requests');
    assert.deepStrictEqual([U.peek(item.path).vision.next, U.peek(item.path).vision.total], [4, 10]);
    const rest = await U.analyse(item, { only: ['vision'] });
    assert.deepStrictEqual([rest.did.vision, R.calls.vision.length, R.calls.grab[2][0]], [true, 5, P.visionTimes(95)[4]], 'the rest, from where it stopped');
    assert.strictEqual(R.calls.sound, 0, 'only what was asked for');
    // sound that can't be read without a render waits – nothing is rendered behind the editor's back
    const R2 = fakeRoutes({ sound: 'fail' }), it2 = { id: 'i4', path: tmp('C004.mxf'), name: 'C004.mxf', duration: 20 };
    try {
      const w = await U.analyse(it2, { only: ['listening'] });
      assert.deepStrictEqual([w.skipped, U.peek(it2.path).listening.waiting], ['sound', 'render']);
      U.queue.items = [it2]; U.queue.listed = true; U.queue.project = '/p/Slices film.prproj';
      const b = U.backlog(); assert.ok(b.todo.length === 1 && b.todo[0].need.retry && b.waitsForRender === 0, 'tried once more this session (ffmpeg may be there now) before it waits: ' + JSON.stringify(b.todo[0] && b.todo[0].need));
    } finally { R2.restore(); }
  } finally { R.restore(); T.undo(); US.ctx = CTX0; }
});

test('heavy work is said clearly and scheduled, not started: what waits, why, how long – with Overnight prep or Run now', async () => {
  project('Big film');
  const T = tinyCatalogue(), R = fakeRoutes();
  try {
    U.queue.items = Array.from({ length: 60 }, (_, i) => ({ id: 'b' + i, path: tmp(`B${i}.mp4`), name: `B${i}.mp4`, duration: 240 }));
    U.queue.listed = true; U.queue.project = '/p/Big film.prproj';
    for (const it of U.queue.items) await U.analyse(it, { only: ['listening'] });   // listening is light: done in the background
    const st = U.status();
    assert.strictEqual(st.state, 'scheduled', JSON.stringify(st));
    assert.ok(/60 clips waiting to be looked at/.test(st.text) && /1440 stills/.test(st.note) && /an estimate – not yet measured here/.test(st.note) && /Overnight prep/.test(st.note), st.note);
    assert.deepStrictEqual(st.offers, ['overnight', 'now']);
    assert.strictEqual(await U.tick(), false, 'and the background doesn’t start it');
    assert.strictEqual(R.calls.vision.length, 0);
    // the editor may say big jobs can run in quiet moments
    US.settings.set('understand.heavyInBackground', true);
    assert.ok(['working', 'paused'].includes(U.status().state));
    US.settings.set('understand.heavyInBackground', false);
    // Run now / Overnight prep: everything, as one job
    U.queue.items = U.queue.items.slice(0, 3);
    const done = await U.runAll(job, { heavy: true });
    assert.ok(/3 clips looked at and listened to/.test(done.summary), done.summary);
    assert.strictEqual(U.status().state, 'up-to-date');
    assert.ok(US.overnight.STEPS.some(s => s.id === 'understand') && typeof US.overnight.RUNNERS.understand === 'function', 'Overnight prep has the step');
  } finally { R.restore(); T.undo(); US.settings.set('understand.heavyInBackground', false); US.ctx = CTX0; }
});

test('the cloud is a per-project choice: off until chosen, never in the background, and gone again for a project kept on this computer', async () => {
  project('Cloud film');
  US.secrets.set('geminiKey', 'g-test');
  const R = fakeRoutes(), sent = [], keepMedia = US.ai.media;
  US.ai.media = async req => { sent.push(req); return req.feature === 'Hearing footage' ? { sounds: [{ from: 0, to: 2, type: 'applause', what: 'a room claps' }], tone: '' } : { shots: [{ from: 0, to: 9, description: 'A hall.', shot: 'wide', setting: '', people: '', tags: ['hall'] }], events: [] }; };
  Object.assign(U.routes, { vision: R.calls.__v = (Pl, req, o) => US.ai.media(req), listen: (Pl, req) => US.ai.media(req) });
  const item = { id: 'c1', path: tmp('C010.mp4'), name: 'C010.mp4', duration: 9 };
  try {
    assert.strictEqual(U.route(), 'local', 'on this computer unless chosen');
    U.setRoute('cloud');
    assert.deepStrictEqual([U.route(), US.ai.mediaOn(), U.plan().vision.kind, U.plan().listenModel.kind], ['cloud', true, 'cloud', 'cloud']);
    U.queue.items = [item]; U.queue.listed = true; U.queue.project = '/p/Cloud film.prproj';
    assert.strictEqual(U.status().state, 'cloud-waiting');
    assert.strictEqual(await U.tick(), false, 'nothing is sent in the background');
    assert.strictEqual(sent.length, 0);
    const r = await U.runAll(job, {});
    assert.ok(r.done === 1 && sent.length === 2 && sent[1].user[1].media.kind === 'audio', 'Run now: stills, then the sound');
    assert.ok(U.peek(item.path).sounds.some(s => s.type === 'applause'));
    US.ai.setProjectOffline(true);
    assert.strictEqual(U.route(), 'local', 'a project set to “nothing leaves this computer” is back on this computer');
    US.ai.setProjectOffline(false);
    U.setRoute('off');
    assert.deepStrictEqual([U.route(), US.ai.mediaOn(), U.status().state], ['off', false, 'off']);
  } finally { US.ai.media = keepMedia; R.restore(); U.setRoute('local'); US.secrets.set('geminiKey', ''); US.ctx = CTX0; }
});

test('honest estimates for a project: stills and minutes counted, this computer measured or said to be assumed, cloud as a dated range', () => {
  const clips = Array.from({ length: 30 }, () => ({ duration: 120 }));   // an hour of footage
  const model = M.BUILTIN.models.find(m => m.id === 'gemma-4-e2b');
  const e = U.estimate(clips, { bench: {}, visionModel: model, cloud: { provider: 'gemini', model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }, prices: US.ai.MEDIA_PRICES });
  assert.deepStrictEqual([e.minutes, e.clips, e.stills], [60, 30, 360]);
  assert.deepStrictEqual([e.local.visionMeasured, e.local.listenMeasured, e.local.visionSecs, e.local.usd], [false, false, [360 * 3, 360 * 15], 0]);
  const m = U.estimate(clips, { bench: { listenX: 100, vision: { 'gemma-4-e2b': 2 } }, visionModel: model });
  assert.deepStrictEqual([m.local.visionMeasured, m.local.visionSecs, m.local.listenSecs, m.cloud], [true, [720, 720], 36, null]);
  // an hour at Flash-Lite: stills + sound in, a few thousand words out – cents, and a range because the token rates differ
  assert.ok(e.cloud.usd[0] > 0.04 && e.cloud.usd[1] < 0.2 && e.cloud.usd[1] > e.cloud.usd[0] && e.cloud.date === US.ai.MEDIA_PRICES.date && e.cloud.hears, JSON.stringify(e.cloud));
  const c = U.estimate(clips, { cloud: { provider: 'claude', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }, prices: US.ai.MEDIA_PRICES });
  assert.ok(c.cloud.hears === false && c.cloud.usd[1] < 0.05);
  const t = US.understandUI.estimateText({ footage: { clips: 30, minutes: 60 }, e, vm: model });
  assert.ok(/30 clips, 1:00:00|30 clips, 60:00|30 clips, 1 h/.test(t.footage) && /an estimate/.test(t.local) && /Cost: nothing/.test(t.local) && /prices read on 19 Nov 2026/.test(t.cloud) && /free allowance/.test(t.cloud), JSON.stringify(t));
  assert.ok(US.settingsSections.list ? US.settingsSections.list().some(s => s.id === 'understand' && s.title === 'Vision & listening models') : true, 'registered as a Settings section');
});

test('Selects reads the understanding: what’s in a select, a shot size for shots without faces, sounds and sound problems, and a search', () => {
  const rec = { path: '/f/C1.mp4', name: 'C1.mp4', duration: 40, sound: { label: 'clean' },
    shots: [{ start: 0, end: 20, text: 'A wide view of a market at dusk.', shot: 'wide', setting: 'a market', people: '', tags: ['market', 'dusk'] }, { start: 20, end: 40, text: 'Hands weigh oranges.', shot: 'detail', setting: '', people: 'hands', tags: ['oranges', 'hands'] }],
    events: [], sounds: [{ type: 'wind', start: 2, end: 9, text: '', conf: 0.6, by: 'built-in' }, { type: 'laughter', start: 25, end: 28, text: 'two people laugh', conf: 0.7, by: 'm' }] };
  const a = { clipId: 'c1', path: rec.path, start: 1, end: 10, shot: 'unknown' }, b = { clipId: 'c1', path: rec.path, start: 22, end: 30, shot: 'unknown' }, c = { clipId: 'c1', path: rec.path, start: 22, end: 30, shot: 'mid' };
  const ka = US.selects.known(a, rec), kb = US.selects.known(b, rec);
  assert.deepStrictEqual([ka.shot, ka.shotName, ka.bad, ka.sounds], ['wide', 'wide', ['wind'], ['wind']]);
  assert.ok(/market at dusk/.test(ka.text) && /wind noise/.test(ka.text));
  assert.deepStrictEqual([kb.shot, kb.sounds, kb.bad, kb.quality], ['close', ['laughter'], [], 'clean']);
  assert.strictEqual(US.selects.sizeOf(a, ka), 'wide', 'no face: the vision model’s shot size');
  assert.strictEqual(US.selects.sizeOf(c, kb), 'mid', 'a face measured: that stays');
  assert.deepStrictEqual(US.selects.searchSelects([a, b], 'the market', [rec]), [a]);
  assert.deepStrictEqual(US.selects.searchSelects([a, b], 'people laughing', [rec]), [b]);
  assert.deepStrictEqual(US.selects.searchSelects([a, b], '', [rec]), [a, b]);
  assert.deepStrictEqual(US.selects.searchSelects([a, b], 'helicopter', [rec]), []);
});

test('Settings › Vision & listening models in jsdom: both routes with pros, cons and this project’s estimate; sizes on the Download buttons; Cloud asks first', () => {
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'understand-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let o; try { o = JSON.parse(last); } catch (e) { throw new Error('understand-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(o.errors, []);
  assert.deepStrictEqual([o.title, o.section, o.routes], ['Vision & listening models', 'understand', ['On this computer', 'Cloud', 'Off']]);
  assert.ok(o.inSettings && /Vision & listening models/.test(o.inSettings.title) && o.inSettings.closed, 'in Settings as a closed dropdown: ' + JSON.stringify(o.inSettings));
  assert.deepStrictEqual([o.inSettings.ownCards, o.inSettings.cardTitles], [0, []], 'no cards inside Settings’ card (they would break Settings’ order)');
  assert.ok(o.prosCons.pros >= 6 && o.prosCons.cons >= 6, 'pros and cons for both');
  assert.deepStrictEqual(o.estimate, { footage: true, local: true, cloud: true, assumed: true }, 'the estimate is for this project, and says what is assumed');
  assert.ok(o.downloads.length === 4 && o.downloads.every(t => /\d (MB|GB)/.test(t)) && o.deleteButtons === 0, 'nothing downloaded; each size is on its button: ' + o.downloads);
  assert.ok(o.kept && o.autoUpdate && o.status && o.statusText);
  assert.ok(o.confirm && /see and hear/.test(o.confirm.title) && o.confirm.says && /Keep it on this computer/.test(o.confirm.buttons[0]) && /Yes – up to about/.test(o.confirm.buttons[1]), JSON.stringify(o.confirm));
  assert.deepStrictEqual(o.afterNo, { route: 'local', mediaOn: false }, 'cloud stays off on “no”');
});

test('Ask’s calls: where() for the footage warning, describe({item, from, to, question, job}) watches now, US.listen needs a model', async () => {
  project('Ask film');
  const T = tinyCatalogue(), asked = [];
  const R = fakeRoutes({ vision: (req) => { asked.push(req); return req.schema && req.schema.required[0] === 'answer' ? { answer: 'She looks away before answering.' } : { shots: [{ from: 0, to: 20, description: 'A woman sits by a window.', shot: 'interview', setting: 'a kitchen', people: 'one woman', tags: ['window'] }], events: [] }; } });
  const item = { id: 'x1', path: tmp('R001.mp4'), name: 'R001.mp4', duration: 20 };
  try {
    assert.deepStrictEqual(U.where(), { where: 'local', label: 'Tiny' });
    const r = await U.describe({ item, itemId: 'x1', from: 3, to: 9, question: 'What does she do?', job });
    assert.ok(/^She looks away before answering\. Also noted: A woman sits by a window\./.test(r.text) && r.usd === 0 && r.where === 'local', JSON.stringify(r));
    const q = asked.find(x => x.schema.required[0] === 'answer');
    assert.ok(q.user.filter(b => b.image).length === 2 && /What does she do\?/.test(q.user[q.user.length - 1]), 'stills of that moment, and the question');
    assert.ok(U.peek(item.path).vision.done && U.peek(item.path).listening.done, 'the clip’s record was made on the way');
    // the old way still answers from what's kept, without doing anything
    assert.ok(/window/.test((await U.describe({ path: item.path, start: 0, end: 5 })).text));
    // dictation: the listening model on this computer; without one, a plain message
    US.settings.set('understand.listenModel', 'builtin');
    assert.strictEqual(typeof US.listen.transcribe, 'function');
    M.remove('tiny');
    await assert.rejects(() => US.listen.transcribe({ samples: new Float32Array(16000), sampleRate: 16000 }), e => /needs a listening model/.test(e.title) && /Vision & listening models/.test(e.action));
    U.setRoute('off');
    assert.deepStrictEqual(U.where().where, 'off');
  } finally { R.restore(); T.undo(); U.setRoute('local'); US.ctx = CTX0; }
});

test('a clip with no sound track is listened to once and noted as such – not left waiting for a render (seen in Premiere, 19 Nov); pause() and forget() for the e2e test', async () => {
  project('Silent film');
  const keep = U.routes.sound, item = { id: 'n1', path: tmp('VID-0000.mp4'), name: 'VID-0000.mp4', duration: 5 };
  U.routes.sound = async () => { const e = new Error('can’t read VID-0000.mp4 (ffmpeg: ffmpeg gave no sound: Stream map \'\' matches no streams.)'); e.code = 'NOT_FROM_FILES'; throw e; };
  try {
    const r = await U.analyse(item, { only: ['listening'] });
    const rec = U.peek(item.path);
    assert.deepStrictEqual([r.did.listening, r.skipped, rec.listening.done, rec.listening.noTrack, rec.sound.label], [true, '', true, true, 'no sound track']);
    assert.deepStrictEqual(U.needs(rec).listening, false, 'nothing left to do');
    // forget() takes everything kept about a clip away, unforget() puts it back
    const saved = U.forget(item.path);
    assert.strictEqual(U.peek(item.path), null);
    U.unforget(saved); U.reset();
    assert.strictEqual(U.peek(item.path).sound.label, 'no sound track');
    assert.ok(U.kept().some(k => k.name === 'VID-0000.mp4' && /built-in/.test(k.heard)));
    // pause(): the background does nothing until released
    const release = await U.pause();
    U.queue.items = [item]; U.queue.listed = true; U.queue.project = '/p/Silent film.prproj';
    assert.strictEqual(await U.tick(), false);
    release();
  } finally { U.routes.sound = keep; US.ctx = CTX0; }
});

test('a model that thinks first (Gemma 4): thinking is switched off for the helper; thoughts are never taken for the answer; one more try with more room; “ran out of room” said plainly', async () => {
  const seen = [];
  let mode = 'think-then-answer';
  const s = await new Promise(res => { const x = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
    const body = JSON.parse(b); seen.push(body); rs.setHeader('content-type', 'application/json');
    // the first try: all thoughts, no answer, cut off – as Gemma 4 E2B did in Premiere
    const thinking = { choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'The stills show… {"shots":[{"from":0,"to":9,"description":"WRONG – from the thoughts"}]}' } }], usage: { completion_tokens: body.max_tokens } };
    const answer = { choices: [{ finish_reason: 'stop', message: { content: '{"shots":[],"events":[]}', reasoning_content: '' } }] };
    rs.end(JSON.stringify(mode === 'always-thinks' || seen.length === 1 ? thinking : answer));
  }); }); x.listen(0, '127.0.0.1', () => res(x)); });
  const url = `http://127.0.0.1:${s.address().port}`;
  try {
    const r = await US.ai.localAt({ url, model: 'gemma-4-e2b', system: 's', user: ['Still:', { image: { data: 'QUJD', w: 8, h: 8 } }], schema: { type: 'object' }, maxTokens: 1000, feature: 'Seeing footage' });
    assert.deepStrictEqual(r, { shots: [], events: [] }, 'the answer, never the thoughts');
    assert.strictEqual(seen.length, 2, 'asked once more');
    assert.ok(seen.every(b => b.reasoning_effort === 'none' && b.chat_template_kwargs.enable_thinking === false), 'thinking is switched off in every request to the helper');
    assert.deepStrictEqual(seen.map(b => b.max_tokens), [1000, 3000], 'with three times the room the second time');
    // it still only thinks: said plainly, with what happened in the details – and not asked a third time
    mode = 'always-thinks'; seen.length = 0;
    await assert.rejects(() => US.ai.localAt({ url, model: 'gemma-4-e2b', system: 's', user: 'x', maxTokens: 500 }), e => /ran out of room before answering/.test(e.title) && /thinking/.test(e.action) && /reasoning_content/.test(e.detail));
    assert.strictEqual(seen.length, 2);
    // the helper itself is started with thinking off, and vision requests have room to answer
    const T = tinyCatalogue(), spawned = [];
    try {
      const spawn = (exe, args) => { const p = new EventEmitter(); p.pid = 0; p.stderr = new EventEmitter(); const srv = http.createServer((q, rs) => { rs.writeHead(200); rs.end('{}'); }); srv.listen(+args[args.indexOf('--port') + 1], '127.0.0.1'); p.kill = () => { srv.close(); p.emit('exit'); }; spawned.push(args); return p; };
      await M.start('tiny', { spawn });
      const a = spawned[0];
      assert.deepStrictEqual([a[a.indexOf('--reasoning') + 1], a[a.indexOf('--reasoning-budget') + 1]], ['off', '0']);
    } finally { T.undo(); }
    assert.ok(P.visionRequest({ name: 'c', duration: 30 }, [STILL(1), STILL(2), STILL(3), STILL(4)]).maxTokens >= 1500);
  } finally { s.close(); }
});

// a stand-in Ollama: both of its lists name the same models (one with “:latest”, one in capitals), and it says what each can take
function fakeOllama(models) {
  return new Promise(res => { const x = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
    rs.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return rs.end(JSON.stringify({ models: Object.keys(models).map(name => ({ name })) }));
    if (req.url === '/v1/models') return rs.end(JSON.stringify({ data: Object.keys(models).map(id => ({ id })) }));
    if (req.url === '/api/show') { const m = models[JSON.parse(b).model]; return m ? rs.end(JSON.stringify({ capabilities: m })) : (rs.writeHead(404), rs.end('{}')); }
    rs.writeHead(404); rs.end('{}');
  }); }); x.listen(0, '127.0.0.1', () => res(x)); });
}

test('models on this computer: with Qwen 3.5 in Ollama and Gemma 4 E2B from Ultra Studio, every model is listed once – in the list and in each job’s picker', async () => {
  const T = tinyCatalogue('gemma-4-e2b', 'Gemma 4 E2B');
  const s = await fakeOllama({ 'qwen3.5:4b': ['completion', 'vision'], 'llama3.2:latest': ['completion'] });
  const keepUrl = US.settings.get('ai.localUrl'), keepText = US.settings.get('ai.localModel'), keepLook = US.settings.get('footage.localModel'), keepWith = US.settings.get('footage.with');
  US.settings.set('ai.localUrl', `http://127.0.0.1:${s.address().port}`);
  try {
    // the editor had chosen Qwen for both jobs before – written a little differently each time
    US.settings.set('ai.localModel', 'Qwen3.5:4b'); US.settings.set('footage.localModel', 'qwen3.5:4b'); US.settings.set('understand.visionModel', 'own');
    assert.strictEqual(M.sameId('Llama3.2:latest'), M.sameId('llama3.2'), 'the same model under two spellings is one model');
    const inv = await M.inventory();
    assert.deepStrictEqual(inv.server, { running: true, app: 'Ollama' });
    assert.deepStrictEqual(inv.models.map(m => [m.name, m.from, m.can.text, m.can.look, m.can.listen]),
      [['Gemma 4 E2B', 'Ultra Studio', false, true, true], ['Qwen 3.5 (4B)', 'Ollama', true, true, false], ['llama3.2:latest', 'Ollama', true, false, false]], 'three models, each once, with what each can do');
    // the lists doubled (both of the app's lists, different case, the chosen one again): still once each
    const doubled = M.inventoryFrom({ status: { ok: true, kind: 'ollama' }, names: ['qwen3.5:4b', 'QWEN3.5:4B', 'llama3.2:latest', 'llama3.2'], caps: {}, chosen: M.jobs() });
    assert.deepStrictEqual(doubled.models.map(m => m.name), ['Gemma 4 E2B', 'Qwen 3.5 (4B)', 'llama3.2:latest']);
    const P = M.pickers(inv);
    const count = (job, re) => P[job].options.filter(o => re.test(o.label)).length;
    for (const job of ['text', 'look']) { assert.strictEqual(count(job, /Qwen/i), 1, job + ': Qwen once'); assert.strictEqual(count(job, /Gemma/), 1, job + ': Gemma once'); assert.strictEqual(count(job, /llama3/), 1, job + ': llama once'); }
    assert.deepStrictEqual(P.text.options.map(o => [o.label, !!o.disabled]), [['None chosen', false], ['Qwen 3.5 (4B) – from Ollama', false], ['llama3.2:latest – from Ollama', false], ['Gemma 4 E2B – from Ultra Studio (looks and listens only)', true]]);
    assert.deepStrictEqual(P.look.options.map(o => [o.label, !!o.disabled]), [['None chosen', false], ['Gemma 4 E2B – from Ultra Studio', false], ['Qwen 3.5 (4B) – from Ollama', false], ['llama3.2:latest – from Ollama (text only – can’t look)', true]]);
    assert.deepStrictEqual(P.listen.options.map(o => o.label), ['Built-in listening – part of Ultra Studio, no model', 'Built-in + Gemma 4 E2B – from Ultra Studio (experimental)']);
    assert.deepStrictEqual([P.text.value, P.look.value, P.listen.value], ['qwen3.5:4b', 'own:qwen3.5:4b', 'builtin'], 'what is chosen now is shown as chosen, however the setting spelt it');
    // one setting per job: the picker's choice is what every tool uses – the looking plan and the older stills describer alike
    assert.deepStrictEqual([U.plan().vision.kind, U.plan().vision.own], ['own', 'qwen3.5:4b']);
    US.settings.set('footage.with', 'local');
    assert.deepStrictEqual([US.footage.looker().where, US.footage.looker().label, US.footage.looker().helper], ['local', 'qwen3.5:4b (on this computer)', undefined]);
    M.setJob('look', 'us:gemma-4-e2b');
    assert.deepStrictEqual([U.plan().vision.kind, U.plan().vision.label, US.footage.looker().helper, US.footage.looker().label], ['helper', 'Gemma 4 E2B', 'gemma-4-e2b', 'Gemma 4 E2B (on this computer)'], 'Ultra Studio’s own model looks for both – no Ollama needed');
    assert.strictEqual(M.pickers(await M.inventory()).look.value, 'us:gemma-4-e2b');
    M.setJob('text', 'llama3.2:latest'); assert.strictEqual(US.settings.get('ai.localModel'), 'llama3.2:latest');
    M.setJob('listen', 'gemma-4-e2b'); assert.strictEqual(M.jobs().listen, 'gemma-4-e2b');
    M.setJob('look', ''); assert.deepStrictEqual([M.jobs().look, U.plan().vision.kind], ['', 'none']);
    // the app not running: the model chosen for a job is still listed, once, and said to be missing just now
    const gone = M.inventoryFrom({ status: { ok: false, kind: '' }, names: [], chosen: { text: 'llama3.2:latest', look: 'own:llama3.2' } });
    assert.deepStrictEqual(gone.models.filter(m => m.from !== 'Ultra Studio').map(m => [m.name, m.here, m.from]), [['llama3.2:latest', false, 'Ollama or LM Studio']]);
    assert.ok(/not found just now/.test(M.pickers(gone).text.options[1].label));
  } finally { s.close(); T.undo(); US.settings.set('ai.localUrl', keepUrl); US.settings.set('ai.localModel', keepText || ''); US.settings.set('footage.localModel', keepLook || ''); US.settings.set('footage.with', keepWith); US.settings.set('understand.listenModel', 'builtin'); }
});

test('the older stills describer looks with Ultra Studio’s own model through the helper when that is the one chosen (no Ollama)', async () => {
  const T = tinyCatalogue('gemma-4-e2b', 'Gemma 4 E2B'), asked = [];
  const keepWith = US.settings.get('footage.with'), keepStart = M.start, keepAt = US.ai.localAt, keepGrab = US.footage.grab;
  US.settings.set('footage.with', 'local'); US.settings.set('footage.localModel', '');
  M.start = async id => { asked.push(['start', id]); return 'http://127.0.0.1:1'; };
  US.ai.localAt = async req => { asked.push(['ask', req.url, req.model, req.user.filter(b => b.image).length]); return { description: 'A river at dusk.', shot: 'wide', setting: 'a river', people: 'no one', action: '', text: '', tags: ['river'] }; };
  US.footage.grab = async (it, times) => ({ stills: times.map(STILL), how: 'panel' });
  const item = { id: 'f1', kind: 'video', path: tmp('DJI_9.mp4'), name: 'DJI_9.mp4', duration: 6 };
  try {
    const r = await US.footage.describe(job, [item], { ask: false });
    assert.ok(r.described === 1 && /described by Gemma 4 E2B \(on this computer\)/.test(r.summary), r.summary);
    assert.deepStrictEqual(asked, [['start', 'gemma-4-e2b'], ['ask', 'http://127.0.0.1:1', 'gemma-4-e2b', 1]]);
  } finally { M.start = keepStart; US.ai.localAt = keepAt; US.footage.grab = keepGrab; US.settings.set('footage.with', keepWith); T.undo(); }
});

test('Settings in jsdom with Qwen 3.5 in Ollama and Ultra Studio’s Gemma 4 E2B: each model once per picker and once in the one list; Footage keeps only the permission; the AI card shares the reading-and-writing picker', () => {
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'models-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let o; try { o = JSON.parse(last); } catch (e) { throw new Error('models-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(o.errors, []);
  // every picker that names a model names it once
  assert.deepStrictEqual(o.selects.map(s => [s.section, s.job, s.qwen, s.gemma, s.llama]), [['ai', '', 1, 1, 1], ['understand', 'text', 1, 1, 1], ['understand', 'look', 1, 1, 1], ['understand', 'listen', 0, 1, 0], ['delivery', '', 0, 1, 0]]);   // the last: Story › Listen to delivery chooses its own listening model, per project
  assert.ok(o.selects.slice(0, 3).every(s => s.chosen === 'Qwen 3.5 (4B) – from Ollama'), 'the model in use is shown as chosen, with where it comes from');
  // one list, in one section: each model a single row (in 1.3.40 Qwen had a row and a dropdown entry in Footage, and another in Vision & listening models)
  assert.deepStrictEqual(o.rows.map(x => x.section), ['understand', 'understand', 'understand', 'understand']);
  assert.deepStrictEqual(o.rows.map(x => x.title), ['Gemma 4 E2Bfrom Ultra Studio', 'Qwen 3.5 (4B)from Ollamain use for reading and writing and looking', 'llama3.2:latestfrom Ollama', 'SmolVLM2 500M']);
  assert.deepStrictEqual(o.jobs, ['Reading and writing', 'Looking at footage', 'Listening']);
  assert.deepStrictEqual(o.explains, { why: true, ways: true, two: true, app: true }, 'the three questions are answered on screen');
  assert.deepStrictEqual(o.buttons, { here: ['Delete', 'Remove', 'Remove'], more: ['Download (437 MB)'] }, 'nothing is lost: Ultra Studio’s can be deleted, Ollama’s removed, the rest downloaded');
  assert.deepStrictEqual(o.footage, { link: true, downloads: 0, permission: true, who: true });
  assert.deepStrictEqual(o.aiCard, { label: true, points: true, offline: true, address: true, find: true });
  assert.deepStrictEqual(o.oneSetting, { setting: 'llama3.2:latest', sectionShows: 'llama3.2:latest – from Ollama' }, 'chosen in the AI card, shown in the section: one setting');
});
