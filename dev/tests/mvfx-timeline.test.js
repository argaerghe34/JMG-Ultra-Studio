// mVFX on the timeline, against a stand-in Premiere (jsx/host.jsx + jsx/tools/mvfx.jsx run in Node): a title's text
// layers are placed INSIDE the picture (Motion › Position is a fraction of the frame, never pixels – pixels threw every
// title far off screen, which is why plain titles "did nothing"), their fade keys, a camera move's keys, a second title
// over the same moment on the next tracks, a moving overlay's strength and blend, and a picture dropped by a drag.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');

const TICKS = 254016000000;
function prop(name, value) {
  const p = { displayName: name, value, keys: [], varying: false, getValue: () => p.value, setValue: v => { p.value = v; return true; }, setTimeVarying: v => { p.varying = v; }, isTimeVarying: () => p.varying,
    addKey: t => { p.keys.push({ t: t.seconds, v: null }); }, setValueAtKey: (t, v) => { const k = p.keys.find(x => Math.abs(x.t - t.seconds) < 1e-9); if (k) k.v = v; }, getKeys: () => p.keys.map(k => ({ seconds: k.t })), removeKey: () => {}, setInterpolationTypeAtKey: () => {} };
  return p;
}
const coll = list => Object.defineProperty(list, 'numItems', { get: () => list.length });
const comp = (name, props) => ({ displayName: name, matchName: name, properties: coll(props) });
const PARAM = JSON.stringify({ mTextParam: { mAlignment: 2, mStyleSheet: { mFillColor: { mParamValues: [[0, 16777215]] }, mFontName: { mParamValues: [[0, 'MyriadPro-Regular']] }, mFontSize: { mParamValues: [[0, 100]] }, mTracking: { mParamValues: [[0, 0]] }, mFauxBold: { mParamValues: [[0, false]] }, mText: 'Your Title Here' } } });
function clip(start, end, extra) {
  const c = Object.assign({ name: '', start: { seconds: start }, inPoint: { seconds: 0 }, getSpeed: () => 1, getMGTComponent: () => null,
    components: coll([comp('Opacity', [prop('Opacity', 100), prop('Blend Mode', 0)]), comp('Motion', [prop('Position', [0.5, 0.5]), prop('Scale', 100)])]) }, extra);
  let e = { seconds: end };
  Object.defineProperty(c, 'end', { get: () => e, set: v => { e = { seconds: typeof v === 'number' ? v : v.seconds }; } });
  return c;
}
function world(trackNames = ['Video 1', 'mVFX 1', 'mVFX 2', 'mVFX 3', 'mVFX 4']) {
  const tracks = trackNames.map(name => ({ name, clips: coll([]) }));
  const seq = { sequenceID: 's1', timebase: TICKS / 25, frameSizeHorizontal: 1920, frameSizeVertical: 1080, videoTracks: Object.assign(tracks, { numTracks: tracks.length }), audioTracks: Object.assign([], { numTracks: 0 }),
    importMGT(file, ticks, t) { const s = Number(ticks) / TICKS, c = clip(s, s + 5); c.components.push(comp('Text', [prop('Source Text', PARAM)])); tracks[t].clips.push(c); return c; } };
  const ctx = { app: { path: '/Applications/Adobe Premiere Pro 2027/Adobe Premiere Pro 2027.app', version: '27.0', project: { rootItem: {}, path: '/p/test.prproj', activeSequence: seq, sequences: Object.assign([seq], { numSequences: 1 }) } }, qe: {},
    File: function (p) { this.exists = /Basic Title\.mogrt$/.test(p); this.fsName = p; }, Folder: function () {}, Time: function () { this.seconds = 0; }, JSON, Math, String, Number, RegExp, Array, Object, Date, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, $: { writeln() {}, sleep() {} } };
  vm.createContext(ctx);
  for (const f of ['host.jsx', path.join('tools', 'mvfx.jsx')]) vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx', f), 'utf8'), ctx, { filename: f });
  return { U: ctx.UStudio, seq, tracks, ctx };
}
const of = (c, comp, name) => c.components.find(x => x.displayName === comp).properties.find(p => p.displayName === name);
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, JSON.stringify(a));   // values made inside the script's own world
const inFrame = p => p[0] > 0 && p[0] < 1 && p[1] > 0 && p[1] < 1;

