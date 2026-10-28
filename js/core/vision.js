/* JMG Ultra Studio – picture analysis. Reads clips (their proxies, or small analysis copies made by Media Encoder
   when the panel can't decode the original) with the panel's own video decoder, measures focus, exposure, colour,
   motion, shake, zoom and faces a few times a second, and caches the numbers. Scoring is separate and pure
   (no Premiere, no video) so sliders and footage types can re-rank thousands of clips instantly. */
(function () {
  'use strict';
  const US = window.US;
  const VERSION = 8;           // bump when the measurements change (invalidates the cache)

  /* ---------------- reading video ---------------- */
  function fileUrl(p) {
    let s = String(p).replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(s)) s = '/' + s;
    return 'file://' + s.split('/').map(seg => encodeURIComponent(seg).replace(/%3A/gi, ':')).join('/');
  }

  function openVideo(file, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      let done = false;
      const fail = why => { if (done) return; done = true; clearTimeout(t); closeVideo(v); reject(new Error(why)); };
      const t = setTimeout(() => fail('timed out loading'), timeoutMs);
      // the panel's browser sometimes holds back loading for paused videos (seen on Windows after a busy spell, for
      // every file): it stops after the file's index and the first frame never comes, and seeking doesn't help.
      // A muted play() always loads it; paused again as soon as the frame is there.
      let kicked = false;
      v.onloadedmetadata = () => {
        if (done || v.readyState >= 2) return;
        kicked = true;
        const p = v.play();
        if (p && p.then) p.then(() => { if (done) v.pause(); }, () => { /* loadeddata or the timeout decides */ });
      };
      v.onloadeddata = () => { if (kicked) v.pause(); if (done) return; if (!v.videoWidth) return fail('no picture'); done = true; clearTimeout(t); resolve(v); };
      v.onerror = () => fail('decoder error ' + (v.error ? v.error.code : '?'));
      v.src = fileUrl(file);
    });
  }
  function closeVideo(v) { try { v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } }
  function seek(v, t, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      t = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
      if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return resolve();
      const to = setTimeout(() => { v.onseeked = null; reject(new Error('seek timed out at ' + t.toFixed(2))); }, timeoutMs);
      v.onseeked = () => { clearTimeout(to); v.onseeked = null; resolve(); };
      v.currentTime = t;
    });
  }

  /** Where the small H.264 analysis copy of a clip lives (made by Media Encoder; never added to the project). */
  function analysisCopyPath(item) {
    const path = require('path');
    return path.join(US.fsx.cacheDir(), 'analysis-copies', US.fsx.mediaKey(item.path || item.id) + '.mp4');
  }

  const decodable = new Map();   // file -> probe result, for this session
  let playbackShort = 0;         // clips whose fast playback dropped too many frames, this session
  async function tryDecode(file) {
    if (decodable.has(file)) return decodable.get(file);
    let r;
    try {
      const v = await openVideo(file);
      await seek(v, Math.min(0.5, (v.duration || 1) / 2));
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 9;
      cv.getContext('2d').drawImage(v, 0, 0, 16, 9);
      r = { ok: true, width: v.videoWidth, height: v.videoHeight, duration: v.duration };
      closeVideo(v);
    } catch (e) { r = { ok: false, reason: e.message }; }
    // a timeout can just mean the panel was busy: only remember answers that will be the same next time
    if (r.ok || !/timed out/.test(r.reason)) decodable.set(file, r);
    return r;
  }

  /**
   * Which file to read for an item: an attached proxy the panel can decode (fastest), else the original,
   * else a cached analysis copy. {ok, source:'proxy'|'original'|'copy', file, …} or {ok:false, reason, needsCopy}.
   */
  async function pickSource(item) {
    const fs = require('fs');
    const tries = [];
    if (item.proxy && fs.existsSync(item.proxy)) tries.push({ source: 'proxy', file: item.proxy });
    if (item.path && fs.existsSync(item.path)) tries.push({ source: 'original', file: item.path });
    const copy = item.path ? analysisCopyPath(item) : '';
    if (copy && fs.existsSync(copy)) tries.push({ source: 'copy', file: copy });
    if (!tries.length) return { ok: false, reason: item.offline ? 'offline' : 'file not found', file: item.path };
    let last = '';
    for (const c of tries) {
      const r = await tryDecode(c.file);
      if (r.ok) return Object.assign({ ok: true, source: c.source, file: c.file }, r);
      last = `${c.source}: ${r.reason}`;
    }
    return { ok: false, reason: last || 'cannot decode', file: item.path, needsCopy: !!item.path && fs.existsSync(item.path) };
  }

  /**
   * The Media Encoder preset for analysis copies: Premiere's own "High Quality 720 HD" (H.264, 1280×720), which sits next to
   * the H.264 preset the core already finds. (The "H.264 MP4" proxy preset is an ingest preset – Media Encoder refuses it
   * as a plain export with error 9007.)
   */
  async function analysisPreset() {
    const fs = require('fs'), path = require('path');
    const p = await US.host.call('encoderPresets');
    // Resolve's presets are recipes ("resolve:analysis"), not files
    if (US.app.is('resolve')) { if (p.analysis) return p.analysis; throw new US.UserError('PRESET_MISSING', { title: 'Resolve can’t make H.264 copies on this computer.', action: 'Check Resolve Studio is installed and up to date, then try again.', detail: 'encoderPresets gave no analysis recipe' }); }
    const cands = [p.analysis, p.h264 && path.join(path.dirname(p.h264), 'High Quality 720 HD.epr'), p.h264 && path.join(path.dirname(p.h264), 'Mobile Device 720p HD.epr')].filter(Boolean);
    const hit = cands.find(f => fs.existsSync(f));
    if (!hit) throw new US.UserError('PRESET_MISSING', { detail: 'High Quality 720 HD.epr not found next to ' + p.h264 });
    return hit;
  }

  /**
   * Make small H.264 analysis copies (Premiere's own 1280×720 H.264 export preset) with Media Encoder for clips the panel
   * can't decode. They go in the cache folder, not the project. attach:true also attaches them as proxies – only
   * when the clip is 16:9 (other shapes would look stretched as a 1280×720 proxy).
   * Returns {made:[item], failed:[{item, error}], attached:n, skippedAttach:n}.
   */
  async function makeAnalysisCopies(items, job, { attach = false } = {}) {
    if (!US.encoder || typeof US.encoder.run !== 'function') throw new US.UserError('HOST_SCRIPT', { title: 'The Media Encoder helper isn’t available.', action: 'Update JMG Ultra Studio, then try again.', detail: 'US.encoder.run missing' });
    const fs = require('fs'), path = require('path');
    const preset = await analysisPreset();
    US.fsx.ensureDir(path.join(US.fsx.cacheDir(), 'analysis-copies'));
    const want = items.map(it => analysisCopyPath(it));
    const tasks = items.map((it, i) => ({ itemId: it.id, out: want[i], preset, name: it.name, overwrite: true }));
    const done = await US.encoder.run(tasks, job, { label: 'Analysis copy' });
    const made = [], failed = [];
    let attached = 0, skippedAttach = 0;
    for (let i = 0; i < items.length; i++) {
      const t = done[i] || {}, it = items[i];
      // Media Encoder may report a slightly different file name; keep the copy where pickSource looks for it
      if (t.ok && t.out && t.out !== want[i] && fs.existsSync(t.out)) { try { US.fsx.renameRetry(t.out, want[i]); } catch (e) { /* leave it */ } }
      if (t.ok && fs.existsSync(want[i])) {
        decodable.delete(want[i]);
        made.push(it);
        if (attach) {
          const ratio = it.width && it.height ? it.width / it.height : 0;
          if (Math.abs(ratio - 16 / 9) < 0.03) { try { await US.host.call('selectsAttachProxy', { id: it.id, path: want[i] }); attached++; } catch (e) { skippedAttach++; } }
          else skippedAttach++;
        }
      } else failed.push({ item: it, error: { title: 'Media Encoder didn’t make an analysis copy.', detail: t.error || 'no file' }, needsCopy: true });
    }
    return { made, failed, attached, skippedAttach };
  }

  /* ---------------- per-frame measurements ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d', { willReadFrequently: true }), w, h }; }
  function luma(img) {
    const d = img.data, n = d.length >> 2, out = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
    return out;
  }

  /** Focus: Laplacian strength relative to local contrast, per tile; take a high percentile so a sharp subject on a soft background counts as sharp. */
  function sharpness(L, w, h) {
    const TX = 4, TY = 4, tw = Math.floor(w / TX), th = Math.floor(h / TY);
    const ratios = [], raws = [];
    for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
      let s = 0, s2 = 0, ls = 0, ls2 = 0, n = 0;
      for (let y = ty * th + 1; y < (ty + 1) * th - 1; y++) for (let x = tx * tw + 1; x < (tx + 1) * tw - 1; x++) {
        const i = y * w + x, c = L[i];
        const lap = 4 * c - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
        s += c; s2 += c * c; ls += lap; ls2 += lap * lap; n++;
      }
      const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
      const lsd = Math.sqrt(Math.max(0, ls2 / n - (ls / n) ** 2));
      raws.push(lsd);
      if (sd > 3) ratios.push(lsd / (sd + 2));
    }
    ratios.sort((a, b) => a - b); raws.sort((a, b) => a - b);
    const pick = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
    return { sh: pick(ratios, 0.85), shr: pick(raws, 0.85) };
  }

  /** Where the detail is, across the whole frame: centroid x of gradient energy and the share inside the middle third (the 9:16 crop). */
  function detailSpread(L, w, h) {
    let ex = 0, e = 0, mid = 0;
    const a = Math.floor(w / 3), b = Math.ceil(2 * w / 3);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, g = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]);
      ex += g * x; e += g; if (x >= a && x < b) mid += g;
    }
    return e > 0 ? { cx: ex / e / (w - 1), mid: mid / e } : { cx: 0.5, mid: 0.33 };
  }

  function exposure(L) {
    const hist = new Uint32Array(256); let sum = 0;
    for (let i = 0; i < L.length; i++) { const v = L[i] | 0; hist[v > 255 ? 255 : v]++; sum += L[i]; }
    const n = L.length, pct = p => { let acc = 0; const want = p * n; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= want) return i; } return 255; };
    let hi = 0, lo = 0; for (let i = 250; i < 256; i++) hi += hist[i]; for (let i = 0; i <= 6; i++) lo += hist[i];
    return { mean: sum / n, p10: pct(0.10), p50: pct(0.5), p90: pct(0.90), p98: pct(0.98), hi: hi / n, lo: lo / n };
  }

  /* motion: zero-mean/unit-variance luma (robust to brightness changes), coarse-to-fine block matching */
  function normalise(L) {
    let s = 0, s2 = 0; for (let i = 0; i < L.length; i++) { s += L[i]; s2 += L[i] * L[i]; }
    const m = s / L.length, sd = Math.sqrt(Math.max(1e-6, s2 / L.length - m * m)) + 1;
    const out = new Float32Array(L.length); for (let i = 0; i < L.length; i++) out[i] = (L[i] - m) / sd;
    return out;
  }
  function half(a, w, h) {
    const w2 = w >> 1, h2 = h >> 1, out = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const i = 2 * y * w + 2 * x; out[y * w2 + x] = (a[i] + a[i + 1] + a[i + w] + a[i + w + 1]) / 4; }
    return { a: out, w: w2, h: h2 };
  }
  function pyramid(a, w, h) { const l0 = { a, w, h }, l1 = half(a, w, h), l2 = half(l1.a, l1.w, l1.h); return [l0, l1, l2]; }
  /** Mean abs difference of region (x0,y0,rw,rh) of A vs B shifted by (dx,dy); NaN-safe for out-of-frame. */
  function sad(A, B, w, h, x0, y0, rw, rh, dx, dy) {
    let s = 0, n = 0;
    const xa = Math.max(x0, -dx), xb = Math.min(x0 + rw, w - dx), ya = Math.max(y0, -dy), yb = Math.min(y0 + rh, h - dy);
    for (let y = ya; y < yb; y++) { const ra = y * w, rb = (y + dy) * w + dx; for (let x = xa; x < xb; x++) { s += Math.abs(A[ra + x] - B[rb + x]); n++; } }
    return n > (rw * rh) * 0.35 ? s / n : 9;
  }
  function search(A, B, w, h, region, gx, gy, R) {
    let best = { dx: gx, dy: gy, e: Infinity }; const grid = {};
    for (let dy = gy - R; dy <= gy + R; dy++) for (let dx = gx - R; dx <= gx + R; dx++) {
      const e = sad(A, B, w, h, region[0], region[1], region[2], region[3], dx, dy); grid[dx + ',' + dy] = e;
      if (e < best.e) best = { dx, dy, e };
    }
    // sub-pixel refinement by parabola fit
    const g = (x, y) => grid[x + ',' + y];
    let fx = 0, fy = 0;
    const l = g(best.dx - 1, best.dy), r = g(best.dx + 1, best.dy), u = g(best.dx, best.dy - 1), d = g(best.dx, best.dy + 1);
    if (l != null && r != null) { const den = l - 2 * best.e + r; if (den > 1e-6) fx = US.clamp(0.5 * (l - r) / den, -0.5, 0.5); }
    if (u != null && d != null) { const den = u - 2 * best.e + d; if (den > 1e-6) fy = US.clamp(0.5 * (u - d) / den, -0.5, 0.5); }
    return { dx: best.dx + fx, dy: best.dy + fy, ix: best.dx, iy: best.dy, e: best.e };
  }
  /** Global shift (in pixels of the finest level) mapping A onto B, for a region given as fractions [x,y,w,h]. */
  function shift(PA, PB, frac = [0, 0, 1, 1]) {
    let gx = 0, gy = 0, res = null;
    for (let lv = PA.length - 1; lv >= 0; lv--) {
      const { w, h } = PA[lv];
      const region = [Math.round(frac[0] * w), Math.round(frac[1] * h), Math.round(frac[2] * w), Math.round(frac[3] * h)];
      res = search(PA[lv].a, PB[lv].a, w, h, region, gx, gy, lv === PA.length - 1 ? 6 : 2);
      if (lv > 0) { gx = res.ix * 2; gy = res.iy * 2; }
    }
    return res;
  }
  /**
   * Scale change between two frames (B relative to A): tries scales 0.80–1.25 about the centre, each with a small
   * translation search, on the 48×27 level, and refines the best with a parabola. <1 = picture shrinking (pulling back).
   */
  function scaleBetween(PA, PB) {
    const A = PA[1], B = PB[1], w = A.w, h = A.h, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const x0 = Math.round(w * 0.15), x1 = Math.round(w * 0.85), y0 = Math.round(h * 0.15), y1 = Math.round(h * 0.85);
    const scales = []; for (let s = 0.80; s <= 1.2501; s += 0.025) scales.push(+s.toFixed(3));
    const errs = scales.map(sc => {
      // warp A by sc about the centre, compare with B over the middle 70 %, allowing ±3 px of shift
      let best = Infinity;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        let e = 0, n = 0;
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
          const sx = cx + (x - dx - cx) / sc, sy = cy + (y - dy - cy) / sc;
          if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
          const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, i = iy * w + ix;
          const v = (A.a[i] * (1 - fx) + A.a[i + 1] * fx) * (1 - fy) + (A.a[i + w] * (1 - fx) + A.a[i + w + 1] * fx) * fy;
          e += Math.abs(v - B.a[y * w + x]); n++;
        }
        if (n > 50) best = Math.min(best, e / n);
      }
      return best;
    });
    let k = 0; for (let i = 1; i < errs.length; i++) if (errs[i] < errs[k]) k = i;
    let sc = scales[k];
    if (k > 0 && k < errs.length - 1) { const l = errs[k - 1], r = errs[k + 1], den = l - 2 * errs[k] + r; if (den > 1e-9) sc += US.clamp(0.5 * (l - r) / den, -0.5, 0.5) * 0.025; }
    const flat = Math.min(errs[k - 1] == null ? Infinity : errs[k - 1], errs[k + 1] == null ? Infinity : errs[k + 1]) - errs[k];
    return { scale: sc, confident: flat > 0.004 };
  }

  let faceDetector = null;
  function getFaceDetector() {
    if (faceDetector === null) { try { faceDetector = typeof FaceDetector === 'function' ? new FaceDetector({ fastMode: true, maxDetectedFaces: 6 }) : false; } catch (e) { faceDetector = false; } }
    return faceDetector;
  }

  /* ---------------- clip analysis ---------------- */
  /**
   * Measure one clip. item: {id, name, path, proxy, duration, fps}. Returns
   * {version, file, source, duration, width, height, rate, mode, samples:[{t, sh, shr, cx, mean, p10, p50, p90, p98, hi, lo, vx, vy, err, lx, ly, zm, fc, fh, fx}], sig}
   * vx/vy: motion since the previous sample, lx/ly: over about a second (frame-widths per second); zm: scale change per second
   * (negative = pulling back). Frames come from fast muted playback (about 10× real time); if playback stalls
   * (e.g. the panel is hidden) it carries on by seeking.
   */
  async function analyseClip(item, { job, rate, onProgress, faces = true, range = null } = {}) {
    const src = await pickSource(item);
    if (!src.ok) {
      if (/offline|not found/.test(src.reason)) throw new US.UserError('OFFLINE', { title: `Can’t find ${item.name}.`, detail: src.file });
      const e = new US.UserError('CANT_DECODE', { title: `Can’t read ${item.name} for analysis.`, action: 'Let JMG Ultra Studio make a small analysis copy with Media Encoder, or create H.264 proxies.', detail: `${src.file}: ${src.reason}` });
      e.needsCopy = !!src.needsCopy; throw e;
    }
    const dur = src.duration || item.duration || 0;
    const r = rate || 3;
    // only part of a long clip is used (e.g. by a sequence): analyse just that stretch
    let a0 = 0, a1 = dur;
    if (range && dur > 60 && (range[1] - range[0]) < 0.6 * dur) { a0 = Math.max(0, range[0] - 0.5); a1 = Math.min(dur, range[1] + 0.5); }
    const partial = a0 > 0 || a1 < dur;
    return US.cache.cached('vision', src.file, `${VERSION}-r${r}-f${faces && getFaceDetector() ? 1 : 0}${partial ? `-${a0.toFixed(1)}-${a1.toFixed(1)}` : ''}`, async () => {
      const v = await openVideo(src.file);
      try {
        const portrait = v.videoHeight > v.videoWidth;
        const full = portrait ? canvas(90, 160) : canvas(160, 90);
        const det = portrait ? canvas(180, 320) : canvas(320, 180);
        const mot = portrait ? canvas(54, 96) : canvas(96, 54);
        const faceC = portrait ? canvas(180, 320) : canvas(320, 180);
        const fd = faces ? getFaceDetector() : false;
        const vw = v.videoWidth, vh = v.videoHeight;
        const grab = (target, crop) => { if (crop) target.g.drawImage(v, vw * 0.2, vh * 0.2, vw * 0.6, vh * 0.6, 0, 0, target.w, target.h); else target.g.drawImage(v, 0, 0, target.w, target.h); return target.g.getImageData(0, 0, target.w, target.h); };
        const samples = [], history = [], faceJobs = [];
        const thumbSum = new Float32Array(48), rgb = [0, 0, 0];
        let prev = null, lastFaceT = -Infinity;

        /** Measure the frame currently shown by the video element (synchronous, so it is safe inside a frame callback). */
        function processFrame(t) {
          const F = luma(grab(full)), D = luma(grab(det, true)), M = grab(mot), ML = luma(M);
          const P = pyramid(normalise(ML), mot.w, mot.h);
          const s = Object.assign({ t: +t.toFixed(3) }, sharpness(D, det.w, det.h), exposure(F), detailSpread(F, full.w, full.h));
          const md = M.data; let rr = 0, gg = 0, bb = 0; for (let k = 0; k < md.length; k += 4) { rr += md[k]; gg += md[k + 1]; bb += md[k + 2]; }
          const np = md.length / 4; rgb[0] += rr / np; rgb[1] += gg / np; rgb[2] += bb / np;
          s.r = +(rr / np).toFixed(1); s.g = +(gg / np).toFixed(1); s.b = +(bb / np).toFixed(1);
          for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 8; tx++) { let a = 0, c = 0; for (let y = Math.floor(ty * mot.h / 6); y < Math.floor((ty + 1) * mot.h / 6); y++) for (let x = Math.floor(tx * mot.w / 8); x < Math.floor((tx + 1) * mot.w / 8); x++) { a += ML[y * mot.w + x]; c++; } thumbSum[ty * 8 + tx] += a / c; }
          if (prev && t > prev.t) {
            const sp = t - prev.t, m = shift(prev.P, P);
            s.vx = +(m.dx / mot.w / sp).toFixed(4); s.vy = +(m.dy / mot.w / sp).toFixed(4); s.err = +m.e.toFixed(3);
          } else { s.vx = 0; s.vy = 0; s.err = 0; }
          let back = null; for (const hh of history) if (t - hh.t >= 0.9) back = hh;
          if (back) {
            const span = t - back.t, lm = shift(back.P, P), z = scaleBetween(back.P, P);
            s.lx = +(lm.dx / mot.w / span).toFixed(4); s.ly = +(lm.dy / mot.w / span).toFixed(4); s.zm = z.confident ? +((z.scale - 1) / span).toFixed(4) : null;
          } else { s.lx = s.vx; s.ly = s.vy; s.zm = null; }
          history.push({ t, P }); while (history.length && t - history[0].t > 1.6) history.shift();
          prev = { t, P };
          if (fd && t - lastFaceT >= 1) {
            lastFaceT = t;
            const fc = canvas(faceC.w, faceC.h); fc.g.drawImage(v, 0, 0, fc.w, fc.h);
            faceJobs.push(fd.detect(fc.c).then(found => {
              s.fc = found.length;
              if (found.length) {
                const big = found.reduce((a, b) => (b.boundingBox.height > a.boundingBox.height ? b : a)), bb = big.boundingBox;
                s.fh = +(bb.height / fc.h).toFixed(3); s.fx = +((bb.x + bb.width / 2) / fc.w).toFixed(3);
                // how bright the face itself is (exposure on the subject)
                const x = Math.max(0, Math.round(bb.x + bb.width * 0.2)), y = Math.max(0, Math.round(bb.y + bb.height * 0.2));
                const w = Math.max(1, Math.min(fc.w - x, Math.round(bb.width * 0.6))), hgt = Math.max(1, Math.min(fc.h - y, Math.round(bb.height * 0.6)));
                const L = luma(fc.g.getImageData(x, y, w, hgt)); s.fl = +US.mean(Array.from(L)).toFixed(1);
              }
            }, () => { s.fc = -1; }));
          }
          for (const k of ['sh', 'shr', 'cx', 'mid', 'mean']) s[k] = +s[k].toFixed(3);
          samples.push(s);
          if (onProgress) onProgress(Math.min(1, (t - a0) / Math.max(0.01, a1 - a0)), t);
        }

        const step = 1 / r;
        let mode = 'playback';
        let canPlay = typeof v.requestVideoFrameCallback === 'function' && !US.settings.get('visionSeekOnly', false) && playbackShort < 2;
        if (canPlay) {
          // seeking samples exact, evenly spaced frames (playback drops some and lands on different ones each run);
          // use it whenever this file seeks about as fast as playback would deliver a sample (≈ 45 ms at 8×)
          // (timed at points inside the clip, away from keyframes: long-GOP 4K seeks cheaply at the start, slowly elsewhere)
          if (a1 - a0 > 2) {
            const probe = [];
            for (const f of [0.31, 0.57, 0.83]) { const w = performance.now(); await seek(v, a0 + (a1 - a0) * f + 0.13); probe.push(performance.now() - w); }
            probe.sort((x, y) => x - y);
            if (probe[1] <= 45) canPlay = false;
          } else canPlay = false;            // a clip this short: seeking is quick anyway
        }
        let reached = -Infinity;
        if (canPlay) {
          reached = await new Promise(resolve => {
            let last = -Infinity, lastWall = performance.now(), finished = false;
            const finish = () => { if (finished) return; finished = true; clearInterval(watch); v.pause(); resolve(last); };
            const watch = setInterval(() => {
              if (job && job.cancelled) return finish();
              if (performance.now() - lastWall > 2500) finish();          // stalled: fall back to seeking from "last"
            }, 250);
            const cb = (now, meta) => {
              if (finished) return;
              lastWall = performance.now();
              const t = meta.mediaTime;
              if (t - last >= step * 0.8 || last < 0) { last = t; try { processFrame(t); } catch (e) { console.error(e); } }
              if (t >= a1 - 0.05) return finish();
              v.requestVideoFrameCallback(cb);
            };
            v.onended = finish;
            seek(v, a0).then(() => {
              v.playbackRate = US.clamp(24 * step, 2, 16);
              v.requestVideoFrameCallback(cb);
              return v.play();
            }).catch(() => finish());
          });
          v.onended = null;
          // playback that delivered far fewer frames than asked for (seen on Windows when the panel is busy: about
          // 17 of 30) can step over a short whip pan or bump: read the whole clip by seeking instead
          const want = (Math.min(reached, a1) - a0) / step;
          if (want > 4 && samples.length < want * 0.8) {
            playbackShort++;   // twice in a session: this computer's playback drops frames, so seek from now on
            US.log('info', `Picture analysis: playback gave ${samples.length} of ~${Math.round(want)} frames, reading by seeking`, US.basename(src.file), 'vision');
            samples.length = 0; history.length = 0; prev = null; lastFaceT = -Infinity;
            thumbSum.fill(0); rgb[0] = rgb[1] = rgb[2] = 0;
            reached = -Infinity;
          }
        }
        if (job) job.check();
        if (reached < a1 - step - 0.1) {
          // seek for whatever playback didn't cover
          if (samples.length) mode = 'mixed'; else mode = 'seek';
          for (let t = Math.max(a0, reached + step); t < a1 - 0.02; t += step) {
            await seek(v, t);
            processFrame(t);
            if (job) job.check();
          }
        }
        await Promise.all(faceJobs);
        const nS = Math.max(1, samples.length);
        const sig = { thumb: Array.from(thumbSum, x => +(x / nS).toFixed(1)), rgb: rgb.map(x => +(x / nS).toFixed(1)) };
        return { version: VERSION, file: src.file, source: src.source, duration: dur, range: partial ? [a0, a1] : null, width: vw, height: vh, rate: r, mode, samples, sig, faces: !!fd };
      } finally { closeVideo(v); }
    });
  }

  /**
   * Analyse many clips (two at a time), reporting overall progress by footage duration.
   * Returns {results: [{item, data}], failed: [{item, error}]}.
   */
  async function analyseMany(items, { job, parallel = 2 } = {}) {
    // items may carry .range [a,b] (the part a sequence uses); progress is measured by what will be analysed
    const len = it => Math.max(1, it.range && it.duration > 60 && (it.range[1] - it.range[0]) < 0.6 * it.duration ? it.range[1] - it.range[0] : (it.duration || 1));
    const total = items.reduce((s, it) => s + len(it), 0);
    const doneDur = new Map(); let finished = 0;
    const t0 = performance.now();
    const report = () => {
      const d = US.sum(Array.from(doneDur.values()));
      const speed = d / Math.max(0.5, (performance.now() - t0) / 1000);
      job && job.progress(d / total, `Clip ${Math.min(items.length, finished + 1)} of ${items.length} · ${speed >= 1 ? Math.round(speed) + '× real time' : 'starting'}`);
    };
    const results = [], failed = [];
    await US.pool(items, parallel, async it => {
      if (job) job.check();
      try {
        const data = await analyseClip(it, { job, range: it.range, onProgress: (f) => { doneDur.set(it.id, f * len(it)); report(); } });
        results.push({ item: it, data });
      } catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        failed.push({ item: it, error: US.errors.explain(e), needsCopy: !!(e && e.needsCopy) });
      }
      doneDur.set(it.id, len(it)); finished++; report();
    });
    return { results, failed, seconds: (performance.now() - t0) / 1000, footage: total };
  }

  /* ---------------- scoring (pure: numbers in, selects out) ---------------- */
  /**
   * Footage types. Each sets how strict the basic checks are and what matters for that kind of video:
   *   faces: 0 ignore, 1 nice to have, 2 needed · motion: 'any' | 'calm' (penalise people walking through a still shot)
   *   | 'moving' (prefer camera moves) | 'energetic' (prefer action) · boring: penalty for "nothing happening" stretches
   *   longer than boringSec · pump / flicker / colour / walkers / jolts: how much auto-exposure pumping, flashes and strobes,
   *   colour (white-balance) shifts, people crossing a still shot and sudden camera jolts count against a moment.
   */
  const BASE = { focus: 50, exposure: 50, steady: 50, minLen: 2, maxLen: 10, edgeTrim: 0.5, dupes: true, best: 80, good: 65, ok: 50, prefer: 'any',
    faces: 0, motion: 'any', boring: 0.2, boringSec: 8, pump: 0.4, flicker: 0.3, colour: 0.3, walkers: 0.2, jolts: 0.3 };
  const FOOTAGE = {
    // the default: anything that can go over something else; only technically unusable stretches are left out
    any: { label: 'Any footage – usable B-roll', desc: 'Keeps anything you could cut to or put over something else. Only what’s technically unusable is left out: blurry or out of focus, far too dark or blown out, too shaky, a camera bump or a whip pan.',
      focus: 50, exposure: 40, steady: 45, minLen: 1.5, maxLen: 10, dupes: false, prefer: 'any', faces: 0, motion: 'any', boring: 0, pump: 0.3, flicker: 0.2, colour: 0, walkers: 0, jolts: 0.4 },
    concert: { label: 'Concert & live music', desc: 'Stage lighting is judged on the lit parts; strobes and colour changes are part of the show.', flicker: 0, colour: 0, pump: 0.3, boring: 0.2 },
    interview: { label: 'Interviews & talking heads', desc: 'Wants a steady, well-exposed face; penalises people walking through, flicker and colour shifts.', focus: 60, exposure: 55, steady: 65, minLen: 3, maxLen: 20, prefer: 'close', faces: 2, motion: 'calm', boring: 0, pump: 0.8, flicker: 0.6, colour: 0.6, walkers: 0.8, jolts: 0.5 },
    wedding: { label: 'Weddings & events', desc: 'People first: faces, steady or smooth moves, stable exposure in mixed light.', focus: 55, steady: 55, maxLen: 12, faces: 1, boring: 0.3, pump: 0.6, flicker: 0.3, colour: 0.5, walkers: 0.3, jolts: 0.5 },
    travel: { label: 'Travel & B-roll', desc: 'Smooth camera moves and things happening; long static stretches score lower.', focus: 55, exposure: 55, steady: 60, maxLen: 8, motion: 'moving', boring: 0.7, boringSec: 6, pump: 0.5, colour: 0.5, jolts: 0.6 },
    sports: { label: 'Sports & action', desc: 'Rewards movement and energy, but still wants it sharp; short selects.', focus: 60, exposure: 45, steady: 40, minLen: 1, maxLen: 6, motion: 'energetic', boring: 0.8, boringSec: 3, pump: 0.3, jolts: 0.2 },
    documentary: { label: 'Documentary', desc: 'Balanced: steady, well exposed, longer selects.', steady: 55, minLen: 3, maxLen: 20, boring: 0.2, pump: 0.5, flicker: 0.4, colour: 0.4, walkers: 0.3 },
    drone: { label: 'Drone & aerial', desc: 'Very smooth moves only: wobble and jolts count heavily.', steady: 75, minLen: 3, maxLen: 15, motion: 'moving', boring: 0.4, pump: 0.5, colour: 0.3, jolts: 1 },
    phone: { label: 'Phone footage', desc: 'Watches for stabiliser wobble and auto-exposure pumping.', focus: 45, steady: 60, maxLen: 12, pump: 0.9, flicker: 0.4, colour: 0.5, jolts: 0.6 },
    crowd: { label: 'Crowd & audience', desc: 'Tolerant of low light and motion; prefers wide shots.', focus: 35, exposure: 40, steady: 40, maxLen: 12, best: 78, good: 60, ok: 45, prefer: 'wide', flicker: 0, colour: 0 },
    closeups: { label: 'Close-ups', desc: 'Prefers tight shots of faces.', focus: 60, steady: 55, maxLen: 8, prefer: 'close', faces: 1, flicker: 0.2, colour: 0.2 }
  };
  const PICKY = {
    // same wording as Story's "How picky"
    loose: { label: 'Everything useful', desc: 'every moment that’s usable, including softer, darker or shakier ones', focus: -20, exposure: -20, steady: -20, best: -5, good: -10, ok: -10, minLen: -0.5 },
    normal: { label: 'Balanced', desc: 'clean, usable moments', },
    strict: { label: 'Only the best', desc: 'the stand-out moments: sharp, well exposed and steady', focus: 20, exposure: 15, steady: 20, best: 5, good: 7, ok: 10, minLen: 1 }
  };
  /** Settings for a footage type at a pickiness: settingsFor('interview', 'strict') */
  function settingsFor(type, picky = 'normal') {
    const st = Object.assign({}, BASE, FOOTAGE[type] || FOOTAGE.concert, { footage: FOOTAGE[type] ? type : 'concert', picky });
    delete st.label; delete st.desc;
    const p = PICKY[picky] || PICKY.normal;
    for (const k of ['focus', 'exposure', 'steady', 'best', 'good', 'ok']) if (p[k]) st[k] = US.clamp(st[k] + p[k], 0, 100);
    if (p.minLen) st.minLen = Math.max(0.5, st.minLen + p.minLen);
    return st;
  }
  // old preset names still work (Assistant phrases, saved settings)
  const PRESETS = { concert: settingsFor('concert'), strict: settingsFor('concert', 'strict'), loose: settingsFor('concert', 'loose'), crowd: settingsFor('crowd'), closeups: settingsFor('closeups') };
  for (const k of Object.keys(FOOTAGE)) if (!PRESETS[k]) PRESETS[k] = settingsFor(k);

  const smooth = (x, a, b) => { const t = US.clamp((x - a) / ((b - a) || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const SHOT_ORDER = { close: 0, mid: 1, wide: 2, unknown: 3 };
  const MOVES = ['static', 'pan', 'tilt', 'push-in', 'pull-out', 'handheld'];
  const MOVE_LABEL = { static: 'Static', pan: 'Pan', tilt: 'Tilt', 'push-in': 'Push-in', 'pull-out': 'Pull-out', handheld: 'Handheld', fast: 'Fast move' };
  const median = US.median;

  /**
   * Everything about a clip that doesn't depend on the settings, worked out once and memoised on the data object:
   * shake, fast motion, shot size, camera move, brightness flicker and pumping, colour shift, activity in the frame,
   * stillness, reveal candidates and a profile for duplicate detection.
   */
  function prepare(data) {
    if (data._prep) return data._prep;
    const S = data.samples, n = S.length;
    // shake: how much the picture moves between samples without going anywhere (random jitter), in frame widths.
    // Pans and zooms move consistently, so they score ~0; a locked-off camera scores 0. Independent of sample spacing.
    const d = S.map((s, i) => { const g = i ? s.t - S[i - 1].t : 0; return { x: s.vx * g, y: s.vy * g }; });
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sa = 0, c = 0;
      for (let j = Math.max(1, i - 2); j <= Math.min(n - 1, i + 2); j++) { sx += d[j].x; sy += d[j].y; sa += Math.hypot(d[j].x, d[j].y); c++; }
      raw[i] = c ? (sa / c) * (1 - Math.hypot(sx, sy) / (sa + 1e-9)) : 0;
    }
    const shake = new Float64Array(n);   // widened by one sample each side: shake rarely stops exactly between two samples
    for (let i = 0; i < n; i++) shake[i] = Math.max(raw[i], i > 0 ? raw[i - 1] : 0, i + 1 < n ? raw[i + 1] : 0);
    // fast camera moves (whip pans): very fast, or tracking lost while moving; the tail of a fast move counts too
    // (the measured speed of a whip pan depends on where the samples fall, so lost tracking and motion blur count too)
    const fastRaw = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const v = Math.hypot(S[i].vx, S[i].vy), e = S[i].err;
      const near = S.slice(Math.max(0, i - 4), i + 5).map(q => q.sh), blur = S[i].sh < 0.65 * median(near);
      fastRaw[i] = v > 0.4 || (v > 0.15 && e > 0.35) || (v > 0.1 && (e > 0.6 || blur)) || (i > 0 && fastRaw[i - 1] && (e > 0.3 || v > 0.12));
    }
    // a fast sample measures motion since the previous one, so the interval before it is spoiled too
    const fast = fastRaw.map((f, i) => f || (i + 1 < n && fastRaw[i + 1]));
    // faces / shot size, carried from the once-a-second face check to the samples in between
    const shot = new Array(n).fill(null), face = new Array(n).fill(false), faceLuma = new Array(n).fill(null);
    let last = null, lastFace = false, lastFl = null;
    for (let i = 0; i < n; i++) {
      if (S[i].fc != null) { last = S[i].fc > 0 ? (S[i].fh >= 0.25 ? 'close' : S[i].fh >= 0.1 ? 'mid' : 'wide') : null; lastFace = S[i].fc > 0; lastFl = S[i].fl != null ? S[i].fl : null; }
      shot[i] = last; face[i] = lastFace; faceLuma[i] = lastFace ? lastFl : null;
    }
    // brightness: single-sample flashes (strobes, photo flashes) vs slow up-and-down swings (auto-exposure pumping)
    const m = S.map(s => s.mean), rel = (a, b) => Math.abs(a - b) / Math.max(20, b);
    const flash = S.map((s, i) => i > 0 && i + 1 < n && rel(m[i], m[i - 1]) > 0.15 && rel(m[i + 1], m[i - 1]) < 0.3 * rel(m[i], m[i - 1]));
    const camStill = S.map(s => Math.abs(s.lx) < 0.02 && Math.abs(s.ly) < 0.02 && Math.abs(s.zm || 0) < 0.03);
    const flicker = new Float64Array(n), pump = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
      let fl = 0, tv = 0, still = 0, lvl = 0;
      for (let j = a; j <= b; j++) { if (camStill[j]) still++; lvl += m[j]; if (j > a && !flash[j] && !flash[j - 1]) tv += Math.abs(m[j] - m[j - 1]); }
      const fa = Math.max(0, i - 5), fb = Math.min(n - 1, i + 5);
      for (let j = fa; j <= fb; j++) if (flash[j]) fl++;
      flicker[i] = fl / (fb - fa + 1);
      lvl /= (b - a + 1);
      // pumping only means something when the camera is holding still (otherwise brightness changes with the view)
      pump[i] = still >= 0.7 * (b - a + 1) ? Math.max(0, tv - Math.abs(m[b] - m[a])) / ((b - a + 1) * Math.max(30, lvl)) : 0;
    }
    // colour: change of red/blue share over about 2 s while the camera holds still (white balance drifting or jumping)
    const chroma = S.map(s => { const t = (s.r || 0) + (s.g || 0) + (s.b || 0); return t > 15 ? [s.r / t, s.b / t] : null; });
    const colShift = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!chroma[i] || !camStill[i] || fast[i]) continue;
      let j = i; while (j > 0 && S[i].t - S[j].t < 2) j--;
      if (j === i || !chroma[j] || !camStill[j]) continue;
      colShift[i] = Math.abs(chroma[i][0] - chroma[j][0]) + Math.abs(chroma[i][1] - chroma[j][1]);
    }
    // activity: what changes in the frame that a camera move or brightness change doesn't explain (someone walking through)
    // (a sample right after a flash is compared with the flash frame, so it doesn't count either)
    const act = S.map((s, i) => (camStill[i] && !flash[i] && !(i > 0 && flash[i - 1]) && flicker[i] < 0.1 && pump[i] < 0.06 && !fast[i]) ? s.err : null);
    // exposure of a flash frame is the flash, not the shot: judge it by the last ordinary frame
    const expo = S.map((s, i) => { let j = i; while (j > 0 && flash[j]) j--; return flash[j] && j + 1 < n ? S[j + 1] : S[j]; });
    const speed = S.map(s => Math.hypot(s.lx, s.ly));
    const energy = S.map((s, i) => Math.max(act[i] || 0, Math.min(1, speed[i] * 4)));
    // camera move per sample, then majority over ±2 samples so it doesn't flicker between types
    const moveRaw = S.map((s, i) => {
      if (fast[i]) return 'fast';
      if (raw[i] > 0.0025) return 'handheld';
      if (s.zm != null && Math.abs(s.zm) >= 0.025) return s.zm > 0 ? 'push-in' : 'pull-out';
      if (Math.abs(s.lx) >= 0.008 && Math.abs(s.lx) >= Math.abs(s.ly)) return 'pan';
      if (Math.abs(s.ly) >= 0.008) return 'tilt';
      return 'static';
    });
    const move = moveRaw.map((_, i) => { const c = {}; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) c[moveRaw[j]] = (c[moveRaw[j]] || 0) + 1; return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; });
    const still = S.map((s, i) => move[i] === 'static' && s.err < 0.03 && !flash[i] && !face[i]);   // a face talking isn't "nothing happening"
    // reveal candidates: 2-second windows that pull back, crane, push in or light up – smoothly, with no cut or jump inside
    const cands = [];
    if (n >= 5) {
      const step = (S[n - 1].t - S[0].t) / (n - 1) || 0.33;
      const win = Math.max(5, Math.round(2 / Math.max(0.15, step)));
      const jump = S.map((s, i) => fast[i] || s.err > 0.75 || Math.abs(s.zm || 0) > 0.35 || flash[i]);
      for (let i = 0; i + win <= n; i++) {
        let bad = false; for (let k = i; k < i + win; k++) if (jump[k]) { bad = true; break; }
        if (bad) continue;
        const w = S.slice(i, i + win);
        const zs = w.filter(s => s.zm != null).map(s => s.zm), zn = Math.max(1, zs.length);
        const zOut = zs.length >= 3 ? zs.filter(z => z < -0.03).length / zn : 0, zIn = zs.length >= 3 ? zs.filter(z => z > 0.03).length / zn : 0, zMed = zs.length ? median(zs) : 0;
        const vy = median(w.map(s => s.ly)), vyCons = w.filter(s => Math.sign(s.ly) === Math.sign(vy) && Math.abs(s.ly) > 0.015).length / win;
        const b0 = (w[0].p90 + w[1].p90) / 2, b1 = (w[win - 1].p90 + w[win - 2].p90) / 2;
        let rising = 0; for (let k = 1; k < win; k++) if (w[k].p90 >= w[k - 1].p90 - 2) rising++;
        let type = null;
        if (zOut >= 0.7 && zMed < -0.04) type = 'Pull-back';
        else if (Math.abs(vy) > 0.025 && vyCons >= 0.75) type = vy > 0 ? 'Crane / tilt up' : 'Crane / tilt down';
        else if (zIn >= 0.7 && zMed > 0.05) type = 'Push-in';
        else if (b0 >= 8 && b0 < 120 && b1 / b0 >= 1.8 && rising >= 0.7 * (win - 1)) type = 'Dark to lit';
        if (type) cands.push({ start: w[0].t, end: w[win - 1].t, type, lightsUp: b0 >= 8 && b1 / Math.max(1, b0) >= 1.8, shake: median(Array.from(shake.slice(i, i + win))) });
      }
    }
    const prof = n ? {
      mean: median(m), sh: median(S.map(s => s.sh)), shake: median(Array.from(shake)),
      lx: median(S.map(s => Math.abs(s.lx))), ly: median(S.map(s => Math.abs(s.ly)))
    } : null;
    data._prep = { shake, raw, fast, shot, face, faceLuma, flash, flicker, pump, colShift, act, energy, move, still, expo, cands, prof };
    return data._prep;
  }

  function thresholds(st) {
    const kf = st.focus / 100, ke = st.exposure / 100, ks = st.steady / 100;
    const fLo = lerp(0.12, 0.55, kf), dLo = lerp(15, 50, ke), hLo = lerp(0.35, 0.10, ke);
    const sLo = lerp(0.006, 0.0015, ks) * (1 - 0.4 * (st.jolts || 0));   // gentle sway and violent jitter look alike at ~3 samples/s
    return { fLo, fHi: fLo * 2.4, dLo, dHi: dLo + 40, hLo, hHi: hLo + 0.25, sLo, sHi: sLo * 2.6 };
  }

  /**
   * Per-sample sub-scores 0..1 and an overall 0..100. It's a product, so one bad check is enough to drop a moment;
   * the footage type decides how much the extra checks (faces, flicker, pumping, colour, walkers, stillness) count.
   */
  function sampleScores(data, st, T) {
    const P = prepare(data), S = data.samples, n = S.length, out = new Array(n);
    // "nothing happening": runs of still samples longer than boringSec
    const boring = new Array(n).fill(false);
    if (st.boring > 0) for (let i = 0; i < n;) {
      if (!P.still[i]) { i++; continue; }
      let j = i; while (j + 1 < n && P.still[j + 1]) j++;
      if (S[j].t - S[i].t >= st.boringSec) for (let k = i; k <= j; k++) boring[k] = true;
      i = j + 1;
    }
    for (let i = 0; i < n; i++) {
      const s = S[i];
      const f = smooth(s.sh, T.fLo, T.fHi);
      const ex = P.expo[i];
      const dark = smooth(ex.p90, T.dLo, T.dHi), blown = smooth(ex.hi, T.hLo, T.hHi) * (ex.mean > 200 ? 1 : 0.6);
      let e = dark * (1 - blown);
      if (st.faces && P.faceLuma[i] != null) e = Math.min(e, smooth(P.faceLuma[i], 30, 65) * (1 - smooth(P.faceLuma[i], 215, 245)));
      const k = 1 - smooth(P.shake[i], T.sLo, T.sHi);
      const pumpF = 1 - st.pump * smooth(P.pump[i], 0.04, 0.12);
      const flickF = 1 - st.flicker * smooth(P.flicker[i], 0.1, 0.3);
      const colF = 1 - st.colour * smooth(P.colShift[i], 0.03, 0.08);
      const walkF = 1 - st.walkers * smooth(P.act[i] || 0, 0.08, 0.2);
      const faceF = st.faces === 2 ? (P.face[i] ? 1 : 0.35) : st.faces === 1 ? (P.face[i] ? 1 : 0.85) : 1;
      const mv = P.move[i];
      const moveF = st.motion === 'moving' ? (mv === 'static' ? 0.85 : 1) : st.motion === 'energetic' ? 0.7 + 0.3 * smooth(P.energy[i], 0.05, 0.3) : 1;
      const boreF = boring[i] ? 1 - 0.6 * st.boring : 1;
      let score = 100 * f * e * k * pumpF * flickF * colF * walkF * faceF * moveF * boreF;
      const sh = P.shot[i];
      if (st.prefer === 'close' && sh) score *= sh === 'close' ? 1.08 : sh === 'wide' ? 0.85 : 1;
      if (st.prefer === 'wide' && sh === 'close') score *= 0.9;
      out[i] = { t: s.t, f, e, dark, blown, k, pumpF, flickF, colF, walkF, faceF, moveF, boreF, fast: P.fast[i], score: Math.min(100, score), shot: sh, boring: boring[i] };
    }
    return out;
  }

  /** The single biggest problem in a stretch of samples, in plain words. */
  function why(sc, a, b) {
    const n = b - a + 1, avg = k => { let s = 0; for (let i = a; i <= b; i++) s += sc[i][k]; return s / n; };
    let fast = 0; for (let i = a; i <= b; i++) if (sc[i].fast) fast++;
    if (fast >= n * 0.5) return 'Fast camera move';
    const probs = [['Soft focus', avg('f')], ['Too dark', avg('dark')], ['Highlights blown out', 1 - avg('blown')], ['Too shaky', avg('k')],
      ['Exposure pumping', avg('pumpF')], ['Flicker or flashes', avg('flickF')], ['Colour shift', avg('colF')], ['Someone walks through', avg('walkF')],
      ['No face in shot', avg('faceF')], ['Nothing happening', avg('boreF')], ['Not enough movement', avg('moveF')]];
    probs.sort((x, y) => x[1] - y[1]);
    return probs[0][1] < 0.75 ? probs[0][0] : 'Below the score cut-off';
  }

  function reveals(data, T) {
    const merged = [];
    for (const r of prepare(data).cands) {
      if (r.shake >= T.sHi) continue;
      const m = merged[merged.length - 1];
      if (m && r.start <= m.end + 0.3) { m.end = Math.max(m.end, r.end); m.counts[r.type] = (m.counts[r.type] || 0) + 1; m.lightsUp = m.lightsUp || r.lightsUp; }
      else merged.push({ start: r.start, end: r.end, counts: { [r.type]: 1 }, lightsUp: r.lightsUp });
    }
    // the move seen most often names the reveal; "as the lights come up" is added when the picture also brightens
    return merged.map(m => {
      const total = US.sum(Object.values(m.counts)), PRIORITY = ['Pull-back', 'Push-in', 'Crane / tilt up', 'Crane / tilt down', 'Dark to lit'];
      const type = PRIORITY.find(t => (m.counts[t] || 0) >= total / 4) || Object.keys(m.counts)[0];
      return { start: m.start, end: m.end, type, label: type === 'Dark to lit' || !m.lightsUp ? type.toLowerCase() : `${type.toLowerCase()} as the lights come up` };
    });
  }

  function sigDistance(a, b) {
    if (!a || !b) return Infinity;
    let d = 0; for (let i = 0; i < a.thumb.length; i++) d += Math.abs(a.thumb[i] - b.thumb[i]);
    d /= a.thumb.length;
    const c = (Math.abs(a.rgb[0] - b.rgb[0]) + Math.abs(a.rgb[1] - b.rgb[1]) + Math.abs(a.rgb[2] - b.rgb[2])) / 3;
    return Math.max(d, c);
  }
  /** Same take? Looks alike AND moves, shakes and is exposed the same way over its length. */
  function isDuplicate(A, B) {
    const da = A.data.duration, db = B.data.duration;
    if (Math.abs(da - db) / Math.max(da, db) > 0.15) return false;
    if (sigDistance(A.data.sig, B.data.sig) > 6) return false;
    const pa = prepare(A.data).prof, pb = prepare(B.data).prof;
    if (!pa || !pb) return false;
    return Math.abs(pa.mean - pb.mean) < 6 && Math.abs(pa.lx - pb.lx) < 0.006 && Math.abs(pa.ly - pb.ly) < 0.006 &&
      Math.abs(pa.shake - pb.shake) < 0.01 && pa.sh / Math.max(1e-6, pb.sh) > 0.8 && pa.sh / Math.max(1e-6, pb.sh) < 1.25;
  }

  const majority = arr => { const c = {}; for (const x of arr) if (x != null) c[x] = (c[x] || 0) + 1; return Object.keys(c).sort((x, y) => c[y] - c[x])[0] || null; };

  /**
   * Score analysed clips. clips: [{item:{id,name,path,duration,fps,width,height, srcId?, range?:[in,out], seq?:{start,speed}}, data}].
   * An item with a range is a use of a source clip in a sequence: only that stretch is graded, without start/end trimming,
   * and selects point at the source clip (clipId = srcId) with .tl giving their place in the sequence.
   * st: settings (settingsFor / PRESETS) plus optional forced: [{clipId, mode:'in', start, end} | {clipId, mode:'out', t}]
   * and heroCount (number, or 'pct' for the top 10 %). Returns {selects, rejected, stats}. Pure and fast.
   */
  /**
   * A select's camera move in words and how smooth it is. samples: [{lx, ly, zm, k, shake}] (fast moments left out).
   * lx < 0 is the picture moving left, i.e. the camera panning right; ly > 0 the picture moving down (tilting up).
   * smooth 0–100: steady speed and direction, no wobble. cinematic: a pan, tilt, push-in or pull-out that's smooth.
   * -> {label, smooth, cinematic, strength (0–1, how much a smooth move counts)}
   */
  const rankOf = s => (s.rank != null ? s.rank : s.score);
  function cameraMove(move, samples) {
    if (samples.length < 3) return { label: MOVE_LABEL[move] || 'Static', smooth: null, cinematic: false, strength: 0 };
    const axis = move === 'pan' ? 'lx' : move === 'tilt' ? 'ly' : move === 'push-in' || move === 'pull-out' ? 'zm' : null;
    let label = MOVE_LABEL[move] || 'Static';
    if (move === 'pan') label = median(samples.map(x => x.lx)) < 0 ? 'Pan right' : 'Pan left';
    if (move === 'tilt') label = median(samples.map(x => x.ly)) > 0 ? 'Tilt up' : 'Tilt down';
    const steady = US.clamp(US.mean(samples.map(x => x.k)), 0, 1);
    if (!axis) return { label, smooth: move === 'static' ? Math.round(steady * 100) : Math.round(steady * 50), cinematic: false, strength: 0 };
    // even speed: how little the speed along the move varies (coefficient of variation), and it keeps one direction
    // (median-based, so one odd measurement doesn't spoil a good move)
    const v = samples.map(x => x[axis]).filter(x => x != null);
    if (v.length < 3) return { label, smooth: null, cinematic: false, strength: 0 };
    const mid = median(v), abs = Math.abs(mid);
    const spread = 1.4826 * median(v.map(x => Math.abs(x - mid)));
    const even = abs > 1e-6 ? US.clamp(1 - spread / (abs * 1.5), 0, 1) : 0;
    const oneWay = v.filter(x => Math.sign(x) === Math.sign(mid)).length / v.length;
    const smooth = Math.round(100 * steady * (0.25 + 0.75 * even) * (oneWay >= 0.9 ? 1 : oneWay));
    const cinematic = smooth >= 60;
    return { label, smooth, cinematic, strength: cinematic ? US.clamp((smooth - 60) / 30, 0.35, 1) : 0 };
  }

  function score(clips, st) {
    st = Object.assign({}, BASE, PRESETS.concert, st || {});
    const T = thresholds(st), forced = st.forced || [];
    const selects = [], rejected = [], seen = new Set();
    const idOf = item => item.srcId || item.id;
    const rej = (item, start, end, whyText, extra) => rejected.push(Object.assign({ key: `${idOf(item)}@${(+start).toFixed(1)}`, clipId: idOf(item), clipName: item.name, start: +(+start).toFixed(3), end: +(+end).toFixed(3), why: whyText }, extra || {}));
    for (const { item, data } of clips) {
      const all = data ? data.samples : [];
      const dur = (data && data.duration) || item.duration || 0;
      const range = item.range || null;
      // which samples belong to this clip (a sequence use only sees its own stretch)
      let i0 = 0, i1 = all.length - 1;
      if (range) { i0 = all.findIndex(s => s.t >= range[0] - 0.01); i1 = -1; for (let i = all.length - 1; i >= 0; i--) if (all[i].t <= range[1] + 0.01) { i1 = i; break; } }
      const n = i0 >= 0 && i1 >= i0 ? i1 - i0 + 1 : 0;
      if (!n) { rej(item, range ? range[0] : 0, range ? range[1] : dur, 'Couldn’t read any frames'); continue; }
      const S = all.slice(i0, i1 + 1);
      const step = n > 1 ? (S[n - 1].t - S[0].t) / (n - 1) : 0.33;
      const scAll = sampleScores(data, st, T), sc = scAll.slice(i0, i1 + 1);
      const P = prepare(data), at = k => i0 + k;
      const span = data.range || [0, dur];
      const lo = range ? range[0] : Math.max(span[0], st.edgeTrim), hi = range ? range[1] : Math.min(span[1], dur - st.edgeTrim);
      const usable = new Array(n);
      for (let i = 0; i < n; i++) usable[i] = sc[i].score >= st.ok && !sc[i].fast && sc[i].t >= lo - 0.01 && sc[i].t <= hi + 0.01;
      for (let i = 1; i < n - 1; i++) if (!usable[i] && usable[i - 1] && usable[i + 1] && !sc[i].fast && sc[i].score >= st.ok - 12) usable[i] = true;
      const segs = [];
      for (let i = 0; i < n;) {
        if (!usable[i]) { i++; continue; }
        let j = i; while (j + 1 < n && usable[j + 1]) j++;
        // next to a rejected moment the select stops at the last good sample; at the clip's ends it runs half a step further
        const a = Math.max(lo, i > 0 ? sc[i].t : sc[i].t - step / 2), b = Math.min(hi, j < n - 1 ? sc[j].t : sc[j].t + step / 2), run = b - a;
        if (run >= st.minLen) {
          const parts = Math.max(1, Math.ceil(run / st.maxLen - 0.15));
          for (let p = 0; p < parts; p++) segs.push({ start: a + run * p / parts, end: a + run * (p + 1) / parts });
        } else rej(item, a, b, 'Too short after trimming');
        i = j + 1;
      }
      // reveals become their own selects (exposure may ramp up inside them, that's the point)
      // a reveal is allowed to start dark: its score leaves out the exposure checks but keeps everything else
      const revealQ = x => Math.min(100, x.score / Math.max(0.05, x.e * x.pumpF * x.flickF)) * (x.fast ? 0.5 : 1);
      for (const r of reveals(data, T)) {
        if (r.end < lo || r.start > hi) continue;
        const a = Math.max(lo, r.start - step), b = Math.min(hi, r.end + Math.min(2, step * 4));
        if (b - a < st.minLen) continue;
        const q = sc.filter(x => x.t >= a - 0.01 && x.t <= b + 0.01).map(revealQ);
        if (!q.length || 0.7 * US.mean(q) + 0.3 * US.percentile(q, 0.2) < st.ok) continue;   // not good enough to replace what's there
        // trim ordinary selects around the reveal, keeping what's left on either side
        for (let k = segs.length - 1; k >= 0; k--) {
          const g = segs[k];
          if (g.reveal || g.start >= b || g.end <= a) continue;
          segs.splice(k, 1);
          if (a - g.start >= st.minLen) segs.push({ start: g.start, end: a });
          if (g.end - b >= st.minLen) segs.push({ start: b, end: g.end });
        }
        segs.push({ start: a, end: b, reveal: r.type, revealLabel: r.label });
      }
      segs.sort((x, y) => x.start - y.start);
      const covered = new Array(n).fill(false);
      const clipSelects = [];
      for (const seg of segs) {
        let k0 = -1, k1 = -1;
        for (let i = 0; i < n; i++) if (sc[i].t >= seg.start - 0.01 && sc[i].t <= seg.end + 0.01) { if (k0 < 0) k0 = i; k1 = i; covered[i] = true; }
        if (k0 < 0) continue;
        const q = [], fs = [], es = [], ks = [], shots = [], cxs = [], mids = [], pans = [], moves = [], energy = [], mv = [];
        let faces = 0, faceChecks = 0, pumpBad = 0, flickBad = 0, colBad = 0, walkBad = 0, bored = 0;
        for (let i = k0; i <= k1; i++) {
          const x = sc[i], sm = S[i], g = at(i);
          q.push(seg.reveal ? revealQ(x) : x.score);
          fs.push(x.f); es.push(x.e); ks.push(x.k); pans.push(Math.abs(sm.lx)); shots.push(x.shot); moves.push(P.move[g] === 'fast' ? null : P.move[g]); energy.push(P.energy[g]);
          if (!x.fast) mv.push({ lx: sm.lx || 0, ly: sm.ly || 0, zm: sm.zm, k: x.k, shake: P.shake[g] });   // zm null = no confident zoom reading
          if (sm.fc != null && sm.fc >= 0) { faceChecks++; if (sm.fc > 0) faces++; }
          if (P.pump[g] > 0.08) pumpBad++; if (P.flicker[g] > 0.15) flickBad++; if (P.colShift[g] > 0.05) colBad++; if ((P.act[g] || 0) > 0.12) walkBad++; if (x.boring) bored++;
          if (sm.fc > 0 && sm.fx != null) cxs.push(sm.fx); else { cxs.push(sm.cx); mids.push(sm.mid == null ? 0.33 : sm.mid); }
        }
        const cnt = k1 - k0 + 1;
        let segScore = 0.7 * US.mean(q) + 0.3 * US.percentile(q, 0.2);
        if (seg.reveal) segScore = Math.max(segScore, st.good);
        const shot = majority(shots) || 'unknown', move = majority(moves) || 'static';
        const af = US.mean(fs), ae = US.mean(es), ak = US.mean(ks), en = median(energy);
        // the camera move in words (with its direction) and how smooth it is; smooth moves can count in their favour
        const cam = cameraMove(move, mv);
        // a reveal is named as such; a moving one (pull-back, crane…) counts as a smooth camera move, lights coming up doesn't
        if (seg.reveal) Object.assign(cam, { label: `${seg.reveal} (reveal)` }, seg.reveal !== 'Dark to lit' ? { cinematic: true, strength: Math.max(cam.strength, 0.6) } : {});
        // movement changes the order (and which selects are marked best), never the technical score or grade
        let rank = segScore;
        if (st.movement && cam.cinematic) rank += (st.movement === 'moves' ? 16 : 9) * cam.strength;
        else if (st.movement === 'moves' && move === 'static') rank -= 4;
        const issues = [];
        if (flickBad >= cnt * 0.3) issues.push('Flicker');
        if (pumpBad >= cnt * 0.3) issues.push('Exposure pumping');
        if (colBad >= 1) issues.push('Colour shift');
        if (walkBad >= 1 && move === 'static') issues.push('Someone walks through');
        if (bored >= cnt * 0.8) issues.push('Nothing happening');
        const reasons = [];
        if (seg.reveal) reasons.push(`Reveal: ${seg.revealLabel}`);
        reasons.push(af > 0.9 ? 'sharp' : af > 0.6 ? 'mostly sharp' : 'a little soft');
        if (!seg.reveal) reasons.push(ae > 0.9 ? 'well exposed' : ae > 0.6 ? 'exposure OK' : 'exposure borderline');
        reasons.push(move === 'static' ? (ak > 0.9 ? 'steady' : ak > 0.6 ? 'slight shake' : 'shaky in places') : `${cam.label.toLowerCase()}${cam.smooth != null ? ` (${cam.smooth >= 80 ? 'very smooth' : cam.smooth >= 60 ? 'smooth' : cam.smooth >= 40 ? 'a little uneven' : 'uneven'})` : ''}`);
        if (shot !== 'unknown') reasons.push(shot === 'close' ? 'close-up' : shot === 'mid' ? 'mid shot' : 'wide shot');
        for (const iss of issues) reasons.push(iss.toLowerCase());
        const id = idOf(item);
        const key = `${id}@${seg.start.toFixed(1)}`;
        if (seen.has(key)) continue;   // the same source moment used twice in a sequence
        seen.add(key);
        const sel = {
          key, clipId: id, clipName: item.name, path: item.path,
          start: +seg.start.toFixed(3), end: +seg.end.toFixed(3), dur: +(seg.end - seg.start).toFixed(3),
          score: Math.round(segScore), rank: +rank.toFixed(2), shot, move, moveLabel: cam.label, smooth: cam.smooth, energy: +en.toFixed(3), faces: faceChecks ? faces / faceChecks >= 0.5 : false, issues, reasons,
          flags: { reveal: seg.reveal || null, vertical: Math.abs(median(cxs) - 0.5) <= 0.1 && (!mids.length || median(mids) >= 0.45), slowmo: (item.fps || 0) >= 49, hero: false, forced: null, action: en >= 0.25, cinematic: cam.cinematic }
        };
        if (item.seq) sel.tl = +(item.seq.start + (seg.start - item.range[0]) / (item.seq.speed || 1)).toFixed(3);
        clipSelects.push(sel); selects.push(sel);
      }
      // what was cut out of this clip, and why
      let cuts = 0;
      for (let i = 0; i < n;) {
        if (usable[i] || covered[i] || sc[i].t < lo - 0.01 || sc[i].t > hi + 0.01) { i++; continue; }
        // one stretch per problem: stop where the main problem changes (e.g. blurry, then dark)
        const w0 = why(sc, i, i);
        let j = i; while (j + 1 < n && !usable[j + 1] && !covered[j + 1] && sc[j + 1].t <= hi + 0.01 && why(sc, j + 1, j + 1) === w0) j++;
        const a = Math.max(lo, sc[i].t - step / 2), b = Math.min(hi, sc[j].t + step / 2);
        if (b - a >= 0.3) {
          const w = why(sc, i, j); cuts++;
          rej(item, a, b, w, item.seq ? { tl: +(item.seq.start + (a - item.range[0]) / (item.seq.speed || 1)).toFixed(3) } : null);
          for (const s of clipSelects) if (Math.abs(a - s.end) < 0.6 || Math.abs(b - s.start) < 0.6) s.reasons.push(`cut: ${w.toLowerCase()} ${US.fmtDur(a, true)}–${US.fmtDur(b, true)}`);
        }
        i = j + 1;
      }
      if (!segs.length && !cuts) rej(item, lo, hi, (hi - lo) < st.minLen ? 'Clip too short' : why(sc, 0, n - 1));
    }

    // duplicates: keep the better of two different takes that look and move alike
    let dupes = 0;
    if (st.dupes && clips.length > 1) {
      const bestOf = new Map();
      for (const s of selects) bestOf.set(s.clipId, Math.max(bestOf.get(s.clipId) || -1, s.score));
      const list = clips.filter(c => c.data && c.data.sig && c.data.samples.length && !c.item.range);
      const dropped = new Set();
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (idOf(A.item) === idOf(B.item) || dropped.has(A.item.id) || dropped.has(B.item.id) || !isDuplicate(A, B)) continue;
        const [keep, drop] = (bestOf.get(idOf(A.item)) || -1) >= (bestOf.get(idOf(B.item)) || -1) ? [A, B] : [B, A];
        dropped.add(drop.item.id); dupes++;
        for (let k = selects.length - 1; k >= 0; k--) if (selects[k].clipId === idOf(drop.item)) {
          const s = selects.splice(k, 1)[0];
          rej(drop.item, s.start, s.end, `Duplicate of ${keep.item.name}`, { dupOf: idOf(keep.item) });
        }
        if (!rejected.some(r => r.clipId === idOf(drop.item) && r.dupOf)) rej(drop.item, 0, drop.data.duration, `Duplicate of ${keep.item.name}`, { dupOf: idOf(keep.item) });
      }
    }

    // your own choices win
    for (const f of forced) {
      if (f.mode === 'out') {
        for (let k = selects.length - 1; k >= 0; k--) {
          const s = selects[k];
          if (s.clipId === f.clipId && f.t >= s.start - 0.05 && f.t <= s.end + 0.05) { selects.splice(k, 1); rej({ id: s.clipId, name: s.clipName }, s.start, s.end, 'Removed by you', { forced: 'out' }); }
        }
      } else if (f.mode === 'in') {
        for (let k = rejected.length - 1; k >= 0; k--) { const r = rejected[k]; if (r.clipId === f.clipId && Math.abs(r.start - f.start) < 0.3) rejected.splice(k, 1); }
        if (!selects.some(s => s.clipId === f.clipId && Math.abs(s.start - f.start) < 0.3)) {
          const c = clips.find(x => idOf(x.item) === f.clipId);
          selects.push({ key: `${f.clipId}@${(+f.start).toFixed(1)}`, clipId: f.clipId, clipName: c ? c.item.name : '', path: c ? c.item.path : '', start: +f.start, end: +f.end, dur: f.end - f.start, score: Math.max(st.ok, f.score || st.ok), shot: 'unknown', move: 'static', moveLabel: 'Static', smooth: null, energy: 0, faces: false, issues: [], reasons: ['kept by you'], flags: { reveal: null, vertical: false, slowmo: c ? (c.item.fps || 0) >= 49 : false, hero: false, forced: 'in', action: false, cinematic: false } });
        }
      }
    }

    for (const s of selects) s.tier = s.score >= st.best ? 'BEST' : s.score >= st.good ? 'GOOD' : 'OK';
    const heroN = st.heroCount === 'pct' ? Math.max(1, Math.round(selects.length * 0.1)) : (st.heroCount || 5);
    selects.filter(s => s.tier !== 'OK').sort((a, b) => rankOf(b) - rankOf(a) || b.dur - a.dur).slice(0, heroN).forEach(s => { s.flags.hero = true; });
    const footage = US.sum(clips.map(c => c.item.range ? c.item.range[1] - c.item.range[0] : (c.data && c.data.range ? c.data.range[1] - c.data.range[0] : (c.data && c.data.duration) || c.item.duration || 0)));
    const count = fn => selects.filter(fn).length;
    return {
      selects, rejected,
      stats: {
        clips: new Set(clips.map(c => idOf(c.item))).size, footage, kept: selects.length, keptDur: US.sum(selects.map(s => s.dur)),
        best: count(s => s.tier === 'BEST'), good: count(s => s.tier === 'GOOD'), ok: count(s => s.tier === 'OK'),
        reveals: count(s => s.flags.reveal), heroes: count(s => s.flags.hero), dupes, rejectedClips: new Set(rejected.map(r => r.clipId)).size
      }
    };
  }

  /** Sort selects. how: 'score' | 'time' | 'shot' | 'move' | 'action' | 'sequence'. heroFirst puts the marked best at the front. */
  function order(selects, how, { heroFirst = false } = {}) {
    const a = selects.slice();
    const nat = (x, y) => x.clipName.localeCompare(y.clipName, undefined, { numeric: true }) || x.start - y.start;
    const byScore = (x, y) => (rankOf(y) - rankOf(x)) || nat(x, y);
    if (how === 'time') a.sort(nat);
    else if (how === 'sequence') a.sort((x, y) => (x.tl != null && y.tl != null ? x.tl - y.tl : nat(x, y)));
    else if (how === 'shot') a.sort((x, y) => (SHOT_ORDER[x.shot] - SHOT_ORDER[y.shot]) || byScore(x, y));
    else if (how === 'move') a.sort((x, y) => (MOVES.indexOf(x.move) - MOVES.indexOf(y.move)) || byScore(x, y));
    else if (how === 'action') a.sort((x, y) => (y.energy - x.energy) || byScore(x, y));
    else if (how === 'smooth') a.sort((x, y) => (+!!y.flags.cinematic - +!!x.flags.cinematic) || ((y.flags.cinematic ? y.smooth || 0 : 0) - (x.flags.cinematic ? x.smooth || 0 : 0)) || byScore(x, y));
    else a.sort(byScore);
    if (heroFirst) { const h = a.filter(s => s.flags.hero), r = a.filter(s => !s.flags.hero); return h.concat(r); }
    return a;
  }

  /**
   * Groups of selects for "Sort into bins by type". groups: any of 'grade', 'shot', 'move', 'special'.
   * Returns [{group, groupName, name, label (Premiere label index), selects (best first)}], skipping empty ones.
   */
  const CATEGORIES = {
    grade: { name: 'By grade', cats: [['BEST', 5, s => s.tier === 'BEST'], ['GOOD', 15, s => s.tier === 'GOOD'], ['OK', 9, s => s.tier === 'OK']] },
    shot: { name: 'By shot size', cats: [['Close-ups', 6, s => s.shot === 'close'], ['Mid shots', 7, s => s.shot === 'mid'], ['Wide shots', 4, s => s.shot === 'wide']] },
    move: { name: 'By camera move', cats: [['Static', 12, s => s.move === 'static'], ['Pans', 2, s => s.move === 'pan'], ['Tilts', 10, s => s.move === 'tilt'], ['Push-ins', 3, s => s.move === 'push-in'], ['Pull-outs', 0, s => s.move === 'pull-out'], ['Handheld', 14, s => s.move === 'handheld']] },
    special: { name: 'Special', cats: [['Smooth camera moves', 2, s => !!s.flags.cinematic], ['Hero shots', 11, s => s.flags.hero], ['Reveals', 8, s => !!s.flags.reveal], ['Good for 9-16', 13, s => s.flags.vertical], ['Slow-mo', 1, s => s.flags.slowmo], ['Faces', 6, s => s.faces], ['Action', 7, s => s.flags.action]] }
  };
  function categories(selects, groups, { heroFirst = false } = {}) {
    const out = [];
    for (const g of groups) {
      const def = CATEGORIES[g]; if (!def) continue;
      for (const [name, label, test] of def.cats) {
        const list = order(selects.filter(test), 'score', { heroFirst });
        if (list.length) out.push({ group: g, groupName: def.name, name, label, selects: list });
      }
    }
    return out;
  }

  /** Quick check used by Home › Check my setup. */
  async function probe(item) { const s = await pickSource(item); return s; }

  US.vision = { cameraMove, VERSION, PRESETS, FOOTAGE, PICKY, CATEGORIES, MOVE_LABEL, settingsFor, probe, pickSource, analysisCopyPath, analysisPreset, makeAnalysisCopies, analyseClip, analyseMany, score, order, categories, fileUrl, _internal: { sharpness, exposure, shift, pyramid, normalise, scaleBetween, sampleScores, reveals, sigDistance, isDuplicate, prepare, thresholds } };
})();
