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
   * without each tool knowing. Order matters: whole instructions that differ in Resolve first (menus, right-click
   * paths), then longer phrases before single words. The case of the first letter is kept. Names people gave things
   * (projects, timelines, clips, bins) must not go through this: pass them to US.h as US.keep(name).
   */
  const AP = '[’\']'; // code has both ’ and '
  const cap = (m, word) => (/^[A-Z]/.test(m) ? word[0].toUpperCase() : word[0].toLowerCase()) + word.slice(1);
  const RESOLVE_WORDS = [
    // instructions that are different in Resolve
    [/\bClick into a sequence in the Timeline\b/g, 'Open a timeline on the Edit page'],
    [/\bright-click › Proxy › Create Proxies\b/g, 'right-click it in the Media Pool › Generate Proxy Media'],
    [/\bright-click › Link Media\b/g, 'right-click in the Media Pool › Relink Selected Clips'],
    [/\bWindow › Extensions › JMG Ultra Studio\b/g, 'Workspace › Workflow Integrations › JMG Ultra Studio'],
    [/\bFile › New › Adjustment Layer\b/g, 'Effects › Toolbox › Effects › Adjustment Clip'],
    [/\bWindow › Essential Graphics\b/g, 'the Inspector'],
    [new RegExp('\\b(?:Adobe )?Media Encoder or Premiere' + AP + 's Export screen\\b', 'g'), 'Resolve’s Deliver page'],
    [new RegExp('\\bPremiere' + AP + 's Export screen\\b', 'g'), 'Resolve’s Deliver page'],
    // Resolve's own transcription can't be read by a plugin: Story reads its own or transcript files
    [new RegExp('\\bPremiere' + AP + 's transcripts\\b', 'g'), (m, off, s) => (off === 0 || /[.!?:]\s*$/.test(s.slice(0, off)) ? 'The' : 'the') + ' transcripts'],
    [new RegExp('\\b(?:Adobe )?Media Encoder' + AP + 's queue\\b', 'g'), 'Resolve’s render queue'],
    [/\bOpen (?:Adobe )?Media Encoder\b/g, 'Open the Deliver page'],
    [/\b(to|in) (?:Adobe )?Media Encoder\b/g, (m, w) => w + ' Resolve’s render queue'],
    [/\bpress its green Start button\b/g, 'press Render All on the Deliver page'],
    [/\b(?:Adobe )?Media Encoder\b/g, 'Resolve'],
    // the editor's name
    [/\bAdobe Premiere Pro\b/g, 'DaVinci Resolve'], [/\bPremiere Pro\b/g, 'Resolve'],
    [new RegExp('\\bPremiere' + AP + 's\\b', 'g'), 'Resolve’s'], [/\bPremiere\b/g, 'Resolve'],
    // panels, features and things
    [/\bProject panel\b/g, 'Media Pool'], [/\bSource Monitor\b/g, 'Source Viewer'], [/\bProgram Monitor\b/g, 'Timeline Viewer'],
    [/\bAuto Reframe\b/g, 'Smart Reframe'],
    [/\b[Ll]abel colou?rs\b/g, m => cap(m, 'clip colours')], [/\b[Ll]abel colou?r\b/g, m => cap(m, 'clip colour')],
    [/\b[Aa]djustment [Ll]ayers\b/g, m => cap(m, 'adjustment clips')], [/\b[Aa]djustment [Ll]ayer\b/g, m => cap(m, 'adjustment clip')],
    [/\b[Ee]xport presets\b/g, m => cap(m, 'render presets')], [/\b[Ee]xport preset\b/g, m => cap(m, 'render preset')],
    [/\b[Nn]ested sequences\b/g, m => cap(m, 'compound clips')], [/\b[Nn]ested sequence\b/g, m => cap(m, 'compound clip')],
    [/\b[Ss]ub-?sequences\b/g, m => cap(m, 'compound clips')], [/\b[Ss]ub-?sequence\b/g, m => cap(m, 'compound clip')],
    [/\b[Ss]equences\b/g, m => cap(m, 'timelines')], [/\b[Ss]equence\b/g, m => cap(m, 'timeline')],
    [/\bSEQUENCES\b/g, 'TIMELINES'], [/\bSEQUENCE\b/g, 'TIMELINE']
  ];
  function say(text) {
    if (id !== 'resolve' || typeof text !== 'string' || !text) return text;
    let t = text;
    for (const [re, to] of RESOLVE_WORDS) t = t.replace(re, to);
    return t;
  }
  /** A name someone gave (project, timeline, clip, bin) for US.h: shown exactly as it is, never put in Resolve's words. */
  function keep(text) { return document.createTextNode(text == null ? '' : String(text)); }

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
  US.keep = keep;
  US.RESOLVE_WORDS = RESOLVE_WORDS;
})();
