// Development only: the panel as still pages, to look at its layout in any browser at any size without Premiere.
// Renders the whole panel (top bar, status, rail and each tab) in jsdom with a stand-in Premiere and the test
// interviews, then writes one page per tab, with the real stylesheets and no scripts.
// Usage: node dev/ui-snapshots.js [out folder]   (default: dev/screenshots/pages) – open index.html there.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dev', 'screenshots', 'pages'));
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-snap-'));   // never the real settings
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME;
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: 'file://' + path.join(ROOT, 'index.html') });
const w = dom.window;
Object.assign(w, { require, process, Buffer, console });
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.document.elementsFromPoint = () => [];
w.Element.prototype.scrollIntoView = function () {};
w.setInterval = () => 0;   // no polling in a still picture
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app', 'time', 'audio', 'encoder', 'dsp', 'vision', 'transcript', 'ai']) if (fs.existsSync(path.join(ROOT, 'js', 'core', f + '.js'))) run(`js/core/${f}.js`);
for (const f of fs.readdirSync(path.join(ROOT, 'js', 'tools')).filter(x => x.endsWith('.js')).sort()) run('js/tools/' + f);
const US = w.US;
const SEQ = { id: 's1', name: 'Bakery – rough cut v3', fps: 25, width: 1920, height: 1080, duration: 184, video: [{ index: 0, name: 'Video 1', clips: [] }], audio: [{ index: 0, name: 'Audio 1', clips: [] }], markers: [] };
US.host.loadScripts = async () => {};
US.host.call = async fn => {
  switch (fn) {
    case 'ping': return { version: '26.5' };
    case 'context': return { project: { name: 'The Bakery', path: '/tmp/The Bakery.prproj' }, sequence: SEQ, selection: 0 };
    case 'listSequences': return [{ id: 's1', name: SEQ.name }];
    case 'listBins': return [{ id: 'b1', path: 'Interviews' }];
    case 'sequenceInfo': case 'editRead': return SEQ;
    default: return {};
  }
};
(async () => {
  US.ctx = { project: { name: 'The Bakery', path: path.join(process.env.HOME, 'The Bakery.prproj') }, sequence: SEQ };
  const S = US.story, T = US.transcript, TR = path.join(ROOT, 'dev', 'test-media', 'transcripts');
  S.loadState();
  for (const f of ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv']) S.addTranscript({ name: f.replace(/\.\w+$/, '').replace(/_/g, ' '), path: '/media/' + f, source: 'file', file: path.join(TR, f), segments: T.parseFile(path.join(TR, f)).segments });
  try { await US.actions.get('story.themes').run({ useAI: false }, US.jobs.testJob()); } catch (e) { /* themes are a nice-to-have here */ }
  await US.boot();
  const css = [path.join(ROOT, 'css', 'app.css')].concat(fs.readdirSync(path.join(ROOT, 'css', 'tools')).filter(f => f.endsWith('.css')).sort().map(f => path.join(ROOT, 'css', 'tools', f)));
  fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
  for (const c of css) fs.copyFileSync(c, path.join(OUT, 'css', path.basename(c)));   // next to the pages, so a local web server can show them
  const ids = US.tools.list().filter(d => !d.hidden).map(d => d.id).concat(['settings']);
  const made = [];
  for (const id of Array.from(new Set(ids))) {
    try { US.tools.open(id, id === 'story' ? { tab: 'transcripts' } : undefined); } catch (e) { console.log('✗', id, e.message); continue; }
    await new Promise(r => setTimeout(r, 60));
    const root = w.document.documentElement.cloneNode(true);
    root.querySelectorAll('script').forEach(s => s.remove());
    const head = root.querySelector('head');
    head.innerHTML = `<meta charset="utf-8"><title>${id}</title>` + css.map(c => `<link rel="stylesheet" href="css/${path.basename(c)}">`).join('');
    fs.writeFileSync(path.join(OUT, id + '.html'), '<!doctype html>\n' + root.outerHTML);
    made.push(id);
  }
  // Story and its steps: made directly (as the screen tests do) and shown in the view on its own
  const story = US.tools.get('story').create(); story.el.classList.add('wide');
  const view = w.document.querySelector('.view');
  for (const tab of ['transcripts', 'themes', 'search', 'build', 'timeline']) {
    Array.from(view.children).forEach(c => c.classList.add('hidden'));
    if (story.el.parentNode !== view) view.appendChild(story.el);
    story.el.classList.remove('hidden'); story.onShow({ tab }); await new Promise(r => setTimeout(r, 60));
    const root = w.document.documentElement.cloneNode(true); root.querySelectorAll('script').forEach(s => s.remove());
    root.querySelector('head').innerHTML = `<meta charset="utf-8"><title>story-${tab}</title>` + css.map(c => `<link rel="stylesheet" href="css/${path.basename(c)}">`).join('');
    fs.writeFileSync(path.join(OUT, `story-${tab}.html`), '<!doctype html>\n' + root.outerHTML); made.push('story-' + tab);
    if (tab === 'transcripts') fs.copyFileSync(path.join(OUT, 'story-transcripts.html'), path.join(OUT, 'story.html'));
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Ultra Studio pages</title><body style="font:14px system-ui;padding:16px"><h3>JMG Ultra Studio – each tab as a still page</h3>${made.map(id => `<div><a href="${id}.html">${id}</a></div>`).join('')}</body>`);
  console.log(`${made.length} pages in ${OUT}`);
  process.exit(0);
})().catch(e => { console.log('✗', e.stack); process.exit(1); });
