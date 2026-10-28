// Loads panel modules (js/core/*.js) into Node for unit tests, with a fake window/document.
// Usage: const US = require('./harness').load(['time', 'audio', 'dsp']);
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let loaded = null;
function load(extra = []) {
  if (!loaded) {
    // keep tests away from the real settings/cache folder
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'us-test-'));
    process.env.HOME = home;
    process.env.APPDATA = process.env.LOCALAPPDATA = home; // Windows keeps them under AppData, not HOME
    global.window = global;
    global.US_SHOW_PAUSED = true; // Colour and Camera Switch are paused in the panel, but their code is still tested
    global.require = require;
    global.performance = global.performance || require('perf_hooks').performance;
    global.requestAnimationFrame = fn => setTimeout(fn, 0);
    global.document = { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ classList: { add() {} }, setAttribute() {}, appendChild() {}, style: {} }), createElementNS: () => ({ setAttribute() {}, appendChild() {}, classList: { add() {} } }), createTextNode: () => ({}), hasFocus: () => true };
    global.location = { pathname: path.join(ROOT, 'index.html') };
    global.Node = function () {};
    global.addEventListener = () => {};
    global.getComputedStyle = () => ({ getPropertyValue: () => '' });
    for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'core', f + '.js'), 'utf8'), { filename: f + '.js' });
    loaded = new Set();
  }
  for (const f of extra) {
    if (loaded.has(f)) continue;
    const p = f.includes('/') ? path.join(ROOT, f) : path.join(ROOT, 'js', 'core', f + '.js');
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) });
    loaded.add(f);
  }
  return global.US;
}
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
module.exports = { load, test, tests, ROOT, MEDIA: path.join(ROOT, 'dev', 'test-media') };
