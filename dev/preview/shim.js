/* JMG Ultra Studio preview (development only): what CEP / Electron give the panel, for a plain browser.
   Loaded by dev/preview/server.js before the panel's own scripts. Node's require() is answered here: fs goes to the
   preview server (reads from the checkout, writes only in its temp folder), the editor is the server's stand-in, and
   everything that would go online, run a program, download or install refuses. */
(function () {
  'use strict';
  const CFG = window.__PREVIEW__;
  const APP = new URLSearchParams(location.search).get('app') === 'resolve' ? 'resolve' : 'premiere';

  /* ---------- errors reach the preview's top bar ---------- */
  const report = msg => { try { if (window.parent !== window) window.parent.postMessage({ usPreviewError: String(msg).slice(0, 4000) }, '*'); } catch (e) { /* alone */ } };
  window.addEventListener('error', e => report((e.error && e.error.stack) || e.message));
  window.addEventListener('unhandledrejection', e => report('Unhandled: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
  const cerr = console.error.bind(console);
  console.error = (...a) => { report(a.map(x => (x && x.stack) || String(x)).join(' ')); cerr(...a); };

  /* ---------- talking to the preview server ---------- */
  function syncPost(url, payload) {
    const x = new XMLHttpRequest();
    x.open('POST', url, false);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(payload));
    if (x.status !== 200) throw new Error('Preview server: ' + x.status + ' ' + x.responseText);
    return JSON.parse(x.responseText);
  }
  // while the page is closing or reloading, a browser refuses synchronous requests: the panel's last saves (settings,
  // Story) are queued and sent together with sendBeacon, which outlives the page
  const WRITES = new Set(['writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rm', 'rmdir', 'copyFile', 'cp', 'utimes', 'chmod']);
  let closing = false, queue = null;
  const closingNow = () => { closing = true; };
  window.addEventListener('beforeunload', closingNow); window.addEventListener('pagehide', closingNow);
  function fsCall(op, ...args) {
    if (closing && WRITES.has(op)) {
      if (!queue) { queue = []; queueMicrotask(() => { const q = queue; queue = null; navigator.sendBeacon('/__preview/fs', JSON.stringify({ op: 'batch', args: q })); }); }
      queue.push([op, args]);
      return undefined;
    }
    if (closing && op === 'exists') return false;
    const r = syncPost('/__preview/fs', { op, args });
    if (!r.ok) { const e = new Error(r.message); e.code = r.code; e.syscall = op; throw e; }
    return r.value;
  }

  /* ---------- Buffer: the parts the panel uses, on Uint8Array ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64of = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const ofB64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  class Buffer extends Uint8Array {
    static from(x, e) {
      if (typeof x === 'string') {
        if (e === 'base64') return Buffer.wrap(ofB64(x));
        if (e === 'hex') { const u = new Buffer(x.length >> 1); for (let i = 0; i < u.length; i++) u[i] = parseInt(x.substr(i * 2, 2), 16); return u; }
        if (e === 'latin1' || e === 'binary' || e === 'ascii') { const u = new Buffer(x.length); for (let i = 0; i < x.length; i++) u[i] = x.charCodeAt(i) & 255; return u; }
        return Buffer.wrap(enc.encode(x));
      }
      if (x instanceof ArrayBuffer) return new Buffer(x, e || 0, arguments[2]);
      if (ArrayBuffer.isView(x)) { const u = new Buffer(x.byteLength); u.set(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); return u; }
      if (Array.isArray(x)) { const u = new Buffer(x.length); u.set(x); return u; }
      if (x && x.type === 'Buffer' && Array.isArray(x.data)) return Buffer.from(x.data);
      throw new TypeError('Buffer.from: unsupported ' + typeof x);
    }
    static wrap(u8) { return new Buffer(u8.buffer, u8.byteOffset, u8.byteLength); }
    static alloc(n, fill) { const u = new Buffer(n); if (fill) u.fill(typeof fill === 'number' ? fill : String(fill).charCodeAt(0)); return u; }
    static allocUnsafe(n) { return new Buffer(n); }
    static isBuffer(x) { return x instanceof Buffer; }
    static byteLength(s, e) { return typeof s === 'string' ? Buffer.from(s, e).length : s.byteLength; }
    static concat(list, total) {
      const n = total != null ? total : list.reduce((a, b) => a + b.length, 0), u = new Buffer(n);
      let o = 0; for (const b of list) { if (o >= n) break; u.set(b.subarray(0, n - o), o); o += b.length; }
      return u;
    }
    toString(e, start, end) {
      const u = this.subarray(start || 0, end == null ? this.length : end);
      if (e === 'base64') return b64of(u);
      if (e === 'hex') return Array.from(u, b => b.toString(16).padStart(2, '0')).join('');
      if (e === 'latin1' || e === 'binary' || e === 'ascii') { let s = ''; for (const b of u) s += String.fromCharCode(b); return s; }
      return dec.decode(u);
    }
    toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
    equals(o) { if (o.length !== this.length) return false; for (let i = 0; i < this.length; i++) if (o[i] !== this[i]) return false; return true; }
    slice(a, b) { return this.subarray(a, b); }
    subarray(a, b) { const s = Uint8Array.prototype.subarray.call(this, a, b); return new Buffer(s.buffer, s.byteOffset, s.byteLength); }
    write(s, off) { const b = Buffer.from(s); this.set(b, off || 0); return b.length; }
    copy(t, ts = 0, ss = 0, se = this.length) { const part = this.subarray(ss, se); t.set(part, ts); return part.length; }
    get dv() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
    readUInt8(o) { return this[o]; } readInt8(o) { return this.dv.getInt8(o); }
    readUInt16LE(o) { return this.dv.getUint16(o, true); } readUInt16BE(o) { return this.dv.getUint16(o); }
    readInt16LE(o) { return this.dv.getInt16(o, true); } readInt16BE(o) { return this.dv.getInt16(o); }
    readUInt32LE(o) { return this.dv.getUint32(o, true); } readUInt32BE(o) { return this.dv.getUint32(o); }
    readInt32LE(o) { return this.dv.getInt32(o, true); } readInt32BE(o) { return this.dv.getInt32(o); }
    readFloatLE(o) { return this.dv.getFloat32(o, true); } readDoubleLE(o) { return this.dv.getFloat64(o, true); }
    readIntLE(o, n) { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + this[o + i]; return v >= 2 ** (8 * n - 1) ? v - 2 ** (8 * n) : v; }
    readUIntLE(o, n) { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + this[o + i]; return v; }
    writeUInt8(v, o) { this[o] = v; return o + 1; }
    writeUInt16LE(v, o) { this.dv.setUint16(o, v, true); return o + 2; } writeInt16LE(v, o) { this.dv.setInt16(o, v, true); return o + 2; }
    writeUInt32LE(v, o) { this.dv.setUint32(o, v, true); return o + 4; } writeUInt32BE(v, o) { this.dv.setUint32(o, v); return o + 4; }
    writeInt32LE(v, o) { this.dv.setInt32(o, v, true); return o + 4; } writeFloatLE(v, o) { this.dv.setFloat32(o, v, true); return o + 4; }
  }
  Buffer.prototype.utf8Slice = function () { return this.toString(); };
  const toData = d => (typeof d === 'string' ? { text: d } : ArrayBuffer.isView(d) ? { b64: b64of(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) } : { text: String(d) });

  /* ---------- events ---------- */
  class EventEmitter {
    constructor() { this._ev = {}; }
    on(n, f) { (this._ev[n] = this._ev[n] || []).push(f); return this; }
    addListener(n, f) { return this.on(n, f); }
    once(n, f) { const w = (...a) => { this.off(n, w); f(...a); }; return this.on(n, w); }
    off(n, f) { this._ev[n] = (this._ev[n] || []).filter(x => x !== f); return this; }
    removeListener(n, f) { return this.off(n, f); }
    removeAllListeners(n) { if (n) delete this._ev[n]; else this._ev = {}; return this; }
    emit(n, ...a) { const l = (this._ev[n] || []).slice(); l.forEach(f => f.apply(this, a)); return l.length > 0; }
    listenerCount(n) { return (this._ev[n] || []).length; }
    setMaxListeners() { return this; }
  }

  /* ---------- process ---------- */
  const proc = new EventEmitter();
  Object.assign(proc, {
    platform: CFG.platform === 'win32' ? 'win32' : 'darwin', arch: 'arm64', pid: 4242, version: 'v18.17.1',
    versions: { node: '18.17.1', chrome: '120.0.0.0', electron: APP === 'resolve' ? '28.0.0' : undefined, cep: APP === 'premiere' ? '11.0' : undefined },
    env: { HOME: CFG.home, USER: 'preview', TMPDIR: CFG.tmp, PATH: '/usr/bin:/bin', LANG: 'en_GB.UTF-8' },
    argv: [], execPath: '/preview/node', cwd: () => CFG.root, exit() {}, hrtime: Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
    nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), uptime: () => performance.now() / 1000, memoryUsage: () => ({ rss: 2e8, heapUsed: 1e8, heapTotal: 2e8 }),
    stdout: { write() {} }, stderr: { write() {} }, type: 'renderer'
  });

  /* ---------- path (posix) ---------- */
  function normalizeArr(parts, abs) {
    const out = [];
    for (const p of parts) { if (!p || p === '.') continue; if (p === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(p); }
    return out;
  }
  const P = {
    sep: '/', delimiter: ':',
    isAbsolute: p => String(p).startsWith('/'),
    normalize(p) { p = String(p); if (!p) return '.'; const abs = p.startsWith('/'), trail = p.endsWith('/'); let r = normalizeArr(p.split('/'), abs).join('/'); if (!r && !abs) r = '.'; if (r && trail) r += '/'; return (abs ? '/' : '') + r; },
    join(...a) { const j = a.filter(x => x !== '').join('/'); return j ? P.normalize(j) : '.'; },
    resolve(...a) { let r = ''; for (let i = a.length - 1; i >= 0 && !r.startsWith('/'); i--) { if (a[i]) r = a[i] + (r ? '/' + r : ''); } if (!r.startsWith('/')) r = proc.cwd() + '/' + r; const n = P.normalize(r); return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n; },
    dirname(p) { p = String(p); if (!p) return '.'; const s = p.replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i); },
    basename(p, ext) { let b = String(p).replace(/\/+$/, ''); b = b.slice(b.lastIndexOf('/') + 1); if (ext && b.endsWith(ext) && b !== ext) b = b.slice(0, -ext.length); return b; },
    extname(p) { const b = P.basename(p); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i); },
    relative(from, to) { const f = P.resolve(from).split('/').filter(Boolean), t = P.resolve(to).split('/').filter(Boolean); let i = 0; while (i < f.length && i < t.length && f[i] === t[i]) i++; return f.slice(i).map(() => '..').concat(t.slice(i)).join('/'); },
    parse(p) { const base = P.basename(p), ext = P.extname(p); return { root: String(p).startsWith('/') ? '/' : '', dir: P.dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base }; },
    format(o) { return (o.dir ? o.dir + '/' : o.root || '') + (o.base || (o.name || '') + (o.ext || '')); },
    toNamespacedPath: p => p
  };
  P.posix = P; P.win32 = P;

  /* ---------- fs: through the preview server ---------- */
  const fdTable = new Map(); let nextFd = 10;
  const statObj = s => s && Object.assign({}, s, { mtime: new Date(s.mtimeMs), ctime: new Date(s.ctimeMs), birthtime: new Date(s.birthtimeMs), atime: new Date(s.atimeMs), isFile: () => s.isFile, isDirectory: () => s.isDirectory, isSymbolicLink: () => s.isSymbolicLink });
  const encOf = o => (typeof o === 'string' ? o : o && o.encoding);
  const pstr = p => (p instanceof URL ? decodeURIComponent(p.pathname) : String(p));
  const FS = {
    constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, O_RDONLY: 0, COPYFILE_EXCL: 1 },
    existsSync: p => { try { return fsCall('exists', pstr(p)); } catch (e) { return false; } },
    accessSync: p => { fsCall('access', pstr(p)); },
    statSync: (p, o) => { try { return statObj(fsCall('stat', pstr(p))); } catch (e) { if (o && o.throwIfNoEntry === false) return undefined; throw e; } },
    lstatSync: p => statObj(fsCall('lstat', pstr(p))),
    realpathSync: Object.assign(p => fsCall('realpath', pstr(p)), { native: p => fsCall('realpath', pstr(p)) }),
    readdirSync(p, o) {
      if (o && o.withFileTypes) return fsCall('readdir', pstr(p), true).map(e => ({ name: e.name, isFile: () => e.file, isDirectory: () => e.dir, isSymbolicLink: () => e.link }));
      return fsCall('readdir', pstr(p));
    },
    readFileSync(p, o) {
      if (typeof p === 'number') p = fdTable.get(p).path;
      const b = Buffer.from(fsCall('readFile', pstr(p)).b64, 'base64'), e = encOf(o);
      return e ? b.toString(e) : b;
    },
    writeFileSync(p, d) { fsCall('writeFile', pstr(p), toData(d)); },
    appendFileSync(p, d) { fsCall('appendFile', pstr(p), toData(d)); },
    mkdirSync(p, o) { return fsCall('mkdir', pstr(p), typeof o === 'object' ? o : {}); },
    mkdtempSync: prefix => fsCall('mkdtemp', String(prefix)),
    renameSync: (a, b) => { fsCall('rename', pstr(a), pstr(b)); },
    unlinkSync: p => { fsCall('unlink', pstr(p)); },
    rmSync: (p, o) => { fsCall('rm', pstr(p), o || {}); },
    rmdirSync: (p, o) => { fsCall('rmdir', pstr(p), o || {}); },
    copyFileSync: (a, b) => { fsCall('copyFile', pstr(a), pstr(b)); },
    cpSync: (a, b, o) => { fsCall('cp', pstr(a), pstr(b), o || {}); },
    utimesSync: (p, a, m) => { fsCall('utimes', pstr(p), +a / (a instanceof Date ? 1000 : 1), +m / (m instanceof Date ? 1000 : 1)); },
    chmodSync: p => { fsCall('chmod', pstr(p)); },
    openSync(p, flags) {
      p = pstr(p); flags = flags || 'r';
      if (/[wa]/.test(flags)) { if (/w/.test(flags)) fsCall('writeFile', p, { text: '' }); else if (!FS.existsSync(p)) fsCall('writeFile', p, { text: '' }); }
      else fsCall('access', p);
      const fd = nextFd++; fdTable.set(fd, { path: p, pos: 0, flags }); return fd;
    },
    readSync(fd, buf, off, len, pos) {
      const f = fdTable.get(fd); if (!f) throw Object.assign(new Error('EBADF: bad file descriptor'), { code: 'EBADF' });
      if (off && typeof off === 'object') ({ offset: off = 0, length: len = buf.length, position: pos = null } = off);
      off = off || 0; len = len == null ? buf.length - off : len;
      const at = pos == null ? f.pos : pos;
      const got = Buffer.from(fsCall('read', f.path, at, len).b64, 'base64');
      buf.set(got, off); if (pos == null) f.pos += got.length;
      return got.length;
    },
    writeSync(fd, d) { const f = fdTable.get(fd); fsCall('appendFile', f.path, toData(d)); return d.length; },
    fstatSync: fd => FS.statSync(fdTable.get(fd).path),
    closeSync: fd => { fdTable.delete(fd); },
    watch: () => ({ close() {}, on() { return this; } }),
    watchFile() {}, unwatchFile() {},
    createWriteStream(p, o) {
      const s = new EventEmitter(); p = pstr(p);
      if (!(o && o.flags === 'a')) fsCall('writeFile', p, { text: '' });
      s.write = (d, e, cb) => { try { fsCall('appendFile', p, toData(d)); } catch (er) { s.emit('error', er); } if (typeof e === 'function') e(); else if (cb) cb(); return true; };
      s.end = (d, cb) => { if (typeof d === 'function') { cb = d; d = null; } if (d) s.write(d); setTimeout(() => { s.emit('finish'); s.emit('close'); if (cb) cb(); }); return s; };
      s.close = cb => s.end(cb); s.destroy = () => s; s.path = p;
      return s;
    },
    createReadStream(p) {
      const s = new EventEmitter();
      setTimeout(() => { try { s.emit('data', FS.readFileSync(p)); s.emit('end'); s.emit('close'); } catch (e) { s.emit('error', e); } });
      s.pipe = d => { s.on('data', c => d.write(c)); s.on('end', () => d.end && d.end()); return d; }; s.destroy = () => s;
      return s;
    }
  };
  // the callback and promise forms, on the sync ones
  const later = (fn, args, cb) => setTimeout(() => { let r, e = null; try { r = fn.apply(FS, args); } catch (x) { e = x; } cb(e, r); });
  FS.promises = {};
  for (const n of Object.keys(FS)) {
    if (!n.endsWith('Sync')) continue;
    const base = n.slice(0, -4);
    FS[base] = (...a) => { const cb = typeof a[a.length - 1] === 'function' ? a.pop() : () => {}; if (base === 'exists') return setTimeout(() => cb(FS.existsSync(a[0]))); later(FS[n], a, cb); };
    FS.promises[base] = (...a) => new Promise((res, rej) => later(FS[n], a, (e, r) => (e ? rej(e) : res(r))));
  }
  FS.promises.constants = FS.constants;

  /* ---------- os, crypto, url, util ---------- */
  const OS = {
    homedir: () => CFG.home, tmpdir: () => CFG.tmp, platform: () => proc.platform, type: () => 'Darwin', release: () => '25.5.0', arch: () => 'arm64',
    hostname: () => 'ultra-studio-preview', EOL: '\n', cpus: () => Array.from({ length: 8 }, () => ({ model: 'Preview CPU', speed: 3200 })),
    totalmem: () => 16 * 2 ** 30, freemem: () => 8 * 2 ** 30, uptime: () => 1000, loadavg: () => [0, 0, 0],
    userInfo: () => ({ username: 'preview', homedir: CFG.home, uid: 501, gid: 20, shell: '/bin/zsh' }), networkInterfaces: () => ({})
  };
  function hasher(kind, alg, key) {
    const parts = [];
    const h = { update(d, e) { parts.push(typeof d === 'string' ? (e && e !== 'utf8' ? toData(Buffer.from(d, e)) : { text: d }) : toData(d)); return h; },
      digest(e) { const hex = fsCall(kind, ...(kind === 'hmac' ? [alg, toData(key), parts, 'hex'] : [alg, parts, 'hex'])); const b = Buffer.from(hex, 'hex'); return e ? b.toString(e) : b; } };
    return h;
  }
  const CRYPTO = {
    createHash: alg => hasher('hash', alg),
    createHmac: (alg, key) => hasher('hmac', alg, key),
    randomBytes: n => { const b = new Buffer(n); crypto.getRandomValues(b); return b; },
    randomUUID: () => crypto.randomUUID(),
    randomInt: (a, b) => (b == null ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a))),
    timingSafeEqual: (a, b) => Buffer.from(a).equals(Buffer.from(b))
  };
  const URLMOD = {
    URL, URLSearchParams,
    pathToFileURL: p => new URL('file://' + encodeURI(P.resolve(String(p))).replace(/[?#]/g, encodeURIComponent)),
    fileURLToPath: u => decodeURIComponent(new URL(String(u)).pathname),
    parse: u => { try { const x = new URL(u); return { protocol: x.protocol, host: x.host, hostname: x.hostname, port: x.port, pathname: x.pathname, path: x.pathname + x.search, search: x.search, query: x.search.slice(1), hash: x.hash, href: x.href }; } catch (e) { return { pathname: u, path: u, href: u }; } },
    format: u => (typeof u === 'string' ? u : u.href || '')
  };
  const UTIL = {
    promisify: fn => (...a) => new Promise((res, rej) => fn(...a, (e, r) => (e ? rej(e) : res(r)))),
    inspect: x => { try { return JSON.stringify(x); } catch (e) { return String(x); } },
    format: (...a) => a.map(String).join(' '), types: { isDate: x => x instanceof Date }, TextDecoder, TextEncoder,
    isDeepStrictEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  };

  /* ---------- nothing runs, nothing goes online ---------- */
  const OFF = what => Object.assign(new Error(`The preview doesn’t ${what}.`), { code: 'EPREVIEW' });
  const note = (what, detail) => console.info('[preview] refused:', what, detail || '');
  function childFail(cmd, args, opts, cb) {
    if (typeof args === 'function') { cb = args; args = []; } else if (typeof opts === 'function') { cb = opts; }
    note('run a program', cmd + ' ' + (Array.isArray(args) ? args.join(' ') : ''));
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { write() {}, end() {} }; c.kill = () => true; c.pid = 0;
    setTimeout(() => { const e = Object.assign(OFF('run programs (' + String(cmd).split(/\s/)[0] + ')'), { code: 'ENOENT' }); if (cb) cb(e, '', ''); c.emit('error', e); c.emit('close', -2); c.emit('exit', -2); });
    return c;
  }
  const CHILD = {
    exec: childFail, execFile: childFail, spawn: childFail, fork: childFail,
    execSync: cmd => { note('run a program', cmd); throw Object.assign(OFF('run programs'), { code: 'ENOENT', status: 127 }); },
    execFileSync: cmd => { note('run a program', cmd); throw Object.assign(OFF('run programs'), { code: 'ENOENT', status: 127 }); },
    spawnSync: cmd => { note('run a program', cmd); return { status: null, error: Object.assign(OFF('run programs'), { code: 'ENOENT' }), stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
  };
  function netRequest(opts, cb) {
    const where = typeof opts === 'string' ? opts : opts && (opts.href || ((opts.protocol || 'https:') + '//' + (opts.hostname || opts.host) + (opts.path || '')));
    note('go online', where);
    const r = new EventEmitter();
    r.write = () => true; r.end = () => { setTimeout(() => r.emit('error', OFF('go online (AI, Memory Box, updates and downloads are off)'))); return r; };
    r.setTimeout = () => r; r.destroy = () => r; r.abort = () => r; r.setHeader = () => {}; r.on('error', () => {});
    return r;
  }
  const NET = { request: netRequest, get: (o, a, b) => netRequest(o, typeof a === 'function' ? a : b).end(), Agent: function () {}, globalAgent: {}, STATUS_CODES: {} };
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = new URL(typeof u === 'string' ? u : u.url, location.href);
    if (url.origin === location.origin) return realFetch(u, o);
    note('go online', url.href);
    return Promise.reject(new TypeError('The preview doesn’t go online (network is off): ' + url.host));
  };
  const ZLIB = new Proxy({}, { get: (t, k) => (k === 'constants' ? {} : () => { throw OFF('unzip or zip'); }) });

  /* ---------- the editor: the preview server's stand-in (resolve/host on a sample project) ---------- */
  async function editor(fn, args) {
    const r = await realFetch('/__preview/host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn, args }) });
    return r.json();
  }
  // Resolve: the plugin's IPC (resolve/plugin/main.js)
  const ipcRenderer = Object.assign(new EventEmitter(), {
    async invoke(ch, ...a) {
      if (ch === 'ultra-studio:load') { const l = await editor('listFns', {}); return { ok: true, modules: (l.data || []).length }; }
      if (ch === 'ultra-studio:run') return editor(a[0], a[1]);
      return null;
    },
    send(ch) { note('ask the plugin', ch); },
    sendSync(ch) { note('ask the plugin', ch); return ch === 'ultra-studio:open-dialog' ? [] : null; }
  });
  const ELECTRON = { ipcRenderer, shell: { openExternal: u => { note('open a link', u); return Promise.resolve(); }, openPath: p => { note('open a file', p); return Promise.resolve(''); }, showItemInFolder: p => note('show a file', p) }, webUtils: { getPathForFile: f => f.path || '' } };

  // Premiere: CEP's evalScript – loading the jsx is a no-op, UStudio.run(fn, args) goes to the stand-in
  if (APP === 'resolve') window.__ULTRA_RESOLVE__ = true;
  else {
    window.__adobe_cep__ = {
      evalScript(script, cb) {
        cb = cb || (() => {});
        const m = /^UStudio\.run\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)$/s.exec(script);
        if (m) { let fn, args; try { fn = JSON.parse(m[1]); args = JSON.parse(JSON.parse(m[2])); } catch (e) { return setTimeout(() => cb('EvalScript error.')); }
          editor(fn, args).then(r => {
            // a Premiere-only command the stand-in doesn't have: say so plainly rather than as a crash
            if (r && !r.ok && /Unknown Resolve command/.test((r.error && r.error.detail) || '')) r = { ok: false, error: { code: 'HOST_SCRIPT', title: 'The preview’s pretend Premiere can’t do that.', action: 'Try it in Premiere.', detail: fn + ' is a Premiere-only command' } };
            cb(JSON.stringify(r));
          }, e => cb(JSON.stringify({ ok: false, error: { code: 'HOST_SCRIPT', detail: String(e) } })));
          return;
        }
        if (/^try \{\n/.test(script)) return setTimeout(() => cb('ok'));          // loading jsx/*.jsx
        if (script === 'Folder.myDocuments.fsName') return setTimeout(() => cb(CFG.home + '/Documents'));
        setTimeout(() => cb('EvalScript error.'));
      },
      getHostEnvironment: () => JSON.stringify({ appName: 'PPRO', appVersion: '25.0', appLocale: 'en_GB', appUILocale: 'en_GB', appId: 'PPRO', isAppOnline: false, appSkinInfo: { baseFontFamily: 'system', baseFontSize: 10, panelBackgroundColor: { color: { red: 35, green: 35, blue: 35, alpha: 255 } }, appBarBackgroundColor: { color: { red: 30, green: 30, blue: 30, alpha: 255 } } } }),
      getExtensionId: () => 'com.jmgphotography.ultrastudio.panel',
      getSystemPath: () => CFG.root,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, closeExtension() {}, requestOpenExtension() {}, invokeSync: () => '', invokeAsync() {},
      getCurrentApiVersion: () => JSON.stringify({ major: 11, minor: 0, micro: 0 }), getNetworkPreferences: () => '{}', getScaleFactor: () => 1
    };
    window.cep = {
      fs: { showOpenDialogEx: () => { note('choose a file'); return { err: 0, data: [] }; }, showSaveDialogEx: () => ({ err: 0, data: '' }) },
      util: { openURLInDefaultBrowser: u => note('open a link', u) },
      process: { createProcess: () => ({ err: 1 }) }
    };
  }

  /* ---------- file:// pictures and sound: served by the preview server (a browser won't load file:// from http) ---------- */
  const fileToHttp = u => (typeof u === 'string' && /^file:\/\//i.test(u) ? location.origin + new URL(u).pathname : u);
  for (const C of [HTMLImageElement, HTMLMediaElement, HTMLSourceElement]) {
    const d = Object.getOwnPropertyDescriptor(C.prototype, 'src');
    if (d && d.set) Object.defineProperty(C.prototype, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { d.set.call(this, fileToHttp(v)); } });
  }
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { return setAttr.call(this, n, (n === 'src' || n === 'href') ? fileToHttp(v) : v); };
  function openLink(u) { if (/^file:\/\//i.test(u)) window.open(fileToHttp(u), '_blank'); else note('open a link', u); }
  if (window.cep) window.cep.util.openURLInDefaultBrowser = openLink;
  ELECTRON.shell.openExternal = u => { openLink(u); return Promise.resolve(); };

  /* ---------- require ---------- */
  const MODULES = { fs: FS, 'fs/promises': FS.promises, path: P, os: OS, crypto: CRYPTO, url: URLMOD, util: UTIL, events: Object.assign(EventEmitter, { EventEmitter }), child_process: CHILD, http: NET, https: NET, zlib: ZLIB, electron: ELECTRON, buffer: { Buffer }, stream: { Readable: EventEmitter, Writable: EventEmitter, PassThrough: EventEmitter, Transform: EventEmitter } };
  window.require = name => {
    const n = String(name).replace(/^node:/, '');
    if (MODULES[n]) return MODULES[n];
    const e = new Error(`Cannot find module '${name}' (not in the preview)`); e.code = 'MODULE_NOT_FOUND'; throw e;
  };
  window.process = proc;
  window.Buffer = Buffer;
  window.global = window;

  /* ---------- once the panel has started: sample interviews in Story, so it has something to show ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const US = window.US; if (!US || !US.bus) return;
    // the panel's own error lines (activity log) count as errors in the preview's top bar too
    US.bus.on('log', e => { if (e && e.level === 'error') report(e.text + (e.detail ? '\n' + e.detail : '')); });
    US.bus.on('ready', async () => {
      try {
        const S = US.story, T = US.transcript; if (!S || !T || !S.loadState) return;
        const st = S.loadState();
        if (st && st.transcripts && st.transcripts.length) return;
        const dir = CFG.root + '/dev/test-media/transcripts';
        for (const f of ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv']) {
          if (!FS.existsSync(dir + '/' + f)) continue;
          S.addTranscript({ name: f.replace(/\.[a-z]+$/, ''), path: CFG.media + '/interview/' + f.replace(/\.[a-z]+$/, '') + '.mp4', source: 'file', file: dir + '/' + f, segments: T.parseFile(dir + '/' + f).segments });
        }
        try { await US.actions.get('story.themes').run({ useAI: false }, US.jobs.testJob()); } catch (e) { console.info('[preview] sample themes not made:', e.message); }
        if (S.save) S.save();
        console.info('[preview] sample interviews added to Story');
      } catch (e) { console.info('[preview] sample interviews not added:', e && e.message); }
    });
  });

  // live reload when the panel is opened on its own (in the preview page, the top bar reloads it)
  if (window.parent === window) {
    try { const es = new EventSource('/__preview/events'); es.addEventListener('reload', () => location.reload()); } catch (e) { /* no live reload */ }
  }
})();