test('a plain title: each text layer lands inside the picture – its Position is the pixels divided by the sequence’s size', () => {
  const { U, tracks } = world();
  const r = U.fn.mvfxApply({ seqId: 's1', start: 1, seconds: 5, name: 'Hairline', layers: [
    { kind: 'text', text: 'Mira Haddad', font: 'Georgia', size: 63, colour: '#f4f1ea', x: 345, y: 826, anim: { type: 'rise', inSec: 0.6, outSec: 0.5, dx: 0, dy: 38 } },
    { kind: 'text', text: 'NURSE', font: 'ArialMT', size: 30, colour: '#b9b4a8', x: 210, y: 913, anim: { type: 'fade', inSec: 0.7, outSec: 0.5, delay: 0.4 } }] });
  assert.strictEqual(r.placed, 2); same(r.tracks, [1, 2]); assert.strictEqual(r.trackName, 'mVFX 1');
  const name = tracks[1].clips[0], role = tracks[2].clips[0], pos = of(name, 'Motion', 'Position');
  // rise: keyframed from a little below to its place
  assert.ok(pos.varying && pos.keys.length === 2, 'two position keys: ' + JSON.stringify(pos.keys));
  for (const k of pos.keys) assert.ok(inFrame(k.v), 'inside the frame: ' + k.v);
  assert.ok(Math.abs(pos.keys[1].v[0] - 345 / 1920) < 1e-6 && Math.abs(pos.keys[1].v[1] - 826 / 1080) < 1e-6, 'settles where the preset puts it: ' + pos.keys[1].v);
  assert.ok(Math.abs(pos.keys[0].v[1] - (826 + 38) / 1080) < 1e-6, 'starts 38 px lower');
  same(of(role, 'Motion', 'Position').value.map(x => Math.round(x * 1000) / 1000), [0.109, 0.845]);
  assert.strictEqual(JSON.parse(of(name, 'Text', 'Source Text').value).mTextParam.mStyleSheet.mText, 'Mira Haddad');
  assert.strictEqual(name.end.seconds, 6); assert.strictEqual(name.name, 'Hairline');
  // the second layer waits 0.4 s, then fades in: 0 at the start, still 0 at 0.4 s, full at 1.1 s, out at the end
  const op = of(role, 'Opacity', 'Opacity').keys.map(k => [Math.round(k.t * 100) / 100, k.v]);   // key times are in the clip's own time
  same(op, [[0, 0], [0.4, 0], [1.1, 100], [4.5, 100], [4.96, 0]]);
});

test('Premiere hands back a clip without its Source Text (seen in 27.0): the words are set on the clip found on the track instead', () => {
  const { U, seq, tracks } = world(), real = seq.importMGT;
  seq.importMGT = function (f, ticks, t) { real.call(seq, f, ticks, t); return clip(Number(ticks) / TICKS, Number(ticks) / TICKS + 5); };   // a bare stand-in object
  const r = U.fn.mvfxApply({ seqId: 's1', start: 2, seconds: 4, layers: [{ kind: 'text', text: 'Mira Haddad', x: 960, y: 900, anim: { type: 'fade' } }] });
  assert.ok(r.text[0].words, JSON.stringify(r));
  assert.strictEqual(JSON.parse(of(tracks[1].clips[0], 'Text', 'Source Text').value).mTextParam.mStyleSheet.mText, 'Mira Haddad');
});

