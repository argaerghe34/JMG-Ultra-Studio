/* JMG Ultra Studio – the optional models that look at and listen to footage on this computer, and the small helper
   program that runs them (Settings › Vision & listening models).

   Nothing here is on the computer until the editor presses Download: the size is shown first, the file comes straight
   from where its makers publish it (Hugging Face, GitHub) over HTTPS, and it is only used once its SHA-256 checksum
   matches the one written here. A download can be stopped and carries on where it left off.

   The helper is llama.cpp's own server (MIT), started hidden on this computer only (127.0.0.1, a free port), at low
   priority, and stopped when it has had nothing to do for a few minutes. It speaks the same language as Ollama and
   LM Studio, so US.ai's “model on this computer” code talks to it; nothing it is given leaves the computer.

   Research, sources and what wasn't confirmed: dev/docs/research-understanding.md. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
  const HF = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;
  const GH = (tag, file) => `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${file}`;

  /* ---------- the catalogue (sizes and checksums as published on 19 Nov 2026) ---------- */
  const BUILTIN = {
    version: 1, date: '2026-11-19',
    // the helper: one archive per kind of computer; `exe` is where the program is inside it
    runtime: {
      id: 'llama-server', name: 'The helper that runs models (llama.cpp)', version: 'b12359', licence: 'MIT', source: 'https://github.com/ggml-org/llama.cpp',
      builds: {
        'darwin-arm64': { name: 'llama-b12359-bin-macos-arm64.tar.gz', url: GH('b12359', 'llama-b12359-bin-macos-arm64.tar.gz'), bytes: 16907811, sha256: '82b00abc740160e1b9980e6cc79c117345fa34af058c80e6c0a69aa8ddccde75', exe: 'llama-b12359/llama-server' },
        'darwin-x64': { name: 'llama-b12359-bin-macos-x64.tar.gz', url: GH('b12359', 'llama-b12359-bin-macos-x64.tar.gz'), bytes: 12661621, sha256: '25320d529077ef5a3d16e7b5da26438f221d88c8c0930a32b0c79457f5eede56', exe: 'llama-b12359/llama-server' },
        'win32-x64': { name: 'llama-b12359-bin-win-cpu-x64.zip', url: GH('b12359', 'llama-b12359-bin-win-cpu-x64.zip'), bytes: 25097509, sha256: '837c1655e87df3b66989f4be33a792a1399c785bf259038dc75c900096683e69', exe: 'llama-server.exe' }
      }
    },
    models: [
      { id: 'smolvlm2-500m', name: 'SmolVLM2 500M', use: ['vision'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', memory: 'about 1 GB', stillsPerAsk: 1, assume: [1, 6],
        what: 'The smallest. Quick, plain descriptions – for a computer with little memory, or to try it out.',
        files: [
          { role: 'model', name: 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf', url: HF('ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf'), bytes: 436808704, sha256: '6f67b8036b2469fcd71728702720c6b51aebd759b78137a8120733b4d66438bc' },
          { role: 'mmproj', name: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf', url: HF('ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf'), bytes: 108785184, sha256: '921dc7e259f308e5b027111fa185efcbf33db13f6e35749ddf7f5cdb60ef520b' }
        ] },
      { id: 'smolvlm2-2.2b', name: 'SmolVLM2 2.2B', use: ['vision'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/ggml-org/SmolVLM2-2.2B-Instruct-GGUF', memory: 'about 3 GB', stillsPerAsk: 1, assume: [2, 10],
        what: 'A light all-rounder: better descriptions than the smallest, still modest in size.',
        files: [
          { role: 'model', name: 'SmolVLM2-2.2B-Instruct-Q4_K_M.gguf', url: HF('ggml-org/SmolVLM2-2.2B-Instruct-GGUF', 'SmolVLM2-2.2B-Instruct-Q4_K_M.gguf'), bytes: 1112602656, sha256: '0cf76814555b8665149075b74ab6b5c1d428ea1d3d01c1918c12012e8d7c9f58' },
          { role: 'mmproj', name: 'mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf', url: HF('ggml-org/SmolVLM2-2.2B-Instruct-GGUF', 'mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf'), bytes: 592523200, sha256: 'ae07ea1facd07dd3230c4483b63e8cda96c6944ad2481f33d531f79e892dd024' }
        ] },
      { id: 'gemma-4-e2b', name: 'Gemma 4 E2B', use: ['vision', 'listening'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF', memory: 'about 4.5 GB', stillsPerAsk: 4, chunkSec: 30, assume: [3, 15], best: true,
        what: 'The recommended one: sees shots well (reads writing in the picture too) and can also listen, 30 seconds at a time. Listening with it is experimental – Google describes it for speech; how well it names laughter, applause or music is not proven.',
        files: [
          { role: 'model', name: 'gemma-4-E2B-it-Q4_0.gguf', url: HF('ggml-org/gemma-4-E2B-it-GGUF', 'gemma-4-E2B-it-Q4_0.gguf'), bytes: 2841481184, sha256: '8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52' },
          { role: 'mmproj', name: 'mmproj-gemma-4-E2B-it-Q8_0.gguf', url: HF('ggml-org/gemma-4-E2B-it-GGUF', 'mmproj-gemma-4-E2B-it-Q8_0.gguf'), bytes: 557368096, sha256: '042cc2561806cd3b5cb5efb25cab76911e3100c43cc09d854904f921924b1429' }
        ] },
      { id: 'gemma-4-e4b', name: 'Gemma 4 E4B', use: ['vision', 'listening'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF', memory: 'about 6.5 GB (a computer with 16 GB or more)', stillsPerAsk: 4, chunkSec: 30, assume: [5, 25],
        what: 'The strongest here: more careful descriptions, slower. Listening is experimental, as with E2B.',
        files: [
          { role: 'model', name: 'gemma-4-E4B-it-Q4_0.gguf', url: HF('ggml-org/gemma-4-E4B-it-GGUF', 'gemma-4-E4B-it-Q4_0.gguf'), bytes: 4590807392, sha256: 'a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2' },
          { role: 'mmproj', name: 'mmproj-gemma-4-E4B-it-Q8_0.gguf', url: HF('ggml-org/gemma-4-E4B-it-GGUF', 'mmproj-gemma-4-E4B-it-Q8_0.gguf'), bytes: 559874848, sha256: '9257f21a0f5358204b4a612cff83fad2e56412f4f607f0049331ce60c0cf9d34' }
        ] }
    ]
  };
  // the list of newer versions, kept in the app's own repository (a few KB of text; nothing about you is sent)
  const MANIFEST_URL = 'https://raw.githubusercontent.com/argaerghe34/JMG-Ultra-Studio/main/models.json';
  const HOSTS = /^(huggingface\.co|github\.com|raw\.githubusercontent\.com)$/i;   // where a download may start

  /** A manifest is only believed when every file in it is HTTPS from a known place and has a size and a checksum. */
  function validManifest(m) {
    const okFile = f => { try { const u = new URL(f.url); return u.protocol === 'https:' && HOSTS.test(u.hostname) && /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0 && typeof f.name === 'string' && !/[\\/]|\.\./.test(f.name); } catch (e) { return false; } };
    if (!m || typeof m !== 'object' || !(m.version >= 1) || !Array.isArray(m.models) || !m.runtime || !m.runtime.builds) return false;
    if (!Object.values(m.runtime.builds).every(b => okFile(b) && typeof b.exe === 'string' && !/\.\.|^[\\/]/.test(b.exe))) return false;
    return m.models.every(x => x && /^[a-z0-9.-]+$/.test(x.id || '') && Array.isArray(x.files) && x.files.length && x.files.every(okFile) && Array.isArray(x.use));
  }
  /** The catalogue in use: the one built in, or a newer one fetched earlier (when it checks out). */
  function manifest() {
    const got = US.settings.get('understand.manifest', null);
    return got && validManifest(got) && got.version > BUILTIN.version ? got : BUILTIN;
  }
  const list = () => manifest().models;
  const get = id => list().find(m => m.id === id) || null;
  const totalBytes = m => (m.files || []).reduce((n, f) => n + f.bytes, 0);
  const fmtSize = n => (n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB');

  /* ---------- where they are kept ---------- */
  /** The models folder (Settings can move it): beside the cache, never inside a project. */
  function dir() {
    const custom = String(US.settings.get('understand.modelsDir', '') || '').trim();
    return US.fsx.ensureDir(custom || path.join(path.dirname(US.fsx.cacheDir()), 'models'));
  }
  const modelDir = m => path.join(dir(), m.id + '-v' + m.version);
  const fileOf = (m, role) => { const f = m.files.find(x => x.role === role) || m.files[0]; return path.join(modelDir(m), f.name); };
  /** Is this model on the computer, whole? (Each file is there at its full size; checked against its checksum when it came down.) */
  function installed(id) {
    const m = typeof id === 'string' ? get(id) : id;
    return !!m && m.files.every(f => US.fsx.size(path.join(modelDir(m), f.name)) === f.bytes);
  }
  /** Versions of a model on disk that the catalogue has moved on from: [{id, dir}] */
  function oldVersions() {
    const out = [];
    let names = []; try { names = fs.readdirSync(dir()); } catch (e) { return out; }
    for (const n of names) { const x = /^(.+)-v([^-]+)$/.exec(n); if (!x) continue; const m = get(x[1]); if (m && String(m.version) !== x[2]) out.push({ id: x[1], dir: path.join(dir(), n) }); }
    return out;
  }
  function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* in use: next time */ } }
  /** Delete a model from this computer (frees its space). */
  function remove(id) {
    const m = get(id); if (!m) return false;
    if (helper.model === id) stop();
    rmrf(modelDir(m));
    for (const k of ['understand.visionModel', 'understand.listenModel']) if (US.settings.get(k, '') === id) US.settings.set(k, k === 'understand.listenModel' ? 'builtin' : '');
    US.bus.emit('models', { id, removed: true });
    return true;
  }

  /* ---------- downloading: resumable, checked ---------- */
  function sha256File(file) {
    return new Promise((resolve, reject) => { const hsh = crypto.createHash('sha256'), s = fs.createReadStream(file); s.on('data', c => hsh.update(c)); s.on('error', reject); s.on('end', () => resolve(hsh.digest('hex'))); });
  }
  const live = new Set();
  US.bus.on('hard-stop', () => { for (const r of live) { try { r.destroy(new US.UserError('CANCELLED')); } catch (e) { /* gone */ } } live.clear(); });
  /**
   * Fetch one file to dest, carrying on from a part already there, then check its size and SHA-256. onProgress(done, total).
   * check() may throw to stop (the part is kept for next time). allowLocal: tests fetch from 127.0.0.1 over http.
   */
  function fetchFile(f, dest, { onProgress = () => {}, check = null, allowLocal = false } = {}) {
    const part = dest + '.part';
    const bad = (title, action, detail) => new US.UserError('AI_FAILED', { title, action, detail });
    return new Promise((resolve, reject) => {
      US.fsx.ensureDir(path.dirname(dest));
      let hops = 0;
      const go = url => {
        let u; try { u = new URL(url); } catch (e) { return reject(bad('The download address isn’t right.', 'Check for updates to the model list, then try again.', String(url))); }
        const local = allowLocal && /^(127\.0\.0\.1|localhost)$/.test(u.hostname);
        if (!local && (u.protocol !== 'https:' || (hops === 0 && !HOSTS.test(u.hostname)))) return reject(bad('That download isn’t from a place Ultra Studio trusts.', 'Nothing was downloaded.', String(url)));
        const have = US.fsx.size(part);
        const req = (u.protocol === 'https:' ? require('https') : require('http')).get(url, { headers: Object.assign({ 'user-agent': 'JMG-Ultra-Studio' }, have > 0 ? { range: `bytes=${have}-` } : {}), timeout: 60000 }, res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); if (++hops > 6) return reject(bad('The download kept being sent elsewhere.', 'Try again later.', url)); return go(new URL(res.headers.location, url).toString()); }
          if (res.statusCode === 416) { res.resume(); try { fs.unlinkSync(part); } catch (e) { /* gone */ } hops++; return go(url); }   // the part was longer than the file: start again
          if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(bad('The download didn’t start.', res.statusCode === 404 ? 'This file has moved. Check for updates to the model list (Settings › Vision & listening models).' : 'Check the internet connection, then try again.', `HTTP ${res.statusCode} for ${url}`)); }
          const from = res.statusCode === 206 ? have : 0;
          const out = fs.createWriteStream(part, { flags: from ? 'a' : 'w' });
          let done = from, stopped = null;
          res.on('data', c => {
            done += c.length; onProgress(done, f.bytes);
            if (check) { try { check(); } catch (e) { stopped = e; req.destroy(e); } }
          });
          res.pipe(out);
          const fail = e => { out.close(); reject(stopped || (e && e.code === 'CANCELLED' ? e : bad('The download was interrupted.', 'Press Download again – it carries on from where it stopped.', String(e && e.message || e)))); };
          res.on('error', fail); req.on('error', fail);
          out.on('finish', async () => {
            if (stopped) return reject(stopped);
            try {
              if (US.fsx.size(part) !== f.bytes) { if (US.fsx.size(part) > f.bytes) fs.unlinkSync(part); throw bad('The download is incomplete.', 'Press Download again – it carries on from where it stopped.', `${US.fsx.size(part)} of ${f.bytes} bytes`); }
              const sum = await sha256File(part);
              if (sum !== f.sha256) { fs.unlinkSync(part); throw bad('The downloaded file isn’t the one expected, so it was thrown away.', 'Try again. If it happens twice, check for updates to the model list.', `sha256 ${sum}, expected ${f.sha256}`); }
              US.fsx.renameRetry ? await US.fsx.renameRetry(part, dest) : fs.renameSync(part, dest);
              resolve(dest);
            } catch (e) { reject(e); }
          });
        });
        live.add(req); req.on('close', () => live.delete(req));
        req.on('timeout', () => req.destroy(new Error('no answer for a minute')));
        req.on('error', e => { if (!req.res) reject(e && e.code === 'CANCELLED' ? e : bad('Couldn’t reach the download.', 'Check the internet connection, then try again.', String(e && e.message || e))); });
      };
      go(f.url);
    });
  }
  function freeSpace(d) { try { const s = fs.statfsSync ? fs.statfsSync(d) : null; return s ? s.bavail * s.bsize : Infinity; } catch (e) { return Infinity; } }
  /** Download every file of a set (a model, or the helper's archive) with one progress bar. */
  async function fetchAll(files, into, job, label, opts = {}) {
    const total = files.reduce((n, f) => n + f.bytes, 0);
    if (freeSpace(dir()) < total * 1.05) throw new US.UserError('AI_FAILED', { title: `There isn’t room for ${label} on this disk.`, action: `It needs ${fmtSize(total)}. Free some space, or move the models folder in Settings › Vision & listening models.` });
    let before = 0;
    for (const f of files) {
      const dest = path.join(into, f.name);
      if (US.fsx.size(dest) !== f.bytes) {
        await fetchFile(f, dest, Object.assign({ check: job && (() => job.check()), onProgress: (d) => { job && job.progress((before + d) / total, `Downloading ${label} · ${fmtSize(before + d)} of ${fmtSize(total)}`); if (opts.onProgress) opts.onProgress(before + d, total); } }, opts));
      }
      before += f.bytes;
    }
    return total;
  }

  /* ---------- the helper program ---------- */
  const platformKey = () => `${process.platform}-${process.arch}`;
  const build = () => manifest().runtime.builds[platformKey()] || null;
  const runtimeDir = () => path.join(dir(), 'helper-' + manifest().runtime.version);
  const exePath = () => { const b = build(); return b ? path.join(runtimeDir(), b.exe) : ''; };
  const runtime = {
    supported: () => !!build(),
    installed: () => !!build() && US.fsx.exists(exePath()),
    bytes: () => (build() ? build().bytes : 0),
    info: () => Object.assign({ platform: platformKey() }, manifest().runtime, { build: build(), dir: runtimeDir() }),
    /** Download and unpack the helper (checked first). Unpacked with the system's own tar – on Windows 10 and later it reads zips too. */
    async install(job, opts = {}) {
      const b = build();
      if (!b) throw new US.UserError('AI_FAILED', { title: 'The helper that runs models isn’t available for this kind of computer.', action: 'Use “Cloud”, or a model you already have in Ollama or LM Studio (Settings › AI).', detail: platformKey() });
      if (runtime.installed()) return true;
      const d = US.fsx.ensureDir(runtimeDir());
      await fetchAll([b], d, job, 'the helper', opts);
      job && job.busy('Unpacking the helper', 'computer');
      await new Promise((resolve, reject) => {
        require('child_process').execFile(process.platform === 'win32' ? 'tar.exe' : '/usr/bin/tar', ['-xf', path.join(d, b.name), '-C', d], { windowsHide: true, timeout: 120000 }, err => (err ? reject(new US.UserError('AI_FAILED', { title: 'The helper couldn’t be unpacked.', action: 'Try the download again.', detail: String(err.message || err) })) : resolve()));
      });
      try { fs.unlinkSync(path.join(d, b.name)); } catch (e) { /* keep it then */ }
      if (!US.fsx.exists(exePath())) throw new US.UserError('AI_FAILED', { title: 'The helper isn’t where it should be after unpacking.', action: 'Check for updates to the model list, then try again.', detail: exePath() });
      if (process.platform !== 'win32') { try { fs.chmodSync(exePath(), 0o755); } catch (e) { /* already */ } }
      US.bus.emit('models', { runtime: true });
      return true;
    },
    remove() { stop(); rmrf(runtimeDir()); US.bus.emit('models', { runtime: true, removed: true }); }
  };

  const helper = { proc: null, model: '', url: '', last: 0, starting: null, timer: null };
  const IDLE_STOP = 3 * 60000;
  function stop() {
    clearTimeout(helper.timer);
    const p = helper.proc; helper.proc = null; helper.model = ''; helper.url = ''; helper.starting = null;
    if (p) { try { p.kill(); } catch (e) { /* gone */ } }
  }
  function touch() { helper.last = Date.now(); clearTimeout(helper.timer); helper.timer = setTimeout(() => { if (Date.now() - helper.last >= IDLE_STOP - 500) stop(); }, IDLE_STOP); if (helper.timer && helper.timer.unref) helper.timer.unref(); }
  const freePort = () => new Promise((resolve, reject) => { const s = require('net').createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  function health(url) {
    return new Promise(resolve => {
      const req = require('http').get(url + '/health', { timeout: 3000 }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => resolve(0)); req.on('timeout', () => { req.destroy(); resolve(0); });
    });
  }
  /**
   * Start the helper with a model (or return it if it's already running that one). -> its address on this computer.
   * Hidden (no window), this computer only, half the processor's threads, low priority.
   */
  async function start(id, { job, spawn = require('child_process').spawn, waitMs = 180000 } = {}) {
    const m = get(id);
    if (!m || !installed(m)) throw new US.UserError('AI_FAILED', { title: 'That model isn’t on this computer.', action: 'Settings › Vision & listening models: press Download.' });
    if (!runtime.installed()) throw new US.UserError('AI_FAILED', { title: 'The helper that runs models isn’t on this computer.', action: 'Settings › Vision & listening models: press Download next to the model – the helper comes with it.' });
    if (helper.proc && helper.model === id && helper.url) { touch(); return helper.url; }
    if (helper.starting && helper.model === id) return helper.starting;
    stop();
    helper.model = id;
    helper.starting = (async () => {
      const port = await freePort(), url = `http://127.0.0.1:${port}`;
      const args = ['-m', fileOf(m, 'model'), '--mmproj', fileOf(m, 'mmproj'), '--host', '127.0.0.1', '--port', String(port), '--no-webui', '--ctx-size', '8192', '--threads', String(Math.max(2, Math.floor(os.cpus().length / 2))),
        // no thinking out loud: Gemma 4 otherwise spends its whole answer on reasoning and the answer comes back empty
        // (seen in Premiere, 19 Nov 2026). Both flags are in b12359's server README.
        '--reasoning', 'off', '--reasoning-budget', '0'];
      let err = '', gone = false;
      const p = spawn(exePath(), args, { cwd: path.dirname(exePath()), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      helper.proc = p;
      if (p.stderr) p.stderr.on('data', b => { err = (err + b).slice(-3000); });
      p.on('error', e => { gone = true; err += String(e && e.message || e); });
      p.on('exit', () => { gone = true; if (helper.proc === p) { helper.proc = null; helper.url = ''; helper.model = ''; } });
      try { os.setPriority(p.pid, 10); } catch (e) { /* stays at the usual priority */ }
      job && job.busy(`Starting ${m.name} on this computer`, 'computer');
      const t0 = Date.now();
      for (;;) {
        if (gone) throw new US.UserError('AI_FAILED', { title: `${m.name} couldn’t start on this computer.`, action: 'It may need more memory than is free. Try a smaller model, or close other apps.', detail: err.slice(-1200) });
        if ((await health(url)) === 200) break;
        if (Date.now() - t0 > waitMs) { stop(); throw new US.UserError('AI_FAILED', { title: `${m.name} took too long to start.`, action: 'Try again, or a smaller model.', detail: err.slice(-1200) }); }
        job && job.check && job.check();
        await new Promise(r => setTimeout(r, 400));
      }
      helper.url = url; helper.starting = null; touch();
      US.log('info', `${m.name} is running on this computer (the helper, ${url})`, '', 'understand');
      return url;
    })();
    try { return await helper.starting; } catch (e) { stop(); throw e; }
  }
  try { process.on('exit', stop); } catch (e) { /* no process events here */ }
  try { window.addEventListener('beforeunload', stop); } catch (e) { /* tests */ }

  /** Download a model – and the helper, the first time – as one job. */
  async function download(id, job, opts = {}) {
    const m = get(id);
    if (!m) throw new US.UserError('NOTHING_FOUND', { title: 'That model isn’t in the list.' });
    job && job.set({ who: 'computer', msg: `Downloading ${m.name} (${fmtSize(totalBytes(m))})` });
    if (!opts.skipRuntime && !runtime.installed()) { job && job.range(0, 0.03); await runtime.install(job, opts); job && job.range(0.03, 1); }
    await fetchAll(m.files, US.fsx.ensureDir(modelDir(m)), job, m.name, opts);
    job && job.range(0, 1);
    // an older version of the same model is no longer needed
    for (const o of oldVersions().filter(o => o.id === id)) rmrf(o.dir);
    if (m.use.includes('vision') && !US.settings.get('understand.visionModel', '')) US.settings.set('understand.visionModel', id);
    US.bus.emit('models', { id, installed: true });
    return { summary: `${m.name} is on this computer (${fmtSize(totalBytes(m))})` };
  }

  /* ---------- updates ---------- */
  function fetchText(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const req = require('https').get(url, { headers: { 'user-agent': 'JMG-Ultra-Studio' }, timeout: timeoutMs }, res => { if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); } const c = []; res.on('data', x => { c.push(x); if (c.length > 400) req.destroy(new Error('too big')); }); res.on('end', () => resolve(Buffer.concat(c).toString('utf8'))); });
      req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout')));
    });
  }
  /** What a newer catalogue changes for models that are on this computer: [{id, name, from, to, bytes}] (and the helper). */
  function updatesIn(next, cur = manifest()) {
    const out = [];
    for (const n of next.models) {
      const c = cur.models.find(x => x.id === n.id);
      if (c && String(c.version) !== String(n.version) && installed(c)) out.push({ id: n.id, name: n.name, from: c.version, to: n.version, bytes: totalBytes(n) });
    }
    if (next.runtime.version !== cur.runtime.version && US.fsx.exists(path.join(dir(), 'helper-' + cur.runtime.version))) { const b = next.runtime.builds[platformKey()]; if (b) out.push({ id: 'llama-server', name: 'the helper', from: cur.runtime.version, to: next.runtime.version, bytes: b.bytes }); }
    return out;
  }
  /**
   * Look for a newer model list (a few KB from the app's own repository). Nothing is downloaded by this.
   * -> {checked, updates: [...], newer: the newer list or null}
   */
  async function checkUpdates({ fetch = fetchText } = {}) {
    let next = null;
    try { next = JSON.parse(await fetch(MANIFEST_URL)); } catch (e) { US.settings.set('understand.updateCheck', { at: Date.now(), ok: false }); return { checked: false, updates: [], newer: null, why: String(e && e.message || e) }; }
    if (!validManifest(next)) { US.settings.set('understand.updateCheck', { at: Date.now(), ok: false }); return { checked: false, updates: [], newer: null, why: 'The model list didn’t check out, so it was ignored.' }; }
    const cur = manifest(), updates = next.version > cur.version ? updatesIn(next, cur) : [];
    US.settings.set('understand.updateCheck', { at: Date.now(), ok: true, updates, version: next.version });
    US.settings.set('understand.pending', next.version > cur.version ? next : null);
    return { checked: true, updates, newer: next.version > cur.version ? next : null };
  }
  /** Updates found by the last check that haven't been taken yet. */
  function pendingUpdates() { const p = US.settings.get('understand.pending', null); return p && validManifest(p) && p.version > manifest().version ? updatesIn(p) : []; }
  /** Take the newer list and download the new versions of the models that are here (the old ones are removed after). */
  async function applyUpdates(job, opts = {}) {
    const p = US.settings.get('understand.pending', null);
    if (!p || !validManifest(p) || p.version <= manifest().version) return { summary: 'The models are up to date' };
    const ups = updatesIn(p), oldRuntime = runtimeDir();
    stop();
    US.settings.set('understand.manifest', p); US.settings.set('understand.pending', null);
    let n = 0;
    for (const u of ups) {
      job && job.check();
      if (u.id === 'llama-server') { await runtime.install(job, opts); if (oldRuntime !== runtimeDir()) rmrf(oldRuntime); } else await download(u.id, job, opts);
      n++;
    }
    return { summary: n ? `${US.plural(n, 'update')} downloaded` : 'The model list is up to date' };
  }
  const autoUpdate = () => US.settings.get('understand.autoUpdate', false) === true;

  /* ---------- every model on this computer, once – and which job each can do ----------
     Three jobs: reading and writing (story work, Ask), looking at footage, listening. Two ways a model gets here:
     downloaded by Ultra Studio (it runs in the helper, nothing else to install), or the editor's own in Ollama or
     LM Studio. One setting per job; whatever is chosen there is the one used – nothing runs twice. */
  /** The same model under two spellings is one model: case, and Ollama's “:latest”. */
  const sameId = n => String(n || '').trim().toLowerCase().replace(/:latest$/, '');
  const KNOWN = () => (US.footage && US.footage.MODELS) || [];   // names and sizes of well-known Ollama vision models
  /**
   * The inventory from what was found. status: US.ai.localStatus(); names: what the app lists (both of its lists may
   * be given – doubles are dropped); caps: {name: ['vision', …] | null}; chosen: {text, look} (the editor's own model
   * for each job, kept in the list even when the app isn't running).
   * -> {server: {running, app}, models: [{key, id, name, from, here, size, can: {text, look, listen}, why: {…}, removable}]}
   * can.look: true, false (a text-only model) or null (the app doesn't say – LM Studio).
   */
  function inventoryFrom({ status = { ok: false, kind: '' }, names = [], caps = {}, chosen = {} } = {}) {
    const app = status.ok ? (status.kind === 'ollama' ? 'Ollama' : 'LM Studio') : '';
    const out = [];
    for (const m of list().filter(x => installed(x.id))) {
      out.push({ key: 'us:' + m.id, id: m.id, name: m.name, from: 'Ultra Studio', here: true, size: fmtSize(totalBytes(m)), removable: 'us',
        can: { text: false, look: m.use.includes('vision'), listen: m.use.includes('listening') }, why: { text: 'it is set up for looking and listening, not for story work' } });
    }
    const seen = new Set();
    const add = (name, here) => {
      const id = sameId(name); if (!id || seen.has(id)) return; seen.add(id);
      const known = KNOWN().find(k => sameId(k.id) === id), c = Object.keys(caps).find(k => sameId(k) === id), cap = c ? caps[c] : null;
      const look = cap ? cap.includes('vision') : known ? true : null;
      out.push({ key: 'own:' + name, id: name, name: known ? known.name : name, tag: name, from: app || 'Ollama or LM Studio', here, size: known ? known.size : '', removable: here && status.kind === 'ollama' ? 'ollama' : '',
        can: { text: true, look, listen: false }, why: Object.assign({ listen: 'Ultra Studio can only listen with its own models' }, look === false ? { look: 'a text-only model – it can’t look at pictures' } : {}) });
    };
    for (const n of names) add(n, true);
    const ownName = n => (/^us:/.test(n || '') ? '' : String(n || '').replace(/^own:/, ''));   // jobs() names its looking choice 'us:…' or 'own:…'
    for (const n of [chosen.text, chosen.look].map(ownName)) if (n) add(n, false);   // chosen, but the app isn't running (or the model has gone)
    return { server: { running: !!status.ok, app }, models: out };
  }
  /** Ask the computer: Ultra Studio's own models on disk, and what Ollama or LM Studio has. */
  async function inventory() {
    let status = { ok: false, kind: '' }, names = [];
    const caps = {};
    try { status = await US.ai.localStatus(); if (status.ok) names = await US.ai.localModels(); } catch (e) { /* not running */ }
    if (status.kind === 'ollama' && US.ai.localCaps) for (const n of names.slice(0, 40)) caps[n] = await US.ai.localCaps(n);
    return inventoryFrom({ status, names, caps, chosen: jobs() });
  }
  /** The model chosen for each job, as kept: {text (the editor's own model's name or ''), look ('us:id' | 'own:name' | ''), listen ('builtin' | id)} */
  function jobs() {
    const v = String(US.settings.get('understand.visionModel', '') || ''), own = String(US.settings.get('footage.localModel', '') || '').trim();
    const mine = get(v) && installed(v) ? 'us:' + v : '';
    const l = String(US.settings.get('understand.listenModel', 'builtin') || 'builtin');
    return { text: String(US.settings.get('ai.localModel', '') || '').trim(), look: mine || ((v === 'own' || !v || !mine) && own ? 'own:' + own : ''), lookOwn: own, listen: get(l) && installed(l) ? l : 'builtin' };
  }
  /** Choose the model for a job (a picker's value). One setting per job – what every tool then uses. */
  function setJob(job, value) {
    value = String(value || '');
    if (job === 'text') US.settings.set('ai.localModel', value.replace(/^own:/, ''));
    else if (job === 'look') {
      if (/^us:/.test(value)) US.settings.set('understand.visionModel', value.slice(3));
      else if (/^own:/.test(value)) { US.settings.set('footage.localModel', value.slice(4)); US.settings.set('understand.visionModel', 'own'); }
      else { US.settings.set('understand.visionModel', ''); US.settings.set('footage.localModel', ''); }
    } else if (job === 'listen') US.settings.set('understand.listenModel', value || 'builtin');
    US.bus.emit('models', { job });
  }
  /**
   * The three pickers: for each job every model that could be listed, once, named with where it comes from; one that
   * can't do the job is greyed with the reason. -> {text|look|listen: {value, options: [{value, label, disabled}]}}
   */
  function pickers(inv, now = jobs()) {
    const label = m => `${m.name} – from ${m.from}${m.here ? '' : ' (not found just now)'}`;
    const us = inv.models.filter(m => m.from === 'Ultra Studio'), own = inv.models.filter(m => m.from !== 'Ultra Studio');
    const text = [{ value: '', label: own.length ? 'None chosen' : 'None – this job needs a model from Ollama or LM Studio' }]
      .concat(own.map(m => ({ value: m.tag, label: label(m) })))
      .concat(us.map(m => ({ value: m.key, label: `${m.name} – from Ultra Studio (looks and listens only)`, disabled: true })));
    const look = [{ value: '', label: inv.models.some(m => m.can.look !== false) ? 'None chosen' : 'None yet – download one below' }]
      .concat(us.filter(m => m.can.look).map(m => ({ value: m.key, label: label(m) })))
      .concat(own.map(m => (m.can.look === false ? { value: m.key, label: `${m.name} – from ${m.from} (text only – can’t look)`, disabled: true } : { value: m.key, label: label(m) + (m.can.look === null ? ' – must be a model that takes pictures' : '') })));
    const listen = [{ value: 'builtin', label: 'Built-in listening – part of Ultra Studio, no model' }]
      .concat(us.filter(m => m.can.listen).map(m => ({ value: m.id, label: `Built-in + ${m.name} – from Ultra Studio (experimental)` })));
    // what is chosen now, as the list spells it (the setting may say “Qwen3.5:4b” where Ollama says “qwen3.5:4b”)
    const pickOf = (opts, v, d) => { const o = v ? opts.find(o => !o.disabled && sameId(o.value) === sameId(v)) : null; return o ? o.value : d; };
    return { text: { value: pickOf(text, now.text, ''), options: text }, look: { value: pickOf(look, now.look, ''), options: look }, listen: { value: pickOf(listen, now.listen, 'builtin'), options: listen } };
  }

  US.models = { sameId, inventory, inventoryFrom, jobs, setJob, pickers, BUILTIN, MANIFEST_URL, manifest, validManifest, list, get, totalBytes, fmtSize, dir, modelDir, fileOf, installed, remove, oldVersions, fetchFile, sha256File, download, runtime, start, stop, helper, touch, checkUpdates, pendingUpdates, applyUpdates, updatesIn, autoUpdate, platformKey };
})();
