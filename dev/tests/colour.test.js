const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/34-colour.js']);
const C = US.colour;

test('Lab conversion: white, black, grey and a warm colour', () => {
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);
  const w = C.rgbToLab(255, 255, 255); near(w[0], 100, 0.1); near(w[1], 0, 0.1); near(w[2], 0, 0.1);
  assert.deepStrictEqual(C.rgbToLab(0, 0, 0).map(x => Math.round(x)), [0, 0, 0]);
  near(C.rgbToLab(119, 119, 119)[0], 50, 1);
  const warm = C.rgbToLab(200, 150, 100); assert.ok(warm[1] > 5 && warm[2] > 25);
});

test('image statistics pick up brightness, contrast and warmth', () => {
  const img = (fn, n = 400) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const [r, g, b] = fn(i); d.set([r, g, b, 255], i * 4); } return d; };
  const flat = C.stats(img(() => [128, 128, 128])), split = C.stats(img(i => (i % 4 < 2 ? [40, 40, 40] : [220, 220, 220])));
  assert.ok(flat.sL < 0.01 && split.sL > 30);
  const warm = C.stats(img(() => [170, 128, 90])), cool = C.stats(img(() => [90, 128, 170]));
  assert.ok(warm.b > 20 && cool.b < -20);
  assert.ok(C.difference(flat, flat) === 0 && C.difference(warm, cool) > 40);
});

// A pretend camera: how Lumetri moves the measurements, with cross-talk and a soft curve, from a different starting look.
function camera(base) {
  return async v => {
    const e = v.exposure, k = v.contrast / 100, s = v.saturation / 100;
    const L = base.L + 14 * e - 0.6 * Math.sign(e) * e * e + 0.02 * v.temperature;
    return { L, sL: base.sL * (1 + 0.55 * k) + 0.8 * e, a: base.a * s + 0.22 * v.tint + 0.03 * v.temperature, b: base.b * s + 0.3 * v.temperature - 0.04 * v.tint, C: base.C * s + 0.05 * Math.abs(v.temperature) };
  };
}

test('camera matching converges from a darker, cooler, flatter shot', async () => {
  const ref = { L: 58, sL: 22, a: 3, b: 12, C: 18 };
  const measure = camera({ L: 47, sL: 17, a: -2, b: 2, C: 14 });
  let calls = 0; const counted = async v => { calls++; return measure(v); };
  const r = await C.matchLoop(ref, counted);
  assert.ok(r.history[0] > 10, 'starts clearly different');
  assert.ok(r.history[r.history.length - 1] < 1.5, 'ends close: ' + r.history.map(x => x.toFixed(2)).join(' → '));
  assert.ok(r.values.exposure > 0.5 && r.values.temperature > 10 && r.values.contrast > 10);
  assert.ok(calls <= 1 + 5 + 4 + 1, 'one base render, five calibration renders, at most four adjustments (+ going back to the best)');
});

test('matching re-uses a calibration and stays inside Lumetri’s ranges', async () => {
  const cam = camera({ L: 30, sL: 20, a: 5, b: 5, C: 20 });
  const first = await C.matchLoop({ L: 40, sL: 22, a: 3, b: 8, C: 18 }, cam);
  let calls = 0;
  const ref = { L: 95, sL: 5, a: 0, b: 0, C: 0 };                 // impossible target: everything clamps
  const r = await C.matchLoop(ref, async v => { calls++; return cam(v); }, { gains: first.gains });
  assert.ok(calls <= 1 + 4 + 1, 'no calibration renders the second time: ' + calls);
  for (const k of C.KNOBS) assert.ok(r.values[k.key] >= k.min && r.values[k.key] <= k.max, k.key + ' ' + r.values[k.key]);
  assert.ok(r.values.exposure > 2, 'pushes exposure up: ' + r.values.exposure);
  assert.ok(r.history[r.history.length - 1] <= r.history[0], 'never ends worse than it started');
});