test('Premiere 27.0: Source Text reads back as one character – it is left alone (writing it blanked the text), and said; a route named by the probe still writes', () => {
  const { U, seq, tracks } = world(), real = seq.importMGT;
  let stored = '\u017c';   // what 27.0 reads back: one character of a binary value
  const blob = () => { const p = prop('Source Text', ''); p.getValue = () => stored.charAt(0); p.setValue = v => { stored = v; return true; }; return p; };
  seq.importMGT = function (f, ticks, t) { const s = Number(ticks) / TICKS, c = clip(s, s + 5); c.components.push(comp('Text', [blob(), prop('Position', [0.5, 0.53])])); tracks[t].clips.push(c); return c; };
  const L = [{ kind: 'text', text: 'Mira Haddad', font: 'Georgia', size: 63, colour: '#c9a96a', x: 345, y: 826, anim: { type: 'fade' } }];
  const r = U.fn.mvfxApply({ seqId: 's1', start: 1, seconds: 5, layers: L });
  assert.ok(!r.text[0].words && stored === '\u017c', 'nothing written: ' + JSON.stringify(r.text[0]));
  assert.ok(/Properties/.test(r.note) && r.log.some(x => /can’t be read/.test(x)), r.note + ' | ' + r.log.join(' | '));
  const rj = U.fn.mvfxApply({ seqId: 's1', start: 10, seconds: 5, layers: L, textRoute: 'json' });
  assert.ok(rj.text[0].route === 'json', JSON.stringify(rj.text[0]));
  const o = JSON.parse(stored).mTextParam.mStyleSheet;
  assert.strictEqual(o.mText, 'Mira Haddad'); assert.strictEqual(o.mFontName.mParamValues[0][1], 'Georgia'); assert.strictEqual(o.mFontSize.mParamValues[0][1], 63); assert.strictEqual(o.mFillColor.mParamValues[0][1], 0xc9a96a);
  assert.ok(rj.log.some(x => /written from scratch \(was \\u017c\): json → \{/.test(x)), rj.log.join(' | '));
  // one route asked for: 4-byte length first, then the JSON
  const r2 = U.fn.mvfxApply({ seqId: 's1', start: 20, seconds: 5, layers: L, textRoute: 'len32-bytes' });
  const n = stored.length - 4;
  assert.strictEqual(r2.text[0].route, 'len32-bytes'); assert.deepStrictEqual([0, 1, 2, 3].map(i => stored.charCodeAt(i)), [n & 255, (n >> 8) & 255, 0, 0]); assert.strictEqual(stored.slice(4, 5), '{');
  U.fn.mvfxApply({ seqId: 's1', start: 40, seconds: 5, layers: L, textRoute: 'len32-utf16' });
  assert.deepStrictEqual([stored.charCodeAt(0), stored.charCodeAt(1), stored.charAt(2)], [stored.length - 2, 0, '{']);
});

test('a second title over the same moment takes the next free mVFX tracks; one later is back on the first', () => {
  const { U } = world(), L = [{ kind: 'text', text: 'A', x: 960, y: 540, anim: { type: 'fade' } }, { kind: 'text', text: 'B', x: 960, y: 600, anim: { type: 'fade' } }];
  same(U.fn.mvfxApply({ seqId: 's1', start: 1, seconds: 5, layers: L }).tracks, [1, 2]);
  same(U.fn.mvfxApply({ seqId: 's1', start: 3, seconds: 5, layers: L }).tracks, [3, 4]);
  same(U.fn.mvfxApply({ seqId: 's1', start: 20, seconds: 2, layers: L }).tracks, [1, 2]);
});

test('a camera move: Position keys are fractions of the frame added to where the clip sits (a pan stays in the picture)', () => {
  const { U, tracks } = world();
  tracks[0].clips.push(clip(0, 4));
  const r = U.fn.mvfxMove({ seqId: 's1', targets: [{ kind: 'video', track: 0, start: 0 }], keys: [{ at: 0, scale: 110, x: 0.03, y: 0 }, { at: 3.96, scale: 110, x: -0.03, y: 0 }], ease: true });
  assert.strictEqual(r.done, 1);
  const pos = of(tracks[0].clips[0], 'Motion', 'Position');
  same(pos.keys.map(k => k.v.map(x => Math.round(x * 100) / 100)), [[0.53, 0.5], [0.47, 0.5]]);
  same(of(tracks[0].clips[0], 'Motion', 'Scale').keys.map(k => k.v), [110, 110]);
});

test('Every clip: a move with onlyPicture leaves our own mVFX tracks alone (titles, grain, held frames), and still moves the picture', () => {
  const { U, tracks } = world();
  tracks[0].clips.push(clip(0, 4)); tracks[1].clips.push(clip(1, 6));
  const keys = [{ at: 0, scale: 100, x: 0, y: 0 }, { at: 3.96, scale: 112, x: 0, y: 0 }];
  const r = U.fn.mvfxMove({ seqId: 's1', targets: [{ kind: 'video', track: 0, start: 0 }, { kind: 'video', track: 1, start: 1 }], keys, ease: true, onlyPicture: true });
  assert.strictEqual(r.done, 1); same(r.skipped, [{ start: 1, why: 'a title or overlay of ours' }]);
  assert.strictEqual(of(tracks[1].clips[0], 'Motion', 'Scale').keys.length, 0, 'the title on mVFX 1 is untouched');
  assert.strictEqual(of(tracks[0].clips[0], 'Motion', 'Scale').keys.length, 2);
  // chosen by hand (selected clips): a title can still be moved
  assert.strictEqual(U.fn.mvfxMove({ seqId: 's1', targets: [{ kind: 'video', track: 1, start: 1 }], keys, ease: true }).done, 1);
});

test('keyframes: a light leak drifts a few hundredths of the frame (not thousands of pixels); an overlay’s Strength is the height of its fade', () => {
  const { U, seq } = world(), c = clip(2, 5), log = [];
  U.mvfxText.animate(seq, c, { type: 'drift', dx: 58, dy: 22 }, null, log);
  for (const k of of(c, 'Motion', 'Position').keys) assert.ok(Math.abs(k.v[0] - 0.5) <= 58 / 1920 + 1e-9 && Math.abs(k.v[1] - 0.5) <= 22 / 1080 + 1e-9, 'a small drift: ' + k.v);
  const g = clip(0, 5);
  U.mvfxText.animate(seq, g, { type: 'fade', inSec: 0.4, outSec: 0.4, peak: 0.35 }, null, log);
  same(of(g, 'Opacity', 'Opacity').keys.map(k => Math.round(k.v)), [0, 35, 35, 0]);
  const b = clip(0, 1);
  U.mvfxText.animate(seq, b, { type: 'burst', peak: 0.5 }, null, log);
  same(of(b, 'Opacity', 'Opacity').keys.map(k => k.v), [0, 50, 0]);
  assert.strictEqual(log.length, 0, log.join('; '));
});

test('a picture dropped by a drag: found by its file on the active sequence, given its length, blend mode, fade and name; nothing found says so', () => {
  const { U, tracks } = world();
  assert.strictEqual(U.fn.mvfxDropped({ path: '/p/vignette-dropped-1.png' }).found, false);
  const moved = [];
  const c = clip(7, 12, { projectItem: { getMediaPath: () => '/P/Vignette-dropped-1.png', moveBin: b => moved.push(b) } });
  tracks[0].clips.push(clip(0, 4, { projectItem: { getMediaPath: () => '/p/other.mp4' } }), c);
  U.ensureBin = p => 'bin:' + p;
  const r = U.fn.mvfxDropped({ path: '/p/vignette-dropped-1.png', seconds: 8, blend: 'screen', anim: { type: 'fade', inSec: 0.4, outSec: 0.4 }, name: 'Vignette' });
  assert.ok(r.found && r.track === 0 && r.start === 7 && r.end === 15, JSON.stringify(r));
  assert.strictEqual(of(c, 'Opacity', 'Blend Mode').value, 10); assert.strictEqual(c.name, 'Vignette');
  assert.strictEqual(of(c, 'Opacity', 'Opacity').keys.length, 4); same(moved, ['bin:JMG Ultra Studio/mVFX']);
  // another clip follows before the asked length: it keeps its own length rather than run over it
  const d = clip(20, 25, { projectItem: { getMediaPath: () => '/p/gate-dropped-2.png', moveBin() {} } });
  tracks[0].clips.push(d, clip(26, 30, { projectItem: { getMediaPath: () => '/p/other.mp4' } }));
  const r2 = U.fn.mvfxDropped({ path: '/p/gate-dropped-2.png', seconds: 10 });
  assert.ok(r2.found && r2.end === 25 && /another clip follows/.test(r2.log.join(' ')), JSON.stringify(r2));
});
