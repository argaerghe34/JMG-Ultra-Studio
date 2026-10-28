/* JMG Ultra Studio – which editor the panel is running in (Premiere Pro or DaVinci Resolve Studio), and the few
   things that differ: the editor's own words, choosing files and opening links. Everything else is shared. */
(function () {
  'use strict';
  const US = window.US;
  const path = require('path');

  // Resolve's plugin (resolve/plugin/preload.js) sets window.__ULTRA_RESOLVE__; Premiere's CEP gives __adobe_cep__
  const id = window.__ULTRA_RESOLVE__ ? 'resolve' : 'premiere';

  /**
   * The words Resolve uses for the same things, so every screen, message and error reads right in either editor
   * without each tool knowing. Order matters (longer phrases first); the case of the first letter is kept.
   */
  const RESOLVE_WORDS = [
    [/\bPremiere Pro\b/g, 'Resolve'], [/\bPremiere’s\b/g, 'Resolve’s'], [/\bPremiere\b/g, 'Resolve'],
    [/\b(Adobe )?Media Encoder\b/g, 'Resolve’s render queue'],
    [/\bProject panel\b/g, 'Media Pool'], [/\bSource Monitor\b/g, 'Source Viewer'], [/\bProgram Monitor\b/g, 'Timeline Viewer'],
    [/\b([Aa])djustment [Ll]ayers\b/g, (m, a) => a + 'djustment clips'], [/\b([Aa])djustment [Ll]ayer\b/g, (m, a) => a + 'djustment clip'],
    [/\b([Ee])xport presets?\b/g, (m, e) => (e === 'E' ? 'Render' : 'render') + (m.endsWith('s') ? ' presets' : ' preset')],
    [/\b([Ss])ub-?sequences\b/g, (m, s) => (s === 'S' ? 'Compound' : 'compound') + ' clips'],
    [/\b([Ss])equences\b/g, (m, s) => (s === 'S' ? 'T' : 't') + 'imelines'], [/\b([Ss])equence\b/g, (m, s) => (s === 'S' ? 'T' : 't') + 'imeline'],
    [/\bSEQUENCE\b/g, 'TIMELINE']
  ];
  function say(text) {
    if (id !== 'resolve' || typeof text !== 'string' || !text) return text;
    let t = text;
    for (const [re, to] of RESOLVE_WORDS) t = t.replace(re, to);
    return t;
  }

  const premiere = {
    pickFiles({ title = 'Choose a file', ext = [], multi = false, folder = false, start = '' } = {}) {
      const c = window.cep && window.cep.fs;
      if (!c) return [];
      const r = c.showOpenDialogEx(multi, folder, title, start, ext);
      return r && !r.err && r.data ? r.data.filter(Boolean) : [];
    },
    openUrl(url) { try { window.cep.util.openURLInDefaultBrowser(url); } catch (e) { openWithSystem(url); } }
  };
  const resolve = {
    pickFiles({ title = 'Choose a file', ext = [], multi = false, folder = false, start = '' } = {}) {
      const props = [folder ? 'openDirectory' : 'openFile'].concat(multi ? ['multiSelections'] : []);
      const filters = ext.length && !folder ? [{ name: 'Files', extensions: ext }] : [];
      try { return require('electron').ipcRenderer.sendSync('ultra-studio:open-dialog', { title, properties: props, filters, defaultPath: start || undefined }) || []; } catch (e) { return []; }
    },
    openUrl(url) { try { require('electron').shell.openExternal(url); } catch (e) { openWithSystem(url); } }
  };
  function openWithSystem(target) {
    const isWin = process.platform === 'win32';
    require('child_process').exec((isWin ? 'start "" "' : 'open "') + target + '"');
  }

  US.app = Object.assign({
    id,
    is: which => which === id,
    /** short name in sentences ("Premiere", "Resolve") and the full product name */
    name: id === 'resolve' ? 'Resolve' : 'Premiere',
    full: id === 'resolve' ? 'DaVinci Resolve Studio' : 'Premiere Pro',
    /** Show a folder in Finder / Explorer. */
    reveal(p) { require('child_process').exec(process.platform === 'win32' ? `explorer "${p}"` : `open "${p}"`); },
    pluginDir: () => path.dirname(decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:\/)/, '$1'))
  }, id === 'resolve' ? resolve : premiere);
  US.say = say;
  US.RESOLVE_WORDS = RESOLVE_WORDS;
})();
