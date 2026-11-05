// Runs jsx/host.jsx + jsx/tools/mvfx.jsx in Node to check the text setter against both shapes of Premiere's Source Text
// JSON (the Essential Graphics control's "textEditValue" form, and the Text component's "mTextParam" form as stored in
// Basic Title.mogrt – decoded from the template file). What real Premiere accepts is checked by dev/e2e/54-mvfx.e2e.js.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');

function loadJsx() {
  const ctx = { app: { path: '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app', version: '26.5', project: null }, qe: {}, File: function (p) { this.exists = false; this.fsName = p; }, Folder: function () {}, Time: function () { this.seconds = 0; }, JSON, Math, String, Number, RegExp, Array, Object, Date, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent };
  ctx.$ = { writeln() {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx', 'host.jsx'), 'utf8'), ctx, { filename: 'host.jsx' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx', 'tools', 'mvfx.jsx'), 'utf8'), ctx, { filename: 'mvfx.jsx' });
  return ctx.UStudio;
}
const prop = (name, value) => { const p = { displayName: name, value, getValue: () => p.value, setValue: (v) => { p.value = v; return true; } }; return p; };
const comp = (name, props) => ({ displayName: name, matchName: name, properties: Object.assign(props.slice(), { numItems: props.length }) });
const clip = (components, mgt) => ({ components: Object.assign(components.slice(), { numItems: components.length }), getMGTComponent: () => mgt || null, name: '' });
const PARAM = JSON.stringify({ mTextParam: { mAlignment: 2, mStyleSheet: { mFillColor: { mParamValues: [[0, 16777215]] }, mFontName: { mParamValues: [[0, 'MyriadPro-Regular']] }, mFontSize: { mParamValues: [[0, 100]] }, mTracking: { mParamValues: [[0, 0]] }, mFauxBold: { mParamValues: [[0, false]] }, mText: 'Your Title Here' } }, mVersion: 1 });

test('Source Text in the Text component (mTextParam): words, font, size, colour (0xRRGGBB), tracking and bold set; the binary prefix kept; base size reported', () => {
  const U = loadJsx(), p = prop('Source Text', '\u0000\u0001' + PARAM), ti = clip([comp('Text', [prop('Position', '0'), p])]);
  const log = [], r = U.mvfxText.setText(ti, { text: 'Mira Haddad', font: 'Georgia-Bold', size: 63, colour: '#c9a96a', tracking: 0.12, bold: true }, log);
  assert.strictEqual(JSON.stringify([r.words, r.font, r.size, r.colour, r.baseSize, r.forms]), JSON.stringify([true, true, true, true, 100, ['param']]));
  assert.ok(p.value.startsWith('\u0000\u0001{'), 'prefix kept');
  const o = JSON.parse(p.value.slice(2)).mTextParam.mStyleSheet;
  assert.strictEqual(o.mText, 'Mira Haddad'); assert.strictEqual(o.mFontName.mParamValues[0][1], 'Georgia-Bold'); assert.strictEqual(o.mFontSize.mParamValues[0][1], 63);
  assert.strictEqual(o.mFillColor.mParamValues[0][1], 0xc9a96a); assert.strictEqual(o.mTracking.mParamValues[0][1], 120);
  assert.strictEqual(o.mFauxBold.mParamValues[0][1], false, 'a Bold face needs no faux bold');
  assert.strictEqual(log.length, 0, log.join('; '));
});

test('the Essential Graphics control (textEditValue): the words always; font and size only when the template allows them', () => {
  const U = loadJsx();
  const locked = prop('TextLayer', JSON.stringify({ textEditValue: 'Your Title Here' })), mgt = comp('Graphic Parameters', [locked]);
  let r = U.mvfxText.setText(clip([mgt], mgt), { text: 'Ruth', font: 'Georgia', size: 60 }, []);
  assert.deepStrictEqual([r.words, r.font, r.size, r.baseSize], [true, false, false, 0]);
  assert.strictEqual(JSON.parse(locked.value).textEditValue, 'Ruth');
  const open = prop('TextLayer', JSON.stringify({ textEditValue: 'x', fontEditValue: 'MyriadPro-Regular', fontSizeEditValue: 100, fontFSBoldValue: false })), mgt2 = comp('Graphic Parameters', [open]);
  r = U.mvfxText.setText(clip([mgt2], mgt2), { text: 'Ruth', font: 'Georgia', size: 60, bold: true }, []);
  assert.deepStrictEqual([r.words, r.font, r.size, r.baseSize], [true, true, true, 100]);
  assert.deepStrictEqual(JSON.parse(open.value), { textEditValue: 'Ruth', fontEditValue: 'Georgia', fontSizeEditValue: 60, fontFSBoldValue: true });
});

test('both at once (a template clip has the control and the Text component): both get the words; nothing at all is said in the log', () => {
  const U = loadJsx();
  const ctl = prop('TextLayer', JSON.stringify({ textEditValue: 'x' })), mgt = comp('Graphic Parameters', [ctl]), src = prop('Source Text', PARAM);
  const r = U.mvfxText.setText(clip([mgt, comp('Text', [src])], mgt), { text: 'Noa', font: 'Menlo-Regular', size: 40, colour: '#ffffff' }, []);
  assert.strictEqual(JSON.stringify(r.forms), '["edit","param"]'); assert.ok(r.words && r.font && r.size && r.colour);
  assert.strictEqual(JSON.parse(ctl.value).textEditValue, 'Noa'); assert.strictEqual(JSON.parse(src.value).mTextParam.mStyleSheet.mText, 'Noa');
  const log = [], none = U.mvfxText.setText(clip([comp('Motion', [prop('Scale', 100)])]), { text: 'x' }, log);
  assert.ok(!none.words && log[0] === 'no Source Text');
});
