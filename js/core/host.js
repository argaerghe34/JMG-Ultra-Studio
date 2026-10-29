/* JMG Ultra Studio – talking to Premiere (ExtendScript) and turning every failure into plain English. */
(function () {
  'use strict';
  const US = window.US;

  /* ---------- plain-English errors ---------- */
  const CATALOG = {
    NO_PROJECT: ['No project is open.', 'Open or create a project in Premiere, then try again.'],
    NO_SEQUENCE: ['There’s no active sequence.', 'Click into a sequence in the Timeline, then try again.'],
    NO_SELECTION: ['Nothing is selected.', 'Select clips in the Project panel or pick a bin, then try again.'],
    NOT_FOUND: ['That item isn’t in the project any more.', 'It may have been deleted. Press Refresh and pick it again.'],
    OFFLINE: ['Can’t find the media file.', 'Is its drive connected? If the file moved, relink it in Premiere, then try again.'],
    CANT_DECODE: ['This clip’s format can’t be read for analysis.', 'Create H.264 proxies for it in Premiere (right-click › Proxy › Create Proxies), then try again.'],
    NO_VIDEO: ['This item has no picture to analyse.', 'Pick video clips rather than audio, stills or sequences.'],
    NO_AUDIO: ['This item has no sound to analyse.', 'Pick a clip or sequence that has audio.'],
    RENDER_FAILED: ['Premiere couldn’t render the sound for analysis.', 'Check the clip plays in Premiere, then try again.'],
    PRESET_MISSING: ['A Premiere export preset is missing.', 'Reinstall or update Premiere Pro, then try again.'],
    HOST_TIMEOUT: ['Premiere didn’t answer in time.', 'If a dialog is open in Premiere, close it, then try again.'],
    HOST_SCRIPT: ['Premiere refused a command.', 'Try again. If it keeps happening, send the activity log to support.'],
    DISK: ['Couldn’t save a file.', 'Check there’s free disk space and that the folder isn’t read-only.'],
    AI_KEY: ['No AI key is set up.', 'Add a key in Settings, or use the built-in commands, which need no key.'],
    AI_FAILED: ['The AI service didn’t answer.', 'Check your internet connection, then try again.'],
    AI_REFUSED: ['The AI declined that request.', 'Try rephrasing it, or use one of the built-in commands.'],
    BAD_INPUT: ['Something in the settings doesn’t look right.', 'Check the highlighted settings and try again.'],
    NOTHING_FOUND: ['Nothing matched.', 'Try looser settings.'],
    BUSY: ['Something else is still running.', 'Wait for it to finish, or press Stop in the status bar.'],
    CANCELLED: ['Stopped.', 'Nothing more was changed.'],
    UNKNOWN: ['Something went wrong.', 'Try again. If it keeps happening, open the activity log (☰) and send the details.']
  };

  class UserError extends Error {
    /** new US.UserError('OFFLINE', {title, action, detail}) – title/action override the catalog text */
    constructor(code, opts = {}) {
      const [t, a] = CATALOG[code] || CATALOG.UNKNOWN;
      super(opts.title || t);
      this.code = CATALOG[code] ? code : 'UNKNOWN';
      this.title = US.say(opts.title || t);
      this.action = US.say(opts.action || a);
      this.detail = opts.detail || '';
    }
  }
  US.UserError = UserError;
  US.errors = {
    CATALOG,
    /** Turn anything thrown into {code,title,action,detail}. Raw text never reaches the screen without this. */
    explain(err) {
      if (err instanceof UserError) return { code: err.code, title: err.title, action: err.action, detail: err.detail || '' };
      // the Resolve connection (resolve/host/index.js) throws plain errors that carry their own plain words
      if (err && err.usCode) { const u = new UserError(err.usCode, { title: err.usTitle, action: err.usAction, detail: err.message }); return { code: u.code, title: u.title, action: u.action, detail: u.detail }; }
      const raw = String((err && (err.stack || err.message)) || err);
      let code = 'UNKNOWN';
      if (/ENOSPC|EACCES|EPERM|EROFS/.test(raw)) code = 'DISK';
      else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(raw)) code = 'AI_FAILED';
      const [t, a] = CATALOG[code];
      return { code, title: t, action: a, detail: raw };
    },
    cancelled: e => e && e.code === 'CANCELLED'
  };

  /* ---------- the ExtendScript bridge ---------- */
  let chain = Promise.resolve();
  // three quick clicks on Stop: calls still waiting their turn are dropped (the one Premiere is running finishes on its own)
  let epoch = 0;
  US.bus.on('hard-stop', () => { epoch++; });

  function rawEval(script, timeoutMs) {
    const cep = window.__adobe_cep__;
    return new Promise((resolve, reject) => {
      if (!cep) return reject(new UserError('HOST_SCRIPT', { detail: 'Not running inside Premiere (no __adobe_cep__).' }));
      let done = false;
      const t = timeoutMs ? setTimeout(() => { if (!done) { done = true; reject(new UserError('HOST_TIMEOUT', { detail: script.slice(0, 300) })); } }, timeoutMs) : null;
      cep.evalScript(script, res => { if (done) return; done = true; clearTimeout(t); resolve(res); });
    });
  }

  /**
   * Call a function defined in jsx (UStudio.fn.<name>). Calls run one at a time, in order.
   * Resolves with the function's return value; rejects with a UserError carrying a plain message.
   */
  function call(fn, args, opts = {}) {
    // Settings › Markers: sequence markers can also (or instead) go on the clips under them – one place for every tool
    if (fn === 'addSequenceMarkers' && args && args.where == null) args = Object.assign({}, args, { where: US.settings.get('markers.where', 'sequence') });
    const script = 'UStudio.run(' + JSON.stringify(fn) + ',' + JSON.stringify(JSON.stringify(args == null ? {} : args)) + ')';
    const mine = epoch;
    const p = chain.then(async () => {
      if (mine !== epoch) throw new UserError('CANCELLED');
      const t0 = performance.now();
      // Premiere can stop answering while it shows a message box of its own (e.g. an export error);
      // nothing returns until someone clicks it, so tell the person after a minute instead of spinning silently.
      const slow = setTimeout(() => US.bus.emit('host-slow', fn), opts.slowAfter || 60000);
      let res, out;
      try { res = await (US.app.is('resolve') ? resolveRun(fn, args, opts.timeout == null ? 600000 : opts.timeout) : rawEval(script, opts.timeout == null ? 600000 : opts.timeout)); }
      finally { clearTimeout(slow); US.bus.emit('host-answered', fn); }
      US.host.lastMs = performance.now() - t0;
      if (US.app.is('resolve')) out = res;
      else {
        if (res === 'EvalScript error.' || res == null || res === 'undefined') {
          throw new UserError('HOST_SCRIPT', { detail: `${fn}: ${res}. The host script may not be loaded.` });
        }
        try { out = JSON.parse(res); } catch (e) { throw new UserError('HOST_SCRIPT', { detail: `${fn} returned: ${String(res).slice(0, 500)}` }); }
      }
      if (out && out.ok) return out.data;
      const e = (out && out.error) || {};
      throw new UserError(e.code || 'UNKNOWN', { title: e.title, action: e.action, detail: `${fn}: ${e.detail || e.message || ''}` });
    });
    chain = p.catch(() => {});
    return p;
  }

  const path = require('path'), fs = require('fs');
  function extensionDir() {
    let p = decodeURIComponent(location.pathname);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows: /C:/...
    return path.dirname(p);
  }

  /* ---------- the Resolve bridge: resolve/host/*.js run in the panel itself, on Resolve's scripting API ---------- */
  /*
   * The Resolve commands run in the plugin's main process (resolve/plugin/main.js), which keeps the one connection
   * to Resolve: connecting again from a reloaded page hangs Resolve 21 (with or without disconnecting first), and
   * the main process outlives page reloads. The page asks over IPC.
   */
  let resolveHost = null;
  /** Run a Resolve host command; answers like the Premiere side: {ok, data} or {ok:false, error}. */
  function resolveRun(fn, args, timeoutMs) {
    if (!resolveHost) return Promise.reject(new UserError('HOST_SCRIPT', { detail: 'The Resolve commands aren’t loaded.' }));
    // the panel plays Story's lines itself in Resolve: storyStop stops that player here as well
    if (fn === 'storyStop' && US.host.cue && US.host.cue.stop) { try { US.host.cue.stop(); } catch (e) { /* nothing playing */ } }
    return new Promise((resolve, reject) => {
      let done = false;
      const t = timeoutMs ? setTimeout(() => { if (!done) { done = true; reject(new UserError('HOST_TIMEOUT', { detail: fn })); } }, timeoutMs) : null;
      resolveHost.run(fn, args == null ? {} : args).then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } }, e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }
  /** (Re)load resolve/host in the plugin's main process – fresh files, the same connection to Resolve. */
  async function loadResolve() {
    const ipc = require('electron').ipcRenderer;
    const r = await ipc.invoke('ultra-studio:load');
    if (!r || !r.ok) { const e = (r && r.error) || {}; throw new UserError(e.code || 'HOST_SCRIPT', { title: e.title, action: e.action, detail: e.detail || 'The Resolve commands didn’t load.' }); }
    resolveHost = { run: (fn, args) => ipc.invoke('ultra-studio:run', fn, args), modules: r.modules };
    US.host.resolve = resolveHost;
    return r.modules;
  }

  /** (Re)load jsx/host.jsx and every jsx/tools/*.jsx into Premiere – or the Resolve commands. */
  async function loadScripts() {
    const dir = extensionDir();
    if (US.app.is('resolve')) return loadResolve();
    const files = [path.join(dir, 'jsx', 'host.jsx')];
    const toolDir = path.join(dir, 'jsx', 'tools');
    try { fs.readdirSync(toolDir).filter(f => f.endsWith('.jsx') && f[0] !== '.').sort().forEach(f => files.push(path.join(toolDir, f))); } catch (e) { /* none */ }
    const failed = [];
    for (const f of files) {
      // Send the text rather than $.evalFile: ExtendScript caches files by path, so an updated script would not reload.
      // A try statement at top level keeps "var" declarations global and gives us the error line (minus 1).
      const src = fs.readFileSync(f, 'utf8');
      const r = await rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 30000);
      if (r !== 'ok') failed.push(`${path.basename(f)}: ${r}`);
    }
    if (failed.length) throw new UserError('HOST_SCRIPT', { detail: failed.join('\n') });
    return files.length;
  }

  /**
   * Put the Source Monitor on a clip at a time (seconds from the start of its media) and optionally play from there.
   * Premiere loads a clip into the monitor in the background, and a jump made before it has loaded is ignored (it then
   * plays from wherever the clip was) – so the panel checks where the monitor landed and jumps again until it's there.
   */
  async function cue(id, seconds, { play = false } = {}) {
    if (US.app.is('resolve')) return cueHere(id, seconds, play);
    // the clip asked for must be the one loaded (a jump made while the last clip is still showing would move that one)
    const there = r => r && (!r.loaded || r.loaded === '?' || r.loaded === id) && (Math.abs(r.position - seconds) < 0.12 || (r.timing && Math.abs(r.position - (r.timing.start + seconds)) < 0.12));
    let r = null;
    for (let i = 0; i < 12 && !there(r); i++) {
      if (i) await new Promise(res => setTimeout(res, i < 4 ? 80 : 160));
      r = await call('storyCue', { id, seconds, play: false, open: i === 0 });
    }
    if (play) r = await call('storyCue', { id, seconds, play: true, open: false });
    // ▶ that misses its line: say exactly where it landed, so the cause can be found from the activity log
    const landed = there(r);
    if (!landed) US.log('warn', 'Play: the Source Monitor didn’t land on the line', JSON.stringify({ wanted: seconds, position: r && r.position, loaded: r && r.loaded, asked: id, timing: r && r.timing }));
    return Object.assign({ landed }, r);
  }

  /**
   * Resolve: its Source Viewer can't be cued or played by script, so the panel plays the line itself – the sound of
   * the clip's media file (or its proxy) in a hidden audio element, from the time asked for. The clip is also selected
   * in the Media Pool (storyCue). Pressing play again on the line that is playing stops it. A file Chromium can't
   * decode is said once, plainly; the clip stays selected so it can be played in Resolve.
   */
  const player = { el: null, id: '', at: 0, file: '', bad: new Set(), told: new Set() };
  function stopCue() { if (player.el) { try { player.el.pause(); } catch (e) { /* not playing */ } } player.id = ''; }
  function playFile(file, seconds) {
    const el = player.el || (player.el = document.createElement('audio'));   // only the sound: no picture to decode
    return new Promise(resolve => {
      let done = false;
      const finish = ok => { if (done) return; done = true; clearTimeout(t); el.onerror = el.onloadedmetadata = null; resolve(ok); };
      const t = setTimeout(() => finish(false), 8000);
      const go = () => {
        try { el.currentTime = Math.max(0, isFinite(el.duration) && el.duration > 0 ? Math.min(seconds, el.duration - 0.05) : seconds); } catch (e) { /* plays from the start */ }
        let p; try { p = el.play(); } catch (e) { return finish(false); }
        if (p && p.then) p.then(() => finish(true), () => finish(false)); else finish(true);
      };
      el.onerror = () => finish(false);
      const url = require('url').pathToFileURL(file).href;
      if (player.file === file && el.src === url && el.readyState >= 1) return go();
      player.file = file; el.onloadedmetadata = go; el.preload = 'auto'; el.src = url;
      try { el.load(); } catch (e) { /* loads on its own */ }
    });
  }
  async function cueHere(id, seconds, play) {
    const r = await US.host.call('storyCue', { id, seconds, play, open: true });
    const again = player.id === id && Math.abs(player.at - seconds) < 0.05 && player.el && !player.el.paused;
    stopCue();
    if (!play || again) return Object.assign({ landed: true, playing: false, player: 'panel' }, r);
    for (const f of [r.path, r.proxy].filter(x => x && !player.bad.has(x))) {
      if (await playFile(f, seconds)) { player.id = id; player.at = seconds; return Object.assign({ landed: true, playing: true, player: 'panel', file: f }, r); }
      player.bad.add(f);
    }
    if (!player.told.has(id)) {
      player.told.add(id);
      US.ui.toast({ type: 'info', title: r.offline ? `“${r.name}” is offline, so it can’t be played here.` : `Ultra Studio can’t play the sound of “${r.name}” itself.`, text: 'It’s selected in the Media Pool – play it in Resolve’s viewer.', timeout: 8000 });
    }
    return Object.assign({ landed: false, playing: false, player: 'none' }, r);
  }
  cue.stop = stopCue;

  US.host = { call, rawEval, loadScripts, extensionDir, cue, lastMs: 0 };
})();
