/* JMG Ultra Studio – Story › Interviews: tell the voices apart. Premiere's transcripts don't say who speaks, so each line
   gets a voice print from its own sound, on this computer (nothing is sent anywhere): the shape of the voice (MFCCs –
   mean and spread over the line's speech) and its pitch. Lines are grouped into voices per interview, the same voice is
   found again across interviews, and the editor names each voice once (“Ruth”) – every line of it follows. The maths is
   pure and unit-tested; reading the sound and changing Story's speakers is below. */
(function () {
  'use strict';
  const US = window.US;
  const S = () => US.story, D = () => US.dsp;
  if (US.addIcon) US.addIcon('voices', 'M3 8.5v3M6 6v8M9 8v4M12 4v12M15 7v6M18 9v2');

  /* ---------- a line's voice print ---------- */
  const SR = 16000, N = 512, HOP = 160, MELS = 26, CEPS = 12, F0_MIN = 70, F0_MAX = 400;
  let melBank = null, dctM = null;
  function tables() {
    if (melBank) return;
    const mel = f => 2595 * Math.log10(1 + f / 700), hz = m => 700 * (10 ** (m / 2595) - 1);
    const lo = mel(100), hi = mel(7600), pts = [];
    for (let i = 0; i < MELS + 2; i++) pts.push(Math.floor((N + 1) * hz(lo + (hi - lo) * i / (MELS + 1)) / SR));
    melBank = [];
    for (let m = 1; m <= MELS; m++) {
      const w = new Float64Array(N / 2 + 1);
      for (let k = pts[m - 1]; k < pts[m]; k++) w[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]);
      for (let k = pts[m]; k <= pts[m + 1]; k++) w[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]);
      melBank.push(w);
    }
    dctM = [];
    for (let c = 1; c <= CEPS; c++) { const r = new Float64Array(MELS); for (let m = 0; m < MELS; m++) r[m] = Math.cos(Math.PI * c * (m + 0.5) / MELS); dctM.push(r); }
  }

  /**
   * The sound of a stretch (from..to seconds of 16 kHz mono data) -> its statistics, kept so the interview's own average
   * can be taken off later: {n (speech frames), sum[12], sq[12], f0: [log pitch of voiced frames]} or null (no speech).
   * Only frames within 30 dB of the loudest count – pauses and breaths are left out.
   */
  function stats(data, from, to) {
    tables();
    const a = Math.max(0, Math.floor(from * SR)), b = Math.min(data.length, Math.floor(to * SR));
    if (b - a < N) return null;
    const win = D().hann(N), re = new Float64Array(N), im = new Float64Array(N), frames = [];
    for (let s = a; s + N <= b; s += HOP) {
      let e = 0;
      for (let i = 0; i < N; i++) { const v = data[s + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      D().fft(re, im);
      const pw = new Float64Array(N / 2 + 1);
      for (let k = 0; k <= N / 2; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      frames.push({ e: 10 * Math.log10(e / N + 1e-12), pw });
    }
    if (!frames.length) return null;
    const top = Math.max(...frames.map(f => f.e)), sum = new Float64Array(CEPS), sq = new Float64Array(CEPS), f0 = [];
    let n = 0;
    const lm = new Float64Array(MELS);
    frames.forEach((f, idx) => {
      if (f.e < top - 30 || f.e < -70) return;
      for (let m = 0; m < MELS; m++) { let t = 0; const w = melBank[m]; for (let k = 0; k <= N / 2; k++) t += w[k] * f.pw[k]; lm[m] = Math.log(t + 1e-10); }
      for (let c = 0; c < CEPS; c++) { let t = 0; const r = dctM[c]; for (let m = 0; m < MELS; m++) t += r[m] * lm[m]; sum[c] += t; sq[c] += t * t; }
      n++;
      if (idx % 2 === 0) { const p = pitch(f.pw); if (p) f0.push(Math.log(p)); }
    });
    return n ? { n, sum: Array.from(sum), sq: Array.from(sq), f0 } : null;
  }
  /** Pitch of one frame from its power spectrum (autocorrelation = inverse FFT of the power) -> Hz, or 0 when unvoiced. */
  function pitch(pw) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k <= N / 2; k++) { re[k] = pw[k]; if (k && k < N / 2) re[N - k] = pw[k]; }
    D().fft(re, im); // a real, even spectrum: the forward transform gives the autocorrelation (times N)
    const r0 = re[0];
    if (!(r0 > 0)) return 0;
    const lo = Math.floor(SR / F0_MAX), hi = Math.min(N / 2, Math.ceil(SR / F0_MIN));
    let best = 0, lag = 0;
    for (let l = lo; l <= hi; l++) { const v = re[l] / r0; if (v > best) { best = v; lag = l; } }
    return best > 0.45 ? SR / lag : 0;
  }
  const median = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const MIN_FRAMES = 80; // ~0.8 s of speech: shorter lines are told by their neighbours
  /**
   * One interview's line statistics -> voice prints: {lineId: [12 means less the interview's average, 12 spreads, pitch]}.
   * Taking the interview's average off cancels the mic and room, so the same person matches across interviews.
   */
  function prints(lineStats) {
    const ids = Object.keys(lineStats).filter(id => lineStats[id] && lineStats[id].n >= 8);
    if (!ids.length) return {};
    const tot = new Float64Array(CEPS);
    let n = 0;
    for (const id of ids) { const s = lineStats[id]; for (let c = 0; c < CEPS; c++) tot[c] += s.sum[c]; n += s.n; }
    const avg = Array.from(tot, t => t / n), out = {};
    for (const id of ids) {
      const s = lineStats[id], mu = s.sum.map(x => x / s.n), sd = s.sq.map((x, c) => Math.sqrt(Math.max(0, x / s.n - mu[c] * mu[c])));
      const p = median(s.f0);
      out[id] = { v: mu.map((m, c) => m - avg[c]).concat(sd, [isFinite(p) ? p : NaN]), n: s.n };
    }
    return out;
  }

  /* ---------- grouping prints into voices ---------- */
  const PITCH_WEIGHT = 3;
  /** Scale every dimension the same (mean 0, spread 1 over these prints; a missing pitch becomes the average). -> {mu, sd} */
  function scaler(vs) {
    const d = vs[0].length, mu = new Array(d).fill(0), sd = new Array(d).fill(0), cnt = new Array(d).fill(0);
    for (const v of vs) v.forEach((x, i) => { if (isFinite(x)) { mu[i] += x; cnt[i]++; } });
    mu.forEach((x, i) => { mu[i] = cnt[i] ? x / cnt[i] : 0; });
    for (const v of vs) v.forEach((x, i) => { if (isFinite(x)) sd[i] += (x - mu[i]) ** 2; });
    sd.forEach((x, i) => { sd[i] = Math.sqrt(x / Math.max(1, cnt[i])) || 1; });
    return { mu, sd };
  }
  /** A print scaled and made unit length, so distances compare the shape of the voice, not how much was said. */
  function scaled(v, { mu, sd }) {
    const d = v.length, out = new Array(d);
    for (let i = 0; i < d; i++) out[i] = (isFinite(v[i]) ? (v[i] - mu[i]) / sd[i] : 0) * (i === d - 1 ? PITCH_WEIGHT : 1);
    const len = Math.sqrt(out.reduce((t, x) => t + x * x, 0)) || 1;
    return out.map(x => x / len);
  }
  const dist = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += (a[i] - b[i]) ** 2; return Math.sqrt(t); };
  function centroid(vs, ws) {
    const c = new Array(vs[0].length).fill(0); let W = 0;
    vs.forEach((v, j) => { const w = ws ? ws[j] : 1; W += w; v.forEach((x, i) => { c[i] += x * w; }); });
    const m = c.map(x => x / (W || 1)), len = Math.sqrt(m.reduce((t, x) => t + x * x, 0)) || 1;
    return m.map(x => x / len);
  }
  /** k-means from the most spread-out starting points, tried from a few first points (deterministic). -> {labels, centres} */
  function kmeans(vs, k, ws) {
    let best = null;
    const starts = Array.from(new Set([0, Math.floor(vs.length / 3), Math.floor(vs.length * 2 / 3), vs.length - 1]));
    for (const s0 of starts) {
      const centres = [vs[s0]];
      while (centres.length < k) { let far = -1, at = 0; vs.forEach((v, i) => { const d = Math.min(...centres.map(c => dist(v, c))); if (d > far) { far = d; at = i; } }); centres.push(vs[at]); }
      let labels = new Array(vs.length).fill(-1);
      for (let it = 0; it < 30; it++) {
        const next = vs.map(v => { let b = 0, bd = Infinity; centres.forEach((c, j) => { const d = dist(v, c); if (d < bd) { bd = d; b = j; } }); return b; });
        const same = next.every((x, i) => x === labels[i]);
        labels = next;
        for (let j = 0; j < k; j++) { const idx = vs.map((_, i) => i).filter(i => labels[i] === j); if (idx.length) centres[j] = centroid(idx.map(i => vs[i]), ws && idx.map(i => ws[i])); }
        if (same) break;
      }
      const cost = vs.reduce((t, v, i) => t + dist(v, centres[labels[i]]) ** 2 * (ws ? ws[i] : 1), 0);
      if (!best || cost < best.cost - 1e-9) best = { labels, centres: centres.slice(), cost };
    }
    return { labels: best.labels, centres: best.centres };
  }
  /** How well the groups stand apart: mean silhouette (−1..1). */
  function silhouette(vs, labels, k) {
    if (k < 2) return 0;
    let t = 0;
    vs.forEach((v, i) => {
      const per = new Array(k).fill(0), cnt = new Array(k).fill(0);
      vs.forEach((u, j) => { if (j !== i) { per[labels[j]] += dist(v, u); cnt[labels[j]]++; } });
      const own = cnt[labels[i]] ? per[labels[i]] / cnt[labels[i]] : 0;
      const other = Math.min(...per.map((p, j) => (j === labels[i] || !cnt[j] ? Infinity : p / cnt[j])));
      t += cnt[labels[i]] && isFinite(other) ? (other - own) / Math.max(own, other) : 0;
    });
    return t / vs.length;
  }
  /**
   * Do these groups really belong to different people? Scaling an interview to itself makes one person's small changes
   * look big, and on lines of a few seconds what's being said moves the voice's shape about as much as who says it.
   * So each pair of groups must differ in pitch by 2 semitones or more, or differ clearly in the shape of the voice
   * (≥ 0.8 of the spread among one group's lines, and ≥ 4 in all) and also be the one asking against the one
   * answering. (Measured on test voices: different people 8–16 apart, one person's halves 3–14 – shape alone can't tell.)
   */
  function apart(raws, labels, k, qs) {
    const groups = Array.from({ length: k }, (_, j) => raws.map((v, i) => i).filter(i => labels[i] === j));
    const mean = g => { const c = new Array(CEPS).fill(0), f = []; g.forEach(i => { const v = raws[i]; for (let d = 0; d < CEPS; d++) c[d] += v[d] / g.length; if (isFinite(v[v.length - 1])) f.push(v[v.length - 1]); }); return { c, f0: median(f), q: qs ? g.filter(i => qs[i]).length / g.length : 0 }; };
    const spread = (g, m) => Math.sqrt(g.reduce((t, i) => t + raws[i].slice(0, CEPS).reduce((u, x, d) => u + (x - m.c[d]) ** 2, 0), 0) / g.length);
    const ms = groups.map(mean), sp = groups.map((g, j) => spread(g, ms[j]));
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const semis = isFinite(ms[a].f0) && isFinite(ms[b].f0) ? 12 * Math.abs(ms[a].f0 - ms[b].f0) / Math.LN2 : 0;
      const d = Math.sqrt(ms[a].c.reduce((t, x, i) => t + (x - ms[b].c[i]) ** 2, 0)), shape = d / (Math.sqrt((sp[a] ** 2 + sp[b] ** 2) / 2) || 1);
      const asks = Math.abs(ms[a].q - ms[b].q) >= 0.5;
      if (semis < 2 && !(shape >= 0.8 && d >= 4 && asks)) return false;
    }
    return true;
  }
  const SPLIT = 0.12; // the groups must stand apart at least this well, or it's one voice
  /**
   * One interview's prints (scaled) -> its voices: [{centre, ids}] (2–4 voices when they stand apart, else 1).
   * Each voice must hold at least 4% of the speech, so a cough or a laugh doesn't become a person.
   */
  function voicesIn(ps, maxVoices = 4) {
    const ids = Object.keys(ps).filter(id => ps[id].n >= MIN_FRAMES);
    if (ids.length < 4) return ids.length ? [{ centre: centroid(ids.map(id => ps[id].s)), ids }] : [];
    const vs = ids.map(id => ps[id].s), ws = ids.map(id => ps[id].n), all = ws.reduce((a, b) => a + b, 0);
    let best = { k: 1, score: SPLIT, labels: new Array(ids.length).fill(0), centres: [centroid(vs, ws)] };
    for (let k = 2; k <= Math.min(maxVoices, ids.length - 1); k++) {
      const r = kmeans(vs, k, ws);
      const share = Array.from({ length: k }, (_, j) => r.labels.reduce((t, l, i) => t + (l === j ? ws[i] : 0), 0) / all);
      if (share.some(x => x < 0.04) || !apart(ids.map(id => ps[id].raw), r.labels, k, ids.map(id => !!ps[id].q))) continue;
      const sc = silhouette(vs, r.labels, k) - (k - 2) * 0.03; // a little against more voices than needed
      if (sc > best.score) best = { k, score: sc, labels: r.labels, centres: r.centres };
    }
    return best.centres.map((c, j) => ({ centre: c, ids: ids.filter((_, i) => best.labels[i] === j) })).filter(v => v.ids.length);
  }
  /** The nearest voice for every print (short lines too). -> {lineId: {voice index, sure 0..1}} */
  function assign(ps, centres) {
    const out = {};
    for (const id of Object.keys(ps)) {
      const ds = centres.map(c => dist(ps[id].s, c)), order = ds.map((d, j) => j).sort((a, b) => ds[a] - ds[b]);
      const sure = centres.length < 2 ? 1 : Math.max(0, Math.min(1, (ds[order[1]] - ds[order[0]]) / (ds[order[1]] || 1) * 2));
      out[id] = { voice: order[0], sure: ps[id].n >= MIN_FRAMES ? sure : sure * 0.6 };
    }
    return out;
  }
  const SAME = 0.55; // voices from different interviews this close are taken to be the same person
  /**
   * Voices from all interviews -> people: [{centre, members: [{iv, j}]}]. The closest pairs are joined first; two voices
   * of the same interview are never joined (they were told apart there).
   */
  function across(perInterview, same = SAME) {
    let groups = [];
    perInterview.forEach((vs, iv) => vs.forEach((v, j) => groups.push({ centre: v.centre, members: [{ iv, j }], w: v.ids.length, asks: !!v.asks })));
    // the one asking the questions is the same interviewer in every interview
    const askers = groups.filter(g => g.asks);
    if (askers.length > 1) groups = groups.filter(g => !g.asks).concat([{ centre: centroid(askers.map(g => g.centre), askers.map(g => g.w)), members: askers.flatMap(g => g.members), w: askers.reduce((t, g) => t + g.w, 0), asks: true }]);
    for (;;) {
      let bi = -1, bj = -1, bd = same;
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i], B = groups[j];
        if (A.members.some(a => B.members.some(b => b.iv === a.iv))) continue;
        const d = dist(A.centre, B.centre);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      if (bi < 0) break;
      const A = groups[bi], B = groups[bj];
      groups[bi] = { centre: centroid([A.centre, B.centre], [A.w, B.w]), members: A.members.concat(B.members), w: A.w + B.w, asks: A.asks || B.asks };
      groups.splice(bj, 1);
    }
    return groups.sort((a, b) => b.members.length - a.members.length || b.w - a.w);
  }
  /**
   * Which voice is the interviewer: the one asking questions – in the most interviews, with the most question lines.
   * lines: [{voice, text}] -> voice key or null.
   */
  function interviewer(lines, isQuestion) {
    const by = new Map();
    for (const l of lines) { const v = by.get(l.voice) || { q: 0, n: 0 }; v.n++; if (isQuestion(l.text)) v.q++; by.set(l.voice, v); }
    let best = null, bs = 0.25;
    for (const [k, v] of by) { const s = v.q / v.n; if (v.n >= 3 && s > bs) { bs = s; best = k; } }
    return best;
  }

  /**
   * The whole step, pure: per interview {key, prints: {lineId: {v, n}}, questions?: {lineId: true}} ->
   * {voices: [{key, centre, interviews}], lines: {lineId: {voice, sure}}, scale, interviewer}.
   * Voices are told apart within each interview, scaled to that interview (the room is the same, so small differences
   * count). Across interviews the room changes the sound about as much as a different person does, so only voices
   * that are very close are joined – and the one asking the questions in each interview is the interviewer, joined
   * by that. old: an earlier result's voices, so a voice keeps its key (and its name).
   */
  function solve(interviews, { old = [], same = SAME } = {}) {
    const flat = [];
    interviews.forEach(t => Object.values(t.prints).forEach(p => flat.push(p.v)));
    if (!flat.length) return { voices: [], lines: {}, scale: null, interviewer: null };
    const sc = scaler(flat);
    const found = interviews.map(t => {
      const own = Object.values(t.prints).map(p => p.v), sc1 = own.length > 3 ? scaler(own) : sc, ps = {};
      for (const [id, p] of Object.entries(t.prints)) ps[id] = { s: scaled(p.v, sc1), g: scaled(p.v, sc), n: p.n, raw: p.v, q: !!(t.questions && t.questions[id]) };
      const vs = voicesIn(ps);
      // each voice's place among all interviews, and how much of it is questions
      vs.forEach(v => {
        v.g = centroid(v.ids.map(id => ps[id].g), v.ids.map(id => ps[id].n));
        v.q = v.ids.filter(id => t.questions && t.questions[id]).length / v.ids.length;
      });
      const asker = vs.length > 1 ? vs.slice().sort((x, y) => y.q - x.q)[0] : null;
      if (asker && asker.q >= 0.3) asker.asks = true;
      return { ps, vs };
    });
    const people = across(found.map(f => f.vs.map(v => ({ centre: v.g, ids: v.ids, asks: v.asks }))), same);
    const used = new Set();
    let next = Math.max(0, ...old.map(v => +(/(\d+)$/.exec(v.key) || [0, 0])[1])) + 1;
    const voices = people.map(p => {
      const near = old.filter(o => !used.has(o.key) && o.centre && o.centre.length === p.centre.length && !!o.asks === !!p.asks).map(o => ({ o, d: dist(o.centre, p.centre) })).sort((a, b) => a.d - b.d)[0];
      const key = near && (near.d < same || (p.asks && near.o.asks)) ? near.o.key : `Voice ${next++}`;
      used.add(key);
      return { key, centre: p.centre, asks: !!p.asks, interviews: Array.from(new Set(p.members.map(m => interviews[m.iv].key))), members: p.members };
    });
    const lines = {};
    found.forEach((f, iv) => {
      const mine = voices.map(v => ({ v, m: v.members.find(m => m.iv === iv) })).filter(x => x.m);
      if (!mine.length) return;
      const got = assign(f.ps, mine.map(x => f.vs[x.m.j].centre));
      for (const [id, a] of Object.entries(got)) lines[id] = { voice: mine[a.voice].v.key, sure: Math.round(a.sure * 100) / 100 };
    });
    const ask = voices.find(v => v.asks);
    return { voices: voices.map(v => ({ key: v.key, asks: v.asks, centre: v.centre.map(x => Math.round(x * 1e4) / 1e4), interviews: v.interviews })), lines, scale: sc, interviewer: ask ? ask.key : null };
  }
  /** Voices of other interviews that sound like this one, closest first: [{key, d}] (for “Same person?”). */
  function soundsLike(voices, key, max = 3) {
    const me = voices.find(v => v.key === key);
    if (!me || !me.centre) return [];
    return voices.filter(v => v !== me && v.centre && v.centre.length === me.centre.length && !v.interviews.some(k => me.interviews.includes(k)))
      .map(v => ({ key: v.key, d: Math.round(dist(v.centre, me.centre) * 100) / 100 })).sort((a, b) => a.d - b.d).slice(0, max);
  }

  /* ---------- in the panel: read the sound, then change Story's speakers ---------- */
  function cachePath(t, item) {
    const path = require('path');
    return path.join(US.fsx.cacheDir ? US.fsx.cacheDir() : US.fsx.tempDir(), `voices-${US.fsx.hash((item.path || item.id) + '|' + US.fsx.mediaKey(item.path || '') + '|' + t.lines.length + '|' + (t.lines[0] && t.lines[0].id) + '|v1')}.json`);
  }
  /** Line statistics for one interview, from the cache or by reading its sound. */
  async function statsFor(job, t, item) {
    const fs = require('fs'), file = cachePath(t, item);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* not read yet */ }
    const a = await US.audio.forItem(item, { job, targetRate: SR });
    const off = a.offset || 0, out = {};
    job.set({ who: 'computer', msg: `Listening to the voices in ${t.name}` });
    for (let i = 0; i < t.lines.length; i++) {
      const l = t.lines[i];
      out[l.id] = stats(a.data, l.start - off, l.end - off);
      if (i % 40 === 39) { job.check(); await new Promise(r => setTimeout(r, 0)); }
    }
    try { fs.writeFileSync(file, JSON.stringify(out)); } catch (e) { /* the cache is a convenience */ }
    return out;
  }
  const isQuestion = text => /\?\s*["”')]*\s*$/.test(String(text || '')) || (US.transcript && !!US.transcript.askedQuestion(text));

  /**
   * Listen to every linked interview and give each line its voice. The lines' old speakers are kept (undo puts them
   * back); voice names the editor gave earlier stay with their voices. -> {voices, summary}
   */
  async function listen(job, { keys = null } = {}) {
    S().loadState();
    const st = S().state(), ts = st.transcripts.filter(t => (t.lines || []).length && (!keys || keys.includes(t.key)));
    if (!ts.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts yet.', action: 'Read or import them in Story › 1 Interviews first.' });
    const ids = await S().resolveItems(ts), clips = await US.host.call('storyClips', {}).catch(() => []), byId = new Map((clips || []).map(c => [c.id, c]));
    const got = [], skipped = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i], id = ids.get(t.key);
      job.check(); job.progress(i / ts.length);
      if (!id) { skipped.push(t.name); continue; }
      job.set({ who: 'computer', msg: `Listening to ${t.name} (${i + 1} of ${ts.length})` });
      const questions = {};
      for (const l of t.lines) if (isQuestion(l.text)) questions[l.id] = true;
      try { got.push({ key: t.key, t, questions, prints: prints(await statsFor(job, t, Object.assign({ id, name: t.name, path: t.path }, byId.get(id) || {}))) }); }
      catch (e) { if (e && e.code === 'CANCELLED') throw e; skipped.push(t.name); US.log('warn', `Voices: couldn’t read the sound of ${t.name}`, String(e && (e.title || e.message)), 'story'); }
    }
    if (!got.length) throw new US.UserError('NOT_FOUND', { title: 'Couldn’t hear any of the interviews.', action: 'Link each transcript to its clip in Story › 1 Interviews › Interviews and speakers, then try again.', detail: skipped.join(', ') });
    const prev = st.voiceID || {}, res = solve(got, { old: prev.voices || [] });
    apply(st, got.map(g => g.t), res);
    const ask = res.interviewer;
    st.voiceID = { at: Date.now(), voices: res.voices, scale: res.scale, interviewer: ask, skipped };
    if (ask && st.speakers[ask] && st.speakers[ask].name === ask) st.speakers[ask].name = 'Interviewer';
    S().reindex(); S().save();
    const n = res.voices.length;
    return { voices: res.voices, summary: `${US.plural(n, 'voice')} in ${US.plural(got.length, 'interview')}${skipped.length ? ` · ${skipped.length} not heard` : ''}` };
  }
  /** Give the lines their voices (keeping what they had before, once) and make sure each voice has a speaker entry. */
  function apply(st, ts, res) {
    for (const t of ts) for (const l of t.lines) {
      const a = res.lines[l.id];
      if (!a) continue;
      if (!('speakerWas' in l)) l.speakerWas = l.speaker || '';
      l.speaker = a.voice; l.voiceSure = a.sure;
    }
    st.speakers = st.speakers || {};
    res.voices.forEach((v, i) => { if (!st.speakers[v.key]) st.speakers[v.key] = { name: v.key, color: (Object.keys(st.speakers).length + i) % 8 }; });
  }
  /** Put every line's speaker back as it was before voices were told apart. */
  function undo() {
    S().loadState();
    const st = S().state();
    let n = 0;
    for (const t of st.transcripts) for (const l of t.lines || []) if ('speakerWas' in l) { l.speaker = l.speakerWas; delete l.speakerWas; delete l.voiceSure; n++; }
    for (const v of (st.voiceID && st.voiceID.voices) || []) delete st.speakers[v.key];
    delete st.voiceID;
    S().reindex(); S().save();
    return n;
  }
  /** Two voices are the same person: move every line of `from` to `to`. */
  function merge(from, to) {
    const st = S().state();
    if (from === to) return 0;
    let n = 0;
    for (const t of st.transcripts) for (const l of t.lines || []) if (l.speaker === from) { l.speaker = to; n++; }
    if (st.voiceID) {
      const vs = st.voiceID.voices, a = vs.find(v => v.key === from), b = vs.find(v => v.key === to);
      if (a && b) { b.interviews = Array.from(new Set(b.interviews.concat(a.interviews))); st.voiceID.voices = vs.filter(v => v !== a); }
      if (st.voiceID.interviewer === from) st.voiceID.interviewer = to;
    }
    delete st.speakers[from];
    S().reindex(); S().save();
    return n;
  }
  /** One line said by someone else: give it that voice. */
  function setLine(lineId, voice) {
    const l = S().lineOf(lineId);
    if (!l) return false;
    if (!('speakerWas' in l)) l.speakerWas = l.speaker || '';
    l.speaker = voice; l.voiceSure = 1;
    S().reindex(); S().save();
    return true;
  }
  /** A clear line of each voice to hear it by (long and sure), per voice key. */
  function samples(st) {
    const out = {};
    for (const t of st.transcripts) for (const l of t.lines || []) {
      if (!l.speaker || !('speakerWas' in l)) continue;
      const len = l.end - l.start, s = (l.voiceSure == null ? 0.5 : l.voiceSure) * Math.min(len, 12);
      const cur = out[l.speaker];
      if (!cur || s > cur.s) out[l.speaker] = { s, line: l, t };
    }
    return out;
  }

  /* ---------- the card in Story › 1 Interviews › Interviews and speakers ---------- */
  /**
   * The button that tells voices apart and, once it has, every voice: its name, a line to hear it by, how many lines,
   * “Same person as…” and Undo. o: {render, speakerColor, speakerName, list (Story's own speaker list, shown before)}.
   */
  function card({ render, speakerColor, speakerName, list }) {
    const h = US.h, ui = US.ui, st = S().state(), vid = st.voiceID;
    const go = () => US.jobs.run({ title: 'Telling the voices apart', tool: 'story' }, job => listen(job)).then(r => { if (r) { ui.toast({ type: 'ok', title: r.summary, text: 'Name each voice once – every line of it follows.', timeout: 4000 }); render(); } });
    const how = h('div.field-hint', 'Listens to each interview on this computer and gives every line its voice – nothing is sent anywhere. The first time takes about a minute per hour of interview; after that it’s instant.');
    if (!vid) return h('div.story-voices', list, h('div.row', { style: { marginTop: '8px' } }, ui.button('Tell the voices apart', { small: true, kind: 'secondary', icon: 'voices', onClick: go })), how);
    const count = new Map(), lowSure = new Map();
    for (const t of st.transcripts) for (const l of t.lines || []) { count.set(l.speaker, (count.get(l.speaker) || 0) + 1); if (l.voiceSure != null && l.voiceSure < 0.25) lowSure.set(l.speaker, (lowSure.get(l.speaker) || 0) + 1); }
    const vs = vid.voices.filter(v => count.get(v.key)), smp = samples(st), others = v => vs.filter(x => x.key !== v.key);
    const ivName = k => { const i = st.transcripts.findIndex(t => t.key === k); return i < 0 ? '' : st.transcripts[i].name; };
    const rows = vs.map(v => {
      const sm = smp[v.key], like = soundsLike(vs, v.key, 1)[0];
      const sel = ui.select({ options: [{ value: '', label: 'Same person as…' }].concat(others(v).map(o => ({ value: o.key, label: speakerName(o.key) }))), value: '', onChange: to => {
        if (!to) return;
        const n = merge(v.key, to);
        ui.toast({ type: 'ok', title: `${US.plural(n, 'line')} now ${speakerName(to)}`, timeout: 2500 }); render();
      } });
      return h('div.story-voice',
        h('div.row', h('span.swatch', { style: { background: speakerColor(v.key) } }),
          h('div.grow', ui.input({ value: speakerName(v.key), placeholder: v.key, onInput: val => { st.speakers[v.key].name = val.trim() || v.key; S().save(); } })),
          sm ? h('button.icon-btn', { title: `Hear ${speakerName(v.key)}: “${String(sm.line.text).slice(0, 80)}”`, onclick: async () => { try { await S().cueLine(sm.line); } catch (e) { ui.showError(e); } } }, US.icon('play', 15)) : null),
        h('div.row.story-voice-sub', h('span.field-hint.grow', `${v.asks ? 'Asks the questions · ' : ''}${US.plural(count.get(v.key) || 0, 'line')} · ${v.interviews.length > 2 ? US.plural(v.interviews.length, 'interview') : v.interviews.map(ivName).join(', ')}${lowSure.get(v.key) ? ` · ${lowSure.get(v.key)} unsure` : ''}`),
          like && like.d < 0.9 && !v.asks ? ui.button(`Same as ${speakerName(like.key)}?`, { small: true, kind: 'ghost', title: 'They sound alike, in different interviews', onClick: () => { merge(like.key, v.key); render(); } }) : null,
          sel));
    });
    return h('div.story-voices',
      h('div.field-hint', `${US.plural(vs.length, 'voice')} heard – name each one once and every line of it follows. Two voices that are the same person: choose “Same person as…”.`),
      ...rows,
      vid.skipped && vid.skipped.length ? ui.note(`Not heard (not linked to a clip, or the sound couldn’t be read): ${vid.skipped.join(', ')}`, 'warn') : null,
      h('div.row', { style: { marginTop: '8px' } },
        ui.button('Listen again', { small: true, kind: 'ghost', icon: 'refresh', title: 'For new interviews – names you gave stay with their voices', onClick: go }),
        ui.button('Put the speakers back', { small: true, kind: 'ghost', title: 'Every line gets the speaker it had before', onClick: () => { undo(); render(); } })));
  }

  if (US.actions) US.actions.register({
    id: 'story.voices', tool: 'story', title: 'Tell the voices apart', changes: false,
    describe: 'Listens to every interview on this computer and gives each line its speaker by voice (the interviewer is found by the questions). Nothing is sent anywhere. Then name each voice once in Story › 1 Interviews › Interviews and speakers.',
    params: {},
    examples: ['tell the voices apart', 'who is speaking in each line', 'identify the speakers', 'separate the interviewer from the interviewee'],
    match: t => (/\b(tell (the )?(voices|speakers) apart|identify (the )?(speakers|voices)|who'?s (speaking|talking)|who is (speaking|talking)|speaker (id|identification|detection|labels?)|label (the )?speakers|separate (the )?(speakers|voices|interviewer))\b/i.test(t) ? { _score: 3 } : null),
    run: async (p, job) => { const r = await listen(job); S().open('transcripts'); return { summary: r.summary }; }
  });

  US.storyVoices = { card, stats, pitch, prints, scaler, scaled, kmeans, silhouette, voicesIn, assign, across, interviewer, solve, soundsLike, listen, apply, undo, merge, setLine, samples, isQuestion, SR, MIN_FRAMES };
})();
