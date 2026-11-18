// The whole panel (every core file and every tool) in jsdom with a stand-in Premiere – for tests that click through
// the real screens (navigation-ui.js, tour-ui.js). require() it, then `await boot()`.
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
async function boot() { await US.boot(); await tick(); return US; }
/** Story with the three test interviews (dev/test-media/transcripts) and its basic themes, as in a real project. */
async function loadStory() {
  const S = US.story, T = US.transcript, TR = path.join(ROOT, 'dev', 'test-media', 'transcripts');
  S.loadState();
  for (const f of ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv']) S.addTranscript({ name: f.replace(/\.\w+$/, '').replace(/_/g, ' '), path: '/media/' + f, source: 'file', file: path.join(TR, f), segments: T.parseFile(path.join(TR, f)).segments });
  try { await US.actions.get('story.themes').run({ useAI: false }, US.jobs.testJob()); } catch (e) { /* themes are a nice-to-have */ }
  await tick();
}
module.exports = { w, US, $$, tick, boot, loadStory, errors, ROOT };
