/* JMG Ultra Studio – Selects: finds the usable moments in any footage (selected clips, a bin, or the clips a sequence
   uses) – by default anything that isn't technically unusable – grades them BEST / GOOD / OK, names shot sizes and camera moves, flags reveals,
   hero shots, 9:16-friendly and slow-mo moments, and turns them into sequences, subclips, bins by type or markers.
   Analysis happens once per clip (cached); changing the footage type or a slider re-grades instantly. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const V = () => US.vision;

  const TIER = {
    BEST: { color: 'var(--tier-best)', label: 5, marker: 0 },     // Forest label / green marker
    GOOD: { color: 'var(--tier-good)', label: 15, marker: 4 },    // Yellow
    OK: { color: 'var(--tier-ok)', label: 9, marker: 6 },         // Blue
    REVEAL: { color: '#a35bd6', label: 8, marker: 2 }             // Purple
  };
  const HERO = { label: 11, marker: 3, color: '#c33ea8' };       // Magenta label, orange marker: not used by the grades
  const labelHex = i => (ui.LABELS.find(l => l.i === i) || {}).hex || '#888';
  const FOOTAGE_ORDER = ['any', 'concert', 'interview', 'wedding', 'travel', 'sports', 'documentary', 'drone', 'phone', 'crowd', 'closeups'];
  const SHOT_NAME = { close: 'Close-up', mid: 'Mid shot', wide: 'Wide shot', unknown: '' };

  /* ---------- settings ---------- */
  const DEFAULTS = { footage: 'any', picky: 'normal', movement: 'smooth', overrides: {}, heroCount: 5, autoCopies: true, attachProxies: false, allTracks: false, anyFirst: true };
  function loadSettings() {
    const saved = US.settings.get('selects.v2', null);
    // 1.2: Selects is genre-independent by default – a footage type chosen before then is replaced once by Any footage
    if (saved && !saved.anyFirst) return Object.assign({}, DEFAULTS, saved, { footage: 'any', overrides: {}, anyFirst: true });
    if (saved) return Object.assign({}, DEFAULTS, saved);
    const old = US.settings.get('selects.settings', null);   // first version: a single "preset"
    const map = { strict: ['concert', 'strict'], loose: ['concert', 'loose'], crowd: ['crowd', 'normal'], closeups: ['closeups', 'normal'] };
    const picky = old && map[old.preset] ? map[old.preset][1] : 'normal';
    return Object.assign({}, DEFAULTS, { picky });
  }

  /* ---------- shared state (the screen and the Assistant use the same results) ---------- */
  const state = {
    clips: [],        // [{item, data}] analysed (for a sequence: one entry per use of a clip)
    failed: [],       // [{item, error, needsCopy}]
    sourceLabel: '',  // "“Concert” bin" / "12 selected clips" / "“Assembly v3” sequence"
    seq: null,        // {id, name} when grading a sequence
    forced: [],
    result: null,
    settings: loadSettings()
  };
  const listeners = new Set();
  const changed = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const saveSettings = () => US.settings.set('selects.v2', state.settings);
  /** The numbers the scorer uses: footage type at a pickiness, plus any fine-tuning. */
  const effective = () => Object.assign(V().settingsFor(state.settings.footage, state.settings.picky), state.settings.overrides, { heroCount: state.settings.heroCount, movement: state.settings.movement || '' });

  function rescore() {
    if (!state.clips.length) { state.result = null; return; }
    state.result = V().score(state.clips, Object.assign(effective(), { forced: state.forced }));
  }

  /* ---------- what to analyse ---------- */
  async function itemsForBinName(name) {
    const bins = await US.host.call('listBins');
    const q = name.toLowerCase().trim();
    const bin = bins.find(b => b.path.toLowerCase() === q) || bins.find(b => b.path.toLowerCase().split(' / ').pop() === q) || bins.find(b => b.path.toLowerCase().includes(q));
    if (!bin) throw new US.UserError('NOT_FOUND', { title: `There’s no bin called “${name}”.`, action: 'Check the bin name in the Project panel, or select the clips and try again.' });
    const items = await US.host.call('binItems', { binId: bin.id, kinds: ['video'], recursive: true });
    if (!items.length) throw new US.UserError('NO_SELECTION', { title: `The “${bin.path}” bin has no video clips.`, action: 'Pick another bin.' });
    return { items, label: `“${bin.path.split(' / ').pop()}” bin` };
  }

  /** Plan for plain clips: analyse each clip once. */
  function planForItems(items, label) {
    return { analysisItems: items, label, seq: null, makeClips: data => items.filter(it => data.has(it.id)).map(it => ({ item: it, data: data.get(it.id) })) };
  }

  /**
   * Plan for a sequence: every camera clip it uses (V1, or all video tracks) is analysed once over the stretch the
   * sequence uses; each use is then graded on its own and its selects point back at the source clip.
   */
  async function planForSequence(seqId, job) {
    job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const r = await US.host.call('selectsSequenceUses', { seqId, allTracks: !!state.settings.allTracks });
    const sk = r.skipped, skippedText = Object.entries(sk).filter(([, n]) => n).map(([k, n]) => `${n} ${k === 'graphics' ? 'graphics/titles' : k === 'adjustment' ? 'adjustment layers' : k === 'nested' ? 'nested sequences' : k === 'stills' ? 'stills' : 'switched-off clips'}`).join(', ');
    if (!r.uses.length) throw new US.UserError('NOTHING_FOUND', { title: `“${r.name}” has no camera clips on ${state.settings.allTracks ? 'its video tracks' : 'V1'}.`, action: state.settings.allTracks ? 'Pick a sequence with video clips in it.' : 'Tick “All video tracks”, or pick another sequence.', detail: skippedText ? 'Skipped: ' + skippedText : '' });
    const ids = Array.from(new Set(r.uses.map(u => u.itemId)));
    const info = new Map();
    for (let i = 0; i < ids.length; i += 40) {
      job.check();
      job.progress(i / ids.length * 0.05, `Looking up clip ${i + 1} of ${ids.length}`);
      const chunk = ids.slice(i, i + 40), got = await US.host.call('itemsInfo', { ids: chunk });
      chunk.forEach((id, k) => { if (got[k]) info.set(id, got[k]); });
    }
    const usesBy = new Map();
    for (const u of r.uses) { if (!info.has(u.itemId)) continue; const lo = Math.min(u.in, u.out), hi = Math.max(u.in, u.out); (usesBy.get(u.itemId) || usesBy.set(u.itemId, []).get(u.itemId)).push(Object.assign({}, u, { lo, hi })); }
    const analysisItems = [];
    for (const [id, list] of usesBy) analysisItems.push(Object.assign({}, info.get(id), { range: [Math.min(...list.map(u => u.lo)), Math.max(...list.map(u => u.hi))] }));
    const makeClips = data => {
      const out = [];
      for (const [id, list] of usesBy) {
        if (!data.has(id)) continue;
        list.forEach((u, k) => out.push({ item: Object.assign({}, info.get(id), { id: `${id}#${k}`, srcId: id, range: [u.lo, u.hi], seq: { start: u.start, speed: Math.abs(u.speed) || 1, track: u.track } }), data: data.get(id) }));
      }
      return out;
    };
    if (skippedText) US.log('info', `Selects: skipped ${skippedText} in “${r.name}”`, '', 'selects');
    return { analysisItems, label: `“${r.name}” sequence`, seq: { id: seqId, name: r.name }, makeClips, uses: r.uses.length, skippedText };
  }

  /**
   * Analyse a plan (cached per clip), make Media Encoder analysis copies for clips the panel can't decode
   * (if switched on), then grade. Returns {summary}.
   */
  async function runPlan(plan, job) {
    const parallel = US.settings.get('visionParallel', 3);
    const autoCopies = state.settings.autoCopies;
    job.range(0.05, autoCopies ? 0.5 : 1);
    job.set({ who: 'computer', msg: `Looking at ${US.plural(plan.analysisItems.length, 'clip')}` });
    const res = await V().analyseMany(plan.analysisItems, { job, parallel });
    const data = new Map(res.results.map(r => [r.item.id, r.data]));
    let failed = res.failed, copies = null;
    const need = failed.filter(f => f.needsCopy).map(f => f.item);
    if (need.length && autoCopies) {
      job.range(0.5, 0.85);
      job.set({ who: 'encoder', msg: `Making ${US.plural(need.length, 'small analysis copy', 'small analysis copies')} of clips the panel can’t read` });
      copies = await V().makeAnalysisCopies(need, job, { attach: state.settings.attachProxies });
      job.range(0.85, 1);
      const res2 = await V().analyseMany(copies.made, { job, parallel });
      for (const r of res2.results) data.set(r.item.id, r.data);
      const fixed = new Set(res2.results.map(r => r.item.id));
      failed = failed.filter(f => !fixed.has(f.item.id)).concat(res2.failed).concat(copies.failed.filter(f => !failed.some(x => x.item.id === f.item.id)));
    }
    job.range(0, 1);
    state.clips = plan.makeClips(data); state.failed = failed; state.sourceLabel = plan.label; state.seq = plan.seq; state.forced = [];
    rescore();
    const secs = res.seconds, footage = res.footage;
    US.log('info', `Selects analysed ${US.fmtDur(footage)} of footage in ${US.fmtDur(secs)} (${(footage / Math.max(0.1, secs)).toFixed(1)}× real time)${copies ? `; ${copies.made.length} analysis copies made` : ''}`, '', 'selects');
    changed();
    if (!state.result || !state.clips.length) {
      if (failed.length) throw new US.UserError('CANT_DECODE', { title: `None of the ${US.plural(plan.analysisItems.length, 'clip')} could be read.`, action: autoCopies ? 'Check Media Encoder is installed and the clips play in Premiere, then try again.' : 'Switch on “Make analysis copies” (or create H.264 proxies), then try again.', detail: failed.map(f => `${f.item.name}: ${f.error.detail || f.error.title}`).join('\n') });
      throw new US.UserError('NOTHING_FOUND');
    }
    const s = state.result.stats;
    return { summary: `${US.plural(s.kept, 'select')} (${s.best} BEST, ${s.good} GOOD, ${s.ok} OK) from ${US.plural(s.clips, 'clip')}${copies && copies.made.length ? ` · ${copies.made.length} read via analysis copies` : ''}${failed.length ? ` · ${failed.length} couldn’t be read` : ''}` };
  }

  /** "Make analysis copies" button for clips that failed earlier (copies off, or a retry). */
  async function copyFailed(job) {
    const need = state.failed.filter(f => f.needsCopy).map(f => f.item);
    if (!need.length) return { summary: 'Nothing to copy' };
    const copies = await V().makeAnalysisCopies(need, job, { attach: state.settings.attachProxies });
    job.range(0.8, 1);
    const res = await V().analyseMany(copies.made, { job, parallel: US.settings.get('visionParallel', 3) });
    job.range(0, 1);
    const fixed = new Set(res.results.map(r => r.item.id));
    if (state.seq) {
      // sequence uses: rebuild the clip list for the newly readable sources
      for (const r of res.results) for (const c of state.clips) if (c.item.srcId === r.item.id) c.data = r.data;
      const known = new Set(state.clips.map(c => c.item.srcId));
      for (const r of res.results) if (!known.has(r.item.id)) state.clips.push({ item: Object.assign({}, r.item, { srcId: r.item.id, id: r.item.id + '#0' }), data: r.data });
    } else for (const r of res.results) state.clips.push({ item: r.item, data: r.data });
    state.failed = state.failed.filter(f => !fixed.has(f.item.id)).concat(res.failed, copies.failed);
    rescore(); changed();
    return { summary: `${US.plural(res.results.length, 'clip')} now readable${state.failed.length ? `, ${state.failed.length} still not` : ''}` };
  }

  /* ---------- making things in Premiere ---------- */
  function pickTiers(selects, tiers) {
    if (tiers === 'best') return selects.filter(s => s.tier === 'BEST' || (s.flags.reveal && s.tier !== 'OK') || s.flags.hero);
    if (tiers === 'bestgood') return selects.filter(s => s.tier !== 'OK' || s.flags.hero);
    return selects;
  }
  const tierOf = s => (s.flags.reveal ? 'REVEAL' : s.tier);
  const shortShot = s => (s.shot === 'close' ? 'closeup' : s.shot === 'unknown' ? '' : s.shot);

  /**
   * Turn the current selects into Premiere items. o: {sequence, order, perTier, subclips, markers, seqMarkers, labels,
   * tiers, markBest, byType:{groups:[...], sequences}, basePath}. Everything new goes under "<basePath>/<run name>".
   */
  /** The single best frame of a select: sharp, no motion blur, faces if there are any, nothing blown out. -> seconds */
  function bestFrame(data, s) {
    const S = ((data && data.samples) || []).filter(x => x.t >= s.start - 0.01 && x.t <= s.end + 0.01);
    if (!S.length) return (s.start + s.end) / 2;
    const val = x => (x.sh || 0) / (1 + 25 * Math.hypot(x.vx || 0, x.vy || 0)) * (1 + 0.25 * Math.min(2, Math.max(0, x.fc || 0))) * ((x.hi || 0) > 0.08 ? 0.7 : 1);
    return S.reduce((b, x) => (val(x) > val(b) ? x : b)).t;
  }
  const dataFor = clipId => { const c = state.clips.find(x => (x.item.srcId || x.item.id) === clipId); return c && c.data; };

  async function makeOutputs(o, job) {
    if (!state.result) throw new US.UserError('NOTHING_FOUND', { title: 'There are no selects yet.', action: 'Press “Find selects” first.' });
    const heroFirst = !!o.markBest;
    const chosen = V().order(pickTiers(state.result.selects, o.tiers), o.order || 'score', { heroFirst });
    if (!chosen.length) throw new US.UserError('NOTHING_FOUND', { title: 'No selects in the grades you picked.', action: 'Include more grades, or loosen the settings.' });
    const d = new Date();
    const run = `${state.sourceLabel.replace(/[“”"]/g, '').replace(/[\\/:]/g, '-')} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${d.toTimeString().slice(0, 5)}`.trim();
    const base = `${o.basePath || 'JMG Ultra Studio/Selects'}/${run}`;
    const made = [];
    const cats = o.byType && o.byType.groups && o.byType.groups.length ? V().categories(chosen, o.byType.groups, { heroFirst }) : [];
    const stages = [];
    if (o.subclips || o.sequence || o.perTier) stages.push('subclips');
    if (o.sequence) stages.push('sequence');
    if (o.perTier) stages.push('perTier');
    if (cats.length) stages.push('cats');
    if (o.markers) stages.push('markers');
    if (o.seqMarkers && state.seq) stages.push('seqMarkers');
    if (o.labels) stages.push('labels');
    if (o.stills) stages.push('stills');
    let stepN = 0;
    const stage = () => { job.range(stepN / stages.length, (stepN + 1) / stages.length); stepN++; };
    const rankOf = new Map(V().order(chosen, 'score', { heroFirst }).map((s, i) => [s.key, i + 1]));
    const labelFor = (s, fallback) => (o.markBest && s.flags.hero ? HERO.label : fallback);
    const nameFor = (s, rank) => [String(rank).padStart(3, '0'), o.markBest && s.flags.hero ? '★' : null, tierOf(s), shortShot(s) || null, String(s.score)].filter(Boolean).join('_');
    const markName = s => `${o.markBest && s.flags.hero ? '★ ' : ''}${tierOf(s)} ${s.score}${s.moveLabel ? ` · ${s.moveLabel}` : ''}`;
    const markColor = s => (o.markBest && s.flags.hero ? HERO.marker : TIER[tierOf(s)].marker);

    /** subclips for a list into a bin; returns Map key -> subclip id */
    async function subclipsFor(list, binPath, label, what) {
      const ids = new Map();
      for (let i = 0; i < list.length; i += 20) {
        job.check();
        const chunk = list.slice(i, i + 20);
        job.set({ who: 'premiere' }).progress(i / list.length, `${what}: subclips ${i + 1}–${i + chunk.length} of ${list.length}`);
        const got = await US.host.call('createSubclips', { binPath, items: chunk.map(s => ({ id: s.clipId, start: s.start, end: s.end, label: labelFor(s, typeof label === 'function' ? label(s) : label), name: nameFor(s, rankOf.get(s.key)) })) });
        chunk.forEach((s, k) => ids.set(s.key, got[k]));
      }
      return ids;
    }
    async function buildSequence(name, list, ids, binPath) {
      const seq = await US.host.call('newSequence', { name, binPath, likeId: list[0].clipId });
      let cursor = 0; const marks = [];
      for (let i = 0; i < list.length; i += 10) {
        job.check();
        const chunk = list.slice(i, i + 10);
        job.set({ who: 'premiere' }).progress(i / list.length, `${name}: placing ${i + 1}–${i + chunk.length} of ${list.length}`);
        const r = await US.host.call('selectsPlaceWhole', { seqId: seq.id, ids: chunk.map(s => ids.get(s.key)), cursor });
        cursor = r.cursor;
        chunk.forEach((s, k) => { const p = r.placed[k]; if (p) marks.push({ start: p.start, name: markName(s), comment: `${s.clipName} ${US.fmtDur(s.start, true)}–${US.fmtDur(s.end, true)} · ${s.reasons.join(' · ')}`, color: markColor(s) }); });
      }
      for (let i = 0; i < marks.length; i += 50) await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: marks.slice(i, i + 50) });
      return seq;
    }

    // grade subclips (also the building blocks of the colour-coded sequences)
    let gradeIds = new Map();
    if (stages.includes('subclips')) {
      stage();
      const groups = {};
      for (const s of chosen) (groups[tierOf(s)] = groups[tierOf(s)] || []).push(s);
      let done = 0;
      for (const [tier, list] of Object.entries(groups)) {
        job.range((stepN - 1 + done / chosen.length) / stages.length, (stepN - 1 + (done + list.length) / chosen.length) / stages.length);
        const ids = await subclipsFor(list, o.subclips ? `${base}/${tier}` : `${base}/Subclips`, TIER[tier].label, tier);
        for (const [k, v] of ids) gradeIds.set(k, v);
        done += list.length;
      }
      if (o.subclips) made.push(`${US.plural(chosen.length, 'subclip')}`);
    }
    let mainSeq = null;
    if (stages.includes('sequence')) {
      stage();
      const orderName = { score: 'best first', time: 'shooting order', sequence: 'sequence order', shot: 'by shot size', move: 'by camera move', action: 'most action first' }[o.order || 'score'];
      mainSeq = await buildSequence(`Selects – ${run} (${orderName})`, chosen, gradeIds, base);
      made.push(`sequence “${mainSeq.name}”`);
    }
    if (stages.includes('perTier')) {
      stage();
      for (const tier of ['BEST', 'GOOD', 'OK', 'REVEAL']) {
        const list = chosen.filter(s => tierOf(s) === tier);
        if (list.length) { const s = await buildSequence(`Selects ${tier} – ${run}`, V().order(list, o.order || 'score', { heroFirst }), gradeIds, base); made.push(`sequence “${s.name}”`); }
      }
    }
    if (stages.includes('cats')) {
      stage();
      const total = US.sum(cats.map(c => c.selects.length)); let done = 0, nSeq = 0;
      for (const c of cats) {
        job.range((stepN - 1 + done / total) / stages.length, (stepN - 1 + (done + c.selects.length) / total) / stages.length);
        const ids = await subclipsFor(c.selects, `${base}/${c.groupName}/${c.name}`, c.label, c.name);
        if (o.byType.sequences) { await buildSequence(`Selects – ${c.name} – ${run}`, c.selects, ids, `${base}/Sequences`); nSeq++; }
        done += c.selects.length;
      }
      made.push(`${US.plural(cats.length, 'bin')} by type${nSeq ? ` with ${US.plural(nSeq, 'sequence')}` : ''}`);
    }
    const store = US.projectStore(US.ctx.project && US.ctx.project.path);
    if (stages.includes('markers')) {
      stage();
      const byClip = {};
      for (const s of chosen) (byClip[s.clipId] = byClip[s.clipId] || []).push(s);
      const saved = store.get('selects.markers', []);
      const ids = Object.keys(byClip); let n = 0;
      for (let i = 0; i < ids.length; i++) {
        job.check();
        job.set({ who: 'premiere' }).progress(i / ids.length, `Adding markers to clip ${i + 1} of ${ids.length}`);
        const guids = await US.host.call('addClipMarkers', { id: ids[i], markers: byClip[ids[i]].map(s => ({ start: s.start, end: s.end, name: markName(s), comment: s.reasons.join(' · '), color: markColor(s) })) });
        saved.push({ id: ids[i], guids }); n += guids.length;
      }
      store.set('selects.markers', saved); store.flush();
      made.push(`${US.plural(n, 'marker')} on ${US.plural(ids.length, 'source clip')}`);
    }
    if (stages.includes('seqMarkers')) {
      stage();
      const list = chosen.filter(s => s.tl != null).sort((a, b) => a.tl - b.tl);
      const marks = list.map(s => ({ start: s.tl, end: s.tl + s.dur, name: markName(s), comment: `${s.clipName} · ${s.reasons.join(' · ')}`, color: markColor(s) }));
      let guids = [];
      for (let i = 0; i < marks.length; i += 50) { job.progress(i / Math.max(1, marks.length)); guids = guids.concat(await US.host.call('addSequenceMarkers', { seqId: state.seq.id, markers: marks.slice(i, i + 50) })); }
      const saved = store.get('selects.seqMarkers', []); saved.push({ seqId: state.seq.id, guids }); store.set('selects.seqMarkers', saved); store.flush();
      made.push(`${US.plural(guids.length, 'marker')} on “${state.seq.name}”`);
    }
    if (stages.includes('labels')) {
      stage();
      const best = {}, rankT = { REVEAL: 0, BEST: 1, GOOD: 2, OK: 3 };
      for (const s of chosen) { const t = tierOf(s); if (!best[s.clipId] || rankT[t] < rankT[best[s.clipId].t]) best[s.clipId] = { t, hero: (best[s.clipId] && best[s.clipId].hero) || s.flags.hero }; else if (s.flags.hero) best[s.clipId].hero = true; }
      const n = await US.host.call('setLabels', { items: Object.entries(best).map(([id, b]) => ({ id, label: o.markBest && b.hero ? HERO.label : TIER[b.t].label })) });
      made.push(`colour labels on ${US.plural(n, 'clip')}`);
    }
    job.range(0, 1).progress(1);
    if (mainSeq) await US.host.call('openSequence', { seqId: mainSeq.id }).catch(() => {});
    // full-size stills of the best frame in each select (best first)
    let stillsDir = null;
    if (stages.includes('stills')) {
      stage();
      const path = require('path');
      const list = chosen.slice(0, o.stillsMax || 50);
      stillsDir = US.fsx.ensureDir(path.join(US.fsx.exportsDir(), 'Stills', run.replace(/[\\/:*?"<>|]+/g, '-')));
      let n = 0;
      for (let i = 0; i < list.length; i += 10) {
        job.check();
        const chunk = list.slice(i, i + 10);
        job.set({ who: 'premiere' }).progress(i / list.length, `Stills ${i + 1}–${i + chunk.length} of ${list.length}`);
        // Premiere renders to a plain name (QE's frame export may not survive ★, – or accents on Windows), then it's renamed
        const finals = [], stills = chunk.map((s, k) => {
          const t = bestFrame(dataFor(s.clipId), s);
          finals.push(path.join(stillsDir, `${nameFor(s, rankOf.get(s.key))}_${US.basename(s.clipName).replace(/\.[^.]+$/, '')}_${t.toFixed(2)}s.png`.replace(/[\\/:*?"<>|]+/g, '-')));
          return { id: s.clipId, seconds: t, out: path.join(stillsDir, `us-still-${i + k}.png`) };
        });
        const got = await US.host.call('selectsStills', { stills });
        got.forEach((g, k) => { if (g) { try { require('fs').renameSync(g, finals[k]); n++; } catch (e) { n++; } } });
      }
      made.push(`${US.plural(n, 'still')} in Documents › JMG Ultra Studio › Stills`);
    }
    return { summary: `Made ${made.join(', ')}`, sequence: mainSeq, stillsDir, categories: cats.map(c => ({ name: c.name, count: c.selects.length })) };
  }

  async function removeMarkers(job) {
    const store = US.projectStore(US.ctx.project && US.ctx.project.path);
    const saved = store.get('selects.markers', []), seqSaved = store.get('selects.seqMarkers', []);
    if (!saved.length && !seqSaved.length) return { summary: 'No Selects markers to remove' };
    let n = 0; const total = saved.length + seqSaved.length;
    for (let i = 0; i < saved.length; i++) {
      job.progress(i / total, `Clip ${i + 1} of ${saved.length}`);
      try { n += await US.host.call('removeClipMarkers', { id: saved[i].id, guids: saved[i].guids }); } catch (e) { /* clip deleted since: nothing to remove */ }
    }
    for (const s of seqSaved) { try { n += await US.host.call('removeSequenceMarkers', { seqId: s.seqId, guids: s.guids }); } catch (e) { /* sequence deleted */ } }
    store.set('selects.markers', []); store.set('selects.seqMarkers', []); store.flush();
    return { summary: `Removed ${US.plural(n, 'marker')}` };
  }

  /* ---------- actions (the Assistant uses these too) ---------- */
  function footageFromText(t) {
    const pairs = [[/interview|talking head|sit.?down/i, 'interview'], [/wedding|ceremony|reception|event/i, 'wedding'], [/b.?roll|cutaways?|any footage/i, 'any'], [/travel|scenic/i, 'travel'], [/sport|action|match|game/i, 'sports'],
      [/documentary|doc\b/i, 'documentary'], [/drone|aerial/i, 'drone'], [/phone|iphone|mobile/i, 'phone'], [/crowd|audience/i, 'crowd'], [/close.?ups?|faces?/i, 'closeups'], [/concert|gig|live music|stage/i, 'concert']];
    const hit = pairs.find(([re]) => re.test(t));
    return hit ? hit[1] : null;
  }
  const pickyFromText = t => (/strict|picky|only the (very )?best/i.test(t) ? 'strict' : /loose|generous|lenient|everything (useful|usable)|every (possible|usable)/i.test(t) ? 'loose' : /balanced|middle ground/i.test(t) ? 'normal' : null);
  function binFromText(t) { const m = /\b(?:in|from)\s+(?:the\s+)?["“']?(.+?)["”']?\s+bin\b/i.exec(t); return m ? m[1].trim() : ''; }
  const seqFromText = t => /\b(this|the|my|active|current)\s+(sequence|timeline|stringout|assembly|edit|cut)\b|\bon the timeline\b/i.test(t);
  function applyType(p) {
    let footage = p.footage, picky = p.picky;
    if (p.preset === 'strict' || p.preset === 'loose') { picky = p.preset; footage = footage || state.settings.footage; }
    else if (p.preset && V().FOOTAGE[p.preset]) footage = p.preset;
    if (footage && V().FOOTAGE[footage]) state.settings.footage = footage;
    if (picky && V().PICKY[picky]) state.settings.picky = picky;
    if (footage || picky) { state.settings.overrides = {}; saveSettings(); }
  }
  async function planFromParams(p, job) {
    if (p.source === 'sequence') {
      await US.refreshContext();
      if (!US.ctx.sequence) throw new US.UserError('NO_SEQUENCE');
      return planForSequence(US.ctx.sequence.id, job);
    }
    if (p.bin) { const { items, label } = await itemsForBinName(p.bin); return planForItems(items, label); }
    const items = await US.host.call('selectedItems', { kinds: ['video'] });
    if (!items.length) throw new US.UserError('NO_SELECTION', { action: 'Select clips in the Project panel, name a bin (“…in the Concert bin”), or say “this sequence”.' });
    return planForItems(items, US.plural(items.length, 'selected clip'));
  }

  US.actions.register({
    id: 'selects.find', tool: 'selects', title: 'Find selects',
    describe: 'Grades footage (selected clips, a named bin, or the clips the active sequence uses) for focus, exposure, steadiness and the checks that matter for the footage type, and lists the usable moments BEST / GOOD / OK with shot size, camera move, reveals, hero shots, 9:16-friendly and slow-mo moments. Changes nothing in the project.',
    params: {
      bin: { type: 'string', default: '', desc: 'Name of the bin to analyse; empty = the clips selected in the Project panel' },
      source: { type: 'enum', options: ['clips', 'sequence'], default: 'clips', desc: 'sequence = grade the clips used in the active sequence' },
      preset: { type: 'enum', options: FOOTAGE_ORDER.concat(['strict', 'loose']), default: '', desc: 'Footage type: any (the default: anything usable), concert, interview, wedding, travel, sports, documentary, drone, phone, crowd, closeups (or strict / loose)' },
      picky: { type: 'enum', options: ['loose', 'normal', 'strict'], default: '', desc: 'How picky' }
    },
    examples: ['find the best shots in the Concert bin', 'grade the interview clips', 'find selects in this sequence', 'find selects, strict'],
    match(t) {
      if (!/(best|good|usable)\s+(shots?|clips?|moments?|bits|takes)|find (the )?selects|selects? finder|grade (the |my |this )?(footage|clips|sequence|timeline|stringout|assembly)|pull selects|sharpest/i.test(t)) return null;
      if (/\b(make|build|create)\b.*\b(sequence|timeline)\b/i.test(t)) return null;
      return { bin: binFromText(t), source: seqFromText(t) ? 'sequence' : 'clips', preset: footageFromText(t) || '', picky: pickyFromText(t) || '' };
    },
    run: async (p, job) => {
      applyType({ preset: p.preset, picky: p.picky });
      const r = await runPlan(await planFromParams(p, job), job);
      US.tools.open('selects');
      return r;
    }
  });

  US.actions.register({
    id: 'selects.sequence', tool: 'selects', title: 'Make a selects sequence', changes: true,
    describe: 'Builds a new sequence from the current selects (colour-coded by grade, with a marker on each clip; the marked best go first). Runs “Find selects” on the selected clips (or a named bin, or this sequence) first if needed.',
    params: {
      order: { type: 'enum', options: ['score', 'time', 'shot', 'move', 'action'], default: 'score', desc: 'score = best first, time = shooting order, shot = close-ups first, move = by camera move, action = most action first' },
      tiers: { type: 'enum', options: ['all', 'bestgood', 'best'], default: 'all', desc: 'Which grades to include' },
      bin: { type: 'string', default: '', desc: 'Bin to analyse first if there are no selects yet' },
      source: { type: 'enum', options: ['clips', 'sequence'], default: 'clips', desc: 'Analyse the active sequence first' }
    },
    examples: ['make a selects sequence', 'sequence of the best shots in shooting order', 'selects timeline, best only'],
    match(t) {
      if (!/(selects?|best (shots?|bits|moments)|highlights?)\b.*\b(sequence|timeline|stringout)|(sequence|timeline|stringout)\b.*\b(selects?|best)/i.test(t)) return null;
      if (/\bin (this|the|my) (sequence|timeline)/i.test(t) && !/\b(make|build|create)\b/i.test(t)) return null;
      return { order: /order|time|chronolog|as shot/i.test(t) ? 'time' : /shot (type|size)|close.?ups? first/i.test(t) ? 'shot' : /camera move/i.test(t) ? 'move' : /action/i.test(t) ? 'action' : 'score', tiers: /best only|only (the )?best/i.test(t) ? 'best' : /good/i.test(t) ? 'bestgood' : 'all', bin: binFromText(t), source: seqFromText(t) ? 'sequence' : 'clips' };
    },
    run: async (p, job) => {
      if (!state.result || p.bin || p.source === 'sequence') { job.range(0, 0.6); await runPlan(await planFromParams(p, job), job); job.range(0.6, 1); }
      const r = await makeOutputs({ sequence: true, order: p.order, tiers: p.tiers, markBest: true }, job);
      US.tools.open('selects');
      return r;
    }
  });

  /* ---------- the screen ---------- */
  US.tools.register({
    id: 'selects', name: 'Selects', short: 'Selects', icon: 'selects', group: 'find', order: 10,
    blurb: 'Grades any footage BEST / GOOD / OK; sorts it by shot, move and more.',
    hostFns: ['selectsPlaceWhole', 'selectsSequenceUses', 'selectsAttachProxy', 'createSubclips', 'newSequence', 'addClipMarkers', 'removeClipMarkers', 'addSequenceMarkers', 'removeSequenceMarkers', 'setLabels', 'showInSource', 'storyCue', 'setPlayhead', 'itemsInfo', 'encoderPresets'],
    create() {
      const help = h('div',
        h('p', h('b', 'What it looks at. '), 'Selects plays each clip quickly on this computer (nothing is uploaded) and looks at about three frames a second. For each frame it measures:'),
        h('ul',
          h('li', 'Focus – is something in the picture sharp? (a sharp subject on a soft background counts as sharp)'),
          h('li', 'Exposure – judged on the lit parts and on faces, so a dark stage with lit performers passes'),
          h('li', 'Steadiness – random shake counts against a shot; smooth pans, tilts and zooms don’t; fast whip pans are cut out'),
          h('li', 'Faces and shot size (close-up, mid, wide), and the camera move (static, pan, tilt, push-in, pull-out, handheld)'),
          h('li', 'Problems: flashes and strobes, auto-exposure “pumping”, colour (white balance) shifts, someone walking through a still shot, long stretches where nothing happens')),
        h('p', h('b', 'How the score works. '), 'Every frame gets a score from 0 to 100. Each check is a multiplier, so one bad thing (say, blur) is enough to pull a moment down. The footage type decides which checks matter: strobes are fine at a concert but not in an interview; travel B-roll wants movement, an interview wants a steady face. Stretches that stay above the “OK” line become selects (split if longer than “Longest select”); a select’s score is mostly its average, pulled down a little by its weakest moments.'),
        h('p', h('b', 'Grades. '), 'BEST, GOOD and OK come from the score lines in Fine-tune. Reveal shots (pull-backs, crane moves, lights coming up) are graded at least GOOD even though they start dark. The top few selects are your “best”: with “Mark the best” they get their own colour (magenta), a ★, and go first.'),
        h('p', h('b', 'What’s remembered. '), 'The measurements for each clip are saved on this computer, so analysing the same clips again is instant, and changing the footage type, “How picky” or any slider re-grades in a fraction of a second without looking at the video again.'),
        h('p', h('b', 'Clips the panel can’t read. '), 'The panel can read H.264 MP4 files. It uses a clip’s proxy if it has one. For formats it can’t read (10-bit 4:2:2 from Lumix and other cameras, iPhone HEVC, ProRes, RAW) it asks Media Encoder for a small 1280×720 “analysis copy”, kept in JMG Ultra Studio’s own folder. These copies are only for looking at, and are not added to your project unless you tick “attach as proxies”. Times always match the original clip.'),
        h('p', h('b', 'What changes in your project. '), 'Nothing, until you press “Make it”. Then everything new goes in a JMG Ultra Studio › Selects bin; your clips and sequences stay as they are (markers and colour labels only if you tick them, and “Remove Selects markers” takes the markers off again).'));
      const v = ui.toolView({ icon: 'selects', title: 'Selects', blurb: 'Finds the usable moments in any footage and grades them. Nothing changes in your project until you choose an output.', help });

      /* source */
      const allTracks = ui.toggle({ label: 'All video tracks (not just V1)', hint: 'Graphics, adjustment layers, nested sequences and stills are skipped.', value: state.settings.allTracks, onChange: x => { state.settings.allTracks = x; saveSettings(); } });
      const src = ui.sourcePicker({ modes: ['selection', 'bin', 'sequence'], kinds: ['video'], onChange: () => syncSrc() });
      const syncSrc = () => allTracks.classList.toggle('hidden', src.get().mode !== 'sequence');
      syncSrc();

      /* footage type + how picky */
      const S = state.settings;
      const typeDesc = h('div.field-hint', V().FOOTAGE[S.footage].desc);
      const footSel = ui.select({ options: FOOTAGE_ORDER.map(k => ({ value: k, label: V().FOOTAGE[k].label })), value: S.footage, onChange: k => { S.footage = k; S.overrides = {}; typeDesc.textContent = V().FOOTAGE[k].desc; syncSliders(); touch(); } });
      const PICK = ['loose', 'normal', 'strict'];
      const pickySeg = ui.segmented({ options: PICK.map(k => ({ value: k, label: V().PICKY[k].label, title: V().PICKY[k].desc })), value: S.picky, onChange: k => { S.picky = k; S.overrides = {}; syncSliders(); touch(); } });
      const pickyLine = h('div.field-hint');
      const moveSeg = ui.segmented({ options: [{ value: '', label: 'Doesn’t matter', title: 'Technical quality only' }, { value: 'smooth', label: 'Smooth moves count', title: 'A smooth camera move ranks a select higher' }, { value: 'moves', label: 'Moves first', title: 'Smooth moves first; static shots a little lower' }], value: S.movement || '', onChange: x => { S.movement = x; touch(); } });
      /** live counts on the three choices, like Story: "Everything useful (42)" */
      const countPicky = US.debounce(() => {
        if (!state.clips.length) { pickySeg.querySelectorAll('.seg').forEach((b, i) => { b.textContent = V().PICKY[PICK[i]].label; }); pickyLine.textContent = V().PICKY[S.picky].desc; return; }
        const n = PICK.map(k => k === S.picky && state.result ? state.result.selects.length : V().score(state.clips, Object.assign(V().settingsFor(S.footage, k), { heroCount: S.heroCount, movement: S.movement || '', forced: state.forced })).selects.length);
        pickySeg.querySelectorAll('.seg').forEach((b, i) => { b.textContent = `${V().PICKY[PICK[i]].label} (${n[i]})`; });
        const custom = Object.keys(S.overrides).length;
        pickyLine.textContent = `${custom ? 'Custom (fine-tuned)' : V().PICKY[S.picky].label}: ${US.plural(state.result ? state.result.selects.length : 0, 'select')} – ${V().PICKY[S.picky].desc}`;
      }, 150);
      listeners.add(countPicky);
      const sliders = {};
      const rerank = US.debounce(() => { rescore(); changed(); }, 60);
      const touch = () => { saveSettings(); rerank(); };
      const mk = (key, label, min, max, step, fmt, hint) => (sliders[key] = ui.slider({ label, min, max, step, value: effective()[key], fmt, hint, onInput: x => { S.overrides[key] = x; touch(); } }));
      const pct = x => x < 25 ? 'relaxed' : x < 45 ? 'easy-going' : x < 60 ? 'normal' : x < 80 ? 'picky' : 'very picky';
      const dupes = ui.toggle({ label: 'Drop duplicate takes', value: effective().dupes, onChange: x => { S.overrides.dupes = x; touch(); } });
      const heroSeg = ui.segmented({ options: [{ value: 3, label: 'Top 3' }, { value: 5, label: 'Top 5' }, { value: 10, label: 'Top 10' }, { value: 'pct', label: 'Top 10%' }], value: S.heroCount, onChange: x => { S.heroCount = x; touch(); } });
      function syncSliders() { const e = effective(); for (const [k, sl] of Object.entries(sliders)) sl.set(e[k]); dupes.set(e.dupes); }
      const fine = ui.section('Fine-tune', [
        h('div.grid2',
          mk('focus', 'Focus', 0, 100, 1, pct), mk('exposure', 'Exposure', 0, 100, 1, pct),
          mk('steady', 'Steadiness', 0, 100, 1, pct), mk('edgeTrim', 'Skip start / end of each clip', 0, 3, 0.1, x => x.toFixed(1) + ' s'),
          mk('minLen', 'Shortest select', 0.5, 10, 0.5, x => x.toFixed(1) + ' s'), mk('maxLen', 'Longest select', 3, 60, 1, x => x + ' s')),
        h('div.grid2', mk('best', 'BEST from score', 50, 100, 1, x => String(x)), mk('good', 'GOOD from score', 30, 95, 1, x => String(x)), mk('ok', 'OK from score', 10, 90, 1, x => String(x))),
        ui.field('The best (★)', heroSeg, 'How many of the top selects count as your best.'),
        dupes,
        h('div.row', ui.button('Back to the footage type’s settings', { small: true, kind: 'ghost', onClick: () => { S.overrides = {}; syncSliders(); touch(); } }))], { open: false, hint: 'changes re-grade instantly' });

      const copies = ui.toggle({ label: 'Make small analysis copies of clips the panel can’t read', hint: 'Uses Media Encoder (1280×720 H.264). For 10-bit/4:2:2, HEVC, ProRes and RAW. Not added to your project.', value: S.autoCopies, onChange: x => { S.autoCopies = x; saveSettings(); attach.classList.toggle('hidden', !x); } });
      const attach = ui.toggle({ label: 'Also attach them as proxies', hint: 'Only for 16:9 clips. Off by default.', value: S.attachProxies, onChange: x => { S.attachProxies = x; saveSettings(); } });
      attach.classList.toggle('hidden', !S.autoCopies);

      const findBtn = ui.actionButton('Find selects', async () => {
        await US.jobs.run({ title: 'Finding selects', tool: 'selects' }, async job => {
          const mode = src.get().mode;
          if (mode === 'sequence') {
            if (!src.get().seqId) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence chosen.', action: 'Pick a sequence in “Works on”, then try again.' });
            return runPlan(await planForSequence(src.get().seqId, job), job);
          }
          const { items } = await src.resolve(job);
          let label = US.plural(items.length, 'selected clip');
          if (mode === 'bin') { const bins = await US.host.call('listBins'); const b = bins.find(x => x.id === src.get().binId); label = b ? `“${b.path.split(' / ').pop()}” bin` : 'bin'; }
          return runPlan(planForItems(items, label), job);
        });
      }, { icon: 'selects' });

      v.body.append(
        ui.card(src.el, allTracks),
        ui.card(h('div.card-title', 'What counts as usable'), typeDesc, ui.field('How picky', pickySeg), pickyLine,
          ui.field('Camera movement', moveSeg, 'Smooth pans, tilts, push-ins and pull-outs make videos feel alive. Wobbly or jerky moves never get a bonus.'),
          ui.section('Kind of footage (optional)', [h('div.field-hint', 'Any footage suits B-roll of every kind. Choose a kind only if you want its style to count too – Interviews want a steady face, Sports wants movement.'), footSel], { open: S.footage !== 'any', hint: V().FOOTAGE[S.footage].label }),
          fine),
        ui.card(copies, attach),
        findBtn);

      /* results */
      const results = h('div.sel-results');
      v.body.append(results);
      let sortBy = 'score', filter = 'all', limit = 120;
      const outOpts = Object.assign({ sequence: true, order: 'score', perTier: false, subclips: false, markers: false, seqMarkers: false, labels: false, tiers: 'all', markBest: true, byTypeOn: false, groups: ['grade', 'shot', 'move', 'special'], catSequences: false, stills: false }, US.settings.get('selects.output', {}));
      const saveOut = () => US.settings.set('selects.output', outOpts);
      const FILTERS = [
        ['all', 'All selects', () => true], ['cinematic', 'Smooth camera moves', s => !!s.flags.cinematic], ['BEST', 'BEST', s => s.tier === 'BEST'], ['GOOD', 'GOOD', s => s.tier === 'GOOD'], ['OK', 'OK', s => s.tier === 'OK'],
        ['hero', 'The best (★)', s => s.flags.hero], ['reveal', 'Reveals', s => !!s.flags.reveal], ['vertical', 'Good for 9:16', s => s.flags.vertical], ['slowmo', 'Slow-mo candidates', s => s.flags.slowmo],
        ['faces', 'With faces', s => s.faces], ['action', 'Action', s => s.flags.action],
        ['close', 'Close-ups', s => s.shot === 'close'], ['mid', 'Mid shots', s => s.shot === 'mid'], ['wide', 'Wide shots', s => s.shot === 'wide'],
        ['static', 'Static', s => s.move === 'static'], ['pan', 'Pans', s => s.move === 'pan'], ['tilt', 'Tilts', s => s.move === 'tilt'], ['push-in', 'Push-ins', s => s.move === 'push-in'], ['pull-out', 'Pull-outs', s => s.move === 'pull-out'], ['handheld', 'Handheld', s => s.move === 'handheld'],
        ['issues', 'With warnings', s => s.issues.length > 0]
      ];

      function chart(sel) {
        const c = h('canvas.sel-chart');
        requestAnimationFrame(() => {
          const w = c.clientWidth || 300, H = 64, dpr = window.devicePixelRatio || 1;
          c.width = w * dpr; c.height = H * dpr; c.style.height = H + 'px';
          const g = c.getContext('2d'); g.scale(dpr, dpr);
          const css = getComputedStyle(document.documentElement);
          g.fillStyle = css.getPropertyValue('--surface-2'); g.fillRect(0, 0, w, H);
          const sorted = sel.slice().sort((a, b) => b.score - a.score), n = sorted.length;
          const col = s => s.flags.hero && outOpts.markBest ? HERO.color : s.flags.reveal ? TIER.REVEAL.color : css.getPropertyValue(s.tier === 'BEST' ? '--tier-best' : s.tier === 'GOOD' ? '--tier-good' : '--tier-ok');
          const bw = w / Math.max(1, n);
          sorted.forEach((s, i) => { g.fillStyle = col(s); const bh = (s.score / 100) * (H - 6); g.fillRect(i * bw, H - bh, Math.max(1, bw - (bw > 3 ? 1 : 0)), bh); });
          const e = effective();
          for (const k of ['best', 'good', 'ok']) {
            const y = Math.round(H - (e[k] / 100) * (H - 6)) + 0.5;
            g.strokeStyle = 'rgba(255,255,255,.45)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]);
          }
        });
        return c;
      }

      function row(s, isRej) {
        const t = isRej ? null : tierOf(s);
        const color = isRej ? 'var(--surface-3)' : (s.flags.hero && outOpts.markBest ? HERO.color : TIER[t].color);
        const pills = [];
        if (!isRej) {
          if (s.flags.hero) pills.push(ui.pill('★ Best', HERO.color));
          if (s.flags.reveal) pills.push(ui.pill('Reveal', '#b18cff'));
          // the camera move on every select, with how smooth it is
          if (s.moveLabel || s.move) pills.push(ui.pill(`${s.moveLabel || V().MOVE_LABEL[s.move] || s.move}${s.move !== 'static' && s.smooth != null ? ` · ${s.smooth >= 80 ? 'very smooth' : s.smooth >= 60 ? 'smooth' : s.smooth >= 40 ? 'a bit uneven' : 'uneven'}` : ''}`, s.flags.cinematic ? '#57a6ff' : 'var(--text-2)'));
          if (s.flags.vertical) pills.push(ui.pill('9:16', '#3ecf8e'));
          if (s.flags.slowmo) pills.push(ui.pill('Slow-mo', '#57a6ff'));
          if (s.flags.forced) pills.push(ui.pill('Kept by you'));
          for (const iss of s.issues || []) pills.push(ui.pill(iss, '#f2b84b'));
        }
        const toggleBtn = isRej
          ? ui.button('Keep', { small: true, kind: 'ghost', title: 'Keep this moment anyway', onClick: e => { e.stopPropagation(); state.forced = state.forced.filter(f => !(f.clipId === s.clipId && f.mode === 'out' && f.t >= s.start && f.t <= s.end)); state.forced.push({ clipId: s.clipId, mode: 'in', start: s.start, end: s.end }); rescore(); changed(); } })
          : ui.button('', { small: true, kind: 'ghost', icon: 'close', title: 'Leave this one out', onClick: e => { e.stopPropagation(); state.forced = state.forced.filter(f => !(f.clipId === s.clipId && f.mode === 'in' && Math.abs(f.start - s.start) < 0.3)); state.forced.push({ clipId: s.clipId, mode: 'out', t: (s.start + s.end) / 2 }); rescore(); changed(); } });
        const where = s.tl != null ? ` · at ${US.fmtDur(s.tl)} in the sequence` : '';
        const goTo = () => (s.tl != null && state.seq ? US.host.call('setPlayhead', { seqId: state.seq.id, seconds: s.tl }) : US.host.cue(s.clipId, s.start)).catch(e => ui.showError(e));
        return h('div.list-row.clickable', { title: s.tl != null ? 'Go to this moment in the sequence' : 'Show in the Source Monitor', onclick: goTo },
          h('span.swatch', { style: { background: color } }),
          h('div.list-main',
            h('div.list-title', `${s.clipName} · ${US.fmtDur(s.start, true)}–${US.fmtDur(s.end, true)}`),
            pills.length ? h('div.sel-pills', pills) : null,
            h('div.list-sub', { title: (isRej ? s.why : s.reasons.join(' · ')) + where }, (isRej ? s.why : s.reasons.join(' · ')) + where)),
          h('div.sel-right', !isRej && h('span.sel-score', String(s.score)), toggleBtn));
      }

      function render() {
        US.clear(results);
        const r = state.result;
        const needCopy = state.failed.filter(f => f.needsCopy);
        const failedNote = () => {
          if (!state.failed.length) return null;
          const names = state.failed.slice(0, 3).map(f => f.item.name).join(', ') + (state.failed.length > 3 ? '…' : '');
          return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            ui.note(`${US.plural(state.failed.length, 'clip')} couldn’t be read (${names}). ${needCopy.length ? 'Their format needs an analysis copy.' : 'Check the files are online.'}`, 'warn'),
            needCopy.length ? ui.button(`Make analysis copies of ${US.plural(needCopy.length, 'clip')} with Media Encoder`, { icon: 'film', onClick: () => US.jobs.run({ title: 'Making analysis copies', tool: 'selects', who: 'Media Encoder' }, copyFailed) }) : null);
        };
        if (!r) { const n = failedNote(); if (n) results.appendChild(n); return; }
        const st = r.stats;
        const card = ui.card(
          h('div.card-title', 'Selects', h('span.right', `${state.sourceLabel} · ${V().FOOTAGE[state.settings.footage].label}`)),
          ui.stats(ui.stat(st.kept, 'selects'), ui.stat(st.best, 'BEST'), ui.stat(st.good, 'GOOD'), ui.stat(st.ok, 'OK'), ui.stat(st.reveals, 'reveals'), ui.stat(US.fmtDur(st.keptDur), `kept of ${US.fmtDur(st.footage)}`)),
          r.selects.length ? chart(r.selects) : null,
          h('div.legend', h('span', h('i', { style: { background: TIER.BEST.color } }), 'BEST'), h('span', h('i', { style: { background: TIER.GOOD.color } }), 'GOOD'), h('span', h('i', { style: { background: TIER.OK.color } }), 'OK'), h('span', h('i', { style: { background: TIER.REVEAL.color } }), 'Reveal'), outOpts.markBest ? h('span', h('i', { style: { background: HERO.color } }), '★ Best') : null, st.dupes ? h('span', `${US.plural(st.dupes, 'duplicate')} dropped`) : null),
          failedNote());
        const sortSel = ui.select({ options: [{ value: 'score', label: 'Best first' }, { value: 'time', label: 'Shooting order' }].concat(state.seq ? [{ value: 'sequence', label: 'Sequence order' }] : []).concat([{ value: 'shot', label: 'Shot size (close-ups first)' }, { value: 'move', label: 'Camera move' }, { value: 'smooth', label: 'Smoothest moves first' }, { value: 'action', label: 'Most action first' }]), value: sortBy, onChange: x => { sortBy = x; limit = 120; render(); } });
        const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, r.selects.filter(fn).length]));
        const filt = ui.select({
          options: FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) => ({ value: k, label: `${label} (${counts[k]})` })).concat([{ value: 'rejected', label: `Left out (${r.rejected.length})` }]),
          value: filter, onChange: x => { filter = x; limit = 120; render(); }
        });
        card.appendChild(h('div.grid2', ui.field('Sort', sortSel), ui.field('Show', filt)));
        let rows;
        if (filter === 'rejected') rows = r.rejected.slice().sort((a, b) => a.clipName.localeCompare(b.clipName, undefined, { numeric: true }) || a.start - b.start);
        else { const f = (FILTERS.find(x => x[0] === filter) || FILTERS[0])[2]; rows = V().order(r.selects.filter(f), sortBy); }
        const list = h('div.list');
        rows.slice(0, limit).forEach(s => list.appendChild(row(s, filter === 'rejected')));
        card.appendChild(rows.length ? list : ui.empty({ icon: 'info', title: 'Nothing here', text: filter === 'rejected' ? 'Every moment made the cut.' : 'Try looser settings or another filter.' }));
        if (rows.length > limit) card.appendChild(ui.button(`Show ${Math.min(200, rows.length - limit)} more`, { small: true, kind: 'ghost', onClick: () => { limit += 200; render(); } }));
        results.appendChild(card);
        results.appendChild(outputCard(r));
      }

      /* outputs */
      function outputCard(r) {
        const tog = (key, label, hint, after) => ui.toggle({ label, hint, value: outOpts[key], onChange: x => { outOpts[key] = x; saveOut(); if (after) after(x); } });
        const orderSel = ui.select({ options: [{ value: 'score', label: 'Best first' }, { value: 'time', label: 'Shooting order' }].concat(state.seq ? [{ value: 'sequence', label: 'Sequence order' }] : []).concat([{ value: 'shot', label: 'Shot size' }, { value: 'move', label: 'Camera move' }, { value: 'smooth', label: 'Smoothest moves first' }, { value: 'action', label: 'Most action first' }]), value: outOpts.order, onChange: x => { outOpts.order = x; saveOut(); } });
        const tiersSeg = ui.segmented({ options: [{ value: 'all', label: 'All' }, { value: 'bestgood', label: 'BEST + GOOD' }, { value: 'best', label: 'BEST only' }], value: outOpts.tiers, onChange: x => { outOpts.tiers = x; saveOut(); preview(); } });
        // sort into bins by type
        const GROUP_NAMES = { grade: 'Grade (BEST / GOOD / OK)', shot: 'Shot size (close-ups, mids, wides)', move: 'Camera move (static, pans, push-ins…)', special: 'Special (best, reveals, 9:16, slow-mo, faces, action)' };
        const catPreview = h('div.sel-cats');
        const groupToggles = h('div.sel-groups', Object.keys(GROUP_NAMES).map(g => ui.toggle({ label: GROUP_NAMES[g], value: outOpts.groups.includes(g), onChange: x => { outOpts.groups = x ? Array.from(new Set(outOpts.groups.concat(g))) : outOpts.groups.filter(y => y !== g); saveOut(); preview(); } })));
        const catSeqs = tog('catSequences', 'Also a sequence per category');
        const byTypeBox = h('div.sel-bytype', groupToggles, catPreview, catSeqs);
        function preview() {
          US.clear(catPreview);
          const cats = V().categories(pickTiers(r.selects, outOpts.tiers), outOpts.groups, { heroFirst: outOpts.markBest });
          if (!cats.length) { catPreview.appendChild(h('div.field-hint', 'No categories – tick a grouping above.')); return; }
          let last = '';
          for (const c of cats) {
            if (c.groupName !== last) { catPreview.appendChild(h('div.sel-cat-group', c.groupName)); last = c.groupName; }
            catPreview.appendChild(h('div.sel-cat', h('span.swatch', { style: { background: labelHex(c.label) }, title: (ui.LABELS.find(l => l.i === c.label) || {}).name }), h('span.grow', c.name), h('span.muted', String(c.selects.length))));
          }
        }
        const byType = tog('byTypeOn', 'Sort into bins by type', 'A bin per category (like themes), best first, each with its own colour.', x => byTypeBox.classList.toggle('hidden', !x));
        byTypeBox.classList.toggle('hidden', !outOpts.byTypeOn);
        preview();
        const makeBtn = ui.actionButton('Make it', async () => {
          const o = Object.assign({}, outOpts, { byType: outOpts.byTypeOn ? { groups: outOpts.groups, sequences: outOpts.catSequences } : null, seqMarkers: outOpts.seqMarkers && !!state.seq });
          if (!o.sequence && !o.perTier && !o.subclips && !o.markers && !o.labels && !o.byType && !o.seqMarkers && !o.stills) { ui.toast({ type: 'warn', title: 'Nothing ticked', text: 'Tick at least one thing to make.' }); return; }
          const r = await US.jobs.run({ title: 'Making selects', tool: 'selects' }, job => makeOutputs(o, job));
          if (r && r.stillsDir) ui.toast({ type: 'ok', title: 'Stills saved', text: r.stillsDir, action: { label: US.fsx.isWin ? 'Open folder' : 'Show in Finder', fn: () => require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + r.stillsDir + '"') } });
        }, { icon: 'film' });
        return ui.card(
          h('div.card-title', 'Make'),
          tog('sequence', 'A selects sequence', 'Colour-coded by grade, with a marker on every clip.'),
          ui.field('Order', orderSel),
          tog('perTier', 'One sequence per grade'),
          byType, byTypeBox,
          tog('subclips', 'A bin of subclips by grade', 'Named like 001_BEST_closeup_87, ready to drag in.'),
          tog('markers', 'Markers on the source clips', 'Score and reasons, visible in the Source Monitor.'),
          state.seq ? tog('seqMarkers', `Markers on “${state.seq.name}”`, 'Where each select sits in that sequence.') : null,
          tog('labels', 'Colour labels on the source clips', 'Each clip takes the colour of its best grade.'),
          tog('stills', 'Stills of the best frames', 'A full-size PNG of the sharpest frame in each select (up to 50, best first) – for thumbnails, posts and your photo edit.'),
          tog('markBest', 'Mark the best', `Your ★ best (${state.settings.heroCount === 'pct' ? 'top 10%' : 'top ' + state.settings.heroCount}) get their own colour (magenta), a ★, and go first.`, () => render()),
          ui.field('Include', tiersSeg),
          makeBtn,
          h('div.row', h('span.field-hint.grow', 'New items go in JMG Ultra Studio › Selects. Your clips and sequences aren’t changed.'),
            ui.button('Remove Selects markers', { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Removing Selects markers', tool: 'selects' }, removeMarkers) })));
      }

      listeners.add(render);
      render(); countPicky();
      return { el: v.el, onShow() { render(); countPicky(); } };
    }
  });

  US.selects = { applyType, state, rescore, effective, makeOutputs, bestFrame, runPlan, planForItems, planForSequence, copyFailed, removeMarkers, saveSettings,
    /** Older callers (and tests): analyse items with the current settings. */
    analyse: (items, label, job) => runPlan(planForItems(items, label), job) };
})();
