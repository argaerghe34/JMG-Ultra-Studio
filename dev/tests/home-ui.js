// Headless check of the panel in DaVinci Resolve (jsdom, a stubbed Resolve): it starts without CEP (no theme to follow),
// the header keeps a timeline's own name, and Home › Check my setup checks Resolve Studio, the plugin version and the
// Resolve commands each tool needs. Run on its own (node dev/tests/home-ui.js) or via platform.test.js.
const ROOT = require('path').join(__dirname, '..', '..');
const { JSDOM } = require(ROOT + '/dev/node_modules/jsdom');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-ui-'));
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME;
// a plugin folder like the installed one: index.html, CSXS/manifest.xml (the panel's version) and manifest.xml (the plugin's)
const PLUG = fs.mkdtempSync(path.join(os.tmpdir(), 'us-plugin-'));
const VER = /ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8'))[1];
fs.mkdirSync(path.join(PLUG, 'CSXS'));
fs.copyFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), path.join(PLUG, 'CSXS', 'manifest.xml'));
fs.writeFileSync(path.join(PLUG, 'manifest.xml'), fs.readFileSync(path.join(ROOT, 'resolve', 'plugin', 'manifest.xml'), 'utf8').replace('__VERSION__', VER));
fs.writeFileSync(path.join(PLUG, 'index.html'), '');
fs.writeFileSync(path.join(PLUG, 'WorkflowIntegration.node'), '');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: require('url').pathToFileURL(path.join(PLUG, 'index.html')).href });
const w = dom.window;
w.__ULTRA_RESOLVE__ = true; // what resolve/plugin/preload.js sets
w.require = require; w.process = process; w.Buffer = Buffer; w.console = console;
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.Element.prototype.scrollIntoView = function () {};
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app']) run(`js/core/${f}.js`);
const US = w.US;
const FNS = ['ping', 'context', 'listFns', 'sampleItems', 'listSequences', 'listBins'];
const CTX = { project: { name: 'JMG Ultra Studio Test' }, sequence: { id: 't1', name: 'Sequence 01', fps: 25, duration: 30, width: 1920, height: 1080 }, selection: 0 };
US.host.loadScripts = async () => 1;
US.host.call = async fn => {
  switch (fn) {
    case 'ping': return { app: 'DaVinci Resolve Studio', version: '20.3.1.6' };
    case 'context': return CTX;
    case 'listFns': return FNS;
    case 'sampleItems': return [];
    default: return {};
  }
};
run('js/tools/00-home.js');
// a tool that needs a command Resolve doesn't have yet
US.tools.register({ id: 'needs', name: 'Needs', icon: 'home', group: 'cut', hostFns: ['context', 'notInResolveYet'], create: () => ({ el: US.h('div') }) });
const fail = m => { errors.push(m); };

(async () => {
  await US.boot();
  await new Promise(r => setTimeout(r, 50));
  if (!w.document.querySelector('.rail')) fail('the shell did not start: ' + w.document.body.textContent.slice(0, 300));
  if (w.document.documentElement.classList.contains('light')) fail('Resolve should get the dark default');
  const chip = w.document.querySelectorAll('.ctx-chip span')[1];
  if (!chip || chip.textContent !== 'Sequence 01') fail('the header changed the timeline’s own name: ' + (chip && chip.textContent));
  US.tools.open('home');
  const root = w.document.querySelector('.tool:not(.hidden)') || w.document;
  if (!/Working in “JMG Ultra Studio Test”\. Active timeline: Sequence 01/.test(root.textContent)) fail('Home’s context line: ' + root.querySelector('.hero p').textContent);
  if (!/in DaVinci Resolve Studio/.test(root.textContent)) fail('Home should show what’s new in Resolve');
  const btn = Array.from(root.querySelectorAll('button')).find(b => /Check my setup/.test(b.textContent));
  btn.click();
  for (let i = 0; i < 100 && (US.jobs.current || !root.querySelector('.check-row')); i++) await new Promise(r => setTimeout(r, 30));
  await new Promise(r => setTimeout(r, 30));
  const rows = Array.from(root.querySelectorAll('.check-row')).map(r => r.textContent);
  const want = [/Connected to DaVinci Resolve Studio 20\.3\.1/, /Project open: JMG Ultra Studio Test/, new RegExp(`JMG Ultra Studio ${VER.replace(/\./g, '\\.')} plugin installed`), /Some tools are missing Resolve commands.*Needs: notInResolveYet/];
  for (const re of want) if (!rows.some(r => re.test(r))) fail('setup check: no row like ' + re + '\n  ' + rows.join('\n  '));
  if (rows.some(r => /Premiere|Media Encoder|\bsequence/i.test(r))) fail('setup check uses Premiere words: ' + rows.join(' | '));
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('Resolve shell and setup check OK:\n  ' + rows.join('\n  '));
  process.exit(0);
})().catch(e => { console.log(e.stack); process.exit(1); });
