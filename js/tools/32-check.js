/* JMG Ultra Studio – Final Check: scans a sequence for the mistakes that slip into exports. Read-only. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const STILL = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|exr|tga)$/i;
  const SEV = { error: { label: 'Fix before export', color: 'var(--err)', marker: 1 }, warn: { label: 'Worth a look', color: 'var(--warn)', marker: 3 }, info: { label: 'For info', color: 'var(--info)', marker: 6 } };

  /** Merge [start,end] ranges. */
  function union(ranges) {
    const r = ranges.filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]), out = [];
    for (const x of r) { const last = out[out.length - 1]; if (last && x[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], x[1]); else out.push([x[0], x[1]]); }
    return out;
  }
  function holes(cover, start, end, minLen) {
    const out = []; let t = start;
    for (const [a, b] of cover) { if (a - t >= minLen) out.push([t, a]); t = Math.max(t, b); }
    if (end - t >= minLen) out.push([t, end]);
    return out;
  }
  const isGuide = c => /^Ultra (Guide|Letterbox)/.test(c.name || ''); // overlays: never count as picture
  const isHiddenGuide = c => /^Ultra Guide/.test(c.name || '');        // guides must be off for export

  /** The checks. seq = sequenceInfo(). Returns [{sev, kind, t, end, track, text, fix}] */
  function scan(seq, o) {
    const issues = [], fr = seq.frame || 1 / (seq.fps || 25), D = seq.duration;
    const add = (sev, kind, t, text, fix, extra) => issues.push(Object.assign({ sev, kind, t, text, fix }, extra || {}));
    const vClips = [], aClips = [];
    seq.video.forEach(tr => tr.clips.forEach(c => vClips.push(Object.assign({ track: 'V' + (tr.index + 1), muted: tr.muted }, c))));
    seq.audio.forEach(tr => tr.clips.forEach(c => aClips.push(Object.assign({ track: 'A' + (tr.index + 1), muted: tr.muted }, c))));
    if (!vClips.length && !aClips.length) { add('error', 'empty', 0, 'The sequence is empty.', 'Add clips before exporting.'); return issues; }

    // 1. black gaps: nowhere on any visible video track has an enabled clip
    const vis = vClips.filter(c => !c.disabled && !c.muted && !isGuide(c));
    for (const [a, b] of holes(union(vis.map(c => [c.start, c.end])), 0, D, fr * 0.5))
      add('error', 'gap', a, `Black gap of ${fmtLen(b - a, fr)}`, b - a < fr * 3 ? 'Probably a leftover from trimming: close it up (select the gap, press Delete).' : 'Close the gap or put something there.', { end: b });
    // 2. flash frames
    for (const c of vClips) if (!isGuide(c) && c.end - c.start < fr * 2.5) add('error', 'flash', c.start, `Flash frame on ${c.track}: “${c.name}” is only ${fmtLen(c.end - c.start, fr)} long`, 'Delete it or trim the neighbours over it.', { end: c.end, track: c.track });
    // 3. offline media
    const seenOffline = new Set();
    for (const c of vClips.concat(aClips)) if (c.offline && !seenOffline.has(c.itemId + c.start)) { seenOffline.add(c.itemId + c.start); add('error', 'offline', c.start, `Media offline on ${c.track}: “${c.name}”`, 'Reconnect the drive or relink the file (right-click › Link Media).', { end: c.end, track: c.track }); }
    // 4. guides still showing
    const guideTracks = seq.video.filter(tr => tr.clips.some(isHiddenGuide));
    for (const tr of guideTracks) if (!tr.muted) add('error', 'guide', 0, `Safe Zones guide is still showing on V${tr.index + 1}`, 'Press “Hide for export” in Safe Zones (it would be burned into the export).', { track: 'V' + (tr.index + 1) });
    // 5. disabled clips
    for (const c of vClips.concat(aClips)) if (c.disabled && !isGuide(c)) add('warn', 'disabled', c.start, `“${c.name}” on ${c.track} is switched off`, 'It won’t export. Right-click › Enable if you want it.', { end: c.end, track: c.track });
    // 6. repeated shots (same source moment used twice)
    const bySrc = {};
    for (const c of vClips) { if (isGuide(c) || c.isSequence || STILL.test(c.path || '') || !c.itemId) continue; (bySrc[c.itemId] = bySrc[c.itemId] || []).push(c); }
    for (const list of Object.values(bySrc)) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j], ov = Math.min(a.out, b.out) - Math.max(a.in, b.in);
        if (ov > Math.max(0.5, o.repeatMin)) add('warn', 'repeat', b.start, `Repeated shot: “${b.name}” at ${US.fmtDur(b.start)} reuses ${ov.toFixed(1)} s also seen at ${US.fmtDur(a.start)}`, 'Fine if it’s on purpose; otherwise swap one for another take.', { end: b.end, track: b.track, also: a.start });
      }
    }
    // 7. long shots (pacing)
    if (o.longShot > 0) for (const c of vClips) if (!isGuide(c) && !STILL.test(c.path || '') && c.end - c.start > o.longShot && c.track === 'V1') add('info', 'long', c.start, `Long shot: ${US.fmtDur(c.end - c.start)} on ${c.track}`, 'Consider a cutaway or B-roll if the pace drags.', { end: c.end, track: c.track });
    // 8. speed changes
    for (const c of vClips) if (c.speed && Math.abs(c.speed - 1) > 0.001 && !isGuide(c)) add('info', 'speed', c.start, `“${c.name}” plays at ${Math.round(c.speed * 100)}% speed`, 'Just so you know – check it looks smooth.', { end: c.end, track: c.track });
    // 9. sound holes
    const audible = aClips.filter(c => !c.disabled && !c.muted);
    if (audible.length) for (const [a, b] of holes(union(audible.map(c => [c.start, c.end])), 0, D, o.audioGap)) add(a < fr || b > D - fr ? 'info' : 'warn', 'silence', a, `No sound for ${fmtLen(b - a, fr)}`, 'Fine if intended (a pause or fade); otherwise add room tone or music.', { end: b });
    // 10. open notes (red markers or TODO / FIX)
    for (const m of seq.markers) if (m.color === 1 || /^(todo|fix|change|note)\b/i.test(m.name || '') || /^(todo|fix)\b/i.test(m.comment || '')) add('warn', 'note', m.start, `Open note: ${m.name || m.comment || 'red marker'}`, 'Deal with it, then delete or recolour the marker.', { end: m.end });
    // 11. locked tracks (tools that cut can't change them)
    for (const tr of seq.video.concat(seq.audio)) if (tr.locked) add('info', 'locked', 0, `${tr.name} is locked`, 'Unlock it if you meant to edit it.');
    return issues.sort((a, b) => ['error', 'warn', 'info'].indexOf(a.sev) - ['error', 'warn', 'info'].indexOf(b.sev) || a.t - b.t);
  }
  function fmtLen(sec, fr) { const f = Math.round(sec / fr); return f < 25 ? US.plural(f, 'frame') : `${sec.toFixed(1)} s`; }

  /* ---------- compare two versions ---------- */
  function segs(seq) {
    const out = [];
    seq.video.forEach(tr => tr.clips.forEach(c => { if (!isGuide(c) && !c.disabled) out.push({ track: tr.index, name: c.name, itemId: c.itemId || c.name, in: c.in, out: c.out, start: c.start, end: c.end }); }));
    return out.sort((x, y) => x.start - y.start || x.track - y.track);
  }
  /** Longest increasing subsequence (indices) – the clips that kept their order. */
  function lis(arr) {
    const p = new Array(arr.length), m = [];
    for (let i = 0; i < arr.length; i++) {
      let lo = 0, hi = m.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[m[mid]] < arr[i]) lo = mid + 1; else hi = mid; }
      p[i] = lo ? m[lo - 1] : -1; m[lo] = i;
    }
    const out = new Set(); let k = m.length ? m[m.length - 1] : -1; while (k >= 0) { out.add(k); k = p[k]; }
    return out;
  }
  /** What changed from version A (old) to B (new). Returns {changes:[{kind,t,text,inOld}], stats}. */
  function compare(A, B) {
    const fr = B.frame || 1 / (B.fps || 25), a = segs(A), b = segs(B), usedA = new Set(), pairs = [], changes = [];
    b.forEach((cb, bi) => {
      let best = -1, bestOv = 0;
      a.forEach((ca, ai) => { if (usedA.has(ai) || ca.itemId !== cb.itemId) return; const ov = Math.min(ca.out, cb.out) - Math.max(ca.in, cb.in); if (ov > bestOv) { bestOv = ov; best = ai; } });
      if (best >= 0) { usedA.add(best); pairs.push({ ai: best, bi }); }
    });
    const pairedB = new Set(pairs.map(x => x.bi));
    b.forEach((cb, bi) => { if (!pairedB.has(bi)) changes.push({ kind: 'added', t: cb.start, text: `Added: “${cb.name}” (${(cb.end - cb.start).toFixed(1)} s) on V${cb.track + 1}` }); });
    a.forEach((ca, ai) => { if (!usedA.has(ai)) changes.push({ kind: 'removed', t: ca.start, inOld: true, text: `Removed: “${ca.name}” (${(ca.end - ca.start).toFixed(1)} s) that was at ${US.fmtDur(ca.start)} in the old version` }); });
    const fmt = d => `${Math.abs(d).toFixed(1)} s ${d > 0 ? 'later' : 'earlier'}`;
    for (const { ai, bi } of pairs) {
      const ca = a[ai], cb = b[bi], dIn = cb.in - ca.in, dOut = cb.out - ca.out, parts = [];
      if (Math.abs(dIn) > fr / 2) parts.push(`starts ${fmt(dIn)}`);
      if (Math.abs(dOut) > fr / 2) parts.push(`ends ${fmt(dOut)}`);
      if (parts.length) changes.push({ kind: 'trimmed', t: cb.start, text: `Trimmed: “${cb.name}” ${parts.join(', ')}` });
    }
    const order = pairs.slice().sort((x, y) => x.bi - y.bi), keep = lis(order.map(x => x.ai));
    order.forEach((x, i) => { if (!keep.has(i)) changes.push({ kind: 'moved', t: b[x.bi].start, text: `Moved: “${b[x.bi].name}” (was at ${US.fmtDur(a[x.ai].start)})` }); });
    const mk = seq => new Set(seq.markers.map(m => `${(m.name || '').trim()}@${Math.round(m.start)}`));
    const ma = mk(A), mb = mk(B);
    B.markers.forEach(m => { if (!ma.has(`${(m.name || '').trim()}@${Math.round(m.start)}`) && (m.name || m.comment)) changes.push({ kind: 'marker', t: m.start, text: `New marker: ${m.name || m.comment}` }); });
    changes.sort((x, y) => x.t - y.t);
    const count = k => changes.filter(c => c.kind === k).length;
    return { changes, stats: { added: count('added'), removed: count('removed'), trimmed: count('trimmed'), moved: count('moved'), oldLength: A.duration, newLength: B.duration } };
  }

  const opts = () => Object.assign({ longShot: 0, audioGap: 0.5, repeatMin: 0.5 }, US.settings.get('check', {}));

  async function runCheck(job, seqId) {
    const id = seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!id) throw new US.UserError('NO_SEQUENCE');
    job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const seq = await US.host.call('sequenceInfo', { seqId: id });
    job.set({ who: 'studio', msg: 'Checking' }).progress(0.6);
    const issues = scan(seq, opts());
    const n = s => issues.filter(i => i.sev === s).length;
    return { seq, issues, summary: issues.length ? `${n('error')} to fix, ${n('warn')} to look at, ${n('info')} for info` : 'No problems found' };
  }

  US.actions.register({
    id: 'check.run', tool: 'check', title: 'Check the cut before export',
    describe: 'Scans the active sequence for black gaps, flash frames, offline media, guides left on, switched-off clips, repeated shots, sound holes and open notes.',
    examples: ['check the cut', 'anything wrong before I export?', 'look for flash frames'],
    match: t => /check (the |my )?(cut|edit|sequence|timeline)|flash frame|black gap|before (i )?export|qc\b|quality check|final check/i.test(t) ? {} : null,
    run: async (p, job) => { const r = await runCheck(job); US.tools.open('check', { result: r }); return { summary: r.summary }; }
  });

  US.actions.register({
    id: 'check.compare', tool: 'check', title: 'Compare two versions of a cut',
    describe: 'Lists what changed between an older and a newer sequence: clips added, removed, trimmed or moved, and the change in length.',
    params: { oldName: { type: 'string', default: '', desc: 'Name (or part of the name) of the older sequence' }, newName: { type: 'string', default: '', desc: 'Name of the newer sequence (default: the active one)' } },
    examples: ['what changed between v1 and v2', 'compare this cut with the previous version'],
    match(t) { const m = /(?:between|compare)\s+(.+?)\s+(?:and|with|to|vs\.?)\s+(.+?)\s*\??$/i.exec(t); if (m && !/this|previous|last/i.test(m[1])) return { oldName: m[1].trim(), newName: m[2].trim() }; return /compare|what changed|differences?/i.test(t) && /version|cut|edit|v\d/i.test(t) ? {} : null; },
    run: async (p, job) => {
      const seqs = await US.host.call('listSequences');
      const find = q => { if (!q) return null; const l = q.toLowerCase(); return seqs.find(s => s.name.toLowerCase() === l) || seqs.find(s => s.name.toLowerCase().includes(l)); };
      const nw = find(p.newName) || (US.ctx.sequence && seqs.find(s => s.id === US.ctx.sequence.id));
      if (!nw) throw new US.UserError('NO_SEQUENCE');
      const old = find(p.oldName) || guessOld(seqs, nw);
      if (!old || old.id === nw.id) throw new US.UserError('BAD_INPUT', { title: 'Couldn’t tell which older version to compare with.', action: 'Name both versions, e.g. “compare Interview v1 and Interview v2”, or use Final Check › Compare.' });
      job.set({ who: 'premiere', msg: 'Reading both versions' });
      const [A, B] = [await US.host.call('sequenceInfo', { seqId: old.id }), await US.host.call('sequenceInfo', { seqId: nw.id })];
      const r = compare(A, B);
      US.tools.open('check', { compare: { A, B, r } });
      return { summary: `${old.name} → ${nw.name}: ${r.stats.added} added, ${r.stats.removed} removed, ${r.stats.trimmed} trimmed, ${r.stats.moved} moved` };
    }
  });
  /** The most likely previous version: same name with a lower number, or the most similar name. */
  function guessOld(seqs, nw) {
    const base = s => s.name.toLowerCase().replace(/[\s_-]*(v|ver|version|cut|draft)?\s*\d+\s*$/i, '').trim();
    const num = s => { const m = /(\d+)\s*$/.exec(s.name); return m ? +m[1] : 0; };
    const same = seqs.filter(s => s.id !== nw.id && base(s) === base(nw) && num(s) < num(nw)).sort((x, y) => num(y) - num(x));
    return same[0] || null;
  }

  /* ---------- the project: unused, offline, imported twice (pure) ---------- */
  /**
   * items: from tidyAudit. Ultra Studio's own bins are never counted as unused or duplicates. exists(path): whether the
   * file is there – right after a project opens, Premiere reports clips "offline" until it has linked them.
   */
  function audit(items, { exists = () => false } = {}) {
    const media = items.filter(x => !x.sequence && x.path);
    const ours = x => /^JMG Ultra Studio\b/.test(x.bin || '');
    const byPath = new Map();
    for (const x of media) if (!ours(x) && !x.subclip) (byPath.get(x.path) || byPath.set(x.path, []).get(x.path)).push(x);   // a subclip isn't a second import
    return {
      clips: media.length, sequences: items.filter(x => x.sequence).length,
      offline: media.filter(x => x.offline && !exists(x.path)),
      linking: media.filter(x => x.offline && exists(x.path)).length,
      unused: media.filter(x => !x.used && !ours(x)),
      duplicates: Array.from(byPath.entries()).filter(([, l]) => l.length > 1).map(([path, list]) => ({ path, list }))
    };
  }

  US.tools.register({
    id: 'check', name: 'Final Check', short: 'Check', icon: 'check', group: 'finish', order: 32,
    blurb: 'Catches black gaps, flash frames and offline media; compares two versions.',
    hostFns: ['sequenceInfo', 'setPlayhead', 'addSequenceMarkers', 'tidyAudit', 'tidyMove'],
    create() {
      const v = ui.toolView({ icon: 'check', title: 'Final Check', blurb: 'Catches the mistakes that slip into exports, shows what changed between two versions, and tidies the project. Checking never changes your cut.' });
      let o = opts(), last = null, show = { error: true, warn: true, info: false };
      const longShot = ui.slider({ label: 'Flag shots longer than', min: 0, max: 60, step: 1, value: o.longShot, fmt: x => x ? x + ' s' : 'off', onChange: x => { o.longShot = x; US.settings.set('check', o); } });
      const audioGap = ui.slider({ label: 'Flag sound holes longer than', min: 0.1, max: 3, step: 0.1, value: o.audioGap, fmt: x => x.toFixed(1) + ' s', onChange: x => { o.audioGap = x; US.settings.set('check', o); } });
      const btn = ui.actionButton('Check the cut', async () => {
        const r = await US.jobs.run({ title: 'Checking the cut', tool: 'check' }, async job => { const r = await runCheck(job); last = r; render(); return { summary: r.summary }; });
        return r;
      });
      const seqLine = h('div.field-hint');
      const results = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

      function render() {
        US.clear(results);
        if (!last) return;
        const { issues, seq } = last;
        const n = s => issues.filter(i => i.sev === s).length;
        results.appendChild(ui.stats(ui.stat(n('error'), 'to fix'), ui.stat(n('warn'), 'to look at'), ui.stat(n('info'), 'for info'), ui.stat(US.fmtDur(seq.duration), 'length')));
        if (!issues.length) { results.appendChild(ui.empty({ icon: 'ok', title: 'All clear', text: `No problems found in ${seq.name}.` })); return; }
        results.appendChild(h('div.row', ['error', 'warn', 'info'].map(s => ui.toggle({ label: SEV[s].label, value: show[s], onChange: x => { show[s] = x; render(); } }))));
        const rows = issues.filter(i => show[i.sev]).map(i => ({
          color: SEV[i.sev].color, title: i.text, sub: i.fix, right: US.fmtDur(i.t, true), tip: 'Go to this point in the sequence',
          onClick: () => US.host.call('setPlayhead', { seqId: seq.id, seconds: i.t }).catch(e => ui.showError(e))
        }));
        results.appendChild(ui.list(rows, { empty: { icon: 'ok', title: 'Nothing in the ticked groups' } }));
        results.appendChild(h('div.row',
          ui.button('Add markers for these', { icon: 'plus', onClick: () => addMarkers(issues.filter(i => show[i.sev])) }),
          ui.button('Remove check markers', { kind: 'ghost', onClick: removeMarkers }),
          ui.button('Copy as text', { kind: 'ghost', onClick: () => { ui.copy(issues.map(i => `${US.fmtDur(i.t, true)}  [${SEV[i.sev].label}] ${i.text} – ${i.fix}`).join('\n')); ui.toast({ type: 'ok', title: 'Copied', timeout: 1500 }); } })));
      }
      async function addMarkers(list) {
        if (!last) return;
        await US.jobs.run({ title: 'Adding check markers', tool: 'check' }, async job => {
          const ms = list.filter(i => i.kind !== 'note').map(i => ({ start: i.t, end: i.end, name: 'Check: ' + i.text.slice(0, 60), comment: i.fix, color: SEV[i.sev].marker }));
          job.set({ who: 'premiere' }).progress(0.3, `Adding ${ms.length} markers`);
          const guids = await US.host.call('addSequenceMarkers', { seqId: last.seq.id, markers: ms });
          const store = US.projectStore(US.ctx.project && US.ctx.project.path);
          const all = store.get('checkMarkers', {}); all[last.seq.id] = (all[last.seq.id] || []).concat(guids); store.set('checkMarkers', all);
          return { summary: `${US.plural(guids.length, 'marker')} added to ${last.seq.name}` };
        });
      }
      async function removeMarkers() {
        if (!last) return;
        const store = US.projectStore(US.ctx.project && US.ctx.project.path);
        const all = store.get('checkMarkers', {}); const guids = all[last.seq.id] || [];
        if (!guids.length) return ui.toast({ type: 'info', title: 'No check markers to remove', timeout: 2000 });
        try { const n = await US.host.call('removeSequenceMarkers', { seqId: last.seq.id, guids }); all[last.seq.id] = []; store.set('checkMarkers', all); ui.toast({ type: 'ok', title: `Removed ${US.plural(n, 'marker')}` }); } catch (e) { ui.showError(e); }
      }
      function renderCtx() { seqLine.textContent = US.ctx.sequence ? `Will check: ${US.ctx.sequence.name} (${US.fmtDur(US.ctx.sequence.duration)})` : 'Open a sequence in the Timeline first.'; btn.setEnabled(!!US.ctx.sequence); }
      US.bus.on('context', renderCtx);
      /* compare two versions */
      const oldSel = ui.select({ options: [], placeholder: 'Older version…' }), newSel = ui.select({ options: [], placeholder: 'Newer version…' });
      const cmpResults = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
      let lastCmp = null;
      async function fillSeqs() {
        try {
          const seqs = await US.host.call('listSequences'); const cur = US.ctx.sequence && seqs.find(s => s.id === US.ctx.sequence.id);
          const opts2 = seqs.map(s => ({ value: s.id, label: s.name }));
          newSel.setOptions(opts2, newSel.get() || (cur && cur.id) || '');
          const g = cur && guessOld(seqs, cur);
          oldSel.setOptions(opts2, oldSel.get() || (g && g.id) || '');
        } catch (e) { /* no project */ }
      }
      const cmpBtn = ui.actionButton('Compare', async () => {
        if (!oldSel.get() || !newSel.get() || oldSel.get() === newSel.get()) return ui.showError(new US.UserError('BAD_INPUT', { title: 'Pick two different sequences.', action: 'Choose the older version and the newer version.' }));
        await US.jobs.run({ title: 'Comparing two versions', tool: 'check' }, async job => {
          job.set({ who: 'premiere', msg: 'Reading both versions' });
          const A = await US.host.call('sequenceInfo', { seqId: oldSel.get() }), B = await US.host.call('sequenceInfo', { seqId: newSel.get() });
          lastCmp = { A, B, r: compare(A, B) }; renderCmp();
          const st = lastCmp.r.stats;
          return { summary: `${st.added} added, ${st.removed} removed, ${st.trimmed} trimmed, ${st.moved} moved` };
        });
      });
      const COLORS = { added: 'var(--ok)', removed: 'var(--err)', trimmed: 'var(--warn)', moved: 'var(--info)', marker: 'var(--text-3)' };
      function renderCmp() {
        US.clear(cmpResults); if (!lastCmp) return;
        const { A, B, r } = lastCmp, st = r.stats, d = st.newLength - st.oldLength;
        cmpResults.appendChild(ui.stats(ui.stat(st.added, 'added'), ui.stat(st.removed, 'removed'), ui.stat(st.trimmed, 'trimmed'), ui.stat(st.moved, 'moved'), ui.stat((d >= 0 ? '+' : '−') + US.fmtDur(Math.abs(d)), 'length change')));
        if (!r.changes.length) { cmpResults.appendChild(ui.empty({ icon: 'ok', title: 'No differences', text: `${A.name} and ${B.name} use the same shots in the same order.` })); return; }
        cmpResults.appendChild(ui.list(r.changes.map(c => ({ color: COLORS[c.kind], title: c.text, right: US.fmtDur(c.t, true), sub: c.inOld ? 'In the old version' : '', onClick: () => US.host.call('setPlayhead', { seqId: c.inOld ? A.id : B.id, seconds: c.t }).catch(e => ui.showError(e)) }))));
        cmpResults.appendChild(h('div.row',
          ui.button('Add change markers to the new version', { icon: 'plus', onClick: async () => {
            await US.jobs.run({ title: 'Marking the changes', tool: 'check' }, async job => {
              const ms = r.changes.filter(c => !c.inOld && c.kind !== 'marker').map(c => ({ start: c.t, name: c.text.slice(0, 64), comment: `Changed since ${A.name}`, color: 7 }));
              job.set({ who: 'premiere' }).progress(0.3, `Adding ${ms.length} markers`);
              const guids = await US.host.call('addSequenceMarkers', { seqId: B.id, markers: ms });
              const store = US.projectStore(US.ctx.project && US.ctx.project.path); const all = store.get('checkMarkers', {}); all[B.id] = (all[B.id] || []).concat(guids); store.set('checkMarkers', all);
              return { summary: `${US.plural(guids.length, 'marker')} added to ${B.name}` };
            });
          } }),
          ui.button('Copy as text', { kind: 'ghost', onClick: () => { ui.copy(`${A.name} → ${B.name}\n` + r.changes.map(c => `${US.fmtDur(c.t, true)}  ${c.text}`).join('\n')); ui.toast({ type: 'ok', title: 'Copied', timeout: 1500 }); } })));
      }
      const checkPane = h('div.tool-body', ui.card(seqLine, ui.section('Settings', [longShot, audioGap], { open: false })), btn, results);
      const comparePane = h('div.tool-body.hidden', ui.card(h('div.grid2', ui.field('Older version', oldSel), ui.field('Newer version', newSel)), h('div.field-hint', 'Lists shots added, removed, trimmed and moved – handy after a round of client changes.')), cmpBtn, cmpResults);
      // the project: what's unused, offline or imported twice
      const projResults = h('div');
      const store = () => US.projectStore(US.ctx.project && US.ctx.project.path);
      function renderProj(a) {
        US.clear(projResults);
        const moved = store().get('tidyMoved');
        const putBack = moved && moved.ids.length ? ui.button(`Put the ${US.plural(moved.ids.length, 'unused clip')} back`, { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Putting clips back', tool: 'check' }, async job => {
          const byBin = {}; moved.ids.forEach((id, k) => { (byBin[moved.from[k]] = byBin[moved.from[k]] || []).push(id); });
          let n = 0; for (const [bin, ids] of Object.entries(byBin)) n += await US.host.call('tidyMove', { ids, binPath: bin === '(Project root)' ? '' : bin });
          store().set('tidyMoved', null); renderProj(a);
          return { summary: `${US.plural(n, 'clip')} back where they were` };
        }) }) : null;
        if (!a) { if (putBack) projResults.appendChild(putBack); return; }
        const list = (rows, empty) => rows.length ? ui.list(rows.slice(0, 200)) : h('div.field-hint', empty);
        projResults.append(ui.card(
          ui.stats(ui.stat(a.clips, 'clips'), ui.stat(a.sequences, 'sequences'), ui.stat(a.unused.length, 'not used in any sequence'), ui.stat(a.offline.length, 'offline'), ui.stat(a.duplicates.length, 'imported twice')),
          a.linking ? ui.note(`Premiere is still linking ${US.plural(a.linking, 'clip')} it has just opened (the files are there). Check again in a minute for the full picture.`) : null,
          ui.section(`Offline (${a.offline.length})`, [list(a.offline.map(x => ({ title: x.name, sub: x.path, right: x.bin, color: 'var(--err)' })), 'Nothing offline.'), a.offline.length ? h('div.field-hint', 'Relink them in Premiere: select › right-click › Link Media.') : null], { open: a.offline.length > 0 }),
          ui.section(`Not used in any sequence (${a.unused.length})`, [list(a.unused.map(x => ({ title: x.name, sub: x.bin })), 'Every clip is used somewhere.'),
            a.unused.length ? ui.button(`Move them into a bin “Unused”`, { small: true, onClick: async () => {
              const before = store().get('tidyMoved') || { ids: [], from: [] };
              const todo = a.unused.filter(x => !/^Unused\b/.test(x.bin) && !before.ids.includes(x.id));   // not the ones already tidied away
              if (!todo.length) { ui.toast({ type: 'info', title: 'They’re already in the Unused bin' }); return; }
              if (!await ui.confirm({ title: `Move ${US.plural(todo.length, 'clip')} into a bin called “Unused”?`, text: 'Nothing is deleted, and Ultra Studio remembers where each one was so you can put them back.', ok: 'Move them' })) return;
              await US.jobs.run({ title: 'Tidying the project', tool: 'check' }, async job => {
                const d = new Date(), name = `Unused ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
                const n = await US.host.call('tidyMove', { ids: todo.map(x => x.id), binPath: name });
                // keep the earlier record: each clip remembers the bin it first came from
                store().set('tidyMoved', { ids: before.ids.concat(todo.map(x => x.id)), from: before.from.concat(todo.map(x => x.bin)) });
                todo.forEach(x => { x.bin = name; }); renderProj(a);
                return { summary: `${US.plural(n, 'clip')} moved into “${name}”` };
              });
            } }) : null], { open: false }),
          ui.section(`Imported twice (${a.duplicates.length})`, [list(a.duplicates.map(d => ({ title: US.basename(d.path), sub: d.list.map(x => x.bin).join(' · '), right: `${d.list.length}×` })), 'No media is imported twice.')], { open: false }),
          putBack));
      }
      const projBtn = ui.actionButton('Check the project', () => US.jobs.run({ title: 'Checking the project', tool: 'check' }, async job => {
        job.set({ who: 'premiere', msg: 'Going through every bin and sequence' });
        const fs = require('fs');
        const a = audit((await US.host.call('tidyAudit')).items, { exists: p => { try { return fs.existsSync(p); } catch (e) { return false; } } });
        renderProj(a);
        return { summary: `${US.plural(a.clips, 'clip')} · ${a.unused.length} unused · ${a.offline.length} offline · ${a.duplicates.length} imported twice` };
      }), { icon: 'check' });
      const projectPane = h('div.tool-body.hidden', ui.card(h('div', 'Lists clips not used in any sequence, offline media and anything imported twice. It never deletes anything.')), projBtn, projResults);
      renderProj(null);
      const mode = ui.segmented({ options: [{ value: 'check', label: 'Check this cut' }, { value: 'compare', label: 'Compare two versions' }, { value: 'project', label: 'Check the project' }], value: 'check', onChange: m => setMode(m) });
      function setMode(m) { mode.set(m); checkPane.classList.toggle('hidden', m !== 'check'); comparePane.classList.toggle('hidden', m !== 'compare'); projectPane.classList.toggle('hidden', m !== 'project'); if (m === 'compare') fillSeqs(); }
      v.body.append(mode, checkPane, comparePane, projectPane);
      return { el: v.el, onShow(opt) { renderCtx(); if (opt && opt.result) { setMode('check'); last = opt.result; render(); } if (opt && opt.compare) { setMode('compare'); lastCmp = opt.compare; fillSeqs().then(() => { oldSel.set(opt.compare.A.id); newSel.set(opt.compare.B.id); }); renderCmp(); } } };
    }
  });

  US.check = { scan, union, holes, compare, guessOld, audit };
})();
