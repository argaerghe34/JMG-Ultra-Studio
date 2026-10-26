/* JMG Ultra Studio – sound analysis engine. Pure functions on mono Float32Array + sample rate,
   so they run (and are unit-tested) in Node as well as in the panel. Long jobs have async versions
   that yield to the UI and report progress: opts {onProgress(0..1), check()}. */
(function () {
  'use strict';
  const US = window.US;
  const sleep0 = () => new Promise(r => setTimeout(r, 0));

  /* =================== FFT =================== */
  const tables = new Map();
  function fftTables(n) {
    let t = tables.get(n);
    if (t) return t;
    if (n & (n - 1)) throw new Error('FFT size must be a power of two');
    const rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
    t = { rev, cos, sin };
    tables.set(n, t);
    return t;
  }
  /** In-place complex FFT (radix-2). re/im: Float64Array of length n (power of two). */
  function fft(re, im) {
    const n = re.length, { rev, cos, sin } = fftTables(n);
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  const windows = new Map();
  function hann(n) {
    let w = windows.get(n);
    if (!w) { w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); windows.set(n, w); }
    return w;
  }

  /**
   * Frame-by-frame power spectra. Frame i is centred on sample i*hop (zero-padded at the ends).
   * cb(i, power: Float64Array(n/2+1)) – power is reused between calls, copy it if you keep it.
   */
  async function eachSpectrum(data, { n = 1024, hop = 256, from = 0, to, onProgress, check, cb }) {
    const frames = Math.floor(data.length / hop) + 1;
    const last = Math.min(frames, to == null ? frames : to);
    const w = hann(n), re = new Float64Array(n), im = new Float64Array(n), pow = new Float64Array(n / 2 + 1);
    const half = n >> 1;
    for (let i = from; i < last; i++) {
      const c = i * hop - half;
      for (let k = 0; k < n; k++) { const s = c + k; re[k] = (s >= 0 && s < data.length ? data[s] : 0) * w[k]; im[k] = 0; }
      fft(re, im);
      for (let k = 0; k <= half; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
      cb(i, pow);
      if ((i & 1023) === 1023) { if (onProgress) onProgress((i - from) / Math.max(1, last - from)); if (check) check(); await sleep0(); }
    }
    if (onProgress) onProgress(1);
    return last - from;
  }

  /** Short helper for small inputs: array of power spectra. */
  async function stft(data, sr, { n = 1024, hop = 256 } = {}) {
    const out = [];
    await eachSpectrum(data, { n, hop, cb: (i, p) => out.push(Float32Array.from(p)) });
    return { frames: out, hop: hop / sr, n, sr, binHz: sr / n };
  }

  /* =================== small helpers =================== */
  function mean(a, s = 0, e = a.length) { let t = 0; for (let i = s; i < e; i++) t += a[i]; return e > s ? t / (e - s) : 0; }
  function std(a, s = 0, e = a.length) { const m = mean(a, s, e); let t = 0; for (let i = s; i < e; i++) t += (a[i] - m) ** 2; return e > s ? Math.sqrt(t / (e - s)) : 0; }
  function percentile(a, p) { if (!a.length) return 0; const s = Float64Array.from(a).sort(); const i = Math.min(s.length - 1, Math.max(0, (s.length - 1) * p)); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  function movingAverage(a, w) {
    const out = new Float32Array(a.length), h = Math.floor(w / 2); let s = 0, n = 0;
    for (let i = 0; i < a.length + h; i++) {
      if (i < a.length) { s += a[i]; n++; }
      if (i - w >= 0) { s -= a[i - w]; n--; }
      const c = i - h; if (c >= 0 && c < a.length) out[c] = s / n;
    }
    return out;
  }
  function medianFilter(arr, w) {
    const h = Math.floor(w / 2), out = arr.slice();
    for (let i = 0; i < arr.length; i++) {
      const win = arr.slice(Math.max(0, i - h), Math.min(arr.length, i + h + 1));
      const counts = {}; let best = arr[i], bc = 0;
      for (const v of win) { counts[v] = (counts[v] || 0) + 1; if (counts[v] > bc) { bc = counts[v]; best = v; } }
      out[i] = best;
    }
    return out;
  }
  const db = p => 10 * Math.log10(p + 1e-12);
  /** max of a (possibly huge) array without spreading it onto the stack */
  function amax(a) { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

  /* =================== onset strength =================== */
  /**
   * Spectral-flux onset strength on log-band energies (librosa-like).
   * Returns {env, low, rate, n, hop, chroma?} where env/low are Float32Array per frame (rate frames/s).
   */
  async function onsetStrength(data, sr, { hopSec = 0.01, n = 1024, bands = 40, fmin = 30, fmax, chroma = false, onProgress, check } = {}) {
    const hop = Math.max(1, Math.round(sr * hopSec));
    fmax = Math.min(fmax || 8000, sr / 2);
    const binHz = sr / n, nb = n / 2 + 1;
    const edges = []; for (let b = 0; b <= bands; b++) edges.push(fmin * Math.pow(fmax / fmin, b / bands));
    const bandOf = new Int16Array(nb).fill(-1);
    for (let k = 1; k < nb; k++) { const f = k * binHz; for (let b = 0; b < bands; b++) if (f >= edges[b] && f < edges[b + 1]) { bandOf[k] = b; break; } }
    const lowBands = edges.filter(e => e < 160).length;
    const frames = Math.floor(data.length / hop) + 1;
    const E = new Float32Array(frames * bands);
    const be = new Float64Array(bands);
    let maxDb = -200;
    await eachSpectrum(data, { n, hop, onProgress, check, cb: (i, pow) => {
      be.fill(0);
      for (let k = 1; k < nb; k++) { const b = bandOf[k]; if (b >= 0) be[b] += pow[k]; }
      for (let b = 0; b < bands; b++) { const v = db(be[b]); E[i * bands + b] = v; if (v > maxDb) maxDb = v; }
    } });
    const floorDb = maxDb - 80;
    const env = new Float32Array(frames), low = new Float32Array(frames);
    for (let i = 1; i < frames; i++) {
      let s = 0, sl = 0;
      for (let b = 0; b < bands; b++) {
        const cur = Math.max(floorDb, E[i * bands + b]), prev = Math.max(floorDb, E[(i - 1) * bands + b]);
        const d = cur - prev; if (d > 0) { s += d; if (b < lowBands) sl += d; }
      }
      env[i] = s / bands; low[i] = sl / Math.max(1, lowBands);
    }
    return { env, low, rate: sr / hop, n, hop, bandsDb: E, bands };
  }

  /* =================== tempo =================== */
  /** Global tempo from an onset envelope: autocorrelation weighted by a log-normal prior around `prior` BPM. */
  function tempo(env, rate, { prior = 120, sigma = 1.0, min = 50, max = 220 } = {}) {
    const m = mean(env), x = Float64Array.from(env, v => v - m);
    const lagMin = Math.max(1, Math.floor(rate * 60 / max)), lagMax = Math.ceil(rate * 60 / min);
    const ac = new Float64Array(lagMax * 2 + 2);
    for (let lag = 0; lag < ac.length; lag++) { let s = 0; for (let i = lag; i < x.length; i++) s += x[i] * x[i - lag]; ac[lag] = s / (x.length - lag || 1); }
    const a0 = ac[0] || 1;
    const score = lag => {
      const bpm = rate * 60 / lag;
      const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / prior) / sigma, 2));
      // evidence from the lag and its double (a real beat period repeats)
      const v = (interp(ac, lag) + 0.5 * interp(ac, 2 * lag)) / a0;
      return Math.max(0, v) * w;
    };
    let best = lagMin, bs = -Infinity;
    for (let lag = lagMin; lag <= lagMax; lag++) { const s = score(lag); if (s > bs) { bs = s; best = lag; } }
    // parabolic refinement
    const s0 = score(best - 1), s1 = bs, s2 = score(best + 1);
    const den = s0 - 2 * s1 + s2; const off = den < 0 ? 0.5 * (s0 - s2) / den : 0;
    const lag = best + Math.max(-0.5, Math.min(0.5, off));
    return { bpm: rate * 60 / lag, lag, confidence: Math.max(0, Math.min(1, (ac[best] / a0))) };
  }
  function interp(a, x) { const i = Math.floor(x), f = x - i; if (i + 1 >= a.length) return a[a.length - 1] || 0; return a[i] * (1 - f) + a[i + 1] * f; }

  /* =================== beat tracking (dynamic programming, after Ellis 2007) =================== */
  function beatTrack(env, rate, bpm, { tightness = 100, trim = true } = {}) {
    const n = env.length, period = rate * 60 / bpm;
    const sd = std(env) || 1;
    const on = Float64Array.from(env, v => v / sd);
    // local score: onset smoothed by a Gaussian a fraction of a beat wide
    const half = Math.round(period);
    const win = []; for (let k = -half; k <= half; k++) win.push(Math.exp(-0.5 * Math.pow(k * 32 / period, 2)));
    const local = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -half; k <= half; k++) { const j = i + k; if (j >= 0 && j < n) s += on[j] * win[k + half]; } local[i] = s; }
    const cum = new Float64Array(n), back = new Int32Array(n).fill(-1);
    const lo = Math.round(2 * period), hi = Math.max(1, Math.round(period / 2));
    const thresh = 0.01 * amax(local);
    let first = true;
    for (let i = 0; i < n; i++) {
      let best = -Infinity, arg = -1;
      for (let j = i - lo; j <= i - hi; j++) {
        if (j < 0) continue;
        const c = cum[j] - tightness * Math.pow(Math.log((i - j) / period), 2);
        if (c > best) { best = c; arg = j; }
      }
      cum[i] = local[i] + (arg >= 0 ? best : 0);
      if (first && local[i] < thresh) back[i] = -1; else { back[i] = arg; first = false; }
    }
    // last beat: last local maximum of cum that is above half the median of local maxima
    const maxima = [];
    for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(i);
    if (!maxima.length) return [];
    const med = percentile(maxima.map(i => cum[i]), 0.5);
    let lastB = maxima[maxima.length - 1];
    for (let k = maxima.length - 1; k >= 0; k--) if (cum[maxima[k]] >= 0.5 * med) { lastB = maxima[k]; break; }
    const beats = [];
    for (let b = lastB; b >= 0; b = back[b]) { beats.push(b); if (back[b] < 0) break; }
    beats.reverse();
    if (trim && beats.length > 4) {
      // drop weak beats at the very start/end (silence or fades)
      const bl = beats.map(b => local[b]);
      const th = 0.5 * Math.sqrt(mean(bl.map(v => v * v)));
      while (beats.length > 2 && local[beats[0]] < th) beats.shift();
      while (beats.length > 2 && local[beats[beats.length - 1]] < th) beats.pop();
    }
    return beats;
  }

  /** Chroma (12 pitch classes) per hop, averaged over spans – for bar/downbeat and song-change detection. */
  async function chromaFrames(data, sr, { hopSec = 0.05, n = 4096, fmin = 65, fmax = 2100, onProgress, check } = {}) {
    const hop = Math.max(1, Math.round(sr * hopSec)), binHz = sr / n, nb = n / 2 + 1;
    const pc = new Int8Array(nb).fill(-1);
    for (let k = 1; k < nb; k++) { const f = k * binHz; if (f >= fmin && f <= Math.min(fmax, sr / 2 - 1)) pc[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; }
    const frames = Math.floor(data.length / hop) + 1, out = new Float32Array(frames * 12);
    await eachSpectrum(data, { n, hop, onProgress, check, cb: (i, pow) => {
      let tot = 0;
      for (let k = 1; k < nb; k++) { const c = pc[k]; if (c >= 0) { const v = Math.sqrt(pow[k]); out[i * 12 + c] += v; tot += v; } }
      if (tot > 0) for (let c = 0; c < 12; c++) out[i * 12 + c] /= tot;
    } });
    return { chroma: out, rate: sr / hop, frames };
  }
  function chromaMean(ch, rate, t0, t1) {
    const v = new Float64Array(12); const a = Math.max(0, Math.floor(t0 * rate)), b = Math.min(ch.length / 12, Math.ceil(t1 * rate)); let n = 0;
    for (let i = a; i < b; i++) { for (let c = 0; c < 12; c++) v[c] += ch[i * 12 + c]; n++; }
    if (n) for (let c = 0; c < 12; c++) v[c] /= n;
    return v;
  }
  function cosDist(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return 1 - d / (Math.sqrt(na * nb) || 1); }

  /**
   * Full beat analysis of a piece of music.
   * Returns {bpm, beats:[s], downbeats:[s], beatsPerBar, confidence, energy:{t,v}[] (per beat, 0..1)}
   */
  async function analyseBeats(data, sr, { prior = 120, beatsPerBar = 4, onProgress, check } = {}) {
    const prog = (a, b) => f => onProgress && onProgress(a + (b - a) * f);
    const o = await onsetStrength(data, sr, { onProgress: prog(0, 0.6), check });
    const t = tempo(o.env, o.rate, { prior });
    const frames = beatTrack(o.env, o.rate, t.bpm);
    // flux peaks ~20 ms before the audible attack with this window/hop (measured on reference tracks)
    const LATENCY = 0.02;
    const beats = frames.map(f => f / o.rate + LATENCY);
    // downbeat phase: kicks (low-band onsets) + chord changes tend to land on beat 1
    const ch = await chromaFrames(data, sr, { onProgress: prog(0.6, 0.95), check });
    const lowAt = frames.map(f => { let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, o.low[f + k] || 0); return m; });
    const change = beats.map((b, i) => {
      if (i === 0 || i >= beats.length - 1) return 0;
      const prev = chromaMean(ch.chroma, ch.rate, beats[i - 1], b), next = chromaMean(ch.chroma, ch.rate, b, beats[i + 1]);
      return cosDist(prev, next);
    });
    const norm = a => { const m = mean(a) || 1; return a.map(v => v / m); };
    const L = norm(lowAt), C = norm(change);
    let bestPhase = 0, bestScore = -Infinity;
    for (let p = 0; p < beatsPerBar; p++) {
      const idx = beats.map((_, i) => i).filter(i => i % beatsPerBar === p);
      const s = mean(idx.map(i => 0.4 * L[i] + 1.0 * C[i]));
      if (s > bestScore) { bestScore = s; bestPhase = p; }
    }
    const downbeats = beats.filter((_, i) => i % beatsPerBar === bestPhase);
    // loudness per beat interval (for "faster cuts in louder parts")
    const env = US.audio && US.audio.envelope ? US.audio.envelope(data, sr, 0.05).db : null;
    const energy = beats.map((b, i) => {
      if (!env) return 0.5;
      const e = i + 1 < beats.length ? beats[i + 1] : b + 60 / t.bpm;
      return mean(env, Math.floor(b / 0.05), Math.max(Math.floor(b / 0.05) + 1, Math.floor(e / 0.05)));
    });
    const lo = percentile(energy, 0.1), hi = percentile(energy, 0.9);
    if (onProgress) onProgress(1);
    return { bpm: t.bpm, confidence: t.confidence, beats, downbeats, beatsPerBar, firstDownbeatIndex: bestPhase, energy: energy.map(v => Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)))), duration: data.length / sr };
  }

  /* =================== pauses / silence =================== */
  /** Robust level statistics of an envelope in dB: floor (quiet room) and speech (loud parts). */
  function levelStats(dbArr) {
    const valid = Array.from(dbArr).filter(v => v > -99);
    if (!valid.length) return { floor: -100, speech: -100, auto: -60 };
    const floor = percentile(valid, 0.05), speech = percentile(valid, 0.9);
    const auto = Math.max(-75, Math.min(-18, floor + Math.max(6, 0.3 * (speech - floor))));
    return { floor, speech, auto };
  }

  /**
   * Pauses in an envelope {db, hop}: stretches below threshold lasting >= minPause.
   * Returns {pauses:[{start,end}], cuts:[{start,end}]} where cuts keep `padding` seconds of room around speech.
   * Bursts shorter than `bridge` seconds inside a pause (clicks, breaths) don't split it.
   */
  function findPauses(env, { threshold, minPause = 0.6, padding = 0.15, bridge = 0.08, duration } = {}) {
    const d = env.db, hop = env.hop, n = d.length;
    duration = duration || n * hop;
    const raw = [];
    let s = -1;
    for (let i = 0; i <= n; i++) {
      const quiet = i < n && d[i] < threshold;
      if (quiet && s < 0) s = i;
      if (!quiet && s >= 0) { raw.push([s * hop, i * hop]); s = -1; }
    }
    // bridge tiny bursts
    const merged = [];
    for (const r of raw) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= bridge) last[1] = r[1]; else merged.push(r.slice());
    }
    const pauses = [], cuts = [];
    for (const [a, b0] of merged) {
      const b = Math.min(b0, duration);
      if (b - a < minPause) continue;
      pauses.push({ start: a, end: b });
      const atStart = a <= hop * 1.5, atEnd = b >= duration - hop * 1.5;
      const cs = atStart ? 0 : a + padding, ce = atEnd ? duration : b - padding;
      if (ce - cs >= 0.05) cuts.push({ start: cs, end: ce });
    }
    return { pauses, cuts, removed: cuts.reduce((t, c) => t + c.end - c.start, 0) };
  }

  /* =================== loudness (ITU-R BS.1770-4) =================== */
  function biquad(b0, b1, b2, a0, a1, a2) { return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }; }
  function kWeighting(fs) {
    // high-shelf (+4 dB above ~1.5 kHz) and high-pass (~38 Hz), RBJ form valid for any sample rate
    let G = 4.0, Q = 1 / Math.SQRT2, fc = 1500, A = Math.pow(10, G / 40), w0 = 2 * Math.PI * fc / fs, alpha = Math.sin(w0) / (2 * Q), cw = Math.cos(w0), sA = Math.sqrt(A);
    const shelf = biquad(A * ((A + 1) + (A - 1) * cw + 2 * sA * alpha), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - 2 * sA * alpha), (A + 1) - (A - 1) * cw + 2 * sA * alpha, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - 2 * sA * alpha);
    Q = 0.5; fc = 38.0; w0 = 2 * Math.PI * fc / fs; alpha = Math.sin(w0) / (2 * Q); cw = Math.cos(w0);
    const hp = biquad((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha);
    return [shelf, hp];
  }
  function filterInPlace(x, f) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const x0 = x[i]; const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2; x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0; }
  }
  /**
   * Loudness of one or more channels (array of Float32Array at rate fs).
   * Returns {integrated (LUFS), shortTerm: Float32Array (3 s windows every 1 s), momentaryMax, range (LRA, approx)}.
   */
  function loudness(channels, fs) {
    const [shelf, hp] = kWeighting(fs);
    const z = channels.map(ch => { const y = Float64Array.from(ch); filterInPlace(y, shelf); filterInPlace(y, hp); return y; });
    const len = z[0].length;
    const blockPower = (start, size) => { let p = 0; for (const y of z) { let s = 0; const e = Math.min(len, start + size); for (let i = start; i < e; i++) s += y[i] * y[i]; p += s / size; } return p; };
    const step = Math.round(0.1 * fs), blk = Math.round(0.4 * fs);
    const blocks = [];
    for (let s = 0; s + blk <= len; s += step) blocks.push(blockPower(s, blk));
    const L = p => -0.691 + 10 * Math.log10(p + 1e-20);
    const abs = blocks.filter(p => L(p) > -70);
    let integrated = -Infinity;
    if (abs.length) {
      const rel = L(mean(abs)) - 10;
      const gated = abs.filter(p => L(p) > rel);
      if (gated.length) integrated = L(mean(gated));
    }
    const momentaryMax = blocks.length ? L(amax(blocks)) : -Infinity;
    // short-term: 3 s windows every 1 s
    const st = [], w3 = Math.round(3 * fs), s1 = Math.round(fs);
    for (let s = 0; s + w3 <= len || (s === 0 && len > 0); s += s1) { st.push(L(blockPower(s, Math.min(w3, len)))); if (s + w3 > len) break; }
    // loudness range (EBU Tech 3342, simplified): 10th–95th percentile of gated short-term values
    const stAbs = st.filter(v => v > -70);
    let range = 0;
    if (stAbs.length > 2) { const relG = 10 * Math.log10(mean(stAbs.map(v => Math.pow(10, v / 10)))) - 20; const g = stAbs.filter(v => v > relG); if (g.length > 2) range = percentile(g, 0.95) - percentile(g, 0.1); }
    return { integrated, momentaryMax, shortTerm: Float32Array.from(st), range };
  }

  /**
   * Streaming meter for long recordings: push() chunks of channel data, then result().
   * Gives integrated loudness (gated), short-term loudness every second, sample peak, estimated true peak and clipping.
   */
  class LoudnessMeter {
    constructor(fs, channels, { clipLevel = 0.999, minRun = 3 } = {}) {
      this.fs = fs; this.nch = channels;
      this.filters = Array.from({ length: channels }, () => kWeighting(fs).map(f => Object.assign({ x1: 0, x2: 0, y1: 0, y2: 0 }, f)));
      this.sub = Math.round(0.1 * fs); this.acc = new Float64Array(channels); this.accN = 0;
      this.subPowers = []; // per 100 ms: summed channel mean-square
      this.peak = 0; this.tp = 0; this.clipLevel = clipLevel; this.minRun = minRun;
      this.runs = new Int32Array(channels); this.clipTimes = []; this.n = 0;
      this.tail = Array.from({ length: channels }, () => new Float32Array(0));
    }
    push(chs) {
      const len = chs[0].length, taps = 8;
      for (let c = 0; c < this.nch; c++) {
        const x = chs[c], [sh, hp] = this.filters[c];
        // peaks / clipping / true peak (uses a little history across chunks)
        const hist = this.tail[c], joined = new Float32Array(hist.length + len); joined.set(hist); joined.set(x, hist.length);
        let run = this.runs[c];
        for (let i = 0; i < len; i++) {
          const v = x[i], a = Math.abs(v);
          if (a > this.peak) this.peak = a;
          if (a >= this.clipLevel) run++; else { if (run >= this.minRun) this.clipTimes.push((this.n + i - run) / this.fs); run = 0; }
          if (a > 0.5) {
            const j = i + hist.length;
            if (j > taps && j < joined.length - taps - 1) for (let q = 1; q < 4; q++) {
              const fr = q / 4; let s = 0;
              for (let k = -taps + 1; k <= taps; k++) { const t = k - fr; const sinc = Math.sin(Math.PI * t) / (Math.PI * t); s += joined[j + k] * sinc * (0.5 + 0.5 * Math.cos(Math.PI * t / taps)); }
              if (Math.abs(s) > this.tp) this.tp = Math.abs(s);
            }
          }
        }
        this.runs[c] = run;
        this.tail[c] = x.slice(Math.max(0, len - 16));
      }
      for (let i = 0; i < len; i++) {
        for (let c = 0; c < this.nch; c++) {
          let v = chs[c][i];
          for (const f of this.filters[c]) { const y = f.b0 * v + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = v; f.y2 = f.y1; f.y1 = y; v = y; }
          this.acc[c] += v * v;
        }
        if (++this.accN === this.sub) { let p = 0; for (let c = 0; c < this.nch; c++) { p += this.acc[c] / this.sub; this.acc[c] = 0; } this.subPowers.push(p); this.accN = 0; }
      }
      this.n += len;
    }
    result() {
      const L = p => -0.691 + 10 * Math.log10(p + 1e-20);
      const sp = this.subPowers, blocks = [];
      for (let i = 0; i + 4 <= sp.length; i++) blocks.push((sp[i] + sp[i + 1] + sp[i + 2] + sp[i + 3]) / 4);
      const abs = blocks.filter(p => L(p) > -70);
      let integrated = -Infinity;
      if (abs.length) { const rel = L(mean(abs)) - 10; const g = abs.filter(p => L(p) > rel); if (g.length) integrated = L(mean(g)); }
      const shortTerm = [];
      for (let i = 0; i + 30 <= sp.length || (i === 0 && sp.length); i += 10) { const e = Math.min(sp.length, i + 30); shortTerm.push(L(mean(sp, i, e))); if (i + 30 > sp.length) break; }
      const stAbs = shortTerm.filter(v => v > -70);
      let range = 0;
      if (stAbs.length > 2) { const relG = 10 * Math.log10(mean(stAbs.map(v => Math.pow(10, v / 10)))) - 20; const g = stAbs.filter(v => v > relG); if (g.length > 2) range = percentile(g, 0.95) - percentile(g, 0.1); }
      const clips = [];
      for (const t of this.clipTimes.sort((a, b) => a - b)) { const g = clips[clips.length - 1]; if (g && t - g.end < 0.25) { g.end = t; g.count++; } else clips.push({ start: t, end: t, count: 1 }); }
      return {
        integrated, shortTerm: Float32Array.from(shortTerm), range, momentaryMax: blocks.length ? L(amax(blocks)) : -Infinity,
        peakDb: 20 * Math.log10(this.peak + 1e-12), truePeakDb: 20 * Math.log10(Math.max(this.tp, this.peak) + 1e-12), clips, duration: this.n / this.fs
      };
    }
  }

  /** Sample peak (dBFS), clipping events (runs of full-scale samples) and an estimated true peak. */
  function peaks(channels, fs, { clipLevel = 0.999, minRun = 3 } = {}) {
    let peak = 0, tp = 0;
    const events = [];
    const taps = 8;
    for (const ch of channels) {
      let run = 0;
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
        if (a >= clipLevel) run++;
        else { if (run >= minRun) events.push((i - run) / fs); run = 0; }
        // 4x oversampled estimate only around loud samples (cheap)
        if (a > 0.5 && i > taps && i < ch.length - taps - 1) {
          for (let q = 1; q < 4; q++) {
            const fr = q / 4; let s = 0;
            for (let k = -taps + 1; k <= taps; k++) { const x = k - fr; const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); const win = 0.5 + 0.5 * Math.cos(Math.PI * x / taps); s += ch[i + k] * sinc * win; }
            if (Math.abs(s) > tp) tp = Math.abs(s);
          }
        }
      }
      if (run >= minRun) events.push((ch.length - run) / fs);
    }
    events.sort((a, b) => a - b);
    const grouped = [];
    for (const t of events) { const g = grouped[grouped.length - 1]; if (g && t - g.end < 0.25) { g.end = t; g.count++; } else grouped.push({ start: t, end: t, count: 1 }); }
    return { peakDb: 20 * Math.log10(peak + 1e-12), truePeakDb: 20 * Math.log10(Math.max(tp, peak) + 1e-12), clips: grouped };
  }

  /* =================== hum, wind/rumble, dead air =================== */
  /** Average spectrum of the quieter frames (where hum is most audible) – {pow, binHz}. */
  async function quietSpectrum(data, sr, { n = 8192, onProgress, check } = {}) {
    const hop = n;
    const env = [], specs = [];
    await eachSpectrum(data, { n, hop, onProgress, check, cb: (i, p) => { let t = 0; for (let k = 1; k < p.length; k++) t += p[k]; env.push(t); specs.push(Float32Array.from(p)); } });
    if (!specs.length) return { pow: new Float64Array(n / 2 + 1), binHz: sr / n };
    const th = percentile(env.filter(v => v > 0), 0.4);
    const avg = new Float64Array(n / 2 + 1); let cnt = 0;
    specs.forEach((p, i) => { if (env[i] > 0 && env[i] <= th) { for (let k = 0; k < avg.length; k++) avg[k] += p[k]; cnt++; } });
    if (cnt) for (let k = 0; k < avg.length; k++) avg[k] /= cnt;
    return { pow: avg, binHz: sr / n };
  }
  /** Mains hum: narrow peaks at 50 or 60 Hz and harmonics standing well above their neighbourhood. */
  function detectHum(spec) {
    const { pow, binHz } = spec;
    const peakRatio = f => {
      const k = Math.round(f / binHz); if (k + 20 >= pow.length) return 0;
      let pk = 0; for (let j = k - 1; j <= k + 1; j++) pk = Math.max(pk, pow[j]);
      const around = []; for (let j = k - Math.round(25 / binHz); j <= k + Math.round(25 / binHz); j++) if (Math.abs(j - k) > Math.max(2, Math.round(4 / binHz)) && j > 0) around.push(pow[j]);
      return db(pk) - db(percentile(around, 0.5));
    };
    let best = null;
    for (const f0 of [50, 60]) {
      const r = [1, 2, 3, 4].map(h => peakRatio(f0 * h));
      const strong = r.filter(v => v > 12).length;
      const score = r[0] + 0.5 * (r[1] + r[2]);
      if ((r[0] > 15 && strong >= 2) || strong >= 3) { if (!best || score > best.score) best = { freq: f0, ratios: r, score }; }
    }
    return best;
  }

  /**
   * Per-frame low-frequency ratio and level → wind / rumble stretches (sustained, not drum hits),
   * plus dead-air stretches (very quiet for > minDead seconds).
   */
  async function windAndDeadAir(data, sr, { hopSec = 0.05, minWind = 0.5, minDead = 2.0, deadDb = -55, onProgress, check } = {}) {
    const n = 2048, hop = Math.round(sr * hopSec), binHz = sr / n;
    const lowK = Math.round(100 / binHz);
    const ratio = [], levels = [];
    await eachSpectrum(data, { n, hop, onProgress, check, cb: (i, p) => { let lo = 0, t = 0; for (let k = 1; k < p.length; k++) { t += p[k]; if (k <= lowK) lo += p[k]; } ratio.push(t > 0 ? lo / t : 0); levels.push(db(t / (n * n / 4))); } });
    const floor = percentile(levels, 0.1);
    const runs = (pred, minLen) => { const out = []; let s = -1; for (let i = 0; i <= ratio.length; i++) { const ok = i < ratio.length && pred(i); if (ok && s < 0) s = i; if (!ok && s >= 0) { if ((i - s) * hopSec >= minLen) out.push({ start: s * hopSec, end: i * hopSec }); s = -1; } } return out; };
    const wind = runs(i => ratio[i] > 0.75 && levels[i] > floor + 18, minWind);
    const dead = runs(i => levels[i] < deadDb, minDead);
    return { wind, dead, levels: Float32Array.from(levels), hop: hopSec };
  }

  /* =================== music / applause / speech / silence =================== */
  /**
   * Splits a long recording (concert, event) into labelled parts.
   * Returns {segments:[{type:'song'|'applause'|'talk'|'silence', start, end}], seconds:[{t, type, f:{...}}]}.
   */
  async function classify(data, sr, { onProgress, check, minSong = 20 } = {}) {
    const prog = (a, b) => f => onProgress && onProgress(a + (b - a) * f);
    const hopSec = 0.05, n = 1024, hop = Math.round(sr * hopSec), binHz = sr / n;
    const kLo = Math.max(1, Math.round(150 / binHz)), kHi = Math.min(n / 2, Math.round(Math.min(6000, sr / 2 - 100) / binHz));
    const F = { db: [], flat: [], cent: [], flux: [] };
    let prev = null;
    await eachSpectrum(data, { n, hop, onProgress: prog(0, 0.55), check, cb: (i, p) => {
      let t = 0, lg = 0, c = 0, cnt = 0;
      for (let k = kLo; k <= kHi; k++) { const v = p[k] + 1e-12; t += v; lg += Math.log(v); c += v * k * binHz; cnt++; }
      const am = t / cnt;
      F.db.push(db(t / (n * n / 4)));
      F.flat.push(Math.exp(lg / cnt) / am);
      F.cent.push(c / t);
      let fl = 0;
      if (prev) for (let k = kLo; k <= kHi; k += 2) { const d = Math.log(p[k] + 1e-12) - Math.log(prev[k] + 1e-12); if (d > 0) fl += d; }
      F.flux.push(fl);
      prev = Float64Array.from(p);
    } });
    const ch = await chromaFrames(data, sr, { hopSec: 0.25, n: 4096, onProgress: prog(0.55, 0.85), check });
    const secs = Math.floor(F.db.length * hopSec);
    const per = Math.round(1 / hopSec);
    const floorDb = percentile(F.db, 0.05);
    const seconds = [];
    for (let s = 0; s < secs; s++) {
      const a = s * per, b = a + per;
      const dbs = F.db.slice(a, b);
      // onset regularity over a 6 s window around this second: autocorrelation peak of flux at beat-like lags
      const wa = Math.max(0, a - 2.5 * per), wb = Math.min(F.flux.length, b + 2.5 * per);
      const fx = F.flux.slice(wa, wb); const m = mean(fx); const x = fx.map(v => v - m);
      let a0 = 0; for (const v of x) a0 += v * v;
      let reg = 0;
      for (let lag = Math.round(0.3 / hopSec); lag <= Math.round(1.2 / hopSec); lag++) { let c = 0; for (let i = lag; i < x.length; i++) c += x[i] * x[i - lag]; reg = Math.max(reg, a0 ? c / a0 : 0); }
      // tonal stability: how similar the pitch-class profile is across the second
      const c0 = chromaMean(ch.chroma, ch.rate, s, s + 0.5), c1 = chromaMean(ch.chroma, ch.rate, s + 0.5, s + 1);
      const chromaPeak = Math.max(...chromaMean(ch.chroma, ch.rate, s, s + 1));
      seconds.push({ t: s, f: { db: mean(dbs), mod: std(dbs), flat: mean(F.flat, a, b), cent: mean(F.cent, a, b), reg, tonal: chromaPeak, chStab: 1 - cosDist(c0, c1) } });
    }
    // label each second
    const lab = seconds.map(({ f }) => {
      if (f.db < floorDb + 5 && f.db < -45) return 'silence';
      const musicScore = (f.reg > 0.25 ? 1 : f.reg * 4) + (f.flat < 0.12 ? 1 : f.flat < 0.25 ? 0.5 : 0) + (f.mod < 4 ? 0.7 : f.mod < 7 ? 0.3 : 0) + (f.tonal > 0.16 ? 0.6 : 0);
      const applauseScore = (f.flat > 0.3 ? 1.2 : f.flat > 0.2 ? 0.6 : 0) + (f.reg < 0.2 ? 0.6 : 0) + (f.cent > 1800 ? 0.6 : 0) + (f.tonal < 0.13 ? 0.4 : 0);
      const speechScore = (f.mod > 6 ? 1.2 : f.mod > 4.5 ? 0.6 : 0) + (f.reg < 0.25 ? 0.5 : 0) + (f.flat > 0.1 && f.flat < 0.35 ? 0.4 : 0) + (f.cent < 2200 ? 0.3 : 0);
      const best = Math.max(musicScore, applauseScore, speechScore);
      return best === musicScore ? 'song' : best === applauseScore ? 'applause' : 'talk';
    });
    let smooth = medianFilter(lab, 5);
    smooth = medianFilter(smooth, 3);
    seconds.forEach((s, i) => { s.type = smooth[i]; });
    // runs → segments, absorbing too-short parts into neighbours
    let segs = toRuns(smooth);
    const minLen = { song: 10, applause: 2, talk: 3, silence: 2 };
    for (let pass = 0; pass < 4; pass++) {
      segs = segs.filter((sg, i) => {
        if (sg.end - sg.start >= minLen[sg.type] || segs.length === 1) return true;
        const nb = (segs[i - 1] && segs[i + 1]) ? ((segs[i - 1].end - segs[i - 1].start) >= (segs[i + 1].end - segs[i + 1].start) ? segs[i - 1] : segs[i + 1]) : (segs[i - 1] || segs[i + 1]);
        if (nb) { nb.start = Math.min(nb.start, sg.start); nb.end = Math.max(nb.end, sg.end); }
        return false;
      });
      segs = mergeSame(segs);
    }
    // split long music runs where the music changes (key / tempo): novelty on per-second chroma + regularity lag
    const out = [];
    for (const sg of segs) {
      if (sg.type !== 'song' || sg.end - sg.start < 2 * minSong) { out.push(sg); continue; }
      const cuts = songChanges(ch, sg.start, sg.end, { minSong, flux: F.flux, fluxRate: 1 / hopSec });
      let a = sg.start;
      for (const c of cuts) { out.push({ type: 'song', start: a, end: c }); a = c; }
      out.push({ type: 'song', start: a, end: sg.end });
    }
    if (onProgress) onProgress(1);
    return { segments: out.map(s => ({ type: s.type, start: s.start, end: Math.min(s.end, data.length / sr) })), seconds };
  }
  function toRuns(labels) {
    const out = []; let s = 0;
    for (let i = 1; i <= labels.length; i++) if (i === labels.length || labels[i] !== labels[s]) { out.push({ type: labels[s], start: s, end: i }); s = i; }
    return out;
  }
  function mergeSame(segs) { const out = []; for (const s of segs) { const l = out[out.length - 1]; if (l && l.type === s.type) l.end = Math.max(l.end, s.end); else out.push(s); } return out; }

  /**
   * Points inside [t0,t1] where one song turns into another. Evidence: the pitch-class profile over ~12 s
   * (a full chord cycle) changes a lot, and/or the local tempo changes by more than ~6 %. Each part >= minSong.
   */
  function songChanges(ch, t0, t1, { minSong = 20, flux, fluxRate }) {
    const W = 12;
    const localBpm = (a, b) => {
      if (!flux) return 0;
      const seg = flux.slice(Math.max(0, Math.floor(a * fluxRate)), Math.min(flux.length, Math.floor(b * fluxRate)));
      return seg.length > fluxRate * 4 ? tempo(seg, fluxRate, { min: 60, max: 200 }).bpm : 0;
    };
    const tempoChange = t => {
      const b1 = localBpm(t - 10, t - 1), b2 = localBpm(t + 1, t + 10);
      if (!b1 || !b2) return 0;
      // ignore half/double time
      const r = Math.max(b1, b2) / Math.min(b1, b2);
      const off = Math.min(Math.abs(r - 1), Math.abs(r - 2), Math.abs(r - 1.5));
      return off;
    };
    const pts = [];
    for (let t = t0 + Math.min(minSong, W); t <= t1 - Math.min(minSong, W); t += 0.5) {
      pts.push({ t, d: cosDist(chromaMean(ch.chroma, ch.rate, t - W, t), chromaMean(ch.chroma, ch.rate, t, t + W)) });
    }
    if (!pts.length) return [];
    const within = pts.map(p => p.d);
    const base = percentile(within, 0.5);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.t - t0 < minSong || t1 - p.t < minSong) continue;
      const isMax = pts.slice(Math.max(0, i - 12), i + 13).every(q => q.d <= p.d);
      if (!isMax || p.d < Math.max(0.05, base * 2)) continue;
      const tc = tempoChange(p.t);
      const strong = p.d > Math.max(0.12, base * 4);
      if ((tc > 0.06 || strong) && (!out.length || p.t - out[out.length - 1] >= minSong)) out.push(p.t);
    }
    return out;
  }

  US.dsp = {
    fft, hann, eachSpectrum, stft, onsetStrength, tempo, beatTrack, chromaFrames, analyseBeats,
    levelStats, findPauses, kWeighting, loudness, LoudnessMeter, peaks, quietSpectrum, detectHum, windAndDeadAir, classify,
    util: { amax, mean, std, percentile, movingAverage, medianFilter, db, cosDist, chromaMean }
  };
})();
