/* JMG Ultra Studio – Colour: looks previewed on your own frame (rendered by Premiere), quick grading, and camera
   matching. Everything it adds is an ordinary Lumetri Color effect the editor can open and tweak. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path');
  US.addIcon('palette', 'M10 3a7 7 0 1 0 0 14c1 0 1.5-.7 1.5-1.4 0-.9-.8-1.2-.8-2 0-.7.6-1.1 1.3-1.1H14a3 3 0 0 0 3-3C17 5.8 14 3 10 3zM6.5 9.5h.01M8.5 6.5h.01M12 6.5h.01M14 9.5h.01');

  /* ---------- colour maths (pure, unit-tested) ---------- */
  function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function rgbToLab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const fx = labF(X), fy = labF(Y), fz = labF(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  /** Colour statistics of an image (RGBA bytes): mean and spread of lightness, mean a and b (tint, warmth), mean chroma. */
  function stats(data) {
    let n = 0, sL = 0, sL2 = 0, sa = 0, sb = 0, sc = 0;
    for (let i = 0; i < data.length; i += 4 * 2) {          // every other pixel is plenty
      const [L, a, b] = rgbToLab(data[i], data[i + 1], data[i + 2]);
      n++; sL += L; sL2 += L * L; sa += a; sb += b; sc += Math.hypot(a, b);
    }
    const L = sL / n;
    return { L, sL: Math.sqrt(Math.max(0, sL2 / n - L * L)), a: sa / n, b: sb / n, C: sc / n };
  }
  /** How far apart two looks are (mean colour + contrast), in rough ΔE units. */
  function difference(x, y) { return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b, (x.sL - y.sL) * 0.6, (x.C - y.C) * 0.6); }

  /** Read a .cube or .itx 3D LUT: {size, min, max, data (r changes fastest)}; null when the file has no 3D table. */
  function parseCube(text) {
    let size = 0, min = [0, 0, 0], max = [1, 1, 1], data = null, n = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line[0] === '#') continue;
      const m = /^(LUT_3D_SIZE|DOMAIN_MIN|DOMAIN_MAX|LUT_1D_SIZE|TITLE|LUT_3D_INPUT_RANGE|LUT_1D_INPUT_RANGE)\b\s*(.*)$/.exec(line);
      if (m) {
        if (m[1] === 'LUT_3D_SIZE') { size = +m[2]; data = new Float32Array(size * size * size * 3); }
        else if (m[1] === 'DOMAIN_MIN') min = m[2].split(/\s+/).map(Number);
        else if (m[1] === 'DOMAIN_MAX') max = m[2].split(/\s+/).map(Number);
        else if (m[1] === 'LUT_3D_INPUT_RANGE') { const r = m[2].split(/\s+/).map(Number); min = [r[0], r[0], r[0]]; max = [r[1], r[1], r[1]]; }
        continue;
      }
      if (!data || !/^[-\d.]/.test(line)) continue;
      const v = line.split(/\s+/); if (v.length < 3 || n >= data.length) continue;
      data[n++] = +v[0]; data[n++] = +v[1]; data[n++] = +v[2];
    }
    return data && n === data.length ? { size, min, max, data } : null;
  }
  /** Apply a 3D LUT (trilinear) to packed 8-bit RGB values [r,g,b,r,g,b…] (or RGBA with stride 4). */
  function applyLut(lut, px, stride = 3) {
    const { size: N, data: D, min, max } = lut, out = new Uint8ClampedArray(px.length), s1 = N - 1;
    for (let i = 0; i < px.length; i += stride) {
      const p = [0, 1, 2].map(c => US.clamp((px[i + c] / 255 - min[c]) / (max[c] - min[c]), 0, 1) * s1);
      const f = p.map(Math.floor).map(x => Math.min(x, s1 - 1)), t = p.map((x, c) => x - f[c]);
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let k = 0; k < 8; k++) {
          const dr = k & 1, dg = (k >> 1) & 1, db = (k >> 2) & 1;
          const w = (dr ? t[0] : 1 - t[0]) * (dg ? t[1] : 1 - t[1]) * (db ? t[2] : 1 - t[2]);
          if (w) v += w * D[(((f[2] + db) * N + (f[1] + dg)) * N + (f[0] + dr)) * 3 + c];
        }
        out[i + c] = Math.round(v * 255);
      }
      if (stride === 4) out[i + 3] = px[i + 3];
    }
    return out;
  }
  /** Mean colour distance between two packed RGB images (0 = identical). */
  function pixelDistance(a, b, stride = 3) {
    let s = 0, n = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += stride) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++; }
    return n ? s / n / 3 : 0;
  }

  /* The Lumetri controls camera matching adjusts, with the size of the step used to measure what each one does. */
  const KNOBS = [
    { key: 'exposure', metric: 'L', step: 0.5, min: -4, max: 4, start: 0 },
    { key: 'contrast', metric: 'sL', step: 25, min: -100, max: 100, start: 0 },
    { key: 'tint', metric: 'a', step: 25, min: -100, max: 100, start: 0 },
    { key: 'temperature', metric: 'b', step: 25, min: -100, max: 100, start: 0 },
    { key: 'saturation', metric: 'C', step: 30, min: 0, max: 200, start: 100 }
  ];
  const METRICS = ['L', 'sL', 'a', 'b', 'C'], WEIGHT = { L: 1, sL: 0.6, a: 1, b: 1, C: 0.6 };
  /** Solve A x = y (small, dense) by Gaussian elimination with partial pivoting. */
  function solve(A, y) {
    const n = y.length, M = A.map((r, i) => r.concat([y[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) continue;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]));
  }
  /**
   * Match a clip's look to a reference by measuring and adjusting (works for any camera, no colour science assumed).
   * measure(values) -> Promise<stats> renders the clip with those Lumetri values. Each control's effect on every
   * measurement is measured first (controls pull on more than one: tint also shifts warmth), then a damped
   * least-squares step is taken and the estimate refined after each render. The best result is kept.
   * gains (optional) reuse a previous calibration. Returns {values, before, after, gains, history}.
   */
  async function matchLoop(ref, measure, { gains, iterations = 4, check } = {}) {
    let values = {}; KNOBS.forEach(k => { values[k.key] = k.start; });
    const vec = st => METRICS.map(m => st[m] * WEIGHT[m]);
    const before = await measure(values), history = [difference(before, ref)];
    // J[i][k]: change of weighted metric i per one calibration step of control k
    let J = gains && gains.J ? gains.J.map(r => r.slice()) : null;
    if (!J) {
      J = METRICS.map(() => KNOBS.map(() => 0));
      for (let k = 0; k < KNOBS.length; k++) {
        check && check();
        const m = await measure(Object.assign({}, values, { [KNOBS[k].key]: KNOBS[k].start + KNOBS[k].step }));
        const d = vec(m).map((x, i) => x - vec(before)[i]);
        d.forEach((x, i) => { J[i][k] = x; });
      }
    }
    let cur = before, best = { values: Object.assign({}, values), st: before, diff: history[0] };
    for (let it = 0; it < iterations && best.diff >= 1; it++) {
      check && check();
      const r = vec(ref).map((x, i) => x - vec(cur)[i]);
      // (JᵀJ + λI) u = Jᵀr, u in calibration steps; λ keeps weak controls from running away
      const JtJ = KNOBS.map((_, a) => KNOBS.map((__, b) => METRICS.reduce((s, ___, i) => s + J[i][a] * J[i][b], 0)));
      const lambda = 0.02 * JtJ.reduce((s, row, i) => s + row[i], 0) / KNOBS.length + 1e-6;
      JtJ.forEach((row, i) => { row[i] += lambda; });
      const u = solve(JtJ, KNOBS.map((_, a) => METRICS.reduce((s, __, i) => s + J[i][a] * r[i], 0)));
      const prev = Object.assign({}, values);
      KNOBS.forEach((k, a) => { values[k.key] = Math.round(US.clamp(values[k.key] + 0.85 * u[a] * k.step, k.min, k.max) * 100) / 100; });
      const next = await measure(values);
      // refine the estimate with what actually happened (Broyden update)
      const dv = KNOBS.map(k => (values[k.key] - prev[k.key]) / k.step), dm = vec(next).map((x, i) => x - vec(cur)[i]);
      const dd = dv.reduce((s, x) => s + x * x, 0);
      if (dd > 1e-9) METRICS.forEach((_, i) => { const err = dm[i] - KNOBS.reduce((s, __, a) => s + J[i][a] * dv[a], 0); KNOBS.forEach((__, a) => { J[i][a] += err * dv[a] / dd; }); });
      cur = next; history.push(difference(cur, ref));
      if (history[history.length - 1] < best.diff) best = { values: Object.assign({}, values), st: cur, diff: history[history.length - 1] };
    }
    if (best.st !== cur) { cur = await measure(best.values); history.push(difference(cur, ref)); }
    return { values: best.values, before, after: cur, gains: { J }, history };
  }

  /* ---------- Premiere's named looks ---------- */
  /** Sort Premiere's Lumetri looks into families. SpeedLooks come once per camera profile: {film, mono, speed:{camera:[…]}, technical}. */
  function groupLooks(names) {
    const g = { film: [], mono: [], speed: {}, technical: [] };
    for (const n of names) {
      const m = /^SL (.+?) \((.+)\)\s*$/.exec(n);
      if (m) { (g.speed[m[2]] = g.speed[m[2]] || []).push({ name: n, label: m[1].replace(/\b\w/g, x => x.toUpperCase()) }); continue; }
      const label = n.replace(/\s*\(by Adobe\)/i, '').trim();
      if (/\brange\b/i.test(n)) g.technical.push({ name: n, label });
      else if (/monochrome/i.test(n)) g.mono.push({ name: n, label });
      else g.film.push({ name: n, label });
    }
    for (const cam of Object.keys(g.speed)) g.mono.push(...g.speed[cam].filter(l => /^Noir/i.test(l.label) && cam === 'Universal').map(l => ({ name: l.name, label: 'SpeedLook ' + l.label })));
    return g;
  }
  /** Camera profiles for SpeedLooks, Universal first. */
  const speedCameras = g => Object.keys(g.speed).sort((a, b) => (a === 'Universal' ? -1 : b === 'Universal' ? 1 : a.localeCompare(b)));

  /* ---------- log footage ---------- */
  /** Which log profile a clip was probably filmed in, from its file name: {space, camera} or null. */
  const LOG_GUESS = [
    [/^P\d{7}\.(mov|mp4)$/i, 'Panasonic V-Log/V-Gamut', 'Panasonic Lumix'],
    [/v-?log|lumix|panasonic/i, 'Panasonic V-Log/V-Gamut', 'Panasonic'],
    [/^C\d{4}\.(mp4|mxf)$/i, 'Sony S-Log3/S-Gamut3.Cine', 'Sony'],
    [/s-?log|sony/i, 'Sony S-Log3/S-Gamut3.Cine', 'Sony'],
    [/^DJI_/i, 'DJI D-Log/D-Gamut', 'DJI'],
    [/^DSCF\d+\.(mov|mp4)$/i, 'Fuji F-Log/Rec. 2020', 'Fujifilm'],
    [/canon|^MVI_\d+/i, 'Canon Log3/Cinema Gamut', 'Canon'],
    [/^DSC_?\d+\.(mov|mp4)$/i, 'Nikon N-Log/Rec2020', 'Nikon'],
    [/^L\d{7}\.(mov|mp4)$/i, 'Leica L-Log/Rec. 2020', 'Leica'],
    [/apple ?log/i, 'Apple Log/Rec. 2020', 'iPhone']
  ];
  function guessLog(name) { const n = path.basename(String(name || '')); const g = LOG_GUESS.find(([re]) => re.test(n)); return g ? { space: g[1], camera: g[2] } : null; }
  /** Log footage looks flat: little contrast and little colour. */
  const looksFlat = st => st.sL < 17 && st.C < 14;

  /* ---------- LUT files ---------- */
  /** Folders where LUT files are kept (the Creative ones also feed Lumetri's Look menu), for this computer. */
  function lutFolders(platform = process.platform, env = process.env, home = require('os').homedir()) {
    const kinds = ['Creative', 'Input', 'Technical'];
    if (platform === 'win32') {
      const P = path.win32, roam = env.APPDATA || P.join(home, 'AppData', 'Roaming'), pf = env.ProgramFiles || 'C:\\Program Files';
      return kinds.flatMap(k => [{ kind: k, dir: P.join(roam, 'Adobe', 'Common', 'LUTs', k) }, { kind: k, dir: P.join(pf, 'Adobe', 'Common', 'LUTs', k) }]);
    }
    const P = path.posix;
    return kinds.flatMap(k => [{ kind: k, dir: P.join(home, 'Library/Application Support/Adobe/Common/LUTs', k) }, { kind: k, dir: P.join('/Library/Application Support/Adobe/Common/LUTs', k) }]);
  }
  function listLuts() {
    const out = [], seen = new Set();
    const add = (file, kind) => { if (seen.has(file)) return; seen.add(file); out.push({ file, kind, name: path.basename(file).replace(/\.cube$/i, '') }); };
    for (const f of lutFolders()) { try { for (const n of fs.readdirSync(f.dir).sort()) if (/\.cube$/i.test(n)) add(path.join(f.dir, n), f.kind); } catch (e) { /* folder not there */ } }
    for (const file of US.settings.get('colour.extraLuts', [])) if (fs.existsSync(file)) add(file, 'Added');
    return out;
  }
  /** Pick the Look-menu number whose render matches the LUT (Premiere's renders vs. the LUT applied here). */
  function pickLookIndex(renders, target) {
    const d = renders.map((r, i) => ({ i, d: r ? pixelDistance(r, target) : 1e9 })).sort((a, b) => a.d - b.d);
    if (!d.length || d[0].d > 12) return null;
    const twin = d[1] && renders[d[1].i] && pixelDistance(renders[d[0].i], renders[d[1].i]) < 0.5;   // the same LUT listed twice
    return !d[1] || d[1].d - d[0].d >= 2 || twin ? d[0].i : null;
  }

  /* ---------- reading frames rendered by Premiere ---------- */
  async function framePixels(file, w = 160, hh = 90) {
    const img = new Image(); img.src = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'); await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, hh);
    return { data: g.getImageData(0, 0, w, hh).data, url: c.toDataURL('image/jpeg', 0.85) };
  }
  const toRGB = rgba => { const o = new Uint8ClampedArray(rgba.length / 4 * 3); for (let i = 0, j = 0; i < rgba.length; i += 4) { o[j++] = rgba[i]; o[j++] = rgba[i + 1]; o[j++] = rgba[i + 2]; } return o; };
  function rgbaToUrl(rgba, w, hh) { const c = document.createElement('canvas'); c.width = w; c.height = hh; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, hh), 0, 0); return c.toDataURL('image/jpeg', 0.85); }
  async function renderAt(seqId, seconds, tag) {
    const p = await US.host.call('exportFrame', { seqId, seconds, outBase: path.join(US.fsx.tempDir(), `col-${tag}-${Date.now()}`) });
    const px = await framePixels(p); try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
    return px;
  }

  /* ---------- which clips ---------- */
  async function targetClips(which, seqId) {
    if (which === 'playhead') {
      const all = await US.host.call('colourClips', { seqId, which: 'all' });
      const t = (US.ctx.sequence && US.ctx.sequence.playhead) || 0;
      const c = all.find(x => t >= x.start && t < x.end);
      return c ? [c] : [];
    }
    return US.host.call('colourClips', { seqId, which });
  }
  const refOf = c => ({ track: c.track, index: c.index });

  /* ---------- the grade we own on each clip (so a user's own Lumetri is never changed) ---------- */
  /** Set values on Ultra Studio's own Lumetri on each clip (marked so it's found again), adding it the first time. */
  async function setOurs(seqId, clips, values) {
    for (const c of clips) {
      const i = c.ours != null ? c.ours : -1;
      const [r] = await US.host.call('colourSet', { seqId, clips: [Object.assign(refOf(c), i >= 0 ? { instance: i } : {})], values, fresh: i < 0, stamp: true });
      c.ours = r.instance;
    }
  }
  /** Put Ultra Studio's grade back to neutral on the clips that have one; returns how many. */
  async function resetOurs(seqId, clips) {
    const mine = clips.filter(c => c.ours >= 0);
    if (mine.length) await setOurs(seqId, mine, Object.assign(neutral(), { look: 0, intensity: 100 }));
    return mine.length;
  }

  const GRADES = {
    natural: { label: 'Natural', values: {} },
    warm: { label: 'Warm', values: { temperature: 18, tint: 3, saturation: 105 } },
    cool: { label: 'Cool', values: { temperature: -18, saturation: 98 } },
    punchy: { label: 'Punchy', values: { contrast: 25, saturation: 120, vibrance: 15, blacks: -10 } },
    soft: { label: 'Soft', values: { contrast: -18, highlights: -15, faded: 15, saturation: 92 } },
    moody: { label: 'Moody', values: { exposure: -0.3, contrast: 15, saturation: 80, temperature: -6, vignette: -1.2 } },
    bw: { label: 'Black & white', values: { saturation: 0, contrast: 15 } }
  };
  const SLIDERS = [
    { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.1, def: 0, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, def: 0 },
    { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, def: 0 },
    { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, def: 0 },
    { key: 'temperature', label: 'Warmth', min: -100, max: 100, step: 1, def: 0 },
    { key: 'tint', label: 'Tint (green ↔ magenta)', min: -100, max: 100, step: 1, def: 0 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, def: 100 },
    { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, def: 0 },
    { key: 'faded', label: 'Faded film', min: 0, max: 100, step: 1, def: 0 },
    { key: 'vignette', label: 'Vignette', min: -3, max: 3, step: 0.1, def: 0, fmt: v => v.toFixed(1) }
  ];

  /* ---------- previews rendered by Premiere on a still of the current frame ---------- */
  const PW = 320, PH = 180, SW = 64, SH = 36;
  // stills live outside the temp folder (emptied at start-up) so a saved project never points at a missing file
  const stillsDir = () => path.join(US.fsx.cacheDir(), 'colour');
  let preview = null; // {seqId, stillId, frameKey, userSeq, base:{data,url} at PW×PH, small: RGB at SW×SH} – base/small are Premiere's render with no look
  const thumbs = new Map();   // look name -> preview url, for the current frame
  async function ensurePreview(job) {
    const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
    const key = s.id + '@' + (s.playhead || 0).toFixed(2);
    if (preview && preview.frameKey === key && (await US.host.call('listSequences')).some(x => x.id === preview.seqId)) return preview;
    job && job.set({ who: 'premiere', msg: 'Taking the current frame' });
    fs.mkdirSync(stillsDir(), { recursive: true });
    const still = await US.host.call('exportFrame', { seqId: s.id, seconds: s.playhead || 0, outBase: path.join(stillsDir(), 'still-' + Date.now()) });
    const r = await US.host.call('colourPreviewSetup', { still });
    preview = { seqId: r.seqId, stillId: r.stillId, frameKey: key, userSeq: s.id };
    // "Original" is Premiere's own render of the still, so it lines up exactly with every look rendered the same way
    preview.base = await renderPreviewPixels({});
    preview.small = toRGB((await renderPreviewPixels({}, SW, SH)).data);
    thumbs.clear(); lookMenu = null;
    US.bus.emit('colour-frame', preview);
    return preview;
  }
  async function backToUser() { if (preview && preview.userSeq) { try { await US.host.call('openSequence', { seqId: preview.userSeq }); await US.refreshContext(); } catch (e) { /* ignore */ } } }
  async function renderPreviewPixels(opts, w = PW, hh = PH) {
    const p = await US.host.call('colourPreviewRender', Object.assign({ seqId: preview.seqId, stillId: preview.stillId, out: path.join(US.fsx.tempDir(), 'col-prev-' + Date.now()) }, opts));
    const px = await framePixels(p, w, hh); try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
    return px;
  }
  const renderPreview = async opts => (await renderPreviewPixels(opts)).url;
  /** Remove the hidden preview sequence and its still from the project (when leaving the tool, and at start-up). */
  async function cleanupPreview() {
    if (US.jobs.current && US.jobs.current.tool === 'colour') return;
    preview = null; thumbs.clear(); lookMenu = null;
    try { await US.host.call('colourPreviewCleanup'); } catch (e) { return; }    // keep the stills if the bin is still there
    try { for (const f of fs.readdirSync(stillsDir())) fs.unlinkSync(path.join(stillsDir(), f)); } catch (e) { /* none */ }
  }
  US.bus.on('ready', () => setTimeout(cleanupPreview, 3000));

  /* ---------- the frame under the playhead, taken automatically from your own sequence ---------- */
  // No preview sequence: Premiere exports the frame you're looking at (with any grade already on it), and every
  // preview is then made here from that frame – LUT files directly, Premiere's looks from a colour table captured once.
  let frame = null;   // {key, seqId, t, base:{data,url} at PW×PH (RGBA), small: RGB at SW×SH}
  const shotFrames = new Map();   // seqId|start -> frame of a shot in the sequence (the strip under the viewer)
  async function grabFrame(seqId, t) {
    const p = await US.host.call('exportFrame', { seqId, seconds: t, outBase: path.join(US.fsx.tempDir(), 'col-frame-' + Date.now()) });
    try { const base = await framePixels(p, PW, PH); const small = toRGB((await framePixels(p, SW, SH)).data); return { key: `${seqId}@${t.toFixed(2)}`, seqId, t, base, small }; }
    finally { try { fs.unlinkSync(p); } catch (e) { /* gone */ } }
  }

  /* ---------- Premiere's looks as colour tables: captured once per look, then applied here to any frame ---------- */
  // A 32×32×32 colour table laid out as 8×4 tiles of 32×32 (red across, green down, one tile per blue step). Premiere
  // renders a look on it once; the result is that look as a LUT. Looks that also blur, sharpen or vignette are previewed
  // without that part.
  const TN = 32, TW = 256, TH = 128;
  const tableFile = () => path.join(US.fsx.cacheDir(), 'colour', 'colour-table-32.png');
  function tablePixels() {
    const px = new Uint8ClampedArray(TW * TH * 4);
    for (let b = 0; b < TN; b++) for (let g = 0; g < TN; g++) for (let r = 0; r < TN; r++) {
      const x = (b % 8) * TN + r, y = Math.floor(b / 8) * TN + g, i = (y * TW + x) * 4;
      px[i] = Math.round(r * 255 / (TN - 1)); px[i + 1] = Math.round(g * 255 / (TN - 1)); px[i + 2] = Math.round(b * 255 / (TN - 1)); px[i + 3] = 255;
    }
    return px;
  }
  /** A rendered colour table (RGBA, TW×TH) -> a LUT in parseCube's form. */
  function tableToLut(px) {
    const data = new Float32Array(TN * TN * TN * 3);
    for (let b = 0; b < TN; b++) for (let g = 0; g < TN; g++) for (let r = 0; r < TN; r++) {
      const x = (b % 8) * TN + r, y = Math.floor(b / 8) * TN + g, i = (y * TW + x) * 4, o = ((b * TN + g) * TN + r) * 3;
      data[o] = px[i] / 255; data[o + 1] = px[i + 1] / 255; data[o + 2] = px[i + 2] / 255;
    }
    return { size: TN, min: [0, 0, 0], max: [1, 1, 1], data };
  }
  function ensureTableFile() {
    const f = tableFile(); if (fs.existsSync(f)) return f;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    c.getContext('2d').putImageData(new ImageData(tablePixels(), TW, TH), 0, 0);
    fs.writeFileSync(f, Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64'));
    return f;
  }
  // kept per Premiere version (a new Premiere may change its looks)
  const tablesDir = () => path.join(US.fsx.cacheDir(), 'colour-looks', String((US.ctx && US.ctx.app) || 'premiere').replace(/[^\w.-]+/g, '_'));
  const tables = new Map();   // look name -> LUT
  function lookTable(name) {
    if (tables.has(name)) return tables.get(name);
    let t = null;
    try { const j = JSON.parse(fs.readFileSync(path.join(tablesDir(), US.fsx.hash(name) + '.json'), 'utf8')); if (j.name === name && j.w === TW && j.h === TH) t = tableToLut(decodeStored(j)); } catch (e) { t = null; }
    if (t) tables.set(name, t);
    return t;
  }
  // stored as the rendered table's raw RGBA bytes (base64), so reading one back needs no image decoding
  function decodeStored(j) { return new Uint8ClampedArray(Buffer.from(j.png, 'base64')); }
  function saveTable(name, rgba) {
    fs.mkdirSync(tablesDir(), { recursive: true });
    fs.writeFileSync(path.join(tablesDir(), US.fsx.hash(name) + '.json'), JSON.stringify({ name, w: TW, h: TH, png: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).toString('base64') }));
    tables.set(name, tableToLut(rgba));
  }
  /** Capture the colour tables for these looks (Premiere renders each once on the table image). -> how many were made */
  async function captureTables(job, looks) {
    const todo = looks.filter(l => !lookTable(l.name));
    if (!todo.length) return 0;
    const user = US.ctx.sequence && US.ctx.sequence.id;
    job.set({ who: 'premiere', msg: 'Getting the look previews ready' });
    const r = await US.host.call('colourPreviewSetup', { still: ensureTableFile() });
    preview = null;    // the hidden sequence now holds the table, not a frame
    let made = 0;
    try {
      for (let i = 0; i < todo.length; i++) {
        job.check(); job.progress(i / todo.length, `Look ${i + 1} of ${todo.length} · ${todo[i].label}`);
        try {
          const p = await US.host.call('colourPreviewRender', { seqId: r.seqId, stillId: r.stillId, preset: todo[i].name, out: path.join(US.fsx.tempDir(), 'col-table-' + Date.now()) });
          const px = await framePixels(p, TW, TH); try { fs.unlinkSync(p); } catch (e) { /* gone */ }
          saveTable(todo[i].name, px.data); made++;
        } catch (e) { US.log('info', `Look “${todo[i].name}” couldn’t be captured`, US.errors.explain(e).detail, 'colour'); }
      }
    } finally {
      if (user) { try { await US.host.call('openSequence', { seqId: user }); await US.refreshContext(); } catch (e) { /* ignore */ } }
      try { await US.host.call('colourPreviewCleanup'); } catch (e) { /* ignore */ }
    }
    return made;
  }

  /* ---------- a quick grade preview made here (the grade you apply is Lumetri's own) ---------- */
  /** Approximates Lumetri's basic controls on RGBA pixels: exposure, contrast, highlights, shadows, warmth, tint,
      saturation, vibrance, faded film and vignette. w, hh: image size (for the vignette). */
  function quickGrade(px, values, w, hh) {
    const v = Object.assign(neutral(), values), out = new Uint8ClampedArray(px.length);
    const ev = Math.pow(2, v.exposure), k = 1 + v.contrast / 100 * 0.6, fade = v.faded / 100;
    const warm = v.temperature / 100, tint = v.tint / 100, sat = v.saturation / 100, vib = v.vibrance / 100;
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0, n = 0; i < px.length; i += 4, n++) {
      let c = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
      c = c.map(x => Math.pow(Math.pow(x, 2.2) * ev, 1 / 2.2));
      c[0] *= 1 + warm * 0.18; c[2] *= 1 - warm * 0.18; c[1] *= 1 - tint * 0.1;
      let L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const tone = (v.highlights / 100) * 0.18 * sm(0.45, 1, L) + (v.shadows / 100) * 0.18 * (1 - sm(0, 0.55, L));
      c = c.map(x => 0.5 + (x + tone - 0.5) * k);
      L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const spread = Math.max(...c) - Math.min(...c), s2 = sat * (1 + vib * (1 - Math.min(1, spread * 2)));
      c = c.map(x => L + (x - L) * s2);
      if (fade) c = c.map(x => x * (1 - fade * 0.22) + fade * 0.1);
      if (v.vignette) { const x = (n % w) / w - 0.5, y = Math.floor(n / w) / hh - 0.5; const f = 1 + v.vignette * 0.22 * (x * x + y * y) * 2; c = c.map(q => q * f); }
      out[i] = c[0] * 255; out[i + 1] = c[1] * 255; out[i + 2] = c[2] * 255; out[i + 3] = 255;
    }
    return out;
  }

  /* Lumetri's Look menu can only be set by number, so a LUT file is found in it once per session: each number is
     rendered on the preview still and compared with the LUT applied by Ultra Studio. */
  let lookMenu = null;            // [RGB render per menu number] for the current still
  const lutIndex = new Map();     // LUT file -> menu number (this Premiere session)
  async function readLookMenu(job) {
    if (lookMenu) return lookMenu;
    const renders = [preview.small]; let same = 0;
    for (let i = 1; i < 400; i++) {
      job.check(); job.progress(Math.min(0.95, i / 100), `Reading Premiere’s Look menu · ${i}`);
      const r = toRGB((await renderPreviewPixels({ values: { look: i } }, SW, SH)).data);
      same = pixelDistance(r, renders[i - 1]) < 0.05 && i > 8 ? same + 1 : 0;
      renders.push(r);
      if (same >= 5) { renders.length -= same; break; }   // past the end, Premiere repeats the last look
    }
    renders[0] = null;    // 0 is "None"
    return (lookMenu = renders);
  }
  async function findLut(file, job) {
    if (lutIndex.has(file)) return lutIndex.get(file);
    const lut = parseCube(fs.readFileSync(file, 'utf8'));
    if (!lut) throw new US.UserError('UNKNOWN', { title: `“${path.basename(file)}” isn’t a LUT Ultra Studio can read.`, action: 'Use a 3D .cube LUT file.' });
    const menu = await readLookMenu(job);
    const i = pickLookIndex(menu, applyLut(lut, preview.small));
    if (i != null) lutIndex.set(file, i);
    return i;
  }
  /** Copy a LUT into the user's Creative LUT folder, so Lumetri lists it in its Look menu after Premiere restarts. */
  function installLut(file) {
    const dir = lutFolders()[0].dir; fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(file));
    if (!US.samePath(dest, file)) fs.copyFileSync(file, dest);
    return dest;
  }

  /* ---------- actions ---------- */
  US.actions.register({
    id: 'colour.match', tool: 'colour', title: 'Match cameras to a reference shot', changes: true,
    describe: 'Adds a Lumetri grade to the selected clips so their colour, brightness and contrast match the clip under the playhead.',
    examples: ['match the cameras', 'make cam B match cam A', 'match colour to this shot'],
    match: t => /\bmatch\b/i.test(t) && /\b(camera|cam|colou?r|shot|grade|look)s?\b/i.test(t) ? {} : null,
    run: (p, job) => matchCameras(job, {})
  });
  US.actions.register({
    id: 'colour.grade', tool: 'colour', title: 'Apply a quick grade', changes: true,
    describe: 'Applies a simple Lumetri grade (natural, warm, cool, punchy, soft, moody, black & white) to the selected clips.',
    params: { look: { type: 'enum', options: Object.keys(GRADES), default: 'natural', desc: 'Which grade' } },
    examples: ['make it warmer', 'black and white', 'punchy grade on these clips'],
    match(t) {
      const k = /black (and|&) white|b&w|mono/i.test(t) ? 'bw' : /warm/i.test(t) ? 'warm' : /cool|cold/i.test(t) ? 'cool' : /punch|vivid/i.test(t) ? 'punchy' : /soft|gentle/i.test(t) ? 'soft' : /moody|dark/i.test(t) ? 'moody' : null;
      return k && /\b(grade|look|make|colou?r|it|clips?)\b/i.test(t) ? { look: k } : null;
    },
    run: async (p, job) => {
      const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
      const clips = await targetClips('selected', s.id);
      if (!clips.length) throw new US.UserError('NO_SELECTION', { title: 'No clips are selected in the timeline.', action: 'Select the clips to grade, then try again.' });
      job.set({ who: 'premiere' }).progress(0.3, `Grading ${US.plural(clips.length, 'clip')}`);
      await setOurs(s.id, clips, Object.assign({}, neutral(), GRADES[p.look].values));
      return { summary: `${GRADES[p.look].label} grade on ${US.plural(clips.length, 'clip')}` };
    }
  });
  function neutral() { const o = { whites: 0, blacks: 0 }; SLIDERS.forEach(sl => { o[sl.key] = sl.def; }); return o; }

  /** Match targets to the reference clip by measuring frames rendered by Premiere and adjusting our Lumetri. */
  async function matchCameras(job, { refClip, which = 'selected' }) {
    const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
    const t0 = s.playhead || 0, every = await US.host.call('colourClips', { seqId: s.id, which: 'every' });
    const selected = which === 'selected' ? await US.host.call('colourClips', { seqId: s.id, which: 'selected' }) : every.filter(c => c.track === 0);
    const isSel = c => selected.some(x => x.track === c.track && x.index === c.index);
    // the reference: the shot showing at the playhead (topmost), preferring one that isn't being matched
    const under = every.filter(x => t0 >= x.start && t0 < x.end).sort((a, b) => b.track - a.track);
    const ref = refClip || under.find(x => !isSel(x)) || under[0];
    if (!ref) throw new US.UserError('NO_SELECTION', { title: 'There’s no clip under the playhead to match to.', action: 'Park the playhead on the reference shot, then try again.' });
    const targets = selected.filter(c => !(c.track === ref.track && c.index === ref.index));
    if (!targets.length) throw new US.UserError('NO_SELECTION', { title: 'No other clips are selected.', action: 'Select the clips from the other camera(s) in the timeline, then try again.' });
    // each clip is measured on its own: tracks above it are switched off while it's rendered, then put back
    const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
    let hidden = [];
    const isolate = async track => {
      const want = info.video.filter(t => t.index > track && !t.muted).map(t => t.index);
      for (const i of hidden.filter(i => !want.includes(i))) await US.host.call('muteTrack', { seqId: s.id, video: true, index: i, mute: false });
      for (const i of want.filter(i => !hidden.includes(i))) await US.host.call('muteTrack', { seqId: s.id, video: true, index: i, mute: true });
      hidden = want;
    };
    const mid = c => c.start + (c.end - c.start) / 2;    // the middle, away from slates and fades
    const results = []; let gains = null;
    try {
      job.set({ who: 'premiere', msg: `Measuring the reference shot (${ref.name})` });
      await isolate(ref.track);
      const refStats = stats((await renderAt(s.id, t0 >= ref.start && t0 < ref.end ? t0 : mid(ref), 'ref')).data);
      for (let i = 0; i < targets.length; i++) {
        job.check();
        const c = targets[i];
        job.progress(i / targets.length, `Matching ${i + 1} of ${targets.length} · ${c.name}`);
        await isolate(c.track);
        const was = difference(stats((await renderAt(s.id, mid(c), 'b')).data), refStats);
        await setOurs(s.id, [c], neutral());
        const measure = async values => { await US.host.call('colourSet', { seqId: s.id, clips: [Object.assign(refOf(c), { instance: c.ours })], values }); return stats((await renderAt(s.id, mid(c), 'm')).data); };
        let r;
        try { r = await matchLoop(refStats, measure, { gains, check: () => job.check() }); }
        catch (e) { await setOurs(s.id, [c], neutral()); throw e; }    // stopped half way: leave this clip neutral, not half-matched
        await setOurs(s.id, [c], r.values);
        gains = gains || r.gains;
        results.push({ clip: c, before: was, after: r.history[r.history.length - 1], values: r.values });
        US.log('info', `Matched ${c.name}: difference ${was.toFixed(1)} → ${r.history[r.history.length - 1].toFixed(1)}`, JSON.stringify(r.values), 'colour');
      }
    } finally { await isolate(1e9); }
    US.bus.emit('colour-matched', { ref, results });
    const avg = k => results.reduce((n, r) => n + r[k], 0) / results.length;
    return { summary: `${US.plural(results.length, 'clip')} matched to ${ref.name} (difference ${avg('before').toFixed(1)} → ${avg('after').toFixed(1)})`, results, ref };
  }

  /** Tell Premiere which log profile clips were filmed in ('' = back to the clip's own). */
  async function setLogProfile(job, { space, which = 'selected' }) {
    const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
    const clips = await targetClips(which, s.id);
    if (!clips.length) throw new US.UserError('NO_SELECTION', { title: 'No clips are selected in the timeline.', action: 'Select the log clips in the Timeline, then try again.' });
    const info = await US.host.call('colourSpaces', { seqId: s.id, clips: clips.map(refOf) });
    if (!info.clips.some(c => c.supported)) throw new US.UserError('UNKNOWN', { title: 'This version of Premiere can’t change a clip’s colour space from a script.', action: 'Use Premiere Pro 2025 or later, or right-click the clip › Modify › Color.' });
    if (space === undefined) {
      const g = info.clips.map(c => guessLog(c.name)).find(Boolean);
      if (!g) throw new US.UserError('UNKNOWN', { title: 'Ultra Studio can’t tell which camera filmed these clips.', action: 'Choose the camera profile in Colour › Log, then press Apply.' });
      space = g.space;
    }
    job.set({ who: 'premiere' }).progress(0.4, space ? `Setting ${US.plural(info.clips.length, 'clip')} to ${space}` : 'Putting clips back to their own colour');
    const n = await US.host.call('colourSetSpace', { seqId: s.id, clips: clips.map(refOf), space });
    return { summary: space ? `${US.plural(n, 'clip')} now read as ${space}` : `${US.plural(n, 'clip')} back to their own colour`, n, space };
  }
  US.actions.register({
    id: 'colour.log', tool: 'colour', title: 'Convert log footage (V-Log, S-Log…) to normal colour', changes: true,
    describe: 'Tells Premiere which log profile the selected clips were filmed in, so Premiere shows them in normal colour (like Modify › Color).',
    params: { space: { type: 'string', default: '', desc: 'Camera profile, e.g. "Panasonic V-Log/V-Gamut"; "original" = undo; empty = guess from the file names' } },
    examples: ['convert the v-log clips', 'these clips are s-log3', 'fix the flat log footage', 'undo the log conversion'],
    match(t) {
      if (!/\b(log|v-?log|s-?log\d?|d-?log|f-?log\d?|n-?log|c-?log\d?|flat footage)\b/i.test(t)) return null;
      const sp = /v-?log/i.test(t) ? 'Panasonic V-Log/V-Gamut' : /s-?log ?3/i.test(t) ? 'Sony S-Log3/S-Gamut3.Cine' : /d-?log/i.test(t) ? 'DJI D-Log/D-Gamut' : /f-?log ?2/i.test(t) ? 'Fuji F-Log2/F-GamutC' : /f-?log/i.test(t) ? 'Fuji F-Log/Rec. 2020' : /n-?log/i.test(t) ? 'Nikon N-Log/Rec2020' : /c-?log|canon log/i.test(t) ? 'Canon Log3/Cinema Gamut' : '';
      return { space: /\b(undo|remove|original)\b/i.test(t) ? 'original' : sp };
    },
    run: (p, job) => setLogProfile(job, { space: p.space === 'original' ? '' : p.space || undefined })
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'colour', name: 'Colour', short: 'Colour', icon: 'palette', group: 'finish', order: 29,
    blurb: 'Looks and LUTs previewed on your shot, grading, camera matching and log footage.',
    hostFns: ['colourClips', 'colourSet', 'colourGet', 'colourPresets', 'colourApplyPreset', 'colourSpaces', 'colourSetSpace', 'colourPreviewSetup', 'colourPreviewRender', 'colourPreviewCleanup'],
    create() {
      const v = ui.toolView({ icon: 'palette', title: 'Colour', blurb: 'Looks and LUTs previewed on your own shot, quick grading, camera matching and log footage – all as Lumetri you can open and tweak.',
        help: h('div', h('ul',
          h('li', 'Previews appear by themselves: when the playhead rests on a frame, Ultra Studio takes that frame from your sequence and shows every look or LUT on it. Use ← → to step through them, Before / After to compare, and the strip of shots to jump around the sequence.'),
          h('li', 'Looks are Premiere’s own Lumetri looks. Each is captured once as a colour table (Premiere renders it on a test image), so afterwards its preview is instant on any shot. LUTs are your own .cube files, previewed straight from the file.'),
          h('li', 'Applying a LUT uses Lumetri’s Look menu, so Premiere has to know the LUT (Ultra Studio can copy it to the right folder; Premiere picks it up after a restart).'),
          h('li', 'Ultra Studio adds its own Lumetri Color effect to a clip the first time and only changes that one – any grade you made yourself is left alone.'),
          h('li', 'Match cameras measures the reference shot and each selected clip, then adjusts exposure, contrast, warmth, tint and saturation step by step until they match.'),
          h('li', 'Log tells Premiere which log profile (e.g. Lumix V-Log) a clip was filmed in, the same as right-click › Modify › Color. Premiere then shows it in normal colour – better than a LUT, and it applies everywhere that clip is used.'))) });
      let visible = false;
      const seqLine = h('div.field-hint');
      const which = ui.segmented({ options: [{ value: 'selected', label: 'Selected clips' }, { value: 'playhead', label: 'Clip at the playhead' }, { value: 'all', label: 'All clips on V1' }], value: US.settings.get('colour.which', 'selected'), onChange: x => US.settings.set('colour.which', x) });
      const whichField = ui.field('Apply to', which);
      const TABS = [{ value: 'looks', label: 'Looks' }, { value: 'luts', label: 'LUTs' }, { value: 'grade', label: 'Grade' }, { value: 'match', label: 'Match' }, { value: 'log', label: 'Log' }];
      const tabs = ui.segmented({ options: TABS, value: 'looks', onChange: t => show(t) });
      const panes = {}; TABS.forEach(t => { panes[t.value] = h('div.colour-pane'); });
      const resolveClips = async () => {
        const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
        const clips = await targetClips(which.get(), s.id);
        if (!clips.length) throw new US.UserError('NO_SELECTION', which.get() === 'selected' ? { title: 'No clips are selected in the timeline.', action: 'Select clips in the Timeline, or choose “Clip at the playhead”.' } : { title: 'No clip found.', action: 'Park the playhead on a clip, then try again.' });
        return { s, clips };
      };
      const thumb = (key, label, url, on, onPick) => h('button.colour-thumb' + (on ? '.on' : ''), { title: label, onclick: onPick }, h('img', url ? { src: url, alt: label } : { alt: '' }), h('span', label));   // no picture yet: a plain dark tile

      /* ---------- the viewer: your frame, before and after, with ◀ ▶ through the looks (or LUTs) ---------- */
      const viewImg = h('img.colour-preview', { alt: 'Preview' }), viewName = h('b.grow'), viewNote = h('div.field-hint');
      let viewList = [], viewAt = -1, showBefore = false;   // viewList: [{key, label, url()}]
      const ba = ui.segmented({ options: [{ value: 'after', label: 'After' }, { value: 'before', label: 'Before' }], value: 'after', onChange: x => { showBefore = x === 'before'; drawView(); } });
      const step = d => { if (!viewList.length) return; viewAt = (viewAt + d + viewList.length) % viewList.length; viewList[viewAt].pick(); };
      const viewer = h('div.colour-viewer', { tabIndex: 0, onkeydown: e => { if (e.key === 'ArrowRight') { step(1); e.preventDefault(); } if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } } },
        viewImg, h('div.row', ui.button('', { small: true, kind: 'ghost', icon: 'chevron-left', title: 'Previous (←)', onClick: () => step(-1) }), viewName, ba, ui.button('', { small: true, kind: 'ghost', icon: 'chevron-right', title: 'Next (→)', onClick: () => step(1) })), viewNote);
      function drawView() {
        const it = viewList[viewAt];
        if (!frame) { viewImg.removeAttribute('src'); viewName.textContent = ''; viewNote.textContent = US.ctx.sequence ? 'Park the playhead on a shot – the preview appears by itself.' : 'Open a sequence in the Timeline first.'; return; }
        const after = !showBefore && it ? it.url() : '';
        viewImg.src = after || frame.base.url;
        viewName.textContent = it ? `${it.label}${showBefore ? ' – before' : !after ? ' – not ready yet (see above)' : ''}` : 'Your shot';
        viewNote.textContent = `The frame at ${US.fmtDur(frame.t, true)} in “${(US.ctx.sequence && US.ctx.sequence.name) || ''}”. ← → step through; click a picture to choose it.`;
      }
      // the shots in the sequence, to jump between (frames taken quietly, one at a time, while nothing else is running)
      const strip = h('div.colour-strip');
      let stripSeq = '', stripClips = [], stripBusy = false, stripStale = false;
      async function drawStrip() {
        const s = US.ctx.sequence; if (!s) { US.clear(strip); return; }
        if (stripSeq !== s.id || stripStale) { if (stripSeq !== s.id) shotFrames.clear(); stripSeq = s.id; stripStale = false; stripClips = []; try { stripClips = (await US.host.call('colourClips', { seqId: s.id, which: 'all' })).slice(0, 60); } catch (e) { stripClips = []; } }
        US.clear(strip);
        for (const c of stripClips) {
          const k = `${s.id}|${c.start.toFixed(2)}`, f = shotFrames.get(k);
          strip.appendChild(h('button.colour-shot' + (frame && frame.t >= c.start && frame.t < c.end ? '.on' : ''), { title: c.name, onclick: async () => {
            const mid = c.start + (c.end - c.start) / 2;
            try { await US.host.call('setPlayhead', { seqId: s.id, seconds: mid }); } catch (e) { /* ignore */ }
            if (f) { frame = f; onFrame(); }
          } }, f ? h('img', { src: f.base.url, alt: c.name }) : h('span', c.name)));
        }
      }
      async function fillStrip() {
        const s = US.ctx.sequence;
        if (stripBusy || !visible || US.jobs.current || !s || s.id !== stripSeq) return;
        const c = stripClips.find(x => !shotFrames.has(`${s.id}|${x.start.toFixed(2)}`)); if (!c) return;
        stripBusy = true;
        try { shotFrames.set(`${s.id}|${c.start.toFixed(2)}`, await grabFrame(s.id, c.start + (c.end - c.start) / 2)); drawStrip(); } catch (e) { shotFrames.set(`${s.id}|${c.start.toFixed(2)}`, null); } finally { stripBusy = false; }
      }

      /* Looks */
      let groups = null, chosen = null;
      const grid = h('div.colour-grid'), filter = ui.input({ placeholder: 'Filter looks (e.g. Fuji, blue, gold)…', onInput: () => drawGrid() });
      const family = ui.segmented({ options: [{ value: 'film', label: 'Film' }, { value: 'speed', label: 'SpeedLooks' }, { value: 'mono', label: 'Black & white' }, { value: 'technical', label: 'Technical' }], value: US.settings.get('colour.family', 'film'), onChange: x => { US.settings.set('colour.family', x); camField.classList.toggle('hidden', x !== 'speed'); drawGrid(); } });
      const camera = ui.select({ options: [{ value: 'Universal', label: 'Universal' }], value: US.settings.get('colour.slCamera', 'Universal'), onChange: x => { US.settings.set('colour.slCamera', x); drawGrid(); } });
      const camField = ui.field('Camera', camera, 'SpeedLooks come tuned for each camera; Universal suits most footage.');
      const intensity = ui.slider({ label: 'Strength', min: 10, max: 100, step: 5, value: US.settings.get('colour.intensity', 100), fmt: x => x + '%', onChange: x => US.settings.set('colour.intensity', x) });
      const prepNote = h('div');
      function currentLooks() {
        if (!groups) return [];
        const f = family.get();
        return f === 'speed' ? (groups.speed[camera.get()] || []) : groups[f] || [];
      }
      const lookUrl = l => {
        if (!frame) return '';
        const k = frame.key + '|' + l.name; if (thumbs.has(k)) return thumbs.get(k);
        const t = lookTable(l.name); if (!t) return '';
        const url = rgbaToUrl(applyLut(t, frame.base.data, 4), PW, PH); thumbs.set(k, url); return url;
      };
      // thumbnails are made a few at a time so the panel never stalls
      const fillTimers = {};
      function fillThumbs(imgs, which) { clearTimeout(fillTimers[which]); let i = 0; const next = () => { const t0 = performance.now(); while (i < imgs.length && performance.now() - t0 < 25) { const [img, fn] = imgs[i++]; const u = fn(); if (u) img.src = u; } if (i < imgs.length) fillTimers[which] = setTimeout(next, 0); }; next(); }
      function drawGrid() {
        US.clear(grid);
        const q = filter.value.trim().toLowerCase(), list = currentLooks().filter(l => !q || l.label.toLowerCase().includes(q));
        const missing = list.filter(l => !lookTable(l.name)).length;
        US.clear(prepNote);
        if (groups && missing) prepNote.appendChild(ui.note(h('div', h('div', `${missing === list.length ? 'These' : missing} looks need getting ready once (about ${Math.max(5, Math.round(missing * 0.8))} s). Premiere briefly shows a hidden preview sequence while it does; after that every preview appears instantly, on any shot.`),
          h('div.row', ui.actionButton(`Get ${US.plural(missing, 'look')} ready`, () => US.jobs.run({ title: 'Getting look previews ready', tool: 'colour' }, async job => { const n = await captureTables(job, list); drawGrid(); return { summary: `${US.plural(n, 'look')} ready` }; }), { icon: 'palette', block: false, small: true }))), 'info'));
        const imgs = [];
        const items = list.map((l, i) => ({ key: l.name, label: l.label, ready: !!lookTable(l.name), url: () => lookUrl(l), pick: () => { chosen = l.name; if (tab === 'looks') viewAt = i; applyLook.setEnabled(true); drawGrid(); } }));
        if (tab === 'looks') { viewList = items; viewAt = Math.max(-1, list.findIndex(l => l.name === chosen)); }
        for (const [i, l] of list.entries()) {
          const b = thumb(l.name, l.label, '', chosen === l.name, () => items[i].pick());
          imgs.push([b.querySelector('img'), () => lookUrl(l)]); grid.appendChild(b);
        }
        if (!list.length && groups) grid.appendChild(ui.empty({ icon: 'palette', title: 'No looks here', text: 'Try another family or clear the filter.' }));
        if (tab === 'looks') drawView();
        fillThumbs(imgs, 'looks');
      }
      async function loadGroups() {
        if (groups) return groups;
        groups = groupLooks(await US.host.call('colourPresets'));
        camera.setOptions(speedCameras(groups).map(c => ({ value: c, label: c })), US.settings.get('colour.slCamera', 'Universal'));
        return groups;
      }
      const applyLook = ui.actionButton('Apply this look', () => US.jobs.run({ title: 'Applying a look', tool: 'colour' }, async job => {
        const { s, clips } = await resolveClips();
        job.set({ who: 'premiere' }).progress(0.3, `Applying “${chosen}” to ${US.plural(clips.length, 'clip')}`);
        const added = await US.host.call('colourApplyPreset', { seqId: s.id, clips: clips.map(refOf), preset: chosen });
        const st = intensity.get(); if (st < 100) await US.host.call('colourSet', { seqId: s.id, clips: added.map(x => ({ track: x.track, index: x.index, instance: x.instance })), values: { intensity: st } });
        return { summary: `“${chosen}” on ${US.plural(clips.length, 'clip')}` };
      }));
      applyLook.setEnabled(false);
      panes.looks.append(ui.card(family, camField, prepNote, filter, grid, intensity, applyLook,
        h('div.field-hint', 'Each look is added as its own Lumetri effect, so you can switch it off or delete it in Effect Controls. Previews show the look’s colour; a look that also blurs, sharpens or vignettes does that only when applied.')));
      camField.classList.toggle('hidden', family.get() !== 'speed');

      /* LUTs */
      let luts = [], chosenLut = null;
      const lutGrid = h('div.colour-grid'), lutNote = h('div.field-hint');
      const lutStrength = ui.slider({ label: 'Strength', min: 10, max: 100, step: 5, value: 100, fmt: x => x + '%' });
      const lutUrls = new Map(), lutCache = new Map();
      function lutPreview(l) {
        if (!frame) return '';
        const k = frame.key + '|' + l.file; if (lutUrls.has(k)) return lutUrls.get(k);
        let url = '';
        try { if (!lutCache.has(l.file)) lutCache.set(l.file, parseCube(fs.readFileSync(l.file, 'utf8'))); const lut = lutCache.get(l.file); if (lut) url = rgbaToUrl(applyLut(lut, frame.base.data, 4), PW, PH); } catch (e) { /* unreadable */ }
        lutUrls.set(k, url); return url;
      }
      function drawLuts() {
        luts = listLuts(); US.clear(lutGrid);
        const imgs = [];
        const items = luts.map((l, i) => ({ key: l.file, label: l.name, ready: true, url: () => lutPreview(l), pick: () => { chosenLut = l.file; if (tab === 'luts') viewAt = i; applyLut_.setEnabled(true); drawLuts(); } }));
        if (tab === 'luts') { viewList = items; viewAt = Math.max(-1, luts.findIndex(l => l.file === chosenLut)); }
        for (const [i, l] of luts.entries()) { const b = thumb(l.file, l.name, '', chosenLut === l.file, () => items[i].pick()); imgs.push([b.querySelector('img'), () => lutPreview(l)]); lutGrid.appendChild(b); }
        if (!luts.length) lutGrid.appendChild(ui.empty({ icon: 'palette', title: 'No LUT files found', text: 'Add a .cube file with the button above. Ultra Studio also lists LUTs in Adobe’s LUT folders.' }));
        lutNote.textContent = 'Previews are made by Ultra Studio from each LUT file, on the frame under your playhead.';
        if (tab === 'luts') drawView();
        fillThumbs(imgs, 'luts');
      }
      const addLut = ui.button('Add a LUT file…', { small: true, icon: 'plus', onClick: () => {
        const files = US.app.pickFiles({ multi: true, title: 'Choose LUT files', ext: ['cube'] }).map(US.normPath); if (!files.length) return;
        US.settings.set('colour.extraLuts', [...new Set(US.settings.get('colour.extraLuts', []).concat(files))]);
        drawLuts();
      } });
      const applyLut_ = ui.actionButton('Apply this LUT', () => US.jobs.run({ title: 'Applying a LUT', tool: 'colour' }, async job => {
        const { s, clips } = await resolveClips();
        let idx;
        try { await ensurePreview(job); idx = await findLut(chosenLut, job); } finally { await backToUser(); }
        if (idx == null) {
          const creative = lutFolders()[0].dir, inFolder = US.samePath(path.dirname(chosenLut), creative);
          const ok = !inFolder && await ui.confirm({ title: 'Premiere doesn’t know this LUT yet', text: `Lumetri can only use LUTs from its Look menu. Copy “${path.basename(chosenLut)}” to ${creative}? It appears in the Look menu after you restart Premiere – then press Apply again.`, ok: 'Copy it' });
          if (ok) installLut(chosenLut);
          throw new US.UserError('UNKNOWN', { title: inFolder || ok ? 'Restart Premiere to finish adding this LUT.' : 'The LUT wasn’t applied.', action: inFolder || ok ? 'After the restart, select the clips and press Apply again. Or pick it yourself in Lumetri › Creative › Look.' : 'You can also pick a LUT yourself in Lumetri › Creative › Look.' });
        }
        job.set({ who: 'premiere' }).progress(0.8, `Applying “${path.basename(chosenLut)}” to ${US.plural(clips.length, 'clip')}`);
        await setOurs(s.id, clips, { look: idx, intensity: lutStrength.get() });
        return { summary: `“${path.basename(chosenLut, '.cube')}” on ${US.plural(clips.length, 'clip')}` };
      }));
      applyLut_.setEnabled(false);
      panes.luts.append(ui.card(h('div.row', h('div.grow', lutNote), addLut), lutGrid, lutStrength, applyLut_,
        h('div.field-hint', 'The LUT goes into Ultra Studio’s Lumetri effect (Creative › Look), so you can change its strength or switch it off there. The first LUT you apply in a session takes about 20 seconds while Ultra Studio finds it in Lumetri’s Look menu. For log footage, the Log tab is usually better than a conversion LUT.')));

      /* Grade */
      let values = neutral();
      const gradeUrl = () => (frame ? rgbaToUrl(quickGrade(frame.base.data, values, PW, PH), PW, PH) : '');
      const gradeNote = h('div.field-hint', 'A quick preview made by Ultra Studio – the grade you apply is Lumetri’s own and can look slightly different. “Exact preview” asks Premiere.');
      const sliders = SLIDERS.map(sl => ui.slider({ label: sl.label, min: sl.min, max: sl.max, step: sl.step, value: sl.def, fmt: sl.fmt || (x => String(x)), onInput: x => { values[sl.key] = x; schedulePreview(); } }));
      const setAll = (vals, label) => { values = Object.assign(neutral(), vals); SLIDERS.forEach((sl, i) => sliders[i].set(values[sl.key])); gradeLabel = label || 'Your grade'; schedulePreview(); };
      let gradeLabel = 'Your grade';
      const presetRow = h('div.row', Object.entries(GRADES).map(([k, g]) => ui.button(g.label, { small: true, onClick: () => setAll(g.values, g.label) })));
      const schedulePreview = US.debounce(() => { if (tab !== 'grade') return; viewList = [{ key: 'grade', label: gradeLabel, url: gradeUrl, pick: () => {} }]; viewAt = 0; drawView(); }, 60);
      const exactBtn = ui.button('Exact preview', { small: true, kind: 'ghost', title: 'Premiere renders this grade on the frame (it briefly shows a hidden preview sequence)', onClick: () => US.jobs.run({ title: 'Exact preview', tool: 'colour' }, async job => {
        try { await ensurePreview(job); const url = await renderPreview({ values }); viewList = [{ key: 'grade', label: `${gradeLabel} (exact, by Premiere)`, url: () => url, pick: () => {} }]; viewAt = 0; showBefore = false; ba.set('after'); drawView(); } finally { await backToUser(); }
        return { summary: 'Exact preview rendered by Premiere' };
      }) });
      const applyGrade = ui.actionButton('Apply grade', () => US.jobs.run({ title: 'Applying a grade', tool: 'colour' }, async job => {
        const { s, clips } = await resolveClips();
        job.set({ who: 'premiere' }).progress(0.3, `Grading ${US.plural(clips.length, 'clip')}`);
        await setOurs(s.id, clips, values);
        return { summary: `Grade applied to ${US.plural(clips.length, 'clip')}` };
      }));
      const resetBtn = ui.button('Reset Ultra Studio’s grade on these clips', { kind: 'ghost', small: true, onClick: async () => {
        US.jobs.run({ title: 'Resetting the grade', tool: 'colour' }, async () => { const { s, clips } = await resolveClips(); const n = await resetOurs(s.id, clips); return { summary: n ? `Ultra Studio’s grade reset on ${US.plural(n, 'clip')}` : 'These clips have no Ultra Studio grade' }; });
      } });
      panes.grade.append(ui.card(h('div.row', h('div.grow', gradeNote), exactBtn)), ui.card(h('div.card-title', 'Start from'), presetRow), ui.card(h('div.grid2', sliders)), applyGrade, h('div.row', resetBtn));

      /* Match cameras */
      const matchList = h('div');
      const matchBtn = ui.actionButton('Match selected clips to the shot at the playhead', () => US.jobs.run({ title: 'Matching cameras', tool: 'colour' }, job => matchCameras(job, { which: 'selected' })));
      US.bus.on('colour-matched', ({ ref, results }) => {
        US.clear(matchList);
        matchList.appendChild(ui.list(results.map(r => ({ title: r.clip.name, sub: `Exposure ${r.values.exposure > 0 ? '+' : ''}${r.values.exposure.toFixed(1)}, warmth ${Math.round(r.values.temperature)}, tint ${Math.round(r.values.tint)}, contrast ${Math.round(r.values.contrast)}, saturation ${Math.round(r.values.saturation)}`, right: `${r.before.toFixed(1)} → ${r.after.toFixed(1)}`, color: r.after < 3 ? 'var(--ok)' : r.after < 6 ? 'var(--warn)' : 'var(--err)' }))));
        matchList.appendChild(h('div.field-hint', `Reference: ${ref.name}. Numbers are the colour difference before → after (under 3 is hard to see).`));
      });
      panes.match.append(ui.card(h('div', 'Park the playhead on the shot whose colour you like (e.g. camera A), select the clips from the other camera(s) in the timeline, then press Match.'), h('div.field-hint', 'Works best when the shots were filmed at the same event and time. If one camera shot log, set it up in the Log tab first.')), matchBtn, matchList);

      /* Log footage */
      const logSel = ui.select({ options: [{ value: '', label: 'Checking…' }] });
      const logList = h('div'), logCompare = h('div.colour-compare');
      let spaces = [];
      const checkLog = ui.actionButton('Check these clips', () => US.jobs.run({ title: 'Checking for log footage', tool: 'colour' }, async job => {
        const { s, clips } = await resolveClips();
        const info = await US.host.call('colourSpaces', { seqId: s.id, clips: clips.map(refOf) });
        spaces = info.spaces;
        if (!info.clips.some(c => c.supported)) throw new US.UserError('UNKNOWN', { title: 'This version of Premiere can’t change a clip’s colour space from a script.', action: 'Use Premiere Pro 2025 or later, or right-click the clip › Modify › Color.' });
        const rows = [];
        for (let i = 0; i < info.clips.length; i++) {
          job.check(); job.progress(i / info.clips.length, `Looking at ${info.clips[i].name}`);
          const c = info.clips[i], tl = clips.find(x => x.itemId === c.id) || clips[0];
          const st = stats((await renderAt(s.id, tl.start + Math.min(tl.end - tl.start, 4) / 2, 'log')).data);
          rows.push({ c, g: guessLog(c.name), flat: looksFlat(st) });
        }
        const sugg = (rows.find(r => r.g && r.flat) || rows.find(r => r.g) || {}).g;
        logSel.setOptions([{ value: '', label: 'The clip’s own colour (undo)' }].concat(spaces.filter(x => x.log && /log/i.test(x.name)).map(x => ({ value: x.name, label: x.name + (sugg && sugg.space === x.name ? ' – suggested' : '') }))).concat([{ value: 'Rec. 709', label: 'Rec. 709 (normal video)' }]), sugg ? sugg.space : '');
        const isLog = name => spaces.some(x => x.name === name && x.log && /log/i.test(name));
        US.clear(logList).appendChild(ui.list(rows.map(r => ({ title: r.c.name, sub: `Read as ${r.c.current || 'unknown'}${r.c.current !== r.c.original ? ` (set by you; normally ${r.c.original})` : ''}${r.g ? ` · probably ${r.g.camera}` : ''}`,
          right: isLog(r.c.current) ? 'converted by Premiere' : r.flat ? 'looks flat – probably log' : 'looks normal', color: r.flat && !isLog(r.c.current) ? 'var(--warn)' : 'var(--ok)' }))));
        if (rows.length && rows.every(r => isLog(r.c.current))) logList.appendChild(ui.note(`Premiere already recognises ${rows.length === 1 ? 'this clip' : 'these clips'} as ${rows[0].c.current} and shows ${rows.length === 1 ? 'it' : 'them'} in normal colour – nothing to do.`));
        else if (!rows.some(r => r.flat || r.c.current !== r.c.original)) logList.appendChild(ui.note('None of these look like log footage, so there’s probably nothing to do here.'));
        return { summary: `${US.plural(rows.filter(r => isLog(r.c.current)).length, 'clip')} already read as log by Premiere · ${US.plural(rows.filter(r => r.flat && !isLog(r.c.current)).length, 'clip')} look flat` };
      }), { kind: 'secondary' });
      const applyLog = ui.actionButton('Apply camera profile', () => US.jobs.run({ title: 'Setting the camera profile', tool: 'colour' }, async job => {
        const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
        const { clips } = await resolveClips(), c = clips[0], at = c.start + Math.min(c.end - c.start, 4) / 2;
        const before = await renderAt(s.id, at, 'logb');
        const r = await setLogProfile(job, { space: logSel.get(), which: which.get() });
        const after = await renderAt(s.id, at, 'loga');
        US.clear(logCompare).append(h('figure', h('img.colour-preview', { src: before.url }), h('figcaption', 'Before')), h('figure', h('img.colour-preview', { src: after.url }), h('figcaption', 'After')));
        return r;
      }));
      panes.log.append(ui.card(h('div', 'Footage filmed in a log profile (Lumix V-Log, Sony S-Log, DJI D-Log…) looks flat and grey. Tell Premiere which profile it was filmed in and Premiere shows it in normal colour.'),
        h('div.field-hint', 'This is the same as right-click › Modify › Color in Premiere: it changes the clip everywhere it’s used in the project, and you can undo it here.')),
        checkLog, logList, ui.field('Camera profile', logSel), applyLog, logCompare);

      let tab = 'looks';
      function show(t) {
        tab = t; Object.entries(panes).forEach(([k, el]) => el.classList.toggle('hidden', k !== t)); tabs.set(t); whichField.classList.toggle('hidden', t === 'match');
        const previews = ['looks', 'luts', 'grade'].includes(t); viewBox.classList.toggle('hidden', !previews);
        if (t === 'looks') loadGroups().then(drawGrid).catch(() => drawGrid()); else if (t === 'luts') drawLuts(); else if (t === 'grade') schedulePreview();
      }
      const viewBox = h('div.card.colour-viewbox', viewer, strip);
      /** A new frame: redraw what's showing (previews of earlier frames are let go). */
      function onFrame() {
        for (const m of [thumbs, lutUrls]) for (const k of Array.from(m.keys())) if (!frame || !k.startsWith(frame.key + '|')) m.delete(k); if (tab === 'looks') drawGrid(); else if (tab === 'luts') drawLuts(); else if (tab === 'grade') schedulePreview(); drawStrip(); }
      // watch the playhead while Colour is open: when it rests on a new frame for a moment, take that frame
      let pendKey = '', pendAt = 0, grabbing = false, ticking = false;
      setInterval(async () => {
        if (!visible || grabbing || ticking || US.jobs.current || document.hidden) return;
        ticking = true;
        try { await US.refreshContext(); } finally { ticking = false; }
        if (!visible || grabbing || US.jobs.current) return;
        const s = US.ctx.sequence; if (!s) { if (frame) { frame = null; onFrame(); } return; }
        if (stripSeq !== s.id) drawStrip();
        const t = s.playhead || 0, key = `${s.id}@${t.toFixed(2)}`;
        if (frame && frame.key === key) { fillStrip(); return; }
        if (key !== pendKey) { pendKey = key; pendAt = Date.now(); return; }
        if (Date.now() - pendAt < 500) return;
        grabbing = true;
        try { frame = await grabFrame(s.id, t); onFrame(); } catch (e) { viewNote.textContent = US.errors.explain(e).title; } finally { grabbing = false; }
      }, 700);
      function renderCtx() { seqLine.textContent = US.ctx.sequence ? `Sequence: ${US.ctx.sequence.name}` : 'Open a sequence in the Timeline first.'; }
      US.bus.on('context', renderCtx);
      v.body.append(seqLine, tabs, viewBox, whichField, ...Object.values(panes));
      show('looks');
      return { el: v.el, onShow() { visible = true; stripStale = true; renderCtx(); show(tab); drawStrip(); }, onHide() { visible = false; cleanupPreview(); }, show };
    }
  });

  US.colour = { tablePixels, tableToLut, quickGrade, lookTable: n => lookTable(n), TN, TW, TH, stats, difference, matchLoop, rgbToLab, parseCube, applyLut, pixelDistance, pickLookIndex, groupLooks, speedCameras, guessLog, looksFlat, lutFolders, KNOBS, GRADES,
    // for the end-to-end tests
    _captureTables: (job, looks) => captureTables(job, looks), _grabFrame: grabFrame, _tables: tables, _tablesDir: () => tablesDir(), _ensurePreview: ensurePreview, _findLut: findLut, _readLookMenu: readLookMenu, _preview: () => preview, _backToUser: backToUser, _renderPreviewPixels: renderPreviewPixels, _toRGB: toRGB };
})();
