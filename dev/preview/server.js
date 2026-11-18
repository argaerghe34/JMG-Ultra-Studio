// JMG Ultra Studio – live preview in a browser (development only, never shipped: the builds leave out dev/).
//
//   node dev/preview/server.js [--root <checkout>] [--port 8790]
//
// Serves the panel's real index.html, css/ and js/ from a checkout (default: the main checkout, so it shows the latest
// main), with dev/preview/shim.js put in front of the panel's scripts. The shim stands in for what CEP / Electron give
// the panel (Node's require, __adobe_cep__, Resolve's IPC). The editor is the real resolve/host commands running here
// against the stand-in Resolve from the unit tests (dev/tests/resolve-fake.js) with a sample project – the same
// commands and results as Premiere's jsx, so the panel looks the same either way.
//
// Safe by design: the panel's files are read from the checkout, but every write goes to a temp folder (the sandbox),
// which is also the panel's home folder – the real settings in ~/Library/Application Support/JMG Ultra Studio are
// never read or written. Nothing goes online (the shim's http/https/fetch refuse), there are no AI keys, and nothing
// is downloaded, installed or run (child_process refuses).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const MAIN = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio';
const HERE = __dirname;
const OWN_ROOT = path.join(HERE, '..', '..');
const ROOT = path.resolve(arg('root', process.env.US_PREVIEW_ROOT || (fs.existsSync(path.join(MAIN, 'index.html')) ? MAIN : OWN_ROOT)));
const PORT = Number(arg('port', process.env.PORT || 8790));

/* ---------- the sandbox: the panel's home folder and everything it writes ---------- */
fs.mkdirSync(path.join(os.tmpdir(), 'jmg-ultra-studio-preview'), { recursive: true });
const SANDBOX = fs.realpathSync(path.join(os.tmpdir(), 'jmg-ultra-studio-preview'));
const HOME = path.join(SANDBOX, 'home'), TMP = path.join(SANDBOX, 'tmp'), MEDIA = path.join(SANDBOX, 'media');
function makeSandbox() {
  for (const d of [HOME, TMP, MEDIA, path.join(HOME, 'Documents'), path.join(HOME, 'Library', 'Application Support')]) fs.mkdirSync(d, { recursive: true });
  // the test media, linked file by file: the editor's commands may write next to a clip (a "JMG Ultra Studio" folder),
  // and those writes land in the sandbox rather than in the checkout
  const src = path.join(ROOT, 'dev', 'test-media');
  for (const sub of ['interview', 'concert', 'selects', 'audio']) {
    const from = path.join(src, sub), to = path.join(MEDIA, sub);
    fs.mkdirSync(to, { recursive: true });
    let names = []; try { names = fs.readdirSync(from); } catch (e) { /* not in this checkout */ }
    for (const n of names) {
      const f = path.join(from, n), l = path.join(to, n);
      try { if (fs.statSync(f).isFile() && !fs.existsSync(l)) fs.symlinkSync(f, l); } catch (e) { /* skip */ }
    }
  }
}
makeSandbox();
// the editor's commands run in this process: give them the same home folder as the panel
process.env.HOME = HOME; process.env.TMPDIR = TMP;

