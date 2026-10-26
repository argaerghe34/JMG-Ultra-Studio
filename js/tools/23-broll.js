/* JMG Ultra Studio – B-roll: cover jump cuts and long talking-head stretches with the best moments from a bin of
   B-roll, on a copy of the sequence. Shots go on their own "B-roll" track; nothing underneath is touched. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  US.addIcon('broll', 'M3 5h14v10H3zM3 8h14M3 12h14M6 5v3M10 5v3M14 5v3M6 12v3M10 12v3M14 12v3');

  /* ---------- where cutaways help (pure, unit-tested) ---------- */
  // tracks Ultra Studio uses for labels and guides never count as B-roll already in place
  const NOT_BROLL = /^(Selects|Themes|Guides|Letterbox)$/i;
  /** Is part of this stretch already covered by a real clip on a track above the talking heads? */
  function covered(info, track, at, len) {
    return info.video.some(t => t.index > track && !NOT_BROLL.test(t.name || '') && !t.muted &&
      t.clips.some(c => c.path && !c.disabled && !/^Ultra /.test(c.name) && c.start < at + len - 0.05 && c.end > at + 0.05));
  }
  /**
   * Spots for cutaways in a sequence. info: sequenceInfo. mode: 'jump' (cuts inside the same interview), 'cuts' (also
   * cuts to another person already introduced) or 'every' (every `every` seconds of continuous talking head).
   * len: cutaway length, lead: how long before the cut it starts, intro: seconds a speaker stays on screen when first seen.
   * Returns {spots:[{at, len, kind, label, cut?}], skipped:{covered, intro}}.
   */
  function findSpots(info, { track = 0, mode = 'jump', every = 10, len = 3, lead = 1, intro = 4 } = {}) {
    const fr = info.frame || 1 / 25, end = info.duration;
    const clips = ((info.video.find(t => t.index === track) || {}).clips || []).filter(c => !c.disabled).slice().sort((a, b) => a.start - b.start);
    const firstSeen = new Map(); for (const c of clips) if (!firstSeen.has(c.itemId)) firstSeen.set(c.itemId, c.start);
    const raw = [], skipped = { covered: 0, intro: 0 };
    if (mode === 'every') {
      let i = 0;
      while (i < clips.length) {
        let j = i; while (j + 1 < clips.length && clips[j + 1].start - clips[j].end <= fr * 1.5) j++;   // a run of touching clips
        const from = clips[i].start + Math.max(intro, every * 0.6), to = clips[j].end;
        for (let t = from; t + len <= to - 0.5; t += every) raw.push({ at: t, len, kind: 'stretch', label: `Long talking head at ${US.fmtDur(t)}` });
        i = j + 1;
      }
    } else {
      for (let i = 1; i < clips.length; i++) {
        const A = clips[i - 1], B = clips[i];
        if (Math.abs(B.start - A.end) > fr * 1.5) continue;              // a gap, not a cut
        const jump = !!A.itemId && A.itemId === B.itemId;
        if (!jump && (mode === 'jump' || firstSeen.get(B.itemId) >= B.start - fr)) { if (!jump && mode === 'cuts') skipped.intro++; continue; }
        raw.push({ at: B.start - lead, len, cut: B.start, kind: jump ? 'jump' : 'cut', label: jump ? `Jump cut in ${B.name} at ${US.fmtDur(B.start)}` : `Cut to ${B.name} at ${US.fmtDur(B.start)}` });
      }
    }
    const spots = [];
    for (const s of raw) {
      s.at = Math.max(0, s.at); s.len = Math.min(s.len, end - s.at);
      if (s.len < 1) continue;
      const prev = spots[spots.length - 1];
      if (prev && s.at < prev.at + prev.len + 0.5) {
        // two cuts close together: one longer cutaway over both (up to twice the length), otherwise start after it
        const merged = s.at + s.len - prev.at;
        if (merged <= len * 2) { prev.len = Math.min(merged, end - prev.at); prev.label += ' + 1 more'; continue; }
        s.at = prev.at + prev.len; s.len = Math.min(len, end - s.at); if (s.len < 1) continue;
      }
      if (covered(info, track, s.at, s.len)) { skipped.covered++; continue; }
      spots.push(s);
    }
    return { spots, skipped };
  }

  /** Moments to use when Selects isn't asked: a few evenly spaced stretches per clip, first ones of every clip first. */
  /** The part of a clip that can be used, in media time: a subclip's own range, else the whole file. */
  const rangeOf = it => (it.subclip && it.rangeEnd > it.rangeStart ? [it.rangeStart, it.rangeEnd] : [0, it.duration || 0]);
  function plainMoments(items, len) {
    const out = [];
    items.forEach((it, ci) => {
      const [a, b] = rangeOf(it), usable = b - a - 1;      // skip half a second at each end
      const n = Math.max(1, Math.min(4, Math.floor(usable / (len + 1))));
      for (let k = 0; k < n; k++) {
        const s = a + 0.5 + (usable / n) * k, e = Math.min(b - 0.5, s + Math.max(len, usable / n));
        if (e - s >= 1) out.push({ clipId: it.id, path: it.path, name: it.name, start: s, end: e, score: 100 - k * 10 - ci * 0.001 });
      }
    });
    return out;
  }
  /**
   * Give each spot a moment of B-roll: best score first, each moment once, not the same clip twice in a row, and a
   * shorter cutaway if no moment is long enough (down to 1.5 s). -> {shots:[{spot, clipId, name, in, out, at, score}], uncovered:[spot]}
   */
  function assignShots(spots, moments, { minLen = 1.5 } = {}) {
    const pool = moments.slice().sort((a, b) => b.score - a.score), used = new Set(), shots = [], uncovered = [];
    // the same footage never twice, even from a clip and its subclip: used stretches per file
    const usedSpans = [];
    const overlapsUsed = m => m.path && usedSpans.some(u => u.path === m.path && m.start < u.end - 0.1 && m.end > u.start + 0.1);
    let last = null;
    for (const spot of spots) {
      const fits = m => !used.has(m) && !overlapsUsed(m) && m.end - m.start >= spot.len - 0.05;
      let m = pool.find(x => fits(x) && x.clipId !== last) || pool.find(fits);
      let len = spot.len;
      if (!m) { m = pool.filter(x => !used.has(x) && !overlapsUsed(x) && x.end - x.start >= minLen).sort((a, b) => (b.end - b.start) - (a.end - a.start) || b.score - a.score)[0]; if (m) len = m.end - m.start; }
      if (!m) { uncovered.push(spot); continue; }
      used.add(m); last = m.clipId;
      const inP = m.start + Math.max(0, (m.end - m.start - len) / 2);   // the middle of the moment
      if (m.path) usedSpans.push({ path: m.path, start: inP, end: inP + len });
      shots.push({ spot, clipId: m.clipId, name: m.name, in: +inP.toFixed(3), out: +(inP + len).toFixed(3), at: +spot.at.toFixed(3), score: m.score });
    }
    return { shots, uncovered };
  }

  /* ---------- running it ---------- */
  const V = () => US.vision;
  /** Moments from the B-roll clips: Selects' graded moments (analysing them, with Media Encoder copies if needed), or plain stretches. */
  async function brollMoments(items, { useSelects, footage, len }, job) {
    if (!useSelects || !V()) return { moments: plainMoments(items, len), failed: [] };
    job.set({ who: 'computer', msg: `Looking at ${US.plural(items.length, 'B-roll clip')}` });
    job.range(0.05, 0.6);
    items = items.map(it => (it.subclip ? Object.assign({}, it, { range: rangeOf(it) }) : it));   // a subclip: only its own stretch
    const res = await V().analyseMany(items, { job, parallel: US.settings.get('visionParallel', 3) });
    const data = new Map(res.results.map(r => [r.item.id, r.data]));
    let failed = res.failed;
    const need = failed.filter(f => f.needsCopy).map(f => f.item);
    if (need.length) {
      job.range(0.6, 0.8);
      job.set({ who: 'encoder', msg: `Making ${US.plural(need.length, 'small analysis copy', 'small analysis copies')} of clips the panel can’t read` });
      const copies = await V().makeAnalysisCopies(need, job, {});
      const res2 = await V().analyseMany(copies.made, { job, parallel: US.settings.get('visionParallel', 3) });
      for (const r of res2.results) data.set(r.item.id, r.data);
      const fixed = new Set(res2.results.map(r => r.item.id));
      failed = failed.filter(f => !fixed.has(f.item.id));
    }
    job.range(0, 1);
    const clips = items.filter(it => data.has(it.id)).map(it => ({ item: it, data: data.get(it.id) }));
    const st = Object.assign(V().settingsFor(footage, 'normal'), { minLen: Math.min(len, 2), movement: 'smooth' });   // smooth moves make good cutaways
    const sel = V().score(clips, st).selects;
    const pathOf = new Map(items.map(it => [it.id, it.path]));
    const moments = sel.map(s => ({ clipId: s.clipId, path: pathOf.get(s.clipId), name: s.clipName, start: s.start, end: s.end, score: s.score, tier: s.tier }));
    // clips Selects found nothing good in still offer a plain moment, after all the graded ones
    const withSel = new Set(moments.map(m => m.clipId));
    plainMoments(items.filter(it => data.has(it.id) && !withSel.has(it.id)), len).forEach(m => moments.push(Object.assign(m, { score: m.score - 100 })));
    return { moments, failed };
  }

  async function makeCopy(job, opts) {
    const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
    return coverSequence(job, s.id, opts, () => opts.source.resolve(job));
  }
  /** Lay B-roll over a sequence (on a copy). getItems() -> {items}: the B-roll clips. */
  async function coverSequence(job, seqId, opts, getItems) {
    job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const info = await US.host.call('sequenceInfo', { seqId });
    const { spots, skipped } = findSpots(info, opts);
    if (!spots.length) throw new US.UserError('NOTHING_FOUND', { title: opts.mode === 'jump' ? 'No jump cuts to cover in this sequence.' : 'Nothing to cover in this sequence.', action: skipped.covered ? 'The spots already have B-roll over them.' : opts.mode === 'jump' ? 'Try “Cuts between people” or “Long stretches”, or check the talking-head track.' : 'Check the talking-head track is right.' });
    const { items } = await getItems();
    const video = items.filter(it => it.kind === 'video' && !it.offline);
    if (!video.length) throw new US.UserError('NO_SELECTION', { title: 'No usable B-roll clips.', action: 'Pick a bin of B-roll (video clips), then try again.' });
    const { moments, failed } = await brollMoments(video, opts, job);
    const { shots, uncovered } = assignShots(spots, moments);
    if (!shots.length) throw new US.UserError('NOTHING_FOUND', { title: 'None of the B-roll is long enough to use.', action: 'Use a shorter shot length, or add longer clips.' });
    job.check();
    job.set({ who: 'premiere' }).progress(0.85, `Laying ${US.plural(shots.length, 'shot')} on a copy of “${info.name}”`);
    const copy = await US.host.call('cloneSequence', { seqId, name: `${info.name} – B-roll` });
    const r = await US.host.call('brollPlace', { seqId: copy.id, shots: shots.map(x => ({ id: x.clipId, in: x.in, out: x.out, at: x.at })), keepSound: opts.keepSound });
    await US.host.call('openSequence', { seqId: copy.id }); await US.refreshContext();
    const result = { copy, track: r.track, shots, uncovered, failed, skipped };
    US.bus.emit('broll-made', result);
    return Object.assign(result, { summary: `${US.plural(r.placed, 'cutaway')} on V${r.track + 1} of “${copy.name}”` + (uncovered.length ? ` · ${uncovered.length} not covered (not enough B-roll)` : '') + (failed.length ? ` · ${failed.length} B-roll clips couldn’t be read` : '') });
  }

  let tool = null;   // the screen, for the Assistant (it needs the chosen B-roll bin)
  US.actions.register({
    id: 'broll.cover', tool: 'broll', title: 'Cover jump cuts with B-roll', changes: true,
    describe: 'Makes a copy of the active sequence with the best moments from the chosen B-roll bin laid over its jump cuts (or long talking-head stretches) on a new B-roll track.',
    params: { mode: { type: 'enum', options: ['jump', 'cuts', 'every'], default: 'jump', desc: 'jump = cuts inside one interview; cuts = also cuts between people; every = long stretches' } },
    examples: ['cover the jump cuts with b-roll', 'add b-roll over the interviews', 'put cutaways over the long talking heads'],
    match(t) {
      if (!/\b(b-?roll|cutaways?|cover(ing)? (the )?(jump )?cuts)\b/i.test(t)) return null;
      return { mode: /long|stretch|every/i.test(t) ? 'every' : /between|people|all (the )?cuts|every cut/i.test(t) ? 'cuts' : 'jump' };
    },
    run: (p, job) => {
      if (!tool) throw new US.UserError('UNKNOWN', { title: 'Open the B-roll tool and pick your B-roll bin first.', action: 'Then ask again, or press “Make a B-roll copy” there.' });
      return makeCopy(job, Object.assign(tool.opts(), { mode: p.mode }));
    }
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'broll', name: 'B-roll', short: 'B-roll', icon: 'broll', group: 'cut', order: 23,
    blurb: 'Cover jump cuts and long talking heads with your best B-roll.',
    hostFns: ['brollPlace', 'cloneSequence', 'sequenceInfo'],
    create() {
      const v = ui.toolView({ icon: 'broll', title: 'B-roll', blurb: 'Covers jump cuts and long talking heads with the best moments from your B-roll, on a copy of the sequence.',
        help: h('div', h('ul',
          h('li', 'A jump cut is two pieces of the same interview back to back – the picture jumps. A cutaway over the join hides it while the sound carries on.'),
          h('li', 'With “Pick the best moments with Selects” on, the B-roll is analysed like Selects does (sharp, steady, well exposed) and the best moments are used first, each only once.'),
          h('li', 'The cutaways go on a new track called B-roll in a copy of your sequence. Its sound track is chosen so no interview or music is ever overwritten.'),
          h('li', 'Spots that already have B-roll over them are left alone, and a person stays on screen for the first seconds you see them.'))) });
      const S = US.settings.get('broll', {});
      const save = () => US.settings.set('broll', S);
      const seqLine = h('div.field-hint');
      const trackSel = ui.select({ options: [{ value: '0', label: 'V1' }], value: String(S.track || 0), onChange: x => { S.track = +x; save(); found = null; drawSpots(); } });
      const mode = ui.segmented({ options: [{ value: 'jump', label: 'Jump cuts' }, { value: 'cuts', label: 'Cuts between people too' }, { value: 'every', label: 'Long stretches' }], value: S.mode || 'jump', onChange: x => { S.mode = x; save(); everyF.classList.toggle('hidden', x !== 'every'); found = null; drawSpots(); } });
      const every = ui.slider({ label: 'A cutaway every', min: 5, max: 30, step: 1, value: S.every || 10, fmt: x => x + ' s', onChange: x => { S.every = x; save(); found = null; drawSpots(); } });
      const everyF = h('div', every); everyF.classList.toggle('hidden', (S.mode || 'jump') !== 'every');
      const len = ui.slider({ label: 'Cutaway length', min: 1.5, max: 8, step: 0.5, value: S.len || 3, fmt: x => x.toFixed(1) + ' s', onChange: x => { S.len = x; save(); found = null; drawSpots(); } });
      const lead = ui.slider({ label: 'Starts before the cut', min: 0, max: 2, step: 0.25, value: S.lead != null ? S.lead : 1, fmt: x => x.toFixed(2).replace(/0$/, '') + ' s', onChange: x => { S.lead = x; save(); found = null; drawSpots(); } });
      const source = ui.sourcePicker({ modes: ['bin', 'selection'], kinds: ['video'], label: 'B-roll clips' });
      const footage = ui.select({ options: Object.entries((V() && V().FOOTAGE) || { travel: { label: 'Travel & B-roll' } }).map(([k, f]) => ({ value: k, label: f.label })), value: S.footage || 'any', onChange: x => { S.footage = x; save(); } });
      const useSel = ui.toggle({ label: 'Pick the best moments with Selects', value: S.useSelects !== false, hint: 'Analyses the B-roll (about 16× real time; remembered afterwards).', onChange: x => { S.useSelects = x; save(); footageF.classList.toggle('hidden', !x); } });
      const footageF = ui.field('Kind of footage', footage); footageF.classList.toggle('hidden', S.useSelects === false);
      const keepSound = ui.toggle({ label: 'Keep the B-roll’s own sound', value: !!S.keepSound, hint: 'Off: picture only, so the interview carries on underneath.', onChange: x => { S.keepSound = x; save(); } });
      const opts = () => ({ track: +trackSel.get(), mode: mode.get(), every: every.get(), len: len.get(), lead: lead.get(), intro: 4, source, useSelects: useSel.get(), footage: footage.get(), keepSound: keepSound.get() });

      let info = null, found = null;
      const spotList = h('div'), resultList = h('div');
      async function readSeq() {
        const s = US.ctx.sequence;
        seqLine.textContent = s ? `Sequence: ${s.name}` : 'Open a sequence in the Timeline first.';
        if (!s) { info = null; return; }
        info = await US.host.call('sequenceInfo', { seqId: s.id });
        const tracks = info.video.filter(t => t.clips.length && !NOT_BROLL.test(t.name || ''));
        trackSel.setOptions((tracks.length ? tracks : info.video.slice(0, 1)).map(t => ({ value: String(t.index), label: `V${t.index + 1}${t.name && !/^Video \d+$/.test(t.name) ? ' · ' + t.name : ''} · ${US.plural(t.clips.length, 'clip')}` })), String(S.track || 0));
        found = null; drawSpots();
      }
      function drawSpots() {
        US.clear(spotList);
        if (!info) return;
        found = found || findSpots(info, opts());
        const { spots, skipped } = found;
        const extra = [skipped.covered && `${skipped.covered} already covered`, skipped.intro && `${skipped.intro} cuts to someone new left on the speaker`].filter(Boolean).join(' · ');
        spotList.append(h('div.card-title', `${US.plural(spots.length, 'spot')} to cover`, extra && h('span.right', extra)),
          ui.list(spots.slice(0, 200).map(sp => ({ title: sp.label, sub: `Cutaway ${US.fmtDur(sp.at, true)}–${US.fmtDur(sp.at + sp.len, true)}`, color: sp.kind === 'jump' ? 'var(--warn)' : 'var(--info)', onClick: () => US.host.call('setPlayhead', { seqId: info.id, seconds: sp.cut != null ? sp.cut : sp.at }).catch(ui.showError) })), { empty: { icon: 'broll', title: 'Nothing to cover', text: mode.get() === 'jump' ? 'No jump cuts on this track.' : 'Nothing found on this track.' } }));
      }
      const refresh = ui.button('Re-read the sequence', { small: true, kind: 'ghost', onClick: () => readSeq().catch(ui.showError) });
      const make = ui.actionButton('Make a B-roll copy', () => US.jobs.run({ title: 'Adding B-roll', tool: 'broll' }, job => makeCopy(job, opts())), { icon: 'broll' });
      US.bus.on('broll-made', r => {
        US.clear(resultList).append(h('div.card-title', `In “${r.copy.name}”`),
          ui.list(r.shots.map(x => ({ title: x.name, sub: `${US.fmtDur(x.at, true)} · ${(x.out - x.in).toFixed(1)} s from ${US.fmtDur(x.in, true)}`, right: x.score != null && x.score > 0 ? Math.round(x.score) : '', onClick: () => US.host.call('setPlayhead', { seqId: r.copy.id, seconds: x.at }).catch(ui.showError) }))),
          r.uncovered.length ? ui.note(`${US.plural(r.uncovered.length, 'spot')} not covered – add more B-roll or use a shorter cutaway.`, 'warn') : '');
      });
      v.body.append(seqLine,
        ui.card(h('div.row', h('div.grow', ui.field('Talking heads on', trackSel)), refresh), ui.field('Cover', mode), everyF, h('div.grid2', len, lead), spotList),
        ui.card(source.el, useSel, footageF, keepSound),
        make, h('div.field-hint', 'Your sequence isn’t changed: the cutaways go into a copy, on their own B-roll track.'), resultList);
      US.bus.on('context', () => { if (!US.jobs.current && (!info || !US.ctx.sequence || info.id !== US.ctx.sequence.id)) readSeq().catch(() => {}); });
      tool = { opts };
      return { el: v.el, onShow() { source.refresh(); readSeq().catch(ui.showError); } };
    }
  });

  /** For other tools (Story's promo): B-roll from a bin over a sequence. o: {seqId, binId, mode, len, lead, useSelects, footage, keepSound} */
  async function cover(job, o) {
    const getItems = async () => {
      const list = await US.host.call('binList', { binId: o.binId, kinds: ['video'], recursive: true });
      const items = [];
      for (let i = 0; i < list.length; i += 40) items.push(...await US.host.call('itemsInfo', { ids: list.slice(i, i + 40).map(x => x.id) }));
      return { items: items.filter(Boolean) };
    };
    return coverSequence(job, o.seqId, Object.assign({ track: 0, mode: 'cuts', every: 10, len: 3, lead: 1, intro: 4, useSelects: true, footage: 'any', keepSound: false }, o), getItems);
  }
  US.broll = { findSpots, assignShots, plainMoments, covered, cover };
})();
