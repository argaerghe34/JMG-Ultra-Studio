// Headless check of Deliver › Bin export and Ask › Edit's question card: both screens drawn in jsdom with a stubbed
// Premiere bridge; fails on any exception or missing text. Run on its own (node dev/tests/deliver-bin-ui.js).
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-ui-'));
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME;
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: 'file://' + path.join(ROOT, 'index.html') });
const w = dom.window;
w.require = require; w.process = process; w.Buffer = Buffer; w.console = console;
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.document.elementsFromPoint = () => [];
w.Element.prototype.scrollIntoView = function () {};
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app', 'time', 'transcript']) run(`js/core/${f}.js`);
const US = w.US;
const calls = [];
const PR = { bins: ['All Songs'], more: 0, sequences: [{ id: 's1', name: 'Song 1', bin: 'All Songs', duration: 200, video: 4, audio: 2 }], clips: [{ id: 'e1', name: 'End screen.mp4', file: 'End screen.mp4', bin: 'Graphics', kind: 'video' }] };
US.host.call = async (fn, a) => {
  calls.push(fn);
  switch (fn) {
    case 'listBins': return [{ id: 'r', path: '(Project root)' }, { id: 'b', path: 'All Songs' }];
    case 'binSequences': return [{ id: 's1', name: 'Song 1', width: 3840, height: 2160, duration: 200, bin: 'All Songs' }, { id: 's2', name: 'Song 2', width: 3840, height: 2160, duration: 150, bin: 'All Songs' }];
    case 'deliverPresets': return { h264: '/p/h264.epr' };
    case 'binItems': return [{ id: 'n1', name: 'Song 1', kind: 'sequence', bin: 'All Songs' }];
    case 'editProject': return PR;
    default: return {};
  }
};
US.ctx = { project: { name: 'Test', path: path.join(process.env.HOME, 'test.prproj') }, sequence: null };
US.tools.open = () => {};
run('js/tools/22-story-ignore.js'); run('js/tools/44-youtube.js'); run('js/tools/33-deliver.js'); run('js/tools/41-edit.js'); run('js/tools/40-assistant.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = m => { console.error('✗ ' + m); process.exitCode = 1; };

(async () => {
  // Deliver › Bin export
  US.settings.set('deliver.bin', { binId: 'b', skip: ['s2'] });
  const d = US.tools.get('deliver').create();
  w.document.body.appendChild(d.el);
  d.onShow({ tab: 'bin' });
  await sleep(200);
  const txt = d.el.textContent;
  for (const want of ['Bin export', 'Include the bins inside it', 'Song 1', 'Song 2', '1 of 2 sequences will export', 'Export the sequences', 'Start rendering straight away']) if (!txt.includes(want)) fail(`Deliver: “${want}” missing`);
  if (!calls.includes('binSequences')) fail('Deliver: the bin wasn’t read');
  // Ask › Edit: a plan with questions shows a card with pickers
  US.ai = { available: () => true, label: () => 'Claude', json: async () => ({ reply: 'A few things first.', done: false, steps: [], questions: [{ ask: 'Which clip?', kind: 'clip', options: [] }, { ask: 'Which track?', kind: 'track', options: [] }, { ask: 'Sound?', kind: 'choice', options: ['Picture only', 'Picture and sound'] }] }) };
  US.settings.set('editAsk.where', 'bin'); US.settings.set('editAsk.bin', 'b');
  const a = US.tools.get('assistant').create();
  w.document.body.appendChild(a.el);
  a.onShow();
  const seg = Array.from(a.el.querySelectorAll('button.seg')).find(b => /Edit/.test(b.textContent));
  if (seg) seg.click(); else fail('Ask: no Edit mode button');
  await sleep(50);
  const input = a.el.querySelector('.chat-bar textarea, .chat-bar input');
  input.value = 'end screen on every sequence'; input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const sendBtn = a.el.querySelector('.chat-bar button'); if (sendBtn) sendBtn.click();
  await sleep(400);
  const at = a.el.textContent;
  for (const want of ['A few questions first', 'Which clip?', 'Which track?', 'Picture only', 'Answer']) if (!at.includes(want)) fail(`Ask: “${want}” missing`);
  const sel = Array.from(a.el.querySelectorAll('.edit-question select'));
  if (sel.length !== 2 || !Array.from(sel[0].options).some(o => /End screen\.mp4/.test(o.textContent)) || !Array.from(sel[1].options).some(o => o.value === 'V5')) fail('Ask: the clip and track pickers aren’t filled');
  if (errors.length) fail('errors:\n' + errors.join('\n'));
  if (!process.exitCode) console.log('ok – Bin export, the question card and Story’s Leave out and YouTube draw');
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})().catch(e => { fail(e.stack); process.exit(1); });
