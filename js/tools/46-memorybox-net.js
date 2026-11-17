/* JMG Ultra Studio – Memory Box: the connection to Memory Box (its read-only editor API) and team downloads on disk.
   Ultra Studio only ever reads from Memory Box: the list of families, a family's memorybox.json, and the original
   files, which are saved on this computer. Nothing is sent to Memory Box but the request itself and the access key,
   and nothing (no photo, video, voice note or face) goes to any AI.
   API (Memory Box, prefix /api/editor/v1, header "Authorization: Bearer <key>"):
     GET /me · GET /families · GET /families/:id/memorybox.json (ETag) · GET /items/:id/original · GET /items/:id/voice-note */
(function () {
  'use strict';
  const US = window.US, MB = US.memoryBox;
  const fs = require('fs'), path = require('path'), crypto = require('crypto');
  const API = '/api/editor/v1';

  /* ---------- the connection (address in settings, access key with the other keys, on this computer only) ---------- */
  const conn = () => ({ url: String(US.settings.get('memoryBoxUrl', '') || '').trim().replace(/\/+$/, ''), key: US.secrets ? US.secrets.get('memoryBoxKey') : '' });
  function setConn(url, key) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    US.settings.set('memoryBoxUrl', url);
    if (key !== undefined && US.secrets) US.secrets.set('memoryBoxKey', String(key || '').trim());
    return conn();
  }
  const connected = () => { const c = conn(); return !!(c.url && c.key); };
  /** The address must be https, except on this computer (Memory Box running locally for testing). */
  const isLocal = host => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(localhost|test)$/.test(host);
  function checkUrl(u) {
    let p; try { p = new URL(u); } catch (e) { throw new US.UserError('BAD_INPUT', { title: 'That Memory Box address doesn’t look right.', action: 'Copy it from your browser, e.g. https://memorybox.example.com' }); }
    const local = isLocal(p.hostname);
    if (p.protocol !== 'https:' && !(p.protocol === 'http:' && local)) throw new US.UserError('BAD_INPUT', { title: 'Memory Box’s address must start with https://', action: 'Copy the address from your browser.' });
    return p;
  }

  const plainError = (status, detail) => {
    if (status === 401) return new US.UserError('MEMORY_BOX', { title: 'Memory Box didn’t accept the access key.', action: 'Make a new key in Memory Box (Settings › Editing programs) and paste it in Memory Box › Connection.', detail });
    if (status === 403) return new US.UserError('MEMORY_BOX', { title: 'This access key can’t open that family.', action: 'Ask an admin for a key with access to every family.', detail });
    if (status === 404) return new US.UserError('MEMORY_BOX', { title: 'Memory Box doesn’t have that any more.', action: 'Press Check for updates; it may have been deleted or moved.', detail });
    if (status === 429) return new US.UserError('MEMORY_BOX', { title: 'Memory Box is busy.', action: 'Wait a minute, then try again.', detail });
    return new US.UserError('MEMORY_BOX', { detail });
  };

  /**
   * One request. Redirects are followed (a file usually comes from a signed storage address), but the access key is
   * only ever sent to Memory Box's own address. -> {status, headers, body (Buffer) | stream when opts.stream}
   */
  function request(u, { key, headers = {}, stream = false, timeout = 30000, hops = 0, origin } = {}) {
    return new Promise((resolve, reject) => {
      const p = new URL(u), mod = p.protocol === 'http:' ? require('http') : require('https');
      origin = origin || p.origin;
      const h = Object.assign({ 'User-Agent': 'JMG-Ultra-Studio/' + (US.version || ''), Accept: 'application/json, */*' }, headers);
      for (const k of Object.keys(h)) if (h[k] == null) delete h[k];
      if (key && p.origin === origin) h.Authorization = 'Bearer ' + key;
      const req = mod.request(p, { method: 'GET', headers: h }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (hops >= 5) return reject(new US.UserError('MEMORY_BOX', { detail: 'Too many redirects: ' + u }));
          const next = new URL(res.headers.location, u).href;
          if (!/^https:/.test(next) && !(/^http:/.test(next) && isLocal(new URL(next).hostname))) return reject(new US.UserError('MEMORY_BOX', { detail: 'Redirected to an address that isn’t https: ' + next }));
          return resolve(request(next, { key, headers: Object.assign({}, headers, { 'If-None-Match': null }), stream, timeout, hops: hops + 1, origin }));
        }
        if (stream && res.statusCode >= 200 && res.statusCode < 300) return resolve({ status: res.statusCode, headers: res.headers, stream: res });
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.setTimeout(timeout, () => req.destroy(new Error('No answer from Memory Box in ' + Math.round(timeout / 1000) + ' s')));
      req.on('error', e => reject(e instanceof US.UserError ? e : new US.UserError('MEMORY_BOX', { detail: e.message })));
      req.end();
    });
  }

  async function getJSON(pathname, { etag } = {}) {
    const c = conn();
    if (!c.url || !c.key) throw new US.UserError('MEMORY_BOX', { title: 'Memory Box isn’t connected yet.', action: 'Add Memory Box’s address and an access key in Memory Box › Connection.' });
    checkUrl(c.url);
    const r = await request(c.url + API + pathname, { key: c.key, headers: etag ? { 'If-None-Match': etag } : {} });
    if (r.status === 304) return { notModified: true, etag };
    if (r.status < 200 || r.status >= 300) throw plainError(r.status, `${r.status} from ${pathname}: ${String(r.body || '').slice(0, 300)}`);
    let data; try { data = JSON.parse(String(r.body).replace(/^﻿/, '')); } catch (e) { throw new US.UserError('MEMORY_BOX', { title: 'Memory Box gave an answer Ultra Studio can’t read.', action: 'Check the address is Memory Box itself (not a login page), then try again.', detail: e.message }); }
    return { data, etag: r.headers.etag || '' };
  }

  /** "Test connection": who Memory Box says we are. */
  const me = async () => (await getJSON('/me')).data;
  /** Every family the key can open: [{id, name, items, photos, videos, lastUploadAt, updatedAt, portalUrl}] */
  async function families() {
    const d = (await getJSON('/families')).data;
    const list = Array.isArray(d) ? d : (d && d.families) || [];
    return list.filter(f => f && f.id).map(f => ({ id: String(f.id), name: String(f.name || 'Family'), items: Number(f.items) || 0, photos: Number(f.photos) || 0, videos: Number(f.videos) || 0, lastUploadAt: f.lastUploadAt || '', updatedAt: f.updatedAt || '', portalUrl: f.portalUrl || '' }));
  }
  /** A family's memorybox.json -> {json, etag} or {notModified} when nothing changed since etag. */
  async function family(id, { etag, privateNotes = false } = {}) {
    const q = privateNotes ? '?privateNotes=1' : '';
    const r = await getJSON(`/families/${encodeURIComponent(id)}/memorybox.json${q}`, { etag });
    return r.notModified ? { notModified: true, etag } : { json: r.data, etag: r.etag };
  }

  /**
   * Save one file from Memory Box at dest: written to "<dest>.part" and only renamed when its size (and sha256, when
   * Memory Box gives one) are right, so a stopped download never leaves a broken file in the folder.
   */
  async function downloadFile(itemId, voice, dest, { bytes = null, sha256 = null, onBytes, job } = {}) {
    const c = conn(); checkUrl(c.url);
    const r = await request(`${c.url}${API}/items/${encodeURIComponent(itemId)}/${voice ? 'voice-note' : 'original'}`, { key: c.key, stream: true, timeout: 120000 });
    if (!r.stream) throw plainError(r.status, `${r.status} downloading ${itemId}${voice ? ' (voice note)' : ''}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const part = dest + '.part', out = fs.createWriteStream(part), hash = crypto.createHash('sha256');
    let got = 0;
    await new Promise((resolve, reject) => {
      r.stream.on('data', ch => {
        got += ch.length; hash.update(ch);
        if (onBytes) onBytes(ch.length);
        if (job && job.cancelled) r.stream.destroy(new US.UserError('CANCELLED'));
      });
      r.stream.on('error', e => { out.destroy(); reject(e); });
      out.on('error', e => reject(new US.UserError('DISK', { detail: e.message })));
      out.on('finish', resolve);
      r.stream.pipe(out);
    }).catch(e => { try { fs.unlinkSync(part); } catch (x) { /* already gone */ } throw e instanceof US.UserError ? e : new US.UserError('MEMORY_BOX', { title: 'A download from Memory Box stopped part-way.', action: 'Try again: files already saved are kept.', detail: e.message }); });
    if ((bytes && got !== bytes) || (sha256 && !voice && hash.digest('hex') !== String(sha256).toLowerCase())) {
      try { fs.unlinkSync(part); } catch (x) { /* gone */ }
      throw new US.UserError('MEMORY_BOX', { title: 'A file from Memory Box didn’t arrive whole.', action: 'Try again.', detail: `${itemId}: ${got} bytes${bytes ? ' of ' + bytes : ''}` });
    }
    fs.renameSync(part, dest);
    return { bytes: got };
  }

  /** Is the file already here? Same size as Memory Box says (any size when it doesn't say). */
  function haveFile(p, bytes) { try { const st = fs.statSync(p); return st.isFile() && st.size > 0 && (!bytes || st.size === bytes); } catch (e) { return false; } }

  /**
   * Make sure the originals (and voice notes) of these items are on this computer: those already in the folder are
   * left alone (no second copy); the rest are downloaded. Works from a source:
   *   {kind:'online', folder}  – saved under <folder>/<family>/<path>
   *   {kind:'folder', root}    – a team download already on disk: used where it is, nothing copied.
   * -> {downloaded, already, missing: [{item, why}], bytes}
   */
  async function ensureLocal(model, items, source, { voiceNotes = true, job } = {}) {
    const out = { downloaded: 0, already: 0, missing: [], bytes: 0 };
    const todo = [];
    for (const it of items) {
      if (it.type === 'other' || !it.path) continue;
      const files = [{ voice: false, rel: it.path, bytes: it.bytes, sha256: it.sha256 }];
      if (voiceNotes && it.voice) files.push({ voice: true, rel: it.voice, bytes: null, sha256: null });
      for (const f of files) {
        const dest = local(model, source, f.rel);
        if (haveFile(dest, f.bytes)) { out.already++; continue; }
        if (source.kind !== 'online') { out.missing.push({ item: it.id, name: it.originalName, why: f.voice ? 'voice note not in this download' : 'not in this download (another ZIP part?)' }); continue; }
        todo.push(Object.assign({ it, dest }, f));
      }
    }
    const total = todo.reduce((s, f) => s + (f.bytes || 0), 0) || 1;
    let done = 0;
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i];
      if (job) { job.check(); job.progress(Math.min(0.99, done / total), `Downloading ${i + 1} of ${todo.length} · ${f.it.originalName}${f.voice ? ' (voice note)' : ''}`); }
      try {
        const r = await downloadFile(f.it.id, f.voice, f.dest, { bytes: f.bytes, sha256: f.sha256, job, onBytes: n => { done += n; } });
        out.downloaded++; out.bytes += r.bytes;
      } catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        if (e && /access key|busy/i.test(e.title || '')) throw e;    // no point going on
        out.missing.push({ item: f.it.id, name: f.it.originalName, why: (e && e.title) || 'download failed' });
        US.log('warn', `Memory Box: ${f.it.originalName} not downloaded`, (e && (e.detail || e.message)) || '', 'memorybox');
      }
    }
    return out;
  }
  /** The file on this computer for a path in Memory Box. */
  function local(model, source, rel) {
    return source.kind === 'online' ? MB.localPath(source.folder, model, rel) : path.join(source.root, ...String(rel).split('/'));
  }

  /* ---------- a team download already on disk (a folder, or the ZIP parts) ---------- */
  const run = (cmd, args) => new Promise((resolve, reject) => require('child_process').execFile(cmd, args, { maxBuffer: 1 << 24, windowsHide: true }, (e, so, se) => (e ? reject(Object.assign(e, { stderr: String(se || '') })) : resolve(String(so || '')))));
  async function unzip(zip, dir) {
    fs.mkdirSync(dir, { recursive: true });
    if (US.fsx.isWin) { try { await run('tar', ['-xf', zip, '-C', dir]); } catch (e) { await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`]); } }
    else await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  }
  /** memorybox.json in dir, or in the one folder inside it (a ZIP that holds a folder). */
  function findJson(dir) {
    const direct = path.join(dir, 'memorybox.json');
    if (fs.existsSync(direct)) return direct;
    let subs = []; try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== '__MACOSX'); } catch (e) { return ''; }
    for (const d of subs) { const p = path.join(dir, d.name, 'memorybox.json'); if (fs.existsSync(p)) return p; }
    return '';
  }
  /** "Adams family - part 2 of 3.zip" -> "Adams family" (the folder all the parts are unzipped into). */
  const zipBase = f => path.basename(f).replace(/\.zip$/i, '').replace(/[\s_-]*(\(?\s*part\s*\d+(\s*of\s*\d+)?\s*\)?|\d+\s*of\s*\d+)$/i, '').trim() || 'Memory Box download';
  /**
   * Open a team download: a folder (unzipped), or one or more ZIP parts, which are unzipped together into a folder
   * next to them (once: an earlier unzip with the same files is reused). -> {json (text), root}
   */
  async function openDownload(paths, { job } = {}) {
    paths = [].concat(paths).filter(Boolean).map(US.normPath);
    if (!paths.length) throw new US.UserError('BAD_INPUT', { title: 'Choose a Memory Box download first.' });
    let root;
    if (paths.length === 1 && fs.existsSync(paths[0]) && fs.statSync(paths[0]).isDirectory()) root = paths[0];
    else {
      const zips = paths.filter(p => /\.zip$/i.test(p));
      if (!zips.length) throw new US.UserError('BAD_INPUT', { title: 'That isn’t a Memory Box download.', action: 'Choose the folder you unzipped, or the ZIP parts.' });
      root = path.join(path.dirname(zips[0]), zipBase(zips[0]));
      for (let i = 0; i < zips.length; i++) {
        const mark = path.join(root, '.unzipped-' + US.fsx.hash(path.basename(zips[i]) + '|' + US.fsx.size(zips[i])));
        if (fs.existsSync(mark)) continue;
        if (job) { job.check(); job.progress(i / zips.length, `Unzipping ${path.basename(zips[i])}`); }
        try { await unzip(zips[i], root); } catch (e) { throw new US.UserError('DISK', { title: `Couldn’t unzip ${path.basename(zips[i])}.`, action: 'Check there’s free disk space, or unzip it yourself and choose the folder.', detail: e.stderr || e.message }); }
        try { fs.writeFileSync(mark, new Date().toISOString()); } catch (e) { /* only saves time next time */ }
      }
    }
    const jf = findJson(root);
    if (!jf) throw new US.UserError('BAD_INPUT', { title: 'There’s no memorybox.json in that download.', action: 'Download it again from Memory Box (version 1.3.3 or later adds it).' });
    return { json: fs.readFileSync(jf, 'utf8'), root: path.dirname(jf) };
  }

  Object.assign(MB, { net: { API, conn, setConn, connected, checkUrl, request, me, families, family, downloadFile, ensureLocal, local, haveFile, openDownload, findJson, zipBase } });
})();
