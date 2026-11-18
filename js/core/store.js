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
    setDocumentsDir(d) { if (d && fs.existsSync(d)) documentsDir = d; },
    /** A folder as people say it: "Documents › JMG Ultra Studio › Downloads", "Home › Movies", else the path itself. */
    pretty(p) {
      if (!p) return '';
      const docs = documentsDir || path.join(os.homedir(), 'Documents'), home = os.homedir();
      const under = (base, name) => { const rel = path.relative(base, p); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? [name].concat(rel.split(path.sep).filter(Boolean)).join(' › ') : p === base ? name : null; };
      return under(docs, 'Documents') || under(home, 'Home') || p;
    }
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

  /* ---------- per-project state (e.g. markers we created, Memory Box, layer colours, the project's own choices) ----------
     Kept on this computer and – like Story – in the project's "JMG Ultra Studio" folder (next to the .prproj; for
     Resolve next to the project's media, where Story's copy is), so the project opened on another computer has it.
     Each value carries when it was last changed; the two copies are merged value by value, the newer one winning. */
  const PROJECT_FOLDER = 'JMG Ultra Studio';
  // about this computer only: which copy of Story it last saw, where it found the project's folder
  const LOCAL_ONLY = new Set(['storySync', 'storyFolder', 'folderChosen', 'projectPath', 'created']);
  const safeName = s => String(s || 'Project').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '') || 'Project';
  /** The shared copy for a project whose Story base is base ("<folder>/<project name>", or the .prproj itself). */
  const sharedProjectFile = base => path.join(path.dirname(base), PROJECT_FOLDER, safeName(path.basename(base).replace(/\.prproj$/i, '')) + ' – Project.json');
  const README = [
    'JMG Ultra Studio keeps its work for this project in this folder, so the project opened on another computer',
    '(Mac or PC) has it all: transcripts, themes, the Story wiki, narratives, Find searches, Ask answers, markers it',
    'added, Memory Box and your choices. Nothing is made again and no AI is paid for twice.',
    '',
    '  <project> – Story.json     Story: transcripts, themes, board, wiki, searches, answers',
    '  <project> – Project.json   the other tools',
    '',
    'Keep this folder with the project when you copy or move it. Don’t edit the files by hand.',
    'Backups from two computers changing Story at once are named “(backup from …)”.',
    ''
  ].join(require('os').EOL);
  const travels = k => k[0] !== '_' && !LOCAL_ONLY.has(k);
  const withProjectOn = () => !US.settings || US.settings.get('story.withProject', true) !== false;
  // one store per project: a second one read straight after a change would miss it (saving waits 250 ms)
  const projectStores = new Map();
  US.projectStore = function (projectPath) {
    const file = path.join(dataDir, 'projects', hash(projectPath || 'none') + '.json');
    if (projectStores.has(file)) return projectStores.get(file);
    let data = readJSON(file, { projectPath, created: Date.now() });
    if (!data._at || typeof data._at !== 'object') data._at = {};
    const save = US.debounce(() => writeJSON(file, data), 250);
    let shared = '', failed = false;
    /** Take the newer values from the shared copy. -> true when something changed here. */
    function mergeShared() {
      const s = shared ? readJSON(shared, null) : null;
      if (!s || typeof s !== 'object') return false;
      const at = (s._at && typeof s._at === 'object') ? s._at : {};
      let changed = false;
      for (const k of Object.keys(s)) {
        if (!travels(k)) continue;
        if ((Number(at[k]) || 0) > (Number(data._at[k]) || 0)) { data[k] = s[k]; data._at[k] = Number(at[k]); changed = true; }
      }
      return changed;
    }
    function writeShared() {
      if (!shared || !withProjectOn()) return;
      try {
        mergeShared();   // another computer may have changed other values meanwhile
        const keys = Object.keys(data).filter(travels);
        if (!keys.length && !fsx.exists(shared)) return;
        const out = { _about: 'JMG Ultra Studio – what its tools keep for this project (markers they added, Memory Box, layer colours, your choices). Story is in the “– Story.json” file. Kept here so the project opened on another computer has them.', _at: {} };
        for (const k of keys) { out[k] = data[k]; out._at[k] = Number(data._at[k]) || 0; }
        writeJSON(shared, out);
        writeJSON(file, data);
        failed = false;
      } catch (e) {
        if (!failed && US.log) US.log('warn', 'Couldn’t save this project’s Ultra Studio data next to the project – it’s kept on this computer', `${shared}\n${e.message}`, 'project');
        failed = true;
      }
    }
    const saveShared = US.debounce(writeShared, 2000);
    const st = {
      get(k, d) { return k in data ? data[k] : d; },
      set(k, v) { data[k] = v; data._at[k] = Date.now(); save(); if (shared && travels(k)) saveShared(); },
      flush() { writeJSON(file, data); if (shared) writeShared(); },
      /** Keep this project's data in its folder too (sharedFile: "<folder>/JMG Ultra Studio/<name> – Project.json"). */
      attach(sharedFile) {
        if (!sharedFile || sharedFile === shared || !withProjectOn()) return st;
        shared = sharedFile;
        // the folder is made as soon as the project is open, with a note saying what it is
        try {
          const readme = path.join(path.dirname(shared), 'Read me.txt');
          if (!fsx.exists(readme)) { ensureDir(path.dirname(shared)); fs.writeFileSync(readme, README); }
        } catch (e) { /* a read-only drive: kept on this computer */ }
        if (mergeShared()) { writeJSON(file, data); if (US.bus) US.bus.emit('project-store', projectPath); }
        if (Object.keys(data).some(travels)) saveShared();
        return st;
      },
      sharedFile: () => shared
    };
    projectStores.set(file, st);
    // Premiere: the project is a file, so its folder is known now (Resolve: Story attaches it when it knows the folder)
    if (/\.prproj$/i.test(String(projectPath || ''))) st.attach(sharedProjectFile(projectPath));
    return st;
  };
  US.projectStore.sharedFile = sharedProjectFile;
  US.projectStore.FOLDER = PROJECT_FOLDER;

  /* ---------- Resolve: the project's folder ----------
     A Resolve project lives in a database, so its "JMG Ultra Studio" folder goes next to its media (storyProjectFile in
     resolve/host/story.js guesses it). It's found as soon as the project opens – not only when Story asks – and the
     person can choose it on Home (Choose the project's folder…): remembered for that project on this computer
     (storyFolder, with folderChosen), and Story follows it ('project-folder' on US.bus). Premiere: the .prproj's folder,
     attached by US.projectStore itself; nothing here runs. */
  const isResolve = () => !!(US.app && US.app.is && US.app.is('resolve'));
  const folderAsks = new Map(), folderAnswers = new Map();   // project -> the pending question / the last answer
  const openIdent = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
  US.projectFolder = {
    /** Where this Resolve project's folder is, attached to its store. again: ask Resolve again (after a choice).
        -> Promise<{folder, path, found, reason, chosen}> (rejects when Resolve couldn't answer; asked again next time) */
    ask(ident = openIdent(), { again = false } = {}) {
      if (!ident || !isResolve()) return Promise.resolve(null);
      if (!again && folderAsks.has(ident)) return folderAsks.get(ident);
      const st = US.projectStore(ident);
      const p = US.host.call('storyProjectFile', { prefer: st.get('storyFolder', '') || undefined }).then(r => {
        r = r || {};
        if (r.folder && r.folder !== st.get('storyFolder', '')) { st.set('storyFolder', r.folder); st.set('folderChosen', false); }   // so it doesn't move
        if (r.path) st.attach(sharedProjectFile(r.path));
        const out = Object.assign({}, r, { chosen: !!(r.folder && st.get('folderChosen', false)) });
        folderAnswers.set(ident, out);
        if (US.bus) US.bus.emit('project-folder', Object.assign({ ident }, out));
        return out;
      }, e => {
        if (folderAsks.get(ident) === p) folderAsks.delete(ident);
        throw e;
      });
      folderAsks.set(ident, p);
      return p;
    },
    /** The last answer for a project (null until Resolve has answered). */
    known(ident = openIdent()) { return folderAnswers.get(ident) || null; },
    /** The person chose the folder (Home): remembered for this project, and everything moves there. */
    choose(folder, ident = openIdent()) {
      if (!ident || !folder || !isResolve()) return Promise.resolve(null);
      const st = US.projectStore(ident);
      st.set('storyFolder', folder); st.set('folderChosen', true);
      return US.projectFolder.ask(ident, { again: true });
    }
  };
  // as soon as a Resolve project is open (and again whenever another one is)
  let lastFolderIdent = '';
  if (US.bus) US.bus.on('context', () => {
    const ident = openIdent();
    if (!isResolve() || !ident || ident === lastFolderIdent) return;
    lastFolderIdent = ident;
    US.projectFolder.ask(ident).catch(e => { lastFolderIdent = ''; if (US.log) US.log('warn', 'Couldn’t find this project’s folder in Resolve – its Ultra Studio data is kept on this computer for now', (US.errors && US.errors.explain(e).detail) || String(e && e.message || e), 'project'); });
  });

  /** The open project's own choices (a script typed in, crops per person…): they travel with the project. Until a
      project has its own, the value last used anywhere is the starting point. */
  const curProject = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || 'none';
  US.projectSettings = {
    get(key, def) { const v = US.projectStore(curProject()).get('set.' + key); return v !== undefined ? v : (US.settings ? US.settings.get(key, def) : def); },
    set(key, val) { US.projectStore(curProject()).set('set.' + key, val); if (US.settings) US.settings.set(key, val); }
  };
})();