/* ---------- the fake editor: resolve/host against the stand-in Resolve, with a sample project ---------- */
let editor = null;
function freshRequire(file) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'resolve')) || k.startsWith(path.join(ROOT, 'dev', 'tests')) || k.startsWith(path.join(OWN_ROOT, 'resolve')) || k.startsWith(path.join(OWN_ROOT, 'dev', 'tests'))) delete require.cache[k];
  return require(file);
}
function pick(rel) { const a = path.join(ROOT, rel); return fs.existsSync(a) ? a : path.join(OWN_ROOT, rel); }
function buildEditor() {
  const Fake = freshRequire(pick('dev/tests/resolve-fake.js'));
  const HOST = freshRequire(pick('resolve/host/index.js'));
  const F = Fake.make({ projectName: 'JMG Ultra Studio Test', fps: 25 });
  const m = (sub, name) => path.join(MEDIA, sub, name);
  const add = (file, info) => F.addMedia(file, info);
  // Interviews: the clip that matches I001_interview.srt, and two whose transcripts are files (no clip on disk)
  const i1 = add(m('interview', 'I001_interview.mp4'), { frames: 25 * 90, bin: 'Interviews' });
  const i2 = add(m('interview', 'Interview_David_Cohen.mp4'), { frames: 25 * 600, bin: 'Interviews' });
  const i3 = add(m('interview', 'Interview_Miriam_Levy.mp4'), { frames: 25 * 480, bin: 'Interviews' });
  const concert = ['C001_sharp_static', 'C002_blurry', 'C003_dark', 'C004_overexposed', 'C005_shaky', 'C007_reveal_pullback', 'C009_slow_pan_good', 'C010_mixed', 'C011_concert_long']
    .map((n, k) => add(m('concert', n + '.mp4'), { frames: n === 'C011_concert_long' ? 25 * 120 : 25 * 10, bin: 'Concert' }));
  const selects = ['S01_strobe', 'S04_walkthrough', 'S06_face_interview', 'S07_face_walkthrough', 'S09_push_in', 'S10_tilt_up']
    .map(n => add(m('selects', n + '.mp4'), { frames: 25 * 8, bin: 'B-roll/Selects' }));
  const music = ['music_120bpm', 'music_92bpm', 'concert_set'].map(n => add(m('audio', n + '.wav'), { type: 'Audio', audioCh: 2, frames: 25 * 60, bin: 'Music' }));
  add(m('selects', 'Logo.png'), { type: 'Still', audioCh: 0, frames: 1, bin: 'Graphics' });
  // timelines: a main cut (interview with b-roll and music), a concert highlights cut, an empty one
  const cut = F.addTimeline('Main Cut', [
    { item: i1, in: 0, out: 25 * 40 }, { item: i2, in: 25 * 60, out: 25 * 100 }, { item: i3, in: 25 * 30, out: 25 * 70 },
    { item: selects[1], in: 0, out: 25 * 6, track: 2, at: 25 * 10 }, { item: selects[4], in: 0, out: 25 * 5, track: 2, at: 25 * 50 },
    { item: music[1], in: 0, out: 25 * 60, mediaType: 2, at: 0 }
  ]);
  F.addTimeline('Concert Highlights', concert.slice(0, 6).map(c => ({ item: c, in: 25, out: 25 * 6 })));
  F.addTimeline('Social – vertical', []);
  // markers on the main cut and on a clip (frames counted from the timeline's or clip's start, as in Resolve)
  const mk = (o, sec, color, name, note) => { try { o.AddMarker(Math.round(sec * 25), color, name, note || '', 1, ''); } catch (e) { /* the fake's checks */ } };
  mk(cut, 4, 'Blue', 'Opening line', 'Ruth introduces herself');
  mk(cut, 22, 'Green', 'Great moment', 'Keep for the trailer');
  mk(cut, 48, 'Red', 'Fix audio', 'Pop at the cut');
  mk(cut, 75, 'Yellow', 'Title here', '');
  mk(i1, 12, 'Purple', 'Laugh', '');
  try { F.project.SetCurrentTimeline(cut); } catch (e) { /* the last made is current */ }
  F.selected = [i1, i2];
  // a render is a real file of the format asked for (the panel reads the sound of what it renders): the test media
  // (a sound render is Resolve's "Audio Only" preset – PCM in a .mov, resolve/host/render.js – and a WAV is accepted in
  // its place; the stand-in doesn't keep the preset with the job, so it's remembered here)
  let preset = '';
  const audioJobs = new Set();
  const load = F.project.LoadRenderPreset, addJob = F.project.AddRenderJob, setFmt = F.project.SetCurrentRenderFormatAndCodec;
  F.project.LoadRenderPreset = n => { preset = String(n); return load(n); };
  F.project.SetCurrentRenderFormatAndCodec = (f, c) => { preset = ''; return setFmt(f, c); };
  F.project.AddRenderJob = () => { const id = addJob(); if (/audio/i.test(preset)) audioJobs.add(id); return id; };
  F.renderContent = j => {
    const ext = String((j.format && j.format.format) || '').toLowerCase();
    const f = audioJobs.has(j.JobId) || ext === 'wav' || ext === 'mov' ? path.join(ROOT, 'dev', 'test-media', 'audio', 'music_92bpm.wav') : path.join(ROOT, 'dev', 'test-media', 'interview', 'I001_interview.mp4');
    try { return fs.readFileSync(f); } catch (e) { return 'fake render'; }
  };
  const host = HOST.connect({ api: F.resolve });
  return { F, host };
}
function editorRun(fn, args) {
  if (!editor) editor = buildEditor();
  return editor.host.run(fn, args);
}

