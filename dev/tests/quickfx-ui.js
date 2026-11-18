// Headless check of the Effects tab (jsdom): it renders; Make your own button saves a button that appears, is kept in
// the settings and can be clicked (it calls editApply with its own value); a wrong value says why; × deletes it.
// Settings go to a temporary home, never the user's. Run on its own (node dev/tests/quickfx-ui.js) or via run.js.
const { JSDOM } = require('jsdom');
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-qfx-'));
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME;
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: 'file://' + path.join(ROOT, 'index.html') });
const w = dom.window;
w.require = require; w.process = process; w.Buffer = Buffer; w.console = console;
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app', 'time']) run(`js/core/${f}.js`);
const US = w.US;
const calls = [];
US.ctx = { project: { name: 'Test', path: path.join(process.env.HOME, 'test.prproj') }, sequence: { id: 's1', name: 'Cut', fps: 25, duration: 30 } };
US.host.call = async (fn, a) => {
  calls.push([fn, a]);
  if (fn === 'editRead') return { fps: 25, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 8 }] }], audio: [] };
  if (fn === 'editSelection') return [];
  if (fn === 'editApply') return { done: a.targets.length, skipped: [] };
  return {};
};
run('js/tools/36-quickfx.js');
const tick = () => new Promise(r => setTimeout(r, 20));
(async () => {
  const tool = US.tools.get('quickfx').create();
  w.document.body.appendChild(tool.el);
  const el = tool.el, $$ = s => [...el.querySelectorAll(s)];
  const btn = t => $$('button').find(b => b.textContent.trim() === t);
  const status = () => el.querySelector('.pad-status').textContent;
  const labelOf = b => b.querySelector('.pad-label').textContent;
  const form = $$('select').find(s => [...s.options].some(o => o.value === 'punch'));
  assert.ok(form, 'the kind of button to make');
  const val = form.parentNode.querySelector('input'), label = form.closest('.row').nextElementSibling;
  // a wrong value says why and saves nothing
  form.value = 'punch'; form.dispatchEvent(new w.Event('change')); val.value = '900';
  btn('Save as a button').click(); await tick();
  assert.match(status(), /10 to 400%/);
  assert.deepStrictEqual(US.settings.get('quickfx.own', []), []);
  // a punch-in of 115% with its own name
  val.value = '115'; label.value = 'Gentle push';
  btn('Save as a button').click(); await tick();
  assert.match(status(), /Saved “Gentle push”/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(US.settings.get('quickfx.own'))), [{ type: 'punch', value: 115, label: 'Gentle push' }]);
  const tile = $$('.qfx-btn').find(b => labelOf(b) === 'Gentle push');
  assert.ok(tile, 'the new button is on the pad');
  // the same again is refused
  val.value = '115'; btn('Save as a button').click(); await tick();
  assert.match(status(), /already have/);
  // every clip, then click it: editApply with scale 115 on both clips
  $$('button').find(b => b.textContent === 'Every clip').click();
  tile.click(); await tick(); await tick();
  const ap = calls.filter(c => c[0] === 'editApply').pop();
  assert.deepStrictEqual([ap[1].op, JSON.parse(JSON.stringify(ap[1].params)), ap[1].targets.length], ['motion', { scale: 115 }, 2]);
  assert.match(status(), /Gentle push: 2 clips/);
  // an effect by name
  form.value = 'effect'; form.dispatchEvent(new w.Event('change')); val.value = 'Ultra Key'; label.value = '';
  btn('Save as a button').click(); await tick();
  assert.strictEqual(US.settings.get('quickfx.own').length, 2);
  // × deletes it (and keeps the other)
  $$('.qfx-btn').find(b => labelOf(b) === 'Gentle push').querySelector('.qfx-del').click(); await tick();
  assert.ok(!$$('.qfx-btn').some(b => labelOf(b) === 'Gentle push'), 'deleted');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(US.settings.get('quickfx.own').map(o => o.name))), ['Ultra Key']);
  assert.deepStrictEqual(errors, []);
  console.log('ok');
  process.exit(0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
