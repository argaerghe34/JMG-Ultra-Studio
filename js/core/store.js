/* JMG Ultra Studio – files on disk: settings, per-media analysis cache, temp files. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

  const isWin = process.platform === 'win32';
  let documentsDir = null;
  const dataDir = isWin
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'JMG Ultra Studio')
    : path.join(os.homedir(), 'Library', 'Application Support', 'JMG Ultra Studio');
  // Windows: the big files (analysis copies, rendered sound, stills) stay out of the Roaming profile, which syncs at logon
  const bulkDir = isWin
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'JMG Ultra Studio')
    : dataDir;

  function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }
  /** Rename, trying again briefly on Windows when antivirus, OneDrive or Media Encoder still holds the file. */
  function renameRetry(from, to) {
    for (let k = 0; ; k++) {
      try { fs.renameSync(from, to); return; } catch (e) {
        if (k >= 5 || !/^(EPERM|EBUSY|EACCES)$/.test(e.code)) throw e;
        const until = Date.now() + 40 * (k + 1); while (Date.now() < until) { /* wait */ }
      }
    }
  }
  function readJSON(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
  }
  /** Write atomically so a crash never leaves half a file. */
  function writeJSON(file, data) {
    ensureDir(path.dirname(file));
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    renameRetry(tmp, file);
  }
  function hash(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

  /** Key for a media file that changes when the file changes. */
  function mediaKey(file) {
    try { const st = fs.statSync(file); return hash(file + '|' + st.size + '|' + st.mtimeMs); }
    catch (e) { return hash(file); }
  }

  const fsx = (US.fsx = {
    fs, path, os, isWin, dataDir, ensureDir, readJSON, writeJSON, renameRetry, hash, mediaKey,
    exists: f => { try { fs.accessSync(f); return true; } catch (e) { return false; } },
    size: f => { try { return fs.statSync(f).size; } catch (e) { return 0; } },
    cacheDir: () => ensureDir(path.join(bulkDir, 'cache')),
    tempDir: () => ensureDir(path.join(bulkDir, 'temp')),
    logDir: () => ensureDir(path.join(dataDir, 'logs')),
    // Windows: the Documents folder Explorer shows (OneDrive often moves it), told by Premiere at start-up
    exportsDir: () => ensureDir(path.join(documentsDir || path.join(os.homedir(), 'Documents'), 'JMG Ultra Studio')),
    setDocumentsDir(d) { if (d && fs.existsSync(d)) documentsDir = d; }
  });

  /** Clear temp files older than two days at start-up. */
  fsx.cleanTemp = function () {
    try {
      const dir = fsx.tempDir(), cutoff = Date.now() - 2 * 86400e3;
      for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* in use */ } }
    } catch (e) { /* ignore */ }
  };

  /* ---------- settings ---------- */
  const settingsFile = path.join(dataDir, 'settings.json');
  let settings = readJSON(settingsFile, {});
  const saveSettings = US.debounce(() => { try { writeJSON(settingsFile, settings); } catch (e) { console.error(e); } }, 300);
  US.settings = {
    get(key, def) { return key in settings ? settings[key] : def; },
    set(key, val) { settings[key] = val; saveSettings(); US.bus.emit('settings', key, val); },
    all() { return settings; },
    /** Write now rather than in a moment (before the panel reloads or closes). */
    flush() { try { writeJSON(settingsFile, settings); } catch (e) { console.error(e); } }
  };
  window.addEventListener('beforeunload', () => US.settings.flush());

  /* ---------- analysis cache (per media file, per kind) ---------- */
  US.cache = {
    file(kind, key) { return path.join(fsx.cacheDir(), kind, key + '.json'); },
    get(kind, key) { return readJSON(this.file(kind, key), null); },
    set(kind, key, data) { writeJSON(this.file(kind, key), data); return data; },
    /** cached(kind, mediaPath, version, compute) – recompute when the file or algorithm version changes */
    async cached(kind, mediaPath, version, compute) {
      const key = mediaKey(mediaPath) + '-v' + version;
      const hit = this.get(kind, key);
      if (hit) return hit;
      const val = await compute();
      if (val) this.set(kind, key, val);
      return val;
    }
  };

  /* ---------- per-project state (e.g. markers we created, StoryWall boards) ---------- */
  // one store per project: a second one read straight after a change would miss it (saving waits 250 ms)
  const projectStores = new Map();
  US.projectStore = function (projectPath) {
    const file = path.join(dataDir, 'projects', hash(projectPath || 'none') + '.json');
    if (projectStores.has(file)) return projectStores.get(file);
    let data = readJSON(file, { projectPath, created: Date.now() });
    const save = US.debounce(() => writeJSON(file, data), 250);
    const st = {
      get(k, d) { return k in data ? data[k] : d; },
      set(k, v) { data[k] = v; save(); },
      flush() { writeJSON(file, data); }
    };
    projectStores.set(file, st);
    return st;
  };
})();
