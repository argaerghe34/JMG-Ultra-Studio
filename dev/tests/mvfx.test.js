// mVFX – the Documentary pack: the presets, fonts, painter, Premiere layer plan, movement keyframes, the Fusion
// templates Resolve gets, and the five looks (.cube files, Lumetri settings).
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/36-quickfx.js', 'js/tools/39-mvfx-fusion.js', 'js/tools/39-mvfx-looks.js', 'js/tools/39-mvfx-pack.js']);
const P = US.mvfxPack, F = US.mvfxFusion, L = US.mvfxLooks;

/** A 2D context that remembers what was drawn. */
function ctx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const c = { calls, font: '', fillStyle: '', globalAlpha: 1, textAlign: '', textBaseline: '', lineWidth: 1, strokeStyle: '', imageSmoothingEnabled: true,
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, rect() {}, arc() {}, arcTo() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() { calls.push(['stroke']); }, fill() { calls.push(['fill']); }, strokeRect() { calls.push(['stroke']); }, setLineDash() {}, clearRect() {}, drawImage() { calls.push(['image']); },
    fillRect(x, y, w, h) { calls.push(['rect', x, y, w, h, c.fillStyle, c.globalAlpha]); }, fillText(t, x, y) { calls.push(['text', t, x, y, c.font, c.fillStyle, c.globalAlpha]); },
    measureText(t) { return { width: t.length * 10 }; }, createLinearGradient: () => grad, createRadialGradient: () => grad,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  return c;
}
global.document.createElement = () => ({ width: 0, height: 0, getContext: () => ctx(), classList: { add() {} }, setAttribute() {}, appendChild() {}, style: {} });

test('the pack: 61 original presets in nine groups, unique ids, every text layer names a field of its preset', () => {
  assert.strictEqual(P.PRESETS.length, 61);
  assert.deepStrictEqual(P.GROUPS.map(g => g.id), ['lower', 'titles', 'dates', 'overlays', 'backgrounds', 'freeze', 'moves', 'transitions', 'looks']);
  assert.strictEqual(new Set(P.PRESETS.map(p => p.id)).size, P.PRESETS.length);
  for (const p of P.PRESETS) {
    assert.ok(P.GROUPS.some(g => g.id === p.group), p.id + ' group');
    for (const l of p.layers || []) if (l.type === 'text' && !l.fixed) assert.ok((p.fields || []).some(f => f.id === l.field), `${p.id}: layer field ${l.field}`);
  }
  assert.strictEqual(P.PRESETS.filter(p => p.group === 'lower').length, 8);
  assert.strictEqual(P.PRESETS.filter(p => p.kind === 'look').length, 5);
  assert.ok(!JSON.stringify(P.PRESETS).match(/motionvfx|mDocumentary/i), 'nothing of theirs in ours');
});

test('fonts: a family per role from what the computer has (the last one always), PostScript names for Premiere', () => {
  const av = P.available(f => f === 'Baskerville' || f === 'Segoe UI');
  assert.deepStrictEqual(av, { serif: ['Baskerville'], sans: ['Segoe UI'], mono: ['Courier New'] });
  assert.strictEqual(P.psName('Georgia', true), 'Georgia-Bold');
  assert.strictEqual(P.psName('Helvetica Neue', false), 'HelveticaNeue');
  assert.strictEqual(P.psName('My Odd Font', true), 'MyOddFont-Bold');
  const d = P.defaults(P.byId('hairline'), { serif: 'Baskerville' });
  assert.strictEqual(d.fonts.serif, 'Baskerville'); assert.strictEqual(d.text.name, 'Ruth Adler'); assert.strictEqual(d.colours.accent, '#c9a96a');
});

test('words: capitals, the two sides of "role: name" credit lines, a fixed mark', () => {
  const cr = P.byId('credits'), v = P.defaults(cr);
  assert.strictEqual(P.wordsOf(cr.layers[0], v), 'DIRECTOR\nCAMERA\nEDITOR\nSOUND');
  assert.strictEqual(P.wordsOf(cr.layers[1], v), 'Jacob Gersch\nAmal Said\nNoa Levin\nTom Rees');
  assert.strictEqual(P.wordsOf(P.byId('quote').layers[0], v), '“');
  assert.strictEqual(P.wordsOf(P.byId('tag').layers[0], P.defaults(P.byId('tag'))), 'FOUNDER, RIVERSIDE TRUST');
});

