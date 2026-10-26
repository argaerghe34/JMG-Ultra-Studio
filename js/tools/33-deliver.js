/* JMG Ultra Studio – Deliver: every export in one go (with live Media Encoder progress),
   client notes turned into markers, and YouTube chapters from markers. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path');

  const OUTPUTS = {
    master: { label: 'Master (same shape as the sequence)', short: 'Master', kind: 'video' },
    v916: { label: 'Vertical 9:16 (Auto Reframe)', short: '9x16', kind: 'video', num: 9, den: 16 },
    s11: { label: 'Square 1:1 (Auto Reframe)', short: '1x1', kind: 'video', num: 1, den: 1 },
    p45: { label: 'Portrait 4:5 (Auto Reframe)', short: '4x5', kind: 'video', num: 4, den: 5 },
    wav: { label: 'Sound only (WAV 48 kHz)', short: 'Sound', kind: 'audio' },
    thumb: { label: 'Thumbnail (frame at the playhead)', short: 'Thumbnail', kind: 'image' }
  };
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Export';

  async function exportPack(o, job) {
    const seqId = o.seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!seqId) throw new US.UserError('NO_SEQUENCE');
    const keys = o.outputs.filter(k => OUTPUTS[k]);
    if (!keys.length) throw new US.UserError('BAD_INPUT', { title: 'Nothing to export.', action: 'Tick at least one output.' });
    const seq = await US.host.call('sequenceInfo', { seqId, clips: false });
    const presets = await US.host.call('encoderPresets');
    if (!presets.h264 || (keys.includes('wav') && !presets.wav)) throw new US.UserError('PRESET_MISSING', { detail: JSON.stringify(presets) });
    const dir = o.folder || path.join(US.fsx.exportsDir(), 'Exports', `${safeName(seq.name)} ${new Date().toISOString().slice(0, 10)}`);
    US.fsx.ensureDir(dir);

    // guides would be burned in
    const guides = await US.host.call('guideStatus', { seqId });
    if (guides.some(g => !g.hidden)) {
      job.set({ msg: 'Hiding the Safe Zones guides so they don’t export' });
      await US.host.call('showGuides', { seqId, show: false });
      US.log('info', 'Hid Safe Zones guides before exporting', '', 'deliver');
    }

    // 1. reframed versions (new sequences in JMG Ultra Studio/Deliver)
    const plan = [];
    const reframes = keys.filter(k => OUTPUTS[k].num);
    let step = 0; const steps = reframes.length + 1;
    try {
    for (const k of reframes) {
      job.check();
      job.set({ who: 'premiere' }).progress(0.02 + 0.18 * (step++ / steps), `Auto Reframe: making the ${OUTPUTS[k].short} version (this can take a while on long sequences)`);
      let r = await US.host.call('autoReframe', { seqId, num: OUTPUTS[k].num, den: OUTPUTS[k].den, motion: 'default', name: `${seq.name} – ${OUTPUTS[k].short.replace('x', ':')}`, binPath: 'JMG Ultra Studio/Deliver' });
      if (o.fullSize !== false) {
        // Auto Reframe keeps the sequence height (607×1080 from a 1080p edit); platforms want 1080×1920 etc.
        const big = Math.max(seq.width, seq.height) >= 3000, base = big ? 2160 : 1080;
        const W = base, H = Math.round(base * OUTPUTS[k].den / OUTPUTS[k].num);
        job.progress(0.02 + 0.18 * (step - 0.5) / steps, `Making the ${OUTPUTS[k].short} version full size (${W}×${H})`);
        r = await US.host.call('fitToSize', { seqId: r.id, width: W, height: H, name: `${seq.name} – ${OUTPUTS[k].short.replace('x', ':')} ${W}×${H}`, binPath: 'JMG Ultra Studio/Deliver' });
      }
      plan.push({ key: k, seqId: r.id, out: path.join(dir, `${safeName(seq.name)} - ${OUTPUTS[k].short}.mp4`), preset: presets.h264 });
    }
    } finally {
      // making new sequences opens them; put the editor back where they were
      if (reframes.length) { try { await US.host.call('openSequence', { seqId }); } catch (e) { /* ignore */ } }
    }
    if (keys.includes('master')) plan.unshift({ key: 'master', seqId, out: path.join(dir, `${safeName(seq.name)} - Master.mp4`), preset: presets.h264 });
    if (keys.includes('wav')) plan.push({ key: 'wav', seqId, out: path.join(dir, `${safeName(seq.name)} - Sound.wav`), preset: presets.wav });

    // 2. thumbnail straight away (no encoder needed)
    let thumb = null;
    if (keys.includes('thumb')) {
      job.set({ who: 'premiere', msg: 'Saving the thumbnail' });
      const ctx = US.ctx.sequence && US.ctx.sequence.id === seqId ? US.ctx.sequence : null;
      thumb = await US.host.call('exportFrame', { seqId, seconds: ctx ? ctx.playhead || 0 : 0, outBase: US.encoder.unique(path.join(dir, `${safeName(seq.name)} - Thumbnail.png`)).replace(/\.png$/, '') });
    }
    if (!plan.length) return { summary: 'Thumbnail saved', dir };

    // 3. render through Media Encoder, following its real progress
    const tasks = plan.map(p => ({ seqId: p.seqId, out: p.out, preset: p.preset, name: OUTPUTS[p.key].short, key: p.key }));
    await US.encoder.run(tasks, job, { label: 'Exporting', from: 0.2, to: 1 });
    const failed = tasks.filter(t => !t.ok), ok = tasks.filter(t => t.ok);
    US.log(failed.length ? 'error' : 'ok', `Exports in ${dir}`, tasks.map(t => `${t.ok ? '✓' : '✗'} ${path.basename(t.out)}${t.ok ? '' : ' – ' + t.error}`).concat(thumb ? ['✓ ' + path.basename(thumb)] : []).join('\n'), 'deliver');
    if (failed.length) throw new US.UserError('RENDER_FAILED', { title: `${failed.length} of ${tasks.length} exports failed.`, action: 'Open Media Encoder to see why, then try those again.', detail: failed.map(t => `${path.basename(t.out)}: ${t.error}`).join('\n') });
    return { summary: `${ok.length + (thumb ? 1 : 0)} files saved`, dir };
  }

  /* ---------- client notes ---------- */
  const TC = '(\\d{1,2}(?::\\d{1,2}){1,3}(?:[.;]\\d+)?)';
  const LINE = new RegExp(`^\\s*(?:[-*•]\\s*)?[\\[(@]?\\s*${TC}(?:\\s*(?:-|–|—|to)\\s*${TC})?\\s*[\\])]?\\s*(?:[-–—:|]\\s*)?(.*)$`, 'i');
  /** Parse pasted notes or a Frame.io-style CSV. Returns [{t, end, text}] (end may be null). */
  function parseNotes(text, fps) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    // CSV with a header row containing a timecode column and a comment column
    const head = lines[0] || '';
    if (/,|\t/.test(head) && /time|timecode|tc/i.test(head) && /comment|note|text|feedback/i.test(head)) {
      const sep = head.includes('\t') ? '\t' : ',';
      const split = l => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map(x => x.trim()); };
      const cols = split(head).map(c => c.toLowerCase());
      const ti = cols.findIndex(c => /timecode|time ?stamp|^time$|^tc$|^in$/.test(c)), ci = (() => { const exact = cols.findIndex(c => /^(comments?|notes?|text|feedback|message)$/.test(c)); return exact >= 0 ? exact : cols.findIndex(c => /comment|note|text|feedback/.test(c) && !/number|#|\bid\b|count/.test(c)); })(), ai = cols.findIndex(c => /author|name|user|commenter/.test(c));
      if (ti >= 0 && ci >= 0) {
        for (const l of lines.slice(1)) { if (!l.trim()) continue; const r = split(l); const t = US.time.parseTC(r[ti], fps); if (isFinite(t)) out.push({ t, end: null, text: (ai >= 0 && r[ai] ? r[ai] + ': ' : '') + r[ci] }); }
        return out;
      }
    }
    for (const l of lines) {
      if (!l.trim()) continue;
      const m = LINE.exec(l);
      if (m && isFinite(US.time.parseTC(m[1], fps))) out.push({ t: US.time.parseTC(m[1], fps), end: m[2] ? US.time.parseTC(m[2], fps) : null, text: (m[3] || '').trim() || '(no comment)' });
      else if (out.length) out[out.length - 1].text += ' ' + l.trim();
    }
    return out;
  }
  /** Notes written against a 01:00:00:00 start: shift them back an hour if that's clearly the case. */
  function autoOffset(notes, duration) {
    if (notes.length && notes.every(n => n.t >= 3600) && duration < 3600) return -3600;
    return 0;
  }

  /* ---------- chapters ---------- */
  function chapters(markers, duration, which) {
    let ms = markers.slice().sort((a, b) => a.start - b.start);
    if (which === 'named') ms = ms.filter(m => (m.name || '').trim());
    else if (which !== 'all') ms = ms.filter(m => String(m.color) === String(which));
    const list = ms.map((m, i) => ({ t: m.start, title: ((m.name || m.comment || '').trim() || `Chapter ${i + 1}`).replace(/\s+/g, ' ') }));
    if (!list.length || list[0].t > 0.5) list.unshift({ t: 0, title: 'Intro' }); else list[0].t = 0;
    const problems = [];
    if (list.length < 3) problems.push('YouTube needs at least 3 chapters.');
    list.forEach((c, i) => { const next = i + 1 < list.length ? list[i + 1].t : duration; if (next - c.t < 10) problems.push(`“${c.title}” is shorter than 10 seconds (YouTube’s minimum).`); });
    return { text: list.map(c => `${US.time.toYouTube(c.t)} ${c.title}`).join('\n'), list, problems };
  }

  /* ---------- actions ---------- */
  const outOpts = () => Object.assign({ outputs: ['master', 'v916', 'thumb'], fullSize: true }, US.settings.get('deliver', {}));
  US.actions.register({
    id: 'deliver.pack', tool: 'deliver', title: 'Export the delivery pack', changes: true,
    describe: 'Exports the active sequence through Media Encoder: master, vertical 9:16 / square 1:1 / portrait 4:5 versions via Auto Reframe, a WAV and a thumbnail.',
    params: { outputs: { type: 'string', default: 'master,v916,thumb', desc: 'Comma list of master, v916, s11, p45, wav, thumb' } },
    examples: ['export the master and a vertical version', 'make the social versions', 'export everything'],
    match(t) {
      if (!/export|deliver|render out|social versions|vertical version|square version/i.test(t)) return null;
      const k = [];
      if (/master|main|16:9|everything|all/i.test(t) || !/vertical|9:16|square|1:1|4:5|portrait|wav|audio|thumbnail/i.test(t)) k.push('master');
      if (/vertical|9:16|reels|tiktok|shorts|social|everything|all/i.test(t)) k.push('v916');
      if (/square|1:1|everything|all/i.test(t)) k.push('s11');
      if (/4:5|portrait|everything|all/i.test(t)) k.push('p45');
      if (/wav|audio|sound|everything|all/i.test(t)) k.push('wav');
      if (/thumbnail|everything|all/i.test(t)) k.push('thumb');
      return { outputs: k.join(',') };
    },
    run: (p, job) => exportPack({ outputs: String(p.outputs).split(',').map(s => s.trim()), fullSize: outOpts().fullSize }, job)
  });
  US.actions.register({
    id: 'deliver.notes', tool: 'deliver', title: 'Turn client notes into markers', changes: true,
    describe: 'Adds a red marker on the active sequence for every timecoded note in the given text.',
    params: { text: { type: 'string', default: '', desc: 'The pasted notes, one per line, each starting with a timecode' } },
    examples: ['turn the client notes into markers', 'add these notes as markers: 0:12 cut the cough, 1:05 swap the music'],
    match(t) {
      if (!(/notes?|feedback|comments?/i.test(t) && /marker/i.test(t))) return null;
      // notes typed into the sentence ("…: 0:12 cut the cough, 1:05 swap the music") are used directly; otherwise open the screen
      return /\d:\d\d/.test(t) ? { text: t.replace(/^.*?:\s*(?=\d)/, '').replace(/,\s*(?=\d{1,2}:\d)/g, '\n') } : { text: '' };
    },
    run: async (p, job) => {
      const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
      if (!String(p.text || '').trim()) { US.tools.open('deliver', { tab: 'notes' }); return { summary: 'Paste the notes into Deliver › Client notes' }; }
      const notes = parseNotes(p.text, s.fps); if (!notes.length) throw new US.UserError('NOTHING_FOUND', { title: 'No timecodes found in those notes.', action: 'Start each note with a time, like “1:05 swap the music”.' });
      const off = autoOffset(notes, s.duration);
      return addNoteMarkers(s, notes.map(n => Object.assign({}, n, { t: n.t + off, end: n.end != null ? n.end + off : null })), 1, job);
    }
  });
  async function addNoteMarkers(seq, notes, color, job) {
    job.set({ who: 'premiere' }).progress(0.3, `Adding ${notes.length} markers`);
    const inside = notes.filter(n => n.t >= 0 && n.t <= seq.duration + 0.01);
    const guids = await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: inside.map(n => ({ start: n.t, end: n.end && n.end > n.t ? n.end : null, name: n.text.slice(0, 64), comment: n.text, color })) });
    const store = US.projectStore(US.ctx.project && US.ctx.project.path);
    const all = store.get('noteMarkers', {}); all[seq.id] = (all[seq.id] || []).concat(guids); store.set('noteMarkers', all);
    const skipped = notes.length - inside.length;
    return { summary: `${US.plural(guids.length, 'note')} added as markers${skipped ? ` (${skipped} outside the sequence skipped)` : ''}` };
  }
  US.actions.register({
    id: 'deliver.chapters', tool: 'deliver', title: 'Make YouTube chapters from markers',
    describe: 'Builds a YouTube chapter list (0:00 Intro, 1:23 …) from the active sequence’s named markers.',
    examples: ['youtube chapters', 'make chapters from my markers'],
    match: t => /chapter/i.test(t) ? {} : null,
    run: async (p, job) => {
      const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
      const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
      const c = chapters(info.markers, info.duration, 'named');
      ui.copy(c.text);
      US.tools.open('deliver', { tab: 'chapters' });
      return { summary: `${c.list.length} chapters copied${c.problems.length ? ' – ' + c.problems[0] : ''}` };
    }
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'deliver', name: 'Deliver', short: 'Deliver', icon: 'deliver', group: 'finish', order: 33,
    blurb: 'Every export in one go, client notes as markers, YouTube chapters.',
    hostFns: ['encoderPresets', 'encoderListen', 'queueExport', 'queueItemExport', 'startEncoderBatch', 'autoReframe', 'exportFrame', 'guideStatus', 'showGuides', 'addSequenceMarkers', 'removeSequenceMarkers'],
    create() {
      const v = ui.toolView({ icon: 'deliver', title: 'Deliver', blurb: 'Export everything in one go, turn client notes into markers, and make YouTube chapters.' });
      const tabs = ui.segmented({ options: [{ value: 'pack', label: 'Export pack' }, { value: 'notes', label: 'Client notes' }, { value: 'chapters', label: 'Chapters' }], value: 'pack', onChange: t => showTab(t) });
      const panes = { pack: h('div.tool-body'), notes: h('div.tool-body'), chapters: h('div.tool-body') };
      const seqLine = h('div.field-hint');

      /* export pack */
      let o = outOpts(), folder = '';
      const toggles = Object.keys(OUTPUTS).map(k => ui.toggle({ label: OUTPUTS[k].label, value: o.outputs.includes(k), onChange: on => { o.outputs = on ? o.outputs.concat(k) : o.outputs.filter(x => x !== k); US.settings.set('deliver', o); } }));
      const folderLine = h('div.field-hint');
      const showFolder = () => { folderLine.textContent = folder ? `Saving to ${folder}` : 'Saving to Documents › JMG Ultra Studio › Exports › <sequence name and date>'; };
      showFolder();
      const chooseFolder = ui.button('Choose folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = window.cep.fs.showOpenDialogEx(false, true, 'Where should the exports go?', folder || US.fsx.exportsDir(), []); if (r && r.data && r.data[0]) { folder = US.normPath(r.data[0]); showFolder(); } } catch (e) { ui.showError(e); } } });
      let lastDir = '';
      const openBtn = ui.button('Open export folder', { small: true, icon: 'folder', onClick: () => lastDir && require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + lastDir + '"') });
      openBtn.classList.add('hidden');
      const packBtn = ui.actionButton('Export', async () => {
        const r = await US.jobs.run({ title: 'Exporting the delivery pack', tool: 'deliver' }, job => exportPack({ outputs: o.outputs, folder, fullSize: o.fullSize }, job));
        if (r && r.dir) { lastDir = r.dir; openBtn.classList.remove('hidden'); }
      });
      panes.pack.append(
        ui.card(h('div.card-title', 'Outputs'), toggles,
          ui.section('More options', [ui.toggle({ label: 'Social versions at full platform size', hint: '1080×1920, 1080×1080, 1080×1350 (or 2160 wide from a 4K edit) instead of Auto Reframe’s own size.', value: o.fullSize !== false, onChange: x => { o.fullSize = x; US.settings.set('deliver', o); } })], { open: false }),
          h('div.row', h('div.grow', folderLine), chooseFolder)),
        ui.note('Vertical, square and portrait versions are made with Premiere’s Auto Reframe as new sequences in “JMG Ultra Studio › Deliver”, so you can tweak them before re-exporting. Safe Zones guides are hidden automatically.'),
        packBtn, openBtn);

      /* client notes */
      const notesBox = h('textarea.input', { rows: 9, placeholder: 'Paste notes here, one per line, e.g.\n0:12 lose the cough\n01:05 – swap the music here\n1:20-1:32 tighten this bit\n\nFrame.io CSV exports work too.' });
      const offsetToggle = ui.toggle({ label: 'Notes use a 01:00:00:00 start (subtract an hour)', value: false });
      const colour = ui.select({ options: ui.MARKER_COLORS.map(c => ({ value: c.i, label: c.name })), value: 1 });
      const preview = h('div');
      let parsed = [];
      function reparse() {
        const s = US.ctx.sequence; const fps = s ? s.fps : 25;
        parsed = parseNotes(notesBox.value, fps);
        if (parsed.length && autoOffset(parsed, s ? s.duration : 0) && !offsetToggle.dataset.touched) offsetToggle.set(true);
        const off = offsetToggle.get() ? -3600 : 0;
        US.clear(preview);
        if (!notesBox.value.trim()) return;
        if (!parsed.length) { preview.appendChild(ui.note('No timecodes found yet. Start each note with a time, like “1:05 swap the music”.', 'warn')); return; }
        preview.appendChild(ui.list(parsed.slice(0, 200).map(n => { const t = n.t + off, bad = s && (t < 0 || t > s.duration + 0.01); return { title: n.text, sub: bad ? 'Outside the sequence – will be skipped' : (n.end != null ? `to ${US.fmtDur(n.end + off)}` : ''), right: US.fmtDur(t), color: bad ? 'var(--text-3)' : ui.MARKER_COLORS[+colour.get()].hex }; })));
      }
      notesBox.addEventListener('input', US.debounce(reparse, 200));
      offsetToggle.addEventListener('change', () => { offsetToggle.dataset.touched = '1'; reparse(); });
      colour.addEventListener('change', reparse);
      const notesBtn = ui.actionButton('Add notes as markers', async () => {
        const s = US.ctx.sequence; if (!s) return ui.showError(new US.UserError('NO_SEQUENCE'));
        if (!parsed.length) return ui.showError(new US.UserError('NOTHING_FOUND', { title: 'No timecoded notes to add.', action: 'Paste notes that start with a time.' }));
        const off = offsetToggle.get() ? -3600 : 0;
        await US.jobs.run({ title: 'Adding client notes as markers', tool: 'deliver' }, job => addNoteMarkers(s, parsed.map(n => Object.assign({}, n, { t: n.t + off, end: n.end != null ? n.end + off : null })), +colour.get(), job));
      });
      const undoNotes = ui.button('Remove note markers', { kind: 'ghost', small: true, onClick: async () => {
        const s = US.ctx.sequence; if (!s) return;
        const store = US.projectStore(US.ctx.project && US.ctx.project.path); const all = store.get('noteMarkers', {});
        if (!(all[s.id] || []).length) return ui.toast({ type: 'info', title: 'No note markers to remove on this sequence', timeout: 2500 });
        try { const n = await US.host.call('removeSequenceMarkers', { seqId: s.id, guids: all[s.id] }); all[s.id] = []; store.set('noteMarkers', all); ui.toast({ type: 'ok', title: `Removed ${US.plural(n, 'marker')}` }); } catch (e) { ui.showError(e); }
      } });
      panes.notes.append(ui.card(notesBox, h('div.grid2', offsetToggle, ui.field('Marker colour', colour))), preview, notesBtn, h('div.row', undoNotes));

      /* chapters */
      const which = ui.select({ options: [{ value: 'named', label: 'Markers that have a name' }, { value: 'all', label: 'All markers' }].concat(ui.MARKER_COLORS.map(c => ({ value: String(c.i), label: c.name + ' markers' }))), value: 'named', onChange: () => buildChapters() });
      const chapterText = h('textarea.input.mono', { rows: 10, readOnly: true });
      const chapterNotes = h('div');
      async function buildChapters() {
        const s = US.ctx.sequence; US.clear(chapterNotes);
        if (!s) { chapterText.value = ''; chapterNotes.appendChild(ui.note('Open a sequence with markers first.', 'warn')); return; }
        try {
          const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
          const c = chapters(info.markers, info.duration, which.get());
          chapterText.value = c.text;
          if (!info.markers.length) chapterNotes.appendChild(ui.note('This sequence has no markers yet. Add a marker (M) at the start of each chapter and type its title in the marker’s name.', 'warn'));
          c.problems.forEach(p => chapterNotes.appendChild(ui.note(p, 'warn')));
        } catch (e) { ui.showError(e); }
      }
      panes.chapters.append(ui.card(ui.field('Use', which), chapterText, h('div.row',
        ui.button('Copy', { kind: 'primary', small: true, onClick: () => { ui.copy(chapterText.value); ui.toast({ type: 'ok', title: 'Chapters copied – paste them into the YouTube description', timeout: 2500 }); } }),
        ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: buildChapters }))), chapterNotes);

      function showTab(t) { Object.entries(panes).forEach(([k, el]) => el.classList.toggle('hidden', k !== t)); tabs.set(t); if (t === 'chapters') buildChapters(); if (t === 'notes') reparse(); }
      function renderCtx() { seqLine.textContent = US.ctx.sequence ? `Sequence: ${US.ctx.sequence.name} (${US.ctx.sequence.width}×${US.ctx.sequence.height}, ${US.fmtDur(US.ctx.sequence.duration)})` : 'Open a sequence in the Timeline first.'; }
      US.bus.on('context', renderCtx);
      v.body.append(seqLine, tabs, panes.pack, panes.notes, panes.chapters);
      showTab('pack');
      return { el: v.el, onShow(opt) { renderCtx(); if (opt && opt.tab) showTab(opt.tab); } };
    }
  });

  US.deliver = { parseNotes, autoOffset, chapters, OUTPUTS };
})();
