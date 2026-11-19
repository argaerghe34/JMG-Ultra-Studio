/* JMG Ultra Studio – Auto Sync: lines up the clips of several cameras and sound recorders by the sound they share (or
   by timecode) and builds a NEW sequence with each camera and recorder on its own tracks. Clips that can't be placed
   go at the end, and the report says why. Nothing of the user's is changed. Research and design: dev/docs/research-synq.md.

   How the matching works: each clip's sound becomes a small "fingerprint" – how strongly sounds start, 100 times a
   second (the Beat Cut engine's onset strength). The longest clip starts a group; every other clip is slid along
   everything placed so far (one FFT each) and joins where the fingerprints agree clearly. Clips that agree with
   nothing start a group of their own. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  if (US.addIcon) US.addIcon('autosync', 'M2 5h7v3H2z M6 12h9v3H6z M11 5h7v3h-7z M9 2v16');

  const RATE = 100;            // fingerprint frames per second
  const PRINT_VERSION = 1;     // bump when the fingerprint changes (cache)
  // A match counts when it is far above chance (score) AND stands out from the next best place: by 1.45× (ratio), or –
  // for music, where the next bar scores nearly as well – by 3 units of chance (sig). Measured on made-up and test
  // media: unrelated sound reaches a ratio of 1.3 and a sig of 0.4; a steady beat a sig of 0.1; real matches 9–50.
  const MIN_SCORE = 6, MIN_RATIO = 1.45, CLEAR_RATIO = 2.2, MIN_SIG = 3, CLEAR_SIG = 8;
  const accepts = m => !!m && m.score >= MIN_SCORE && (m.ratio >= MIN_RATIO || m.sig >= MIN_SIG);
  const GAP = 5;               // seconds between groups on the new sequence
  const BIN = 'JMG Ultra Studio/Auto Sync';
  const DEFAULTS = { mode: 'sound', cameraSound: 'keep', colour: true };
  const COLOURS = [4, 7, 5, 6, 0, 10, 15, 11, 2, 13, 9, 3];   // label colours, one per camera or recorder

  /* ====================== the sound fingerprint (pure) ====================== */
  /** Where sounds start, per 10 ms, with slow swells taken out. data: mono samples. -> {env: Float32Array, level: dB} */
  async function fingerprint(data, sr, { onProgress, check } = {}) {
    let sq = 0; for (let i = 0; i < data.length; i++) sq += data[i] * data[i];
    const level = 10 * Math.log10(sq / Math.max(1, data.length) + 1e-12);
    const o = await US.dsp.onsetStrength(data, sr, { hopSec: 1 / RATE, n: sr >= 32000 ? 2048 : 1024, bands: 24, fmin: 100, fmax: 6000, onProgress, check });
    const x = new Float32Array(o.env.length);
    for (let i = 0; i < x.length; i++) x[i] = Math.sqrt(o.env[i]);
    const slow = US.dsp.util.movingAverage(x, RATE);
    for (let i = 0; i < x.length; i++) x[i] -= slow[i];
    return { env: x, level };
  }
  /** A fingerprint as text for the cache (one signed byte per frame). */
  function pack(fp) {
    let m = 1e-9; for (let i = 0; i < fp.env.length; i++) m = Math.max(m, Math.abs(fp.env[i]));
    const b = Buffer.alloc(fp.env.length);
    for (let i = 0; i < b.length; i++) b.writeInt8(Math.round(127 * fp.env[i] / m), i);
    return { n: b.length, scale: m, level: fp.level, b64: b.toString('base64') };
  }
  function unpack(p) {
    const b = Buffer.from(p.b64, 'base64'), env = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) env[i] = b.readInt8(i) * p.scale / 127;
    return { env, level: p.level };
  }
  /** Zero mean, unit spread. */
  function znorm(a) {
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i];
    const m = s / Math.max(1, a.length);
    let v = 0; for (let i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m);
    const sd = Math.sqrt(v / Math.max(1, a.length)) || 1, out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i] - m) / sd;
    return out;
  }
  const pow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  /**
   * Everything placed so far as one fingerprint to compare against. parts: [{at: frames, env: normalised}] ->
   * {data, n, sq: running sum of squares, cnt: running count of frames that have sound data, start: frame of data[0]}
   */
  function composite(parts) {
    let lo = Infinity, hi = -Infinity;
    for (const p of parts) { lo = Math.min(lo, p.at); hi = Math.max(hi, p.at + p.env.length); }
    const n = Math.max(0, hi - lo), data = new Float32Array(n), count = new Uint16Array(n);
    for (const p of parts) for (let i = 0, o = p.at - lo; i < p.env.length; i++) { data[o + i] += p.env[i]; count[o + i]++; }
    const sq = new Float64Array(n + 1), cnt = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) { if (count[i] > 1) data[i] /= count[i]; sq[i + 1] = sq[i] + data[i] * data[i]; cnt[i + 1] = cnt[i] + (count[i] ? 1 : 0); }
    return { data, n, sq, cnt, start: lo };
  }
  /** The reference's spectrum for one FFT size (made once per round, used for every clip). */
  function spectrum(ref, N) {
    if (ref.spec && ref.spec.N === N) return ref.spec;
    const re = new Float64Array(N), im = new Float64Array(N);
    re.set(ref.data);
    US.dsp.fft(re, im);
    return (ref.spec = { N, re, im });
  }
  /**
   * Where a clip's fingerprint fits a reference. b: normalised clip. -> {lag (frames after the reference's first frame,
   * with a fraction), score (how far above chance), ratio (best ÷ next best elsewhere), sig (best above next best, in
   * units of chance), r (−1…1), n (frames compared)}
   * or null when the clip is too short to say.
   */
  function match(ref, b, N) {
    const la = ref.n, lb = b.length;
    const minOv = Math.min(3 * RATE, Math.floor(lb * 0.6));
    if (lb < RATE || la < RATE || minOv < RATE / 2) return null;
    N = N || pow2(la + lb);
    const A = spectrum(ref, N), re = new Float64Array(N), im = new Float64Array(N);
    re.set(b);
    US.dsp.fft(re, im);
    // ref × conj(clip), then back: c[k] = Σ ref[i + k] · clip[i]
    for (let i = 0; i < N; i++) { const xr = A.re[i] * re[i] + A.im[i] * im[i], xi = A.im[i] * re[i] - A.re[i] * im[i]; re[i] = xi; im[i] = xr; }
    US.dsp.fft(re, im);   // inverse by swapping the parts; the result is in im (scaled by N)
    const bsq = new Float64Array(lb + 1);
    for (let i = 0; i < lb; i++) bsq[i + 1] = bsq[i] + b[i] * b[i];
    const first = -(lb - minOv), last = la - minOv, S = new Float32Array(last - first + 1);
    let best = -Infinity, bestK = 0, bestR = 0, bestN = 0;
    for (let k = first; k <= last; k++) {
      const a0 = Math.max(0, k), a1 = Math.min(la, k + lb), n = ref.cnt[a1] - ref.cnt[a0];
      if (n < minOv) { S[k - first] = -1e9; continue; }
      const e = (ref.sq[a1] - ref.sq[a0]) * (bsq[a1 - k] - bsq[a0 - k]);
      const c = im[k >= 0 ? k : N + k] / N, r = e > 1e-9 ? c / Math.sqrt(e) : 0, s = r * Math.sqrt(n);
      S[k - first] = s;
      if (s > best) { best = s; bestK = k; bestR = r; bestN = n; }
    }
    if (!(best > 0)) return null;
    let second = 0;
    for (let i = 0; i < S.length; i++) if (Math.abs(i + first - bestK) > RATE / 2 && S[i] > second) second = S[i];
    // between frames: the top of a parabola through the best and its neighbours
    const i0 = bestK - first, y0 = S[i0 - 1], y1 = S[i0], y2 = S[i0 + 1];
    let frac = 0;
    if (i0 > 0 && i0 < S.length - 1 && y0 > -1e8 && y2 > -1e8) { const d = y0 - 2 * y1 + y2; if (d < 0) frac = Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / d)); }
    // music repeats, so the next best place can score nearly as well: how far the best stands above it, in units of
    // chance (the likeness of each as a Fisher z; frames aren't independent, so a tenth of them are counted)
    const r2 = Math.min(0.999, Math.max(0, second / Math.sqrt(bestN))), ne = bestN / 10;
    const sig = ne > 4 ? (Math.atanh(Math.min(0.999, Math.max(0, bestR))) - Math.atanh(r2)) * Math.sqrt((ne - 3) / 2) : 0;
    return { lag: bestK + frac, score: best, ratio: best / Math.max(second, 1e-6), r: bestR, n: bestN, sig };
  }
  /** The best shift (frames, ±range) of clip frames [i0, i1) around a known lag – for measuring drift. */
  function lagNear(ref, b, lag, i0, i1, range = 30) {
    let best = -Infinity, bestD = 0; const vals = [];
    for (let d = -range; d <= range; d++) {
      let c = 0, ea = 0, eb = 0;
      for (let i = i0; i < i1; i++) { const j = i + lag + d; if (j < 0 || j >= ref.n) continue; const x = ref.data[j], y = b[i]; c += x * y; ea += x * x; eb += y * y; }
      const r = ea > 1e-9 && eb > 1e-9 ? c / Math.sqrt(ea * eb) : 0;
      vals.push(r); if (r > best) { best = r; bestD = d; }
    }
    const k = bestD + range; let frac = 0;
    if (k > 0 && k < vals.length - 1) { const d = vals[k - 1] - 2 * vals[k] + vals[k + 1]; if (d < 0) frac = Math.max(-0.5, Math.min(0.5, 0.5 * (vals[k - 1] - vals[k + 1]) / d)); }
    return { d: bestD + frac, r: best, edge: Math.abs(bestD) === range };
  }
  /** How far a clip slips against the reference between the start and the end of what they share (seconds; null = can't say). */
  function drift(ref, b, lag) {
    const L = Math.round(lag), i0 = Math.max(0, -L), i1 = Math.min(b.length, ref.n - L), len = i1 - i0;
    if (len < 60 * RATE) return null;
    const w = Math.min(Math.floor(len / 3), 60 * RATE);
    const a = lagNear(ref, b, L, i0, i0 + w), z = lagNear(ref, b, L, i1 - w, i1);
    if (a.edge || z.edge || a.r < 0.08 || z.r < 0.08) return null;
    return (z.d - a.d) / RATE;
  }

  /* ====================== lining the clips up (pure) ====================== */
  /**
   * clips: [{key, device, dur (seconds), env (Float32Array or null), level (dB), tc (seconds or null)}]
   * mode: 'sound' | 'timecode' | 'both'. -> {groups: [{members: [{key, at (seconds from the group's start), how:
   * 'first'|'sound'|'timecode', score, ratio, sure: 'clear'|'good', drift}]}], loose: [{key, why}]}
   * why: 'silent' | 'short' | 'nosound' | 'nomatch' | 'unsure' | 'notimecode' | 'alone'
   */
  async function solve(clips, { mode = 'sound', job } = {}) {
    const groups = [], loose = [], pool = [];
    const tick = async (f, msg) => { if (job) { job.check(); job.progress(f, msg); } await new Promise(r => setTimeout(r, 0)); };
    let rest = clips.slice();

    // by timecode: clips of different cameras or recorders whose times of day overlap
    if (mode !== 'sound') {
      const timed = rest.filter(c => c.tc != null && c.tc > 0).sort((a, b) => a.tc - b.tc);
      const clusters = [];
      for (const c of timed) { const last = clusters[clusters.length - 1]; if (last && c.tc < last.end) { last.clips.push(c); last.end = Math.max(last.end, c.tc + c.dur); } else clusters.push({ clips: [c], end: c.tc + c.dur }); }
      for (const cl of clusters) {
        if (new Set(cl.clips.map(c => c.device)).size < 2) continue;
        const t0 = cl.clips[0].tc;
        groups.push({ tc: t0, members: cl.clips.map(c => ({ key: c.key, at: c.tc - t0, how: 'timecode' })) });
        rest = rest.filter(c => !cl.clips.includes(c));
      }
      if (mode === 'timecode') { for (const c of rest) loose.push({ key: c.key, why: c.tc != null && c.tc > 0 ? 'alone' : 'notimecode' }); return finish(); }
    }
    for (const c of rest) {
      if (!c.env) loose.push({ key: c.key, why: 'nosound' });
      else if (c.level != null && c.level < -75) loose.push({ key: c.key, why: 'silent' });
      else if (c.dur < 1 || c.env.length < RATE) loose.push({ key: c.key, why: 'short' });
      else pool.push(Object.assign({ z: znorm(c.env) }, c));
    }
    const byKey = new Map(clips.map(c => [c.key, c]));
    const total = pool.length || 1;
    let done = 0;

    /** Add every clip in the pool that clearly fits the group; again while the group keeps growing. */
    async function grow(g) {
      for (;;) {
        const parts = [];
        for (const m of g.members) { const c = byKey.get(m.key); if (c && c.env && !(c.level < -75)) parts.push({ at: Math.round(m.at * RATE), env: m.z || (m.z = znorm(c.env)) }); }
        if (!parts.length || !pool.length) return;
        const ref = composite(parts), N = pow2(ref.n + Math.max(...pool.map(c => c.z.length)));
        let added = 0;
        for (const c of pool.slice()) {
          await tick(0.1 + 0.85 * done / total, `Comparing the sound · ${c.name || c.key}`);
          const m = match(ref, c.z, N);
          // a strong likeness that still isn't clear enough (a steady beat fits in many places): remembered for the report
          if (m && m.score >= MIN_SCORE * 2 && !accepts(m)) { c.near = true; g.near = true; }
          if (!accepts(m)) continue;
          g.members.push({ key: c.key, at: (ref.start + m.lag) / RATE, how: 'sound', score: m.score, ratio: m.ratio, sure: m.ratio >= CLEAR_RATIO || m.sig >= CLEAR_SIG ? 'clear' : 'good', drift: drift(ref, c.z, m.lag), z: c.z });
          pool.splice(pool.indexOf(c), 1); added++; done++;
        }
        if (!added) return;
      }
    }
    for (const g of groups) await grow(g);
    while (pool.length) {
      pool.sort((a, b) => b.dur - a.dur);
      const seed = pool.shift(); done++;
      const g = { members: [{ key: seed.key, at: 0, how: 'first', z: seed.z }] };
      await grow(g);
      if (g.members.length > 1) groups.push(g);
      else loose.push({ key: seed.key, why: seed.near || g.near ? 'unsure' : 'nomatch' });
    }
    return finish();

    function finish() {
      for (const g of groups) {
        const t0 = Math.min(...g.members.map(m => m.at));
        for (const m of g.members) { m.at -= t0; delete m.z; }
        g.members.sort((a, b) => a.at - b.at);
        g.length = Math.max(...g.members.map(m => m.at + byKeyDur(m.key)));
      }
      // groups in the order of their timecode, else of the clips as they were given
      const order = new Map(clips.map((c, i) => [c.key, i]));
      const rank = g => (g.tc != null ? g.tc - 1e9 : Math.min(...g.members.map(m => order.get(m.key))));
      groups.sort((a, b) => rank(a) - rank(b));
      loose.sort((a, b) => order.get(a.key) - order.get(b.key));
      return { groups, loose };
    }
    function byKeyDur(k) { const c = clips.find(x => x.key === k); return c ? c.dur : 0; }
  }

  /* ====================== from the answer to tracks (pure) ====================== */
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const GENERIC = /^(clip|clips|stream|dcim|private|m4root|avchd|bdmv|contents|video|audio|sound|media|footage|\d{3}[a-z_]{5}|\d+)$/i;
  /** Sort clips into cameras and recorders: by the folder their files are in (one card, one folder), else by how the
      files are named. items: itemInfo-like. -> [{id, name, kind: 'camera'|'recorder', hint, keys: [item ids]}] */
  function devicesFromItems(items) {
    const out = [];
    for (const kind of ['camera', 'recorder']) {
      const mine = items.filter(i => (i.hasVideo ? 'camera' : 'recorder') === kind);
      if (!mine.length) continue;
      const dirOf = i => String(i.path || '').replace(/\\/g, '/').replace(/\/[^/]*$/, '');
      const folders = new Set(mine.map(dirOf));
      const patternOf = i => US.basename(i.path || i.name).replace(/\d+/g, '#').toLowerCase() + (i.width ? ` ${i.width}x${i.height}` : '');
      const keyOf = folders.size > 1 ? dirOf : patternOf;
      const groups = new Map();
      for (const i of mine) { const k = keyOf(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
      const keys = Array.from(groups.keys()).sort(natural);
      keys.forEach((k, n) => {
        let name = '';
        if (folders.size > 1) { const parts = k.split('/').filter(Boolean); while (parts.length && GENERIC.test(parts[parts.length - 1])) parts.pop(); name = parts.pop() || ''; }
        const fallback = kind === 'camera' ? 'Camera ' + String.fromCharCode(65 + (n % 26)) : 'Recorder ' + (n + 1);
        if (!name || out.some(d => d.name === name)) name = fallback;
        out.push({ id: kind + ':' + k, name, kind, hint: folders.size > 1 ? k : `files named like ${US.basename(groups.get(k)[0].path || groups.get(k)[0].name)}`, keys: groups.get(k).map(i => i.id) });
      });
    }
    return out;
  }
  /** Clips and devices from clips in the project (each whole clip, or a subclip's own range). */
  function fromItems(items) {
    const usable = items.filter(i => (i.kind === 'video' || i.kind === 'audio') && i.path && !i.offline);
    const devices = devicesFromItems(usable);
    const devOf = new Map(); for (const d of devices) for (const k of d.keys) devOf.set(k, d.id);
    const clips = usable.map(i => ({ key: i.id, itemId: i.id, name: i.name, path: i.path, device: devOf.get(i.id), 'in': i.rangeStart || 0, out: i.rangeEnd || i.duration, dur: (i.rangeEnd || i.duration) - (i.rangeStart || 0), hasVideo: !!i.hasVideo, hasAudio: !!i.hasAudio, fps: i.fps || 0 }));
    return { clips, devices, skipped: items.length - usable.length };
  }
  /** Clips and devices from a sequence the footage was dropped on: one camera per video track, one recorder per audio
      track (a camera clip's own sound, on an audio track at the same place, isn't counted twice). infos: {itemId: itemInfo} */
  function fromSequence(seq, infos) {
    const clips = [], devices = []; let skipped = 0;
    const camAt = [];
    for (const t of seq.video) {
      const mine = [];
      t.clips.forEach((c, k) => {
        const i = infos[c.itemId];
        if (!i || !c.path || c.isSequence || (i.kind !== 'video' && i.kind !== 'audio') || c.offline || (c.speed && Math.abs(c.speed - 1) > 0.001)) { skipped++; return; }
        mine.push({ key: `v${t.index}:${k}`, itemId: c.itemId, name: c.name, path: c.path, device: 'v' + t.index, 'in': c['in'], out: c.out, dur: c.out - c['in'], hasVideo: true, hasAudio: !!i.hasAudio, fps: i.fps || 0, was: c.start });
        camAt.push(c.itemId + '@' + c.start.toFixed(2));
      });
      if (mine.length) { clips.push(...mine); devices.push({ id: 'v' + t.index, name: t.name && !/^(Video|V) ?\d+$/i.test(t.name) ? t.name : 'Camera on V' + (t.index + 1), kind: 'camera', hint: 'video track ' + (t.index + 1) }); }
    }
    for (const t of seq.audio) {
      const mine = [];
      t.clips.forEach((c, k) => {
        if (camAt.includes(c.itemId + '@' + c.start.toFixed(2))) return;   // a camera clip's own sound
        const i = infos[c.itemId];
        if (!i || !c.path || c.isSequence || !i.hasAudio || c.offline || (c.speed && Math.abs(c.speed - 1) > 0.001)) { skipped++; return; }
        mine.push({ key: `a${t.index}:${k}`, itemId: c.itemId, name: c.name, path: c.path, device: 'a' + t.index, 'in': c['in'], out: c.out, dur: c.out - c['in'], hasVideo: false, hasAudio: true, fps: 0, was: c.start });
      });
      if (mine.length) { clips.push(...mine); devices.push({ id: 'a' + t.index, name: t.name && !/^(Audio|A) ?\d+$/i.test(t.name) ? t.name : 'Recorder on A' + (t.index + 1), kind: 'recorder', hint: 'audio track ' + (t.index + 1) }); }
    }
    return { clips, devices, skipped };
  }

  /**
   * Where everything goes on the new sequence. -> {layers: [{key, id, in, out, at, v, a, label}], tracks: {video: [name],
   * audio: [name]}, mute: [audio track indexes], markers, end, rows: [{device, name, kind, lanes}] for the picture}
   * Groups follow each other with a gap; clips that couldn't be placed come last, one after another. A camera whose
   * clips overlap after syncing (two cameras that looked like one) gets a second track rather than losing a clip.
   */
  function layout(result, clips, devices, { cameraSound = 'keep', colour = true, fps = 25 } = {}) {
    const byKey = new Map(clips.map(c => [c.key, c]));
    const snap = t => Math.round(t * fps) / fps;
    const placed = [], markers = [];
    let cursor = 0;
    result.groups.forEach((g, n) => {
      if (result.groups.length > 1 || result.loose.length) markers.push({ start: cursor, name: `Synced group ${n + 1}`, comment: `${g.members.length} clips lined up`, color: 0 });
      for (const m of g.members) placed.push({ key: m.key, at: snap(cursor + m.at), group: n });
      cursor = snap(cursor + g.length + GAP);
    });
    if (result.loose.length) {
      markers.push({ start: cursor, name: 'Not synced', comment: 'These clips couldn’t be placed – see Auto Sync’s report', color: 1 });
      for (const l of result.loose) { const c = byKey.get(l.key); placed.push({ key: l.key, at: cursor, group: -1 }); cursor = snap(cursor + c.dur + 1); }
    }
    // lanes: a device's clips on one track, a second only where two overlap
    const rows = [];
    const order = devices.slice().sort((a, b) => (a.kind === b.kind ? natural(a.name, b.name) : a.kind === 'camera' ? -1 : 1));
    order.forEach((d, n) => {
      const mine = placed.filter(p => byKey.get(p.key).device === d.id).sort((a, b) => a.at - b.at), ends = [];
      for (const p of mine) { const dur = byKey.get(p.key).dur; let lane = ends.findIndex(e => e <= p.at + 0.02); if (lane < 0) lane = ends.length; ends[lane] = p.at + dur; p.lane = lane; }
      if (mine.length) rows.push({ device: d.id, name: d.name, kind: d.kind, lanes: ends.length, label: colour ? COLOURS[n % COLOURS.length] : null, clips: mine });
    });
    const tracks = { video: [], audio: [] }, mute = [], layers = [];
    const cams = rows.filter(r => r.kind === 'camera'), recs = rows.filter(r => r.kind === 'recorder');
    for (const r of cams) { r.v = tracks.video.length; for (let l = 0; l < r.lanes; l++) tracks.video.push(r.name + (r.lanes > 1 ? ` (${l + 1})` : '')); }
    if (cameraSound !== 'none') for (const r of cams) {
      if (!r.clips.some(p => byKey.get(p.key).hasAudio)) continue;
      r.a = tracks.audio.length;
      for (let l = 0; l < r.lanes; l++) { if (cameraSound === 'mute') mute.push(tracks.audio.length); tracks.audio.push(r.name + (r.lanes > 1 ? ` (${l + 1})` : '')); }
    }
    for (const r of recs) { r.a = tracks.audio.length; for (let l = 0; l < r.lanes; l++) tracks.audio.push(r.name + (r.lanes > 1 ? ` (${l + 1})` : '')); }
    for (const r of rows) for (const p of r.clips) {
      const c = byKey.get(p.key);
      const v = r.kind === 'camera' ? r.v + p.lane : null, a = r.a != null && c.hasAudio ? r.a + p.lane : null;
      if (v == null && a == null) continue;
      layers.push({ key: p.key, id: c.itemId, 'in': c['in'], out: c.out, at: p.at, v, a, label: r.label });
    }
    return { layers, tracks, mute, markers, end: cursor, rows };
  }

  /* ====================== listening, and the whole job ====================== */
  /** What the tool asks of the computer and the editor – replaced by pretend ones in the tests. */
  const io = {
    /** A file's sound, from the file where the computer can read it (no render), else as the other tools get it. */
    async sound(item, job) {
      try { const a = await US.audio.fileAudio(item.path, { check: job && (() => job.check()) }); return { data: a.data, sr: a.sr, offset: 0 }; }
      catch (e) { if (e && e.code === 'CANCELLED') throw e; }
      const a = await US.audio.forItem(item, { job });
      return { data: a.data, sr: a.sr, offset: a.offset || 0, partial: !!a.partial };
    }
  };
  /** A clip's fingerprint for the part it uses – each file is listened to once and remembered. */
  async function printFor(clip, job, memo) {
    if (!clip.hasAudio) return null;
    let fp = memo.get(clip.path);
    if (!fp) {
      const key = US.fsx && US.fsx.mediaKey ? US.fsx.mediaKey(clip.path) + '-v' + PRINT_VERSION : '';
      const hit = key && US.cache.get('autosync', key);
      if (hit && hit.b64) fp = Object.assign(unpack(hit), { offset: 0 });
      else {
        const a = await io.sound({ id: clip.itemId, path: clip.path, name: clip.name, duration: clip.out }, job);
        job && job.set({ who: 'computer', msg: `Listening to ${clip.name}` });
        fp = Object.assign(await fingerprint(a.data, a.sr, { check: job && (() => job.check()) }), { offset: a.offset || 0 });
        if (key && !a.offset && !a.partial) { try { US.cache.set('autosync', key, pack(fp)); } catch (e) { /* the cache is a nicety */ } }
      }
      memo.set(clip.path, fp);
    }
    const i0 = Math.max(0, Math.round((clip['in'] - fp.offset) * RATE)), i1 = Math.min(fp.env.length, Math.round((clip.out - fp.offset) * RATE));
    if (i1 - i0 < RATE / 2) return null;
    const env = fp.env.subarray(i0, i1);
    // the level of this part (a quiet stretch of a loud file counts as quiet): from the fingerprint's own movement
    let e = 0; for (let i = 0; i < env.length; i++) e += env[i] * env[i];
    return { env, level: e / env.length < 1e-10 ? -100 : fp.level };
  }

  const WHY = {
    silent: 'no sound to go by', nosound: 'no sound to go by', short: 'too short to be sure',
    nomatch: 'shares no sound with the others', unsure: 'a possible match, but not sure enough to place',
    notimecode: 'has no timecode', alone: 'no other camera or recorder was running at its timecode'
  };
  /** One line per clip for the report. */
  function report(result, clips, devices) {
    const byKey = new Map(clips.map(c => [c.key, c])), dev = new Map(devices.map(d => [d.id, d.name])), out = [];
    result.groups.forEach((g, n) => g.members.forEach(m => {
      const c = byKey.get(m.key);
      const how = m.how === 'timecode' ? 'by timecode' : m.how === 'first' ? 'the others were lined up to this one' : `by sound · ${m.sure === 'clear' ? 'a clear match' : 'a good match'}`;
      const slip = m.drift != null && Math.abs(m.drift) >= 0.03 ? ` · drifts ${Math.abs(m.drift).toFixed(2)} s by the end – check the last minutes` : '';
      out.push({ key: m.key, name: c.name, device: dev.get(c.device), ok: true, group: n, how: how + slip, drift: m.drift });
    }));
    for (const l of result.loose) { const c = byKey.get(l.key); out.push({ key: l.key, name: c.name, device: dev.get(c.device), ok: false, group: -1, how: WHY[l.why] || l.why, why: l.why }); }
    return out;
  }

  /**
   * The whole thing. src: {items} (clips from the project) or {sequence} (sequenceInfo). o: {mode, cameraSound, colour,
   * name?, build?: false to stop before the new sequence}. -> {summary, sequence, report, plan, counts}
   */
  async function run(job, src, o = {}) {
    o = Object.assign({}, DEFAULTS, o);
    job.set({ who: 'premiere', msg: 'Reading the clips' });
    let got, baseName;
    if (src.sequence) {
      const ids = Array.from(new Set([].concat(...src.sequence.video.concat(src.sequence.audio).map(t => t.clips.map(c => c.itemId).filter(Boolean)))));
      const infos = {}; (await US.host.call('itemsInfo', { ids })).forEach(i => { if (i) infos[i.id] = i; });
      got = fromSequence(src.sequence, infos); baseName = src.sequence.name;
    } else { got = fromItems(src.items || []); baseName = ''; }
    const { clips, devices } = got;
    if (clips.length < 2 || devices.length < 2) throw new US.UserError('NOTHING_FOUND', {
      title: clips.length < 2 ? 'Auto Sync needs at least two clips.' : 'These clips all look like one camera.',
      action: src.sequence ? 'Put each camera’s clips on their own video track and each recorder’s on its own audio track, then try again.' : 'Select the clips of every camera and recorder (or a bin that holds them), then try again.',
      detail: `${clips.length} clips, ${devices.length} device(s)` });

    if (o.mode !== 'sound') {
      const ids = Array.from(new Set(clips.map(c => c.itemId)));
      let tcs = [];
      try { tcs = await US.host.call('syncTimecodes', { ids }); } catch (e) { if (o.mode === 'timecode') throw e; US.log('warn', 'Auto Sync couldn’t read the timecodes – matching by sound only', String(e && (e.detail || e.message) || e), 'autosync'); }
      const start = new Map(tcs.filter(Boolean).map(t => [t.id, t.start]));
      for (const c of clips) { const s = start.get(c.itemId); c.tc = s != null && s > 0 ? s + c['in'] : null; }
    }
    if (o.mode !== 'timecode') {
      const memo = new Map(); let n = 0;
      for (const c of clips) {
        job.check(); job.set({ who: 'computer' }).progress(0.02 + 0.5 * n++ / clips.length, `Listening to clip ${n} of ${clips.length} · ${c.name}`);
        try { const p = await printFor(c, job, memo); if (p) { c.env = p.env; c.level = p.level; } }
        catch (e) { if (e && e.code === 'CANCELLED') throw e; c.env = null; US.log('warn', `Auto Sync couldn’t listen to ${c.name}`, String(e && (e.detail || e.title || e.message) || e), 'autosync'); }
      }
    }
    job.set({ who: 'computer', msg: 'Lining the clips up' });
    const sub = { check: () => job.check(), progress: (f, m) => job.progress(0.55 + 0.35 * f, m) };
    const result = await solve(clips, { mode: o.mode, job: sub });
    const cam = clips.find(c => c.hasVideo && result.groups.some(g => g.members.some(m => m.key === c.key))) || clips.find(c => c.hasVideo) || clips[0];
    const plan = layout(result, clips, devices, { cameraSound: o.cameraSound, colour: o.colour, fps: cam.fps || 25 });
    const rep = report(result, clips, devices);
    const synced = rep.filter(r => r.ok).length;
    const counts = { clips: clips.length, synced, loose: result.loose.length, groups: result.groups.length, cameras: devices.filter(d => d.kind === 'camera').length, recorders: devices.filter(d => d.kind === 'recorder').length, skipped: got.skipped };
    const base = { report: rep, plan, counts, devices };
    if (!synced) return Object.assign(base, { sequence: null, summary: 'Nothing could be lined up – no new sequence was made' });
    if (o.build === false) return Object.assign(base, { sequence: null, summary: `${synced} of ${clips.length} clips can be lined up` });

    job.check();
    job.set({ who: 'premiere' }).progress(0.92, `Building the synced sequence · ${US.plural(plan.layers.length, 'clip')}`);
    const made = await US.host.call('syncBuild', { name: o.name || (baseName ? `${baseName} – synced` : 'Synced'), binPath: BIN, likeId: cam.itemId,
      layers: plan.layers.map(l => ({ id: l.id, 'in': l['in'], out: l.out, at: l.at, v: l.v, a: l.a, label: l.label })), videoNames: plan.tracks.video, audioNames: plan.tracks.audio, mute: plan.mute, markers: plan.markers });
    try { await US.host.call('openSequence', { seqId: made.id }); await US.refreshContext(); } catch (e) { /* it's in the bin all the same */ }
    const missing = (made.missing || []).length;
    return Object.assign(base, { sequence: made, missing,
      summary: `${synced} of ${clips.length} clips lined up in “${made.name}”` + (result.groups.length > 1 ? ` · ${result.groups.length} groups` : '') + (result.loose.length ? ` · ${result.loose.length} not synced, at the end` : '') + (missing ? ` · ${missing} couldn’t be laid on the sequence` : '') });
  }

  /* ====================== Ask ====================== */
  function matchAsk(t) {
    if (!/\b(sync|synchroni[sz]e|line up|align)\b/i.test(t)) return null;
    if (!/\b(clips?|cameras?|cams?|angles?|audio|sound|mics?|recorders?|footage|timecode|multi-?cam|selected|bin)\b/i.test(t)) return null;
    if (/\b(story|lyrics?|captions?|subtitles?|beat|music video)\b/i.test(t)) return null;
    return { mode: /timecode/i.test(t) ? (/\b(sound|audio|waveform)\b/i.test(t) ? 'both' : 'timecode') : 'sound', from: /\b(sequence|timeline)\b/i.test(t) ? 'sequence' : 'selection', _score: 2.5 };
  }
  US.actions && US.actions.register && US.actions.register({
    id: 'autosync.sync', tool: 'autosync', title: 'Sync cameras and sound', changes: true,
    describe: 'Lines up the clips of several cameras and sound recorders by the sound they share (or by timecode) and builds a new sequence with each on its own tracks. Works on the selected clips, or on the open sequence when asked. Nothing existing is changed.',
    params: { mode: { type: 'enum', options: ['sound', 'timecode', 'both'], default: 'sound', desc: 'Match by sound, by timecode, or timecode first and sound for the rest' }, from: { type: 'enum', options: ['selection', 'sequence'], default: 'selection', desc: 'The clips selected in the Project panel, or the open sequence (one camera per track)' } },
    examples: ['sync the selected clips', 'line up the cameras with the recorder’s sound', 'sync this sequence by timecode'],
    match: matchAsk,
    run: async (p, job) => {
      p = p || {};
      let src;
      if (p.from === 'sequence') { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); src = { sequence: await US.host.call('sequenceInfo', { seqId: s.id }) }; }
      else { const items = await US.host.call('selectedItems', { kinds: ['video', 'audio'] }); if (!items.length) throw new US.UserError('NO_SELECTION'); src = { items }; }
      const r = await run(job, src, Object.assign({}, US.settings.get('autosync', {}), { mode: p.mode || 'sound' }));
      last = r; US.bus && US.bus.emit && US.bus.emit('autosync:done');
      return r;
    }
  });
  let last = null;   // the latest result, shown by the open tab

  /* ====================== the screen ====================== */
  US.tools.register({
    id: 'autosync', name: 'Auto Sync', short: 'Auto Sync', icon: 'autosync', group: 'cut', order: 48,
    blurb: 'Lines up your cameras and sound recorders by the sound they share, in a new sequence.',
    hostFns: ['syncBuild', 'syncTimecodes', 'itemsInfo', 'sequenceInfo', 'openSequence'],
    tour: [
      { target: '[data-as="source"]', title: 'Give it everything', text: 'Select the clips of every camera and recorder (or a bin), or drop them on a sequence – one camera per video track, one recorder per audio track. They needn’t be in the right place.' },
      { target: '[data-as="mode"]', title: 'Sound or timecode', text: 'By sound needs nothing but the cameras’ own microphones. Timecode is for cameras and recorders that were set to the same clock.', tip: '“Both” places the timecoded clips first and matches the rest by sound.' },
      { target: 'text:Sync into a new sequence', title: 'One press', text: 'Your clips and sequences aren’t touched. The new sequence has each camera and recorder on its own tracks, lined up.' },
      { target: '[data-as="results"]', title: 'The report', text: 'Says how every clip was placed and how sure it is. Clips it couldn’t place are at the end of the sequence, each with the reason.' }
    ],
    create() {
      const v = ui.toolView({ icon: 'autosync', title: 'Auto Sync', blurb: 'Lines up the clips of several cameras and sound recorders by the sound they share – or by timecode – and builds a new sequence with each on its own tracks. Your clips and sequences aren’t changed.',
        help: h('div', h('ul',
          h('li', 'By sound, every clip needs to have heard the same thing: a camera’s own microphone is enough, however poor.'),
          h('li', 'From clips or a bin, cameras and recorders are told apart by the folder their files are in (one card, one folder), else by how the files are named. From a sequence, each track is one camera or recorder.'),
          h('li', 'Takes that share no sound become separate groups, one after the other, each with a marker.'),
          h('li', 'Clips that can’t be placed – silent, or nothing in common – go at the end after a “Not synced” marker. Drag them into place yourself.'))) });
      const S = Object.assign({}, DEFAULTS, US.settings.get('autosync', {}));
      const save = () => US.settings.set('autosync', S);
      const picker = ui.sourcePicker({ modes: ['selection', 'bin', 'sequence'], kinds: ['video', 'audio'] });
      const mode = ui.segmented({ options: [{ value: 'sound', label: 'Sound' }, { value: 'timecode', label: 'Timecode' }, { value: 'both', label: 'Both', title: 'Timecode first, sound for the rest' }], value: S.mode, onChange: x => { S.mode = x; save(); } });
      const camSound = ui.segmented({ options: [{ value: 'keep', label: 'Keep' }, { value: 'mute', label: 'Keep, muted' }, { value: 'none', label: 'Leave out' }], value: S.cameraSound, onChange: x => { S.cameraSound = x; save(); } });
      const colour = ui.toggle({ label: 'A colour for each camera', hint: 'Each camera’s and recorder’s clips get their own label colour on the new sequence.', value: !!S.colour, onChange: x => { S.colour = x; save(); } });
      const results = h('div', { dataset: { as: 'results' } });

      function draw(r) {
        US.clear(results);
        if (!r) return;
        const c = r.counts;
        const lanes = h('div.as-lanes');
        for (const row of r.plan.rows) {
          const hex = row.label != null && ui.LABELS[row.label] ? ui.LABELS[row.label].hex : 'var(--info)';
          lanes.appendChild(h('div.as-lane', h('div.as-lane-name', { title: row.name }, US.keep(row.name)),
            h('div.as-lane-strip', row.clips.map(p => { const cl = r.report.find(x => x.key === p.key); const layer = r.plan.layers.find(l => l.key === p.key); const dur = layer ? layer.out - layer['in'] : 1;
              return h('div.as-clip' + (cl && !cl.ok ? '.loose' : ''), { title: cl ? `${cl.name} · ${cl.how}` : '', style: { left: (100 * p.at / r.plan.end) + '%', width: Math.max(0.4, 100 * dur / r.plan.end) + '%', background: hex },
                onclick: () => { if (r.sequence) US.host.call('setPlayhead', { seqId: r.sequence.id, seconds: p.at }).catch(ui.showError); } }); }))));
        }
        const rows = r.report.map(x => ({ title: US.keep(x.name), sub: `${x.device} · ${x.ok ? 'synced ' : 'not synced: '}${x.how}`, color: x.ok ? 'var(--ok)' : 'var(--warn)',
          onClick: r.sequence ? () => { const p = [].concat(...r.plan.rows.map(w => w.clips)).find(q => q.key === x.key); if (p) US.host.call('setPlayhead', { seqId: r.sequence.id, seconds: p.at }).catch(ui.showError); } : null }));
        const drifting = r.report.filter(x => x.drift != null && Math.abs(x.drift) >= 0.03).length;
        results.appendChild(ui.card(h('div.card-title', r.sequence ? h('span', 'Synced: ', US.keep(r.sequence.name)) : 'Nothing to build'),
          ui.stats(ui.stat(`${c.synced} of ${c.clips}`, 'clips lined up'), ui.stat(String(c.cameras), c.cameras === 1 ? 'camera' : 'cameras'), ui.stat(String(c.recorders), c.recorders === 1 ? 'recorder' : 'recorders'), c.groups > 1 ? ui.stat(String(c.groups), 'groups') : null),
          !c.synced ? ui.note(S.mode === 'timecode' ? 'No two cameras or recorders have timecode that overlaps. Try “Sound”.' : 'None of these clips share sound that is clear enough to go by. If the cameras ran on the same timecode, try “Timecode”.', 'warn') : null,
          c.loose && c.synced ? ui.note(`${US.plural(c.loose, 'clip')} couldn’t be placed. ${c.loose === 1 ? 'It is' : 'They are'} at the end of the sequence, after the “Not synced” marker – the list below says why.`, 'warn') : null,
          drifting ? ui.note(`${US.plural(drifting, 'clip')} slowly slip${drifting === 1 ? 's' : ''} out of step (two devices never run at exactly the same speed). The start is in sync; check the end of long takes.`, 'warn') : null,
          r.missing ? ui.note(`${US.plural(r.missing, 'clip')} couldn’t be laid on the sequence. Details are in the log (Settings › Help).`, 'warn') : null,
          c.skipped ? h('div.field-hint', `${US.plural(c.skipped, 'item')} left out (stills, titles, nested sequences, offline or speed-changed clips).`) : null,
          c.synced ? lanes : null,
          r.sequence ? h('div.row', ui.button('Open the synced sequence', { small: true, onClick: () => US.host.call('openSequence', { seqId: r.sequence.id }).catch(ui.showError) })) : null,
          ui.section('What happened to each clip', [ui.list(rows)], { open: !!c.loose || !c.synced }),
          r.sequence ? ui.section('To switch between the cameras', [h('div.field-hint', US.app.is('resolve')
            ? 'In the Media Pool, right-click the synced timeline › Convert Timeline to Multicam Clip. Then edit that clip into a new timeline and switch angles in the multicam viewer.'
            : 'In the Project panel, right-click the synced sequence › New Sequence From Clip. On that new sequence, right-click the clip › Multi-Camera › Enable, then switch angles in the Program Monitor’s multi-camera view.')], { open: false }) : null));
      }
      const go = ui.actionButton('Sync into a new sequence', () => US.jobs.run({ title: 'Lining up cameras and sound', tool: 'autosync' }, async job => {
        const src = await picker.resolve(job);
        const r = await run(job, src, S);
        last = r; draw(r);
        return r;
      }), { icon: 'autosync' });
      v.body.append(
        h('div', { dataset: { as: 'source' } }, ui.card(picker.el, h('div.field-hint', 'Every camera and recorder that was running. From a sequence: one camera per video track, one recorder per audio track.'))),
        ui.card(h('div', { dataset: { as: 'mode' } }, ui.field('Match by', mode, 'Sound: the cameras’ own microphones are enough. Timecode: only for cameras and recorders set to the same clock.')),
          ui.section('The new sequence', [ui.field('The cameras’ own sound', camSound, 'Recorders always keep theirs. “Leave out” puts only the recorders’ sound on the sequence.'), colour], { open: false, hint: 'Camera sound, colours' })),
        go, h('div.field-hint', 'Your clips and sequences aren’t changed: the result is a new sequence in “JMG Ultra Studio › Auto Sync”.'),
        results);
      if (US.bus && US.bus.on) US.bus.on('autosync:done', () => draw(last));
      return { el: v.el, onShow() { picker.refresh(); if (last) draw(last); } };
    }
  });

  US.autoSync = { RATE, MIN_SCORE, MIN_RATIO, MIN_SIG, accepts, DEFAULTS, BIN, fingerprint, pack, unpack, znorm, composite, match, lagNear, drift, solve, devicesFromItems, fromItems, fromSequence, layout, report, run, matchAsk, io, WHY };
})();