test('painter: a lower third draws its rule and both lines at the right places; text and art can be drawn apart; the in-animation moves them', () => {
  const p = P.byId('hairline'), v = P.defaults(p), c = ctx();
  P.paint(c, 1920, 1080, p, v, { t: 1 });
  const rects = c.calls.filter(x => x[0] === 'rect'), texts = c.calls.filter(x => x[0] === 'text');
  assert.strictEqual(rects.length, 1); assert.deepStrictEqual(rects[0].slice(1, 5).map(Math.round), [154, 869, 422, 3]);
  assert.deepStrictEqual(texts.map(t => t[1]), ['Ruth Adler', 'FOUNDER, RIVERSIDE TRUST']);
  assert.ok(/Georgia/.test(texts[0][4]) && /63px/.test(texts[0][4]), texts[0][4]);
  assert.strictEqual(Math.round(texts[0][3]), 826);
  const art = ctx(); P.paint(art, 1920, 1080, p, v, { text: false }); assert.ok(art.calls.every(x => x[0] === 'rect'));
  const words = ctx(); P.paint(words, 1920, 1080, p, v, { art: false }); assert.ok(words.calls.every(x => x[0] === 'text'));
  const early = ctx(); P.paint(early, 1920, 1080, p, v, { t: 0.2 });
  const r2 = early.calls.find(x => x[0] === 'rect'); assert.ok(r2[3] < 422, 'the rule is still growing: ' + r2[3]);
  const none = ctx(); P.paint(none, 1920, 1080, p, v, { t: 0 }); assert.strictEqual(none.calls.length, 0, 'nothing before it starts');
});

test('painter: every overlay, background and freeze look paints without throwing, at any size', () => {
  for (const p of P.PRESETS.filter(x => x.paint)) { for (const [W, H] of [[1920, 1080], [1080, 1920], [320, 180]]) { const c = ctx(); P.paint(c, W, H, p, P.defaults(p), { t: 0.5, frame: 3 }); assert.ok(c.calls.length > 0, p.id + ' at ' + W); } }
  const a = ctx(), b = ctx(); P.paint(a, 640, 360, P.byId('dust'), null, { frame: 1 }); P.paint(b, 640, 360, P.byId('dust'), null, { frame: 1 });
  assert.deepStrictEqual(a.calls, b.calls, 'the same seed paints the same dust');
});

test('Premiere plan: the art as one still, each line a text layer with PostScript font, pixel size, centre position and its own animation', () => {
  const p = P.byId('block'), v = P.defaults(p, { sans: 'Helvetica Neue' });
  const layers = P.premiereLayers(p, v, { width: 1920, height: 1080 }, { art: '/tmp/block.png' }, (font, text) => text.length * 30);
  assert.strictEqual(layers[0].kind, 'still'); assert.strictEqual(layers[0].path, '/tmp/block.png');
  const name = layers[1];
  assert.deepStrictEqual([name.kind, name.text, name.font, name.bold, name.size, name.align, name.anim.type], ['text', 'Ruth Adler', 'HelveticaNeue-Bold', true, 54, 'left', 'slide']);
  assert.strictEqual(name.x, Math.round(0.085 * 1920 + 150), 'left edge + half the measured width'); assert.strictEqual(name.y, Math.round(0.78 * 1080));
  assert.ok(name.anim.dx < 0 && name.anim.dy === 0);
  const noArt = P.premiereLayers(P.byId('tag'), P.defaults(P.byId('tag')), { width: 1920, height: 1080 }, {});
  assert.ok(noArt.every(l => l.kind === 'text') && noArt.length === 2);
  const empty = P.premiereLayers(p, Object.assign(v, { text: { name: '', role: ' ' } }), { width: 1920, height: 1080 }, { art: '/x' });
  assert.strictEqual(empty.length, 1, 'blank lines make no layers');
  const centred = P.premiereLayers(P.byId('chapter'), P.defaults(P.byId('chapter')), { width: 1920, height: 1080 }, {}, () => 500);
  assert.strictEqual(centred[1].x, 960, 'centred text keeps its centre');
});

