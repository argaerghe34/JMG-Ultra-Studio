// Headless check of the Colour screen (jsdom, stubbed Premiere): switching to LUTs while the looks are still loading
// must not mix up the two lists; clicking a LUT chooses that LUT. Run on its own or via colour-ui.test.js.
const ROOT = require('path').join(__dirname, '..', '..');
const { JSDOM } = require(ROOT + '/dev/node_modules/jsdom');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-ui-'));
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: 'file://' + path.join(ROOT, 'index.html') });
const w = dom.window;
w.require = require; w.process = process; w.Buffer = Buffer; w.console = console;
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => ({ putImageData() {}, drawImage() {}, getImageData: (x,y,a,b) => ({ data: new Uint8ClampedArray(a*b*4) }) });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AA';
w.ImageData = function (d, a, b) { this.data = d; this.width = a; this.height = b; };
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'store', 'host', 'jobs', 'ui', 'app']) run(`js/core/${f}.js`);
const US = w.US;
let presetsResolve;
US.host.call = async (fn, a) => {
  if (fn === 'colourPresets') return new Promise(r => { presetsResolve = () => r(['Fuji F125 Kodak 2393 (by Adobe)', 'Monochrome Kodak 5205 Fuji 3510 (by Adobe)']); });
  if (fn === 'context') return { project: { name: 'T', path: '/tmp/t.prproj' }, sequence: null };
  if (fn === 'colourClips') return [];
  return {};
};
US.ctx = { project: { name: 'T', path: '/tmp/t.prproj' }, sequence: null };
run('js/tools/34-colour.js');
// fake LUT file
const lutDir = path.join(process.env.HOME, 'Library/Application Support/Adobe/Common/LUTs/Creative'); fs.mkdirSync(lutDir, { recursive: true });
let cube = 'LUT_3D_SIZE 2\n'; for (let b=0;b<2;b++) for (let g=0;g<2;g++) for (let r=0;r<2;r++) cube += `${r} ${g} ${b}\n`;
fs.writeFileSync(path.join(lutDir, 'A.cube'), cube); fs.writeFileSync(path.join(lutDir, 'B.cube'), cube);
(async () => {
  const tool = US.tools.get('colour').create();
  w.document.body.appendChild(tool.el);
  tool.onShow();
  await new Promise(r => setTimeout(r, 10));
  // user switches to LUTs before the looks list has arrived
  tool.show('luts');
  presetsResolve();
  await new Promise(r => setTimeout(r, 20));
  const lutThumbs = Array.from(tool.el.querySelectorAll('.colour-pane:not(.hidden) .colour-thumb'));

  lutThumbs[1].click();
  await new Promise(r => setTimeout(r, 20));
  const on = Array.from(tool.el.querySelectorAll('.colour-pane:not(.hidden) .colour-thumb.on')).map(b => b.textContent);
  const apply = Array.from(tool.el.querySelectorAll('.colour-pane:not(.hidden) .btn')).find(b => /Apply this LUT/.test(b.textContent));
  const problems = errors.slice();
  if (lutThumbs.length !== 2 || on.join() !== 'B') problems.push('LUT B not chosen: ' + on.join());
  if (!apply || apply.disabled || apply.classList.contains('disabled')) problems.push('Apply this LUT stayed disabled');
  if (problems.length) { console.log('✗ Colour UI: ' + problems.join(' | ')); process.exit(1); }
  console.log('✓ Colour UI');
  process.exit(0);
})();