/* ---------- the panel's file access, policed: reads from the checkout or the sandbox, writes only in the sandbox ---------- */
const within = (p, dir) => p === dir || p.startsWith(dir + path.sep);
const canRead = p => within(p, ROOT) || within(p, SANDBOX) || within(p, OWN_ROOT);
function canWrite(p) {
  if (!within(p, SANDBOX)) return false;
  try { if (fs.lstatSync(p).isSymbolicLink()) return false; } catch (e) { /* new file */ }   // never write through a link to the checkout
  return true;
}
const err = (code, msg) => Object.assign(new Error(code + ': ' + msg), { code });
function R(p, op) { p = path.resolve(String(p)); if (!canRead(p)) throw err('ENOENT', `no such file or directory (outside the preview), ${op} '${p}'`); return p; }
function W(p, op) { p = path.resolve(String(p)); if (!canWrite(p)) throw err('EACCES', `permission denied (the preview only writes in its temp folder), ${op} '${p}'`); return p; }
const statOut = s => ({ size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, birthtimeMs: s.birthtimeMs, atimeMs: s.atimeMs, mode: s.mode, isFile: s.isFile(), isDirectory: s.isDirectory(), isSymbolicLink: s.isSymbolicLink() });
const dataIn = d => (d && d.b64 != null ? Buffer.from(d.b64, 'base64') : String(d == null ? '' : d.text != null ? d.text : d));
const FS = {
  exists: ([p]) => { try { return fs.existsSync(R(p, 'exists')); } catch (e) { return false; } },
  access: ([p]) => { fs.accessSync(R(p, 'access')); return true; },
  stat: ([p]) => statOut(fs.statSync(R(p, 'stat'))),
  lstat: ([p]) => statOut(fs.lstatSync(R(p, 'lstat'))),
  realpath: ([p]) => { const r = fs.realpathSync(R(p, 'realpath')); return canRead(r) ? r : path.resolve(p); },
  readdir: ([p, types]) => { const d = R(p, 'scandir'); return types ? fs.readdirSync(d, { withFileTypes: true }).map(e => ({ name: e.name, file: e.isFile() || (e.isSymbolicLink() && (() => { try { return fs.statSync(path.join(d, e.name)).isFile(); } catch (x) { return false; } })()), dir: e.isDirectory(), link: e.isSymbolicLink() })) : fs.readdirSync(d); },
  readFile: ([p]) => ({ b64: fs.readFileSync(R(p, 'open')).toString('base64') }),
  read: ([p, pos, len]) => { const fd = fs.openSync(R(p, 'open'), 'r'); try { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return { b64: b.subarray(0, n).toString('base64') }; } finally { fs.closeSync(fd); } },
  writeFile: ([p, d]) => { fs.writeFileSync(W(p, 'open'), dataIn(d)); return true; },
  appendFile: ([p, d]) => { fs.appendFileSync(W(p, 'open'), dataIn(d)); return true; },
  mkdir: ([p, opts]) => { const d = path.resolve(String(p)); if (opts && opts.recursive && fs.existsSync(d) && canRead(d)) return undefined; return fs.mkdirSync(W(d, 'mkdir'), opts || {}); },
  mkdtemp: ([prefix]) => fs.mkdtempSync(W(String(prefix), 'mkdtemp')),
  rename: ([a, b]) => { fs.renameSync(W(a, 'rename'), W(b, 'rename')); return true; },
  unlink: ([p]) => { fs.unlinkSync(W(p, 'unlink')); return true; },
  rm: ([p, opts]) => { const t = path.resolve(String(p)); if (!within(t, SANDBOX)) { if (opts && opts.force && !fs.existsSync(t)) return true; W(t, 'rm'); } fs.rmSync(t, opts || {}); return true; },
  rmdir: ([p, opts]) => { fs.rmSync(W(p, 'rmdir'), Object.assign({ recursive: false }, opts || {})); return true; },
  copyFile: ([a, b]) => { fs.copyFileSync(R(a, 'copyfile'), W(b, 'copyfile')); return true; },
  cp: ([a, b, opts]) => { fs.cpSync(R(a, 'cp'), W(b, 'cp'), Object.assign({}, opts || {}, { dereference: true })); return true; },
  utimes: ([p, a, m]) => { fs.utimesSync(W(p, 'utime'), a, m); return true; },
  chmod: ([p]) => { W(p, 'chmod'); return true; },
  hash: ([alg, parts, enc]) => { const h = crypto.createHash(alg); for (const x of parts) h.update(dataIn(x)); return h.digest(enc || 'hex'); },
  batch: list => { for (const [op, a] of list) { try { if (op !== 'batch' && FS[op]) FS[op](a || []); } catch (e) { console.warn('preview: a save on closing failed:', e.message); } } return true; },
  hmac: ([alg, key, parts, enc]) => { const h = crypto.createHmac(alg, dataIn(key)); for (const x of parts) h.update(dataIn(x)); return h.digest(enc || 'hex'); }
};