test('movements: keyframes from the preset across the clip; a punch is short; a drift wanders but starts in place', () => {
  const k = P.moveKeys(P.byId('pushin'), 10, 25);
  assert.deepStrictEqual(k.map(x => [x.at, Math.round(x.scale * 100) / 100]), [[0, 100], [9.96, 112]]);
  const pan = P.moveKeys(P.byId('panleft'), 4, 25); assert.ok(pan[0].x > 0 && pan[1].x < 0 && pan[0].scale === 110);
  const punch = P.moveKeys(P.byId('punch'), 10, 25); assert.ok(punch[1].at <= 0.25 && punch[1].scale === 120);
  const drift = P.moveKeys(P.byId('drift'), 6, 25); assert.ok(drift.length >= 4 && drift[0].x === 0 && drift[0].y === 0 && drift.slice(1).some(d => d.x !== 0));
  assert.deepStrictEqual(P.moveKeys(P.byId('drift'), 6, 25), drift, 'the same every time');
});

test('what each editor can do: Resolve refuses keyframed moves (bar Punch) and bare transitions; Premiere does all', () => {
  assert.ok(P.PRESETS.every(p => P.readiness(p, false).ok));
  const no = P.PRESETS.filter(p => !P.readiness(p, true).ok).map(p => p.id);
  assert.deepStrictEqual(no, ['pushin', 'pullout', 'panleft', 'panright', 'tiltup', 'tiltdown', 'drift', 'trdissolve', 'trblack']);
  assert.ok(/Resolve doesn’t let add-ons/.test(P.readiness(P.byId('pushin'), true).why));
});