test('strongly coupled, weak controls (log footage in a colour-managed sequence) still converge', async () => {
  // measured in Premiere 26 on V-Log-read footage: tint also cools, saturation barely moves chroma
  const base = { L: 48.4, sL: 25.0, a: 0, b: -0.2, C: 5.2 };
  const cam = async v => ({ L: base.L + 8.8 * v.exposure, sL: base.sL + 1.2 * v.exposure + 0.028 * v.contrast, a: 0.26 * v.tint + 0.05 * v.temperature,
    b: base.b - 0.19 * v.tint + 0.22 * v.temperature, C: base.C + 0.047 * (v.saturation - 100) + 0.12 * Math.abs(v.tint) + 0.11 * Math.abs(v.temperature) });
  const ref = { L: 48.4, sL: 21.9, a: 4.1, b: 0, C: 9.7 };
  const r = await C.matchLoop(ref, cam);
  assert.ok(r.history[r.history.length - 1] < 2, r.history.map(x => x.toFixed(1)).join(' → '));
});

test('Stop is honoured during matching', async () => {
  let n = 0;
  await assert.rejects(C.matchLoop({ L: 50, sL: 20, a: 0, b: 0, C: 10 }, camera({ L: 40, sL: 20, a: 0, b: 0, C: 10 }), { check: () => { if (++n > 2) throw new US.UserError('CANCELLED'); } }), e => e.code === 'CANCELLED');
});

test('assistant phrases route to grade and match', () => {
  assert.deepStrictEqual(US.actions.get('colour.grade').match('make these clips black and white'), { look: 'bw' });
  assert.deepStrictEqual(US.actions.get('colour.grade').match('a warm look please'), { look: 'warm' });
  assert.ok(US.actions.get('colour.match').match('match the cameras to this shot'));
  assert.strictEqual(US.actions.get('colour.match').match('match the music to the cut'), null);
});

test('Premiere’s looks are grouped into film, SpeedLooks per camera, black & white and technical', () => {
  const g = C.groupLooks(['2 Strip', 'Cinespace 25', 'Fuji Eterna 250D Fuji 3510 (by Adobe)', 'Monochrome Punch', 'SL Blue Cold (Arri Alexa)', 'SL Blue Cold (Universal)', 'SL Noir Tri-X (Universal)', 'SL Gold heat (GoPro 5800k)', 'Full to Legal Range, 8-bit']);
  assert.deepStrictEqual(g.film.map(l => l.label), ['2 Strip', 'Cinespace 25', 'Fuji Eterna 250D Fuji 3510']);
  assert.deepStrictEqual(g.speed.Universal.map(l => l.label), ['Blue Cold', 'Noir Tri-X']);
  assert.strictEqual(g.speed['GoPro 5800k'][0].label, 'Gold Heat');
  assert.deepStrictEqual(g.mono.map(l => l.label), ['Monochrome Punch', 'SpeedLook Noir Tri-X']);
  assert.strictEqual(g.technical.length, 1);
  assert.deepStrictEqual(C.speedCameras(g), ['Universal', 'Arri Alexa', 'GoPro 5800k']);
});

test('log profile is guessed from camera file names', () => {
  assert.strictEqual(C.guessLog('/Volumes/Card/PRIVATE/M4ROOT/P1003525.MOV').space, 'Panasonic V-Log/V-Gamut');
  assert.strictEqual(C.guessLog('C0042.MP4').space, 'Sony S-Log3/S-Gamut3.Cine');
  assert.strictEqual(C.guessLog('DJI_0012.MP4').camera, 'DJI');
  assert.strictEqual(C.guessLog('interview_vlog_cam2.mov').camera, 'Panasonic');
  assert.strictEqual(C.guessLog('I001_interview.mp4'), null);
  assert.ok(C.looksFlat({ sL: 12, C: 8 }) && !C.looksFlat({ sL: 25, C: 20 }));
});

test('LUT folders for Mac and Windows', () => {
  const mac = C.lutFolders('darwin', {}, '/Users/jacob');
  assert.deepStrictEqual(mac[0], { kind: 'Creative', dir: '/Users/jacob/Library/Application Support/Adobe/Common/LUTs/Creative' });
  assert.ok(mac.some(f => f.dir === '/Library/Application Support/Adobe/Common/LUTs/Input'));
  const win = C.lutFolders('win32', { APPDATA: 'C:\\Users\\jacob\\AppData\\Roaming', ProgramFiles: 'C:\\Program Files' }, 'C:\\Users\\jacob');
  assert.strictEqual(win[0].dir, 'C:\\Users\\jacob\\AppData\\Roaming\\Adobe\\Common\\LUTs\\Creative');
  assert.ok(win.some(f => f.dir === 'C:\\Program Files\\Adobe\\Common\\LUTs\\Technical'));
});

