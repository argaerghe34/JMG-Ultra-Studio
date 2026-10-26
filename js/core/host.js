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
      this.title = opts.title || t;
      this.action = opts.action || a;
      this.detail = opts.detail || '';
    }
  }
  US.UserError = UserError;
  US.errors = {
    CATALOG,
    /** Turn anything thrown into {code,title,action,detail}. Raw text never reaches the screen without this. */
    explain(err) {
      if (err instanceof UserError) return { code: err.code, title: err.title, action: err.action, detail: err.detail || '' };
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
  const cep = window.__adobe_cep__;
  let chain = Promise.resolve();

  function rawEval(script, timeoutMs) {
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
    const script = 'UStudio.run(' + JSON.stringify(fn) + ',' + JSON.stringify(JSON.stringify(args == null ? {} : args)) + ')';
    const p = chain.then(async () => {
      const t0 = performance.now();
      // Premiere can stop answering while it shows a message box of its own (e.g. an export error);
      // nothing returns until someone clicks it, so tell the person after a minute instead of spinning silently.
      const slow = setTimeout(() => US.bus.emit('host-slow', fn), opts.slowAfter || 60000);
      let res;
      try { res = await rawEval(script, opts.timeout == null ? 600000 : opts.timeout); }
      finally { clearTimeout(slow); US.bus.emit('host-answered', fn); }
      US.host.lastMs = performance.now() - t0;
      if (res === 'EvalScript error.' || res == null || res === 'undefined') {
        throw new UserError('HOST_SCRIPT', { detail: `${fn}: ${res}. The host script may not be loaded.` });
      }
      let out;
      try { out = JSON.parse(res); } catch (e) { throw new UserError('HOST_SCRIPT', { detail: `${fn} returned: ${String(res).slice(0, 500)}` }); }
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

  /** (Re)load jsx/host.jsx and every jsx/tools/*.jsx into Premiere. */
  async function loadScripts() {
    const dir = extensionDir();
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
    // the clip asked for must be the one loaded (a jump made while the last clip is still showing would move that one)
    const there = r => r && (!r.loaded || r.loaded === '?' || r.loaded === id) && (Math.abs(r.position - seconds) < 0.12 || (r.timing && Math.abs(r.position - (r.timing.start + seconds)) < 0.12));
    let r = null;
    for (let i = 0; i < 12 && !there(r); i++) {
      if (i) await new Promise(res => setTimeout(res, i < 4 ? 80 : 160));
      r = await call('storyCue', { id, seconds, play: false, open: i === 0 });
    }
    if (play) r = await call('storyCue', { id, seconds, play: true, open: false });
    return Object.assign({ landed: there(r) }, r);
  }

  US.host = { call, rawEval, loadScripts, extensionDir, cue, lastMs: 0 };
})();