test('Fusion title: a group with Text+ per line, a Background+Rectangle per rule, a Merge each, exposed words/colours/fonts, a KeyStretcher', () => {
  const p = P.byId('hairline'), t = F.title(p, P.defaults(p, { serif: 'Georgia', sans: 'Arial' }), { width: 1920, height: 1080 });
  assert.strictEqual(t.name, 'JMG Hairline'); assert.strictEqual(t.kind, 'titles');
  const b = t.body;
  assert.ok(/^\{\n\tTools = ordered\(\) \{\n\t\tJMG_Hairline = GroupOperator \{/.test(b), b.slice(0, 80));
  assert.strictEqual((b.match(/= TextPlus \{/g) || []).length, 2);
  assert.strictEqual((b.match(/= RectangleMask \{/g) || []).length, 1);
  assert.strictEqual((b.match(/= Merge \{/g) || []).length, 3);
  assert.ok(b.includes('StyledText = Input { Value = "Ruth Adler", }') && b.includes('StyledText = Input { Value = "FOUNDER, RIVERSIDE TRUST", }'));
  assert.ok(b.includes('Font = Input { Value = "Georgia", }') && b.includes('Font = Input { Value = "Arial", }'));
  assert.ok(b.includes('InstanceInput { SourceOp = "T2", Source = "StyledText", Name = "Name", }'));
  assert.ok(b.includes('KS = KeyStretcher {') && b.includes('SourceEnd = Input { Value = 150, }') && b.includes('MainOutput1 = InstanceOutput { SourceOp = "KS", Source = "Result", }'));
  assert.ok(b.includes('R1Grow = BezierSpline {') && /\[0\] = \{ 0, RH/.test(b), 'the rule grows on a spline');
  assert.ok(b.includes('Expression = "Point(0.5 + 0 * (1 - M2.Blend), 0.5 + -0.035 * (1 - M2.Blend))"'), 'the name rises with its fade');
  assert.ok(b.includes('ActiveTool = "JMG_Hairline"'));
  assert.deepStrictEqual(Object.keys(t.inputs), ['T2', 'T3']); assert.strictEqual(t.inputs.T2.StyledText, 'Ruth Adler');
  // balanced braces, every tool's Inputs closed
  assert.strictEqual((b.match(/\{/g) || []).length, (b.match(/\}/g) || []).length, 'braces balance');
  const q = F.title(P.byId('quote'), P.defaults(P.byId('quote')));
  assert.ok(q.body.includes('StyledText = Input { Value = "“", }') && q.body.includes('LayoutWidth = Input { Value = 0.7, }'));
  const esc = F.title(P.byId('tag'), Object.assign(P.defaults(P.byId('tag')), { text: { name: 'Say "hi"\\now', role: 'a\nb' } }));
  assert.ok(esc.body.includes('Value = "Say \\"hi\\"\\\\now"') && esc.body.includes('Value = "A\\nB"'), 'quotes, backslashes and new lines escaped');
});

test('Fusion generators: every overlay, background and freeze look has one; film grain is a FastNoise; the letterbox a masked black; every template of the pack lists', () => {
  const g = F.generator(P.byId('grain'), null, { width: 1920, height: 1080 });
  assert.strictEqual(g.name, 'JMG Film grain'); assert.strictEqual(g.kind, 'generators'); assert.strictEqual(g.blend, 'overlay');
  assert.ok(g.body.includes('Out = FastNoise {') && g.body.includes('SeetheRate = Input { Value = 6, }'));
  const lb = F.generator(P.byId('letterbox'), null, { width: 1920, height: 1080 });
  assert.ok(lb.body.includes('= RectangleMask {') && lb.body.includes('Invert = Input { Value = 1, }') && lb.body.includes('Height = Input { Value = ' + Math.round((1920 / 2.39) / 1080 * 1e6) / 1e6 + ', }'));
  const box = F.generator(P.byId('frzbox'), { cx: 0.3, cy: 0.4 }, {});
  assert.ok(box.body.includes('Center = Input { Value = { 0.3, 0.6 }, }'), 'y flipped for Fusion');
  assert.strictEqual(F.generator(P.byId('hairline'), null), null, 'titles are not generators');
  const all = F.all({ width: 1920, height: 1080 });
  assert.strictEqual(all.length, 46);
  assert.strictEqual(new Set(all.map(t => t.name)).size, all.length, 'template names are unique');
  assert.ok(all.every(t => (t.body.match(/\{/g) || []).length === (t.body.match(/\}/g) || []).length), 'every template balances its braces');
  assert.ok(all.some(t => t.name === 'JMG Light leak' && t.kind === 'generators'), 'transition washes are generators');
  assert.ok(all.every(t => !/undefined|NaN/.test(t.body)), 'no undefined values');
});

test('looks: a .cube of the right size that keeps black black-ish and white bright, Lumetri settings per look, a quick pixel preview', () => {
  const c = L.cube('faded', 5).split('\n');
  assert.strictEqual(c[1], 'LUT_3D_SIZE 5'); assert.strictEqual(c.length - 1, 4 + 125);
  const first = c[4].split(' ').map(Number), last = c[128].split(' ').map(Number);
  assert.ok(first.every(x => x >= 0 && x < 0.2) && last.every(x => x > 0.8 && x <= 1), c[4] + ' / ' + c[128]);
  for (const id of Object.keys(L.LOOKS)) { assert.ok(L.LOOKS[id].lumetri && Object.keys(L.LOOKS[id].lumetri).length, id); assert.ok(/\.cube$/.test(L.fileName(id))); }
  const sep = L.LOOKS.sepia.f([0.5, 0.5, 0.5]); assert.ok(sep[0] > sep[1] && sep[1] > sep[2], 'sepia is brown');
  const bw = L.LOOKS.bw.f([0.9, 0.2, 0.2]); assert.ok(bw[0] === bw[1] && bw[1] === bw[2]);
  const d = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]); L.applyToImageData('cold', d); assert.ok(d[2] >= d[0] && d[6] >= d[4], 'cold is bluer');
});

test('a short tag of the values, stable and file-safe', () => {
  const a = P.hashOf({ id: 'x', v: 1 }), b = P.hashOf({ id: 'x', v: 1 }), c = P.hashOf({ id: 'x', v: 2 });
  assert.strictEqual(a, b); assert.notStrictEqual(a, c); assert.ok(/^[0-9a-z]+$/.test(a));
});