test('a .cube LUT is read and applied (identity, channel swap, domain)', () => {
  const cube = (N, fn, head = '') => { let s = `TITLE "t"\n${head}LUT_3D_SIZE ${N}\n`; for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) s += fn(r / (N - 1), g / (N - 1), b / (N - 1)).map(x => x.toFixed(5)).join(' ') + '\n'; return s; };
  const px = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 200, 100, 30, 12, 140, 250]);
  const id = C.parseCube(cube(17, (r, g, b) => [r, g, b]));
  assert.ok(C.pixelDistance(C.applyLut(id, px), px) < 0.6);
  const swap = C.applyLut(C.parseCube(cube(9, (r, g, b) => [b, g, r])), px);
  assert.deepStrictEqual(Array.from(swap.slice(6, 9)).map(x => Math.round(x / 4)), [8, 25, 50]);
  const rgba = C.applyLut(id, Uint8ClampedArray.from([10, 20, 30, 77]), 4);
  assert.strictEqual(rgba[3], 77);
  assert.strictEqual(C.parseCube('LUT_1D_SIZE 4\n0 0 0\n1 1 1'), null);
  assert.strictEqual(C.parseCube(cube(3, (r, g, b) => [r, g, b]).split('\n').slice(0, -5).join('\n')), null, 'truncated file');
});

test('a LUT is found in the Look menu only when the match is clear', () => {
  const img = v => Uint8ClampedArray.from({ length: 30 }, () => v);
  const menu = [null, img(10), img(60), img(120), img(121)];
  assert.strictEqual(C.pickLookIndex(menu, img(58)), 2);
  assert.strictEqual(C.pickLookIndex(menu, img(200)), null, 'nothing close');
  assert.strictEqual(C.pickLookIndex([null, img(50), img(53)], img(51)), null, 'two similar candidates');
  assert.strictEqual(C.pickLookIndex([null, img(50), img(50)], img(51)), 1, 'same LUT listed twice');
});

test('look tables: the test image read back unchanged is an identity LUT; a rendered table becomes that look', () => {
  const px = C.tablePixels();
  assert.strictEqual(px.length, C.TW * C.TH * 4);
  const id = C.tableToLut(px);
  const img = new Uint8ClampedArray([10, 200, 30, 255, 128, 64, 250, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  const same = C.applyLut(id, img, 4);
  for (let i = 0; i < img.length; i++) if (i % 4 !== 3) assert.ok(Math.abs(same[i] - img[i]) <= 1, `${i}: ${img[i]} → ${same[i]}`);
  // a "render" that swaps red and blue: the table applies the same swap to any colour
  const swapped = px.slice(); for (let i = 0; i < swapped.length; i += 4) { const r = swapped[i]; swapped[i] = swapped[i + 2]; swapped[i + 2] = r; }
  const out = C.applyLut(C.tableToLut(swapped), img, 4);
  assert.ok(Math.abs(out[0] - 30) <= 1 && Math.abs(out[2] - 10) <= 1 && Math.abs(out[1] - 200) <= 1, Array.from(out.slice(0, 3)).join(','));
});

test('quick grade preview: neutral changes nothing; warmer is warmer, black & white has no colour, brighter is brighter', () => {
  const w = 8, h = 4, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 150; px[i + 1] = 120; px[i + 2] = 90; px[i + 3] = 255; }
  const mean = (a, c) => { let s = 0, n = 0; for (let i = c; i < a.length; i += 4) { s += a[i]; n++; } return s / n; };
  const n0 = C.quickGrade(px, {}, w, h);
  assert.ok(Math.abs(mean(n0, 0) - 150) <= 1 && Math.abs(mean(n0, 2) - 90) <= 1, 'neutral');
  const warm = C.quickGrade(px, C.GRADES.warm.values, w, h);
  assert.ok(mean(warm, 0) - mean(warm, 2) > 60, 'warmer');
  const bw = C.quickGrade(px, C.GRADES.bw.values, w, h);
  assert.ok(Math.abs(mean(bw, 0) - mean(bw, 2)) < 1, 'black & white');
  assert.ok(mean(C.quickGrade(px, { exposure: 1 }, w, h), 1) > 150, 'brighter');
});
