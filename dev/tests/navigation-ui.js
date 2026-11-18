// Headless check that nothing is lost in the panel's navigation: the whole panel (every core file and every tool) starts
// in jsdom with a stand-in Premiere, and by clicking only what a person can click – the rail, a place's tabs, the
// Settings gear, Advanced's tiles (In development too) – every registered tool must be reached, in the rail as places
// and in Settings › Classic rail. Every action the Assistant knows must belong to a tool that can be reached.
// Run on its own (node dev/tests/navigation-ui.js) or through navigation.test.js. Prints JSON on the last line.
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const { JSDOM } = require(path.join(ROOT, 'dev', 'node_modules', 'jsdom'));
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-nav-'));   // never the real settings
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME;

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: require('url').pathToFileURL(path.join(ROOT, 'index.html')).href });
const w = dom.window;
Object.assign(w, { require, process, Buffer, console });
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.document.elementsFromPoint = () => [];
w.Element.prototype.scrollIntoView = function () {};
w.setInterval = () => 0;   // no polling
const errors = [];
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app', 'time', 'audio', 'encoder', 'dsp', 'vision', 'transcript', 'ai']) if (fs.existsSync(path.join(ROOT, 'js', 'core', f + '.js'))) run(`js/core/${f}.js`);
for (const f of fs.readdirSync(path.join(ROOT, 'js', 'tools')).filter(x => x.endsWith('.js') && x[0] !== '.').sort()) {
  try { run('js/tools/' + f); } catch (e) { errors.push(`${f} failed to load: ${e.message}`); }
}
const US = w.US;
const SEQ = { id: 's1', name: 'Main Cut', fps: 25, width: 1920, height: 1080, duration: 120, video: [], audio: [], markers: [] };
US.host.loadScripts = async () => {};
US.host.call = async fn => {
  switch (fn) {
    case 'ping': return { version: '26.5' };
    case 'context': return { project: { name: 'JMG Ultra Studio Test', path: path.join(process.env.HOME, 'Test.prproj') }, sequence: SEQ, selection: 0 };
    case 'listSequences': return [{ id: 's1', name: 'Main Cut' }];
    case 'listBins': return [];
    case 'listFns': return [];
    default: return {};
  }
};
const $$ = (sel, root = w.document) => Array.from(root.querySelectorAll(sel));
const tick = () => new Promise(r => setTimeout(r, 5));

/** Every tool reached by clicking what's on screen, starting from the rail. */
async function reachable() {
  const seen = new Set(), how = {};
  const note = via => { const id = US.tools.current; if (id && !seen.has(id)) { seen.add(id); how[id] = via; } };
  for (const b of $$('.rail .rail-btn')) {
    const label = b.textContent.trim();
    b.click(); await tick(); note('rail › ' + label);
    for (const t of $$('.place-tabs:not(.hidden) .place-tab')) { const tl = t.textContent.trim(); t.click(); await tick(); note(`rail › ${label} › tab ${tl}`); }
  }
  const gear = $$('.header .icon-btn').find(b => b.title === 'Settings');
  if (gear) { gear.click(); await tick(); note('header › Settings'); }
  // Advanced's tiles (and the closed "In development" section's), each a click away from Advanced
  const advBtn = $$('.rail .rail-btn').find(b => b.dataset.place === 'advanced' || b.dataset.id === 'advanced');
  if (advBtn) {
    advBtn.click(); await tick();
    const ids = $$('.tool:not(.hidden) [data-tool]').map(t => t.dataset.tool);
    for (const id of ids) {
      advBtn.click(); await tick();
      const t = $$('.tool:not(.hidden) [data-tool]').find(x => x.dataset.tool === id);
      if (t) { t.click(); await tick(); note('Advanced › ' + id); }
    }
  }
  return { seen, how };
}

(async () => {
  await US.boot();
  await tick();
  const all = US.tools.list().map(d => d.id);
  const out = { tools: all, modes: {} };
  for (const mode of ['places', 'classic']) {
    US.settings.set('ui.classicRail', mode === 'classic');
    US.rebuildRail();
    const { seen, how } = await reachable();
    const missing = all.filter(id => !seen.has(id));
    const actionsMissing = US.actions.list().filter(a => !seen.has(a.tool)).map(a => a.id);
    out.modes[mode] = { railButtons: $$('.rail .rail-btn').length, missing, actionsMissing, how };
  }
  US.settings.set('ui.classicRail', false);
  out.places = US.PLACES.map(p => ({ id: p.id, tools: (p.id === 'advanced' ? ['advanced'] : US.placeTools(p.id).map(d => d.id)) }));
  out.advanced = US.ADVANCED_TOOLS.concat(US.PAUSED_TOOLS);
  out.errors = errors;
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: e.stack })); process.exit(1); });