/* ---------- live reload: the panel's files (and the shim, and the editor's commands) ---------- */
const clients = new Set();
let reloadTimer = null, lastChange = '';
function changed(what) {
  lastChange = what;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (/^resolve[\\/]host|resolve-fake/.test(what)) editor = null;   // the editor's commands changed: start it again
    for (const res of clients) res.write(`event: reload\ndata: ${JSON.stringify({ file: what, at: Date.now() })}\n\n`);
    console.log('changed:', what, '→ reload', clients.size, 'page(s)');
  }, 150);
}
function watch(dir, label, recursive) {
  try { fs.watch(dir, { recursive }, (ev, f) => { if (f && !/(^|[\\/])(\.|_)|~$|\.swp$/.test(f)) changed(path.join(label, String(f))); }); }
  catch (e) { console.warn('can’t watch', dir, e.message); }
}
watch(path.join(ROOT, 'js'), 'js', true);
watch(path.join(ROOT, 'css'), 'css', true);
watch(path.join(ROOT, 'resolve', 'host'), 'resolve/host', true);
fs.watch(ROOT, (ev, f) => { if (f === 'index.html') changed('index.html'); });
fs.watch(HERE, (ev, f) => { if (f === 'shim.js' || f === 'frame.html') changed('dev/preview/' + f); });
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

/* ---------- serving ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const PANEL = encodeURI(ROOT.split(path.sep).join('/') + '/index.html');
function body(req) { return new Promise((resolve, reject) => { const b = []; req.on('data', c => b.push(c)); req.on('end', () => resolve(Buffer.concat(b).toString('utf8'))); req.on('error', reject); }); }
function send(res, code, type, data, extra) { res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {})); res.end(data); }
const json = (res, o) => send(res, 200, 'application/json', JSON.stringify(o));

function panelHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cfg = { root: ROOT, sandbox: SANDBOX, home: HOME, tmp: TMP, media: MEDIA, platform: process.platform };
  const inject = `<script>window.__PREVIEW__ = ${JSON.stringify(cfg)};</script>\n<script src="/__preview/shim.js"></script>\n`;
  const i = html.indexOf('<script');
  return i < 0 ? html + inject : html.slice(0, i) + inject + html.slice(i);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '/index.html') return send(res, 200, TYPES['.html'], fs.readFileSync(path.join(HERE, 'frame.html'), 'utf8').replace('__PANEL__', PANEL));
    if (p === '/__preview/info') return json(res, { root: ROOT, sandbox: SANDBOX, panel: PANEL, lastChange });
    if (p === '/__preview/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': hello\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/__preview/shim.js') return send(res, 200, TYPES['.js'], fs.readFileSync(path.join(HERE, 'shim.js')));
    if (p === '/__preview/fs' && req.method === 'POST') {
      const { op, args } = JSON.parse(await body(req));
      try { if (!FS[op]) throw err('ENOSYS', 'not in the preview: fs.' + op); return json(res, { ok: true, value: FS[op](args || []) }); }
      catch (e) { return json(res, { ok: false, code: e.code || 'EIO', message: e.message }); }
    }
    if (p === '/__preview/host' && req.method === 'POST') {
      const { fn, args } = JSON.parse(await body(req));
      if (fn === 'listFns') { if (!editor) editor = buildEditor(); return json(res, { ok: true, data: Object.keys(editor.host.fns).sort() }); }
      return json(res, await editorRun(fn, args));
    }
    if (p === '/__preview/reset' && req.method === 'POST') {
      editor = null;
      const wipe = u.searchParams.get('all') === '1';
      if (wipe) { for (const d of [HOME, TMP, MEDIA]) fs.rmSync(d, { recursive: true, force: true }); makeSandbox(); }
      return json(res, { ok: true, wiped: wipe });
    }
    // the panel's own files (and the test media, for the panel's audio player)
    const f = path.resolve(p);
    if (req.method === 'GET' && (within(f, ROOT) || within(f, SANDBOX))) {
      if (f === path.join(ROOT, 'index.html')) return send(res, 200, TYPES['.html'], panelHtml());
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, 'text/plain', 'Not found: ' + p);
      return send(res, 200, TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', fs.readFileSync(f));
    }
    send(res, 404, 'text/plain', 'Not found: ' + p);
  } catch (e) {
    send(res, 500, 'text/plain', String(e.stack || e));
  }
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`JMG Ultra Studio preview: http://localhost:${PORT}/`);
  console.log(`  panel from: ${ROOT}`);
  console.log(`  sandbox (home folder, every write): ${SANDBOX}`);
});
