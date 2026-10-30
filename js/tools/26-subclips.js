/* JMG Ultra Studio – Subclip Maker: for every clip in a bin, a subclip restricted to the In and Out you set on it (the
   whole clip when there are none) – or for every clip on the timeline, a subclip of the part used – in a new bin or one
   you choose, optionally with handles, so long clips show only the chosen part when you browse. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  const TICKS = 254016000000;
  /** Names in filming order (timecode, then name; timeline order for the timeline), numbered, with the original file
   *  name kept. In "add" mode a name that's already in the subclip bin gets " (2)", " (3)"…; handles (seconds) widen
   *  each one that has an In or Out, never past the ends of the clip. -> {items, conflicts} */
  function plan(read, mode, handles = 0) {
    const clips = read.clips.slice().sort((a, b) => (a.start - b.start) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const w = Math.max(2, String(clips.length).length), have = new Set(read.existing), conflicts = [];
    const items = clips.map((c, i) => {
      const base = `${String(i + 1).padStart(w, '0')} – ${c.name}`;
      let name = base;
      if (have.has(base)) { conflicts.push(base); if (mode === 'add') for (let n = 2; have.has(name); n++) name = `${base} (${n})`; }
      if (handles > 0 && !c.whole) {
        const a = Math.max(0, c.in - handles), b = c.dur > 0 ? Math.min(c.dur, c.out + handles) : c.out + handles;
        return { id: c.id, name, inTicks: String(Math.round(a * TICKS)), outTicks: String(Math.round(b * TICKS)), in: a, out: b, whole: false, clip: c.name, handles: true };
      }
      return { id: c.id, name, inTicks: c.inTicks, outTicks: c.outTicks, in: c.in, out: c.out, whole: c.whole, clip: c.name };
    });
    return { items, conflicts };
  }

  // from: 'bin' | 'timeline'; into: 'new' (a new bin, named newName or "<source> – Subclips") | 'bin' (intoId);
  // handles: off by default, handleSecs on each side when on
  const opts = () => Object.assign({ mode: 'replace', binId: '', from: 'bin', into: 'new', newName: '', intoId: '', handles: false, handleSecs: 1 }, US.settings.get('subclipMaker', {}));
  const saveOpts = o => US.settings.set('subclipMaker', o);
  const handlesOf = o => (o.handles ? Math.max(0, Math.min(60, Number(o.handleSecs) || 0)) : 0);
  /** The subRead arguments for these options, or null when something still has to be chosen. */
  function readArgs(o) {
    const seqId = US.ctx.sequence && US.ctx.sequence.id;
    const src = o.from === 'timeline' ? (seqId ? { from: 'timeline', seqId } : null) : (o.binId ? { from: 'bin', binId: o.binId } : null);
    if (!src) return null;
    const into = o.into === 'bin' ? (o.intoId ? { binId: o.intoId } : null) : (String(o.newName || '').trim() ? { name: String(o.newName).trim() } : undefined);
    if (into === null) return null;
    return Object.assign(src, into ? { into } : {});
  }

  async function make(o, mode, job) {
    const args = readArgs(o);
    if (!args) throw new US.UserError('BAD_INPUT', { title: o.from === 'timeline' ? 'Open a sequence first.' : 'Choose a bin first.' });
    job.set({ who: 'premiere', msg: o.from === 'timeline' ? 'Reading the clips on the timeline' : 'Reading the clips and their In/Out' });
    const read = await US.host.call('subRead', args);
    if (!read.clips.length) throw new US.UserError('NOTHING_FOUND', o.from === 'timeline' ? { title: 'There are no clips on this timeline.', action: 'Open the sequence with your clips on it (nested sequences, titles and adjustment layers are left out).' } : { title: 'There are no clips in that bin.', action: 'Choose the bin that holds your long clips (clips in bins inside it aren’t included).' });
    const p = plan(read, mode, handlesOf(o));
    job.progress(0.3, `Making ${US.plural(p.items.length, 'subclip')}`);
    const r = await US.host.call('subMake', { targetPath: read.targetPath, items: p.items, conflicts: p.conflicts, mode });
    const whole = o.from === 'timeline' ? 0 : p.items.filter(x => x.whole).length;
    US.log(r.failed.length ? 'warn' : 'ok', `Subclip Maker: ${r.made} subclips in “${read.targetPath}”`, [whole ? `${whole} without In/Out (whole clip)` : '', r.moved ? `${r.moved} earlier ones moved to “${r.earlierPath}”` : '', r.failed.length ? 'Not made: ' + r.failed.join(', ') : ''].filter(Boolean).join(' · '), 'subclips');
    if (!r.made) throw new US.UserError('HOST_SCRIPT', { title: 'Premiere didn’t make the subclips.', detail: r.failed.join(', ') });
    return { summary: `${US.plural(r.made, 'subclip')} in “${read.target}”${whole ? ` (${whole} whole, no In/Out set)` : ''}${r.moved ? ` · ${r.moved} earlier ones moved to “${read.target} – earlier”` : ''}${r.failed.length ? ` · ${r.failed.length} not made` : ''}`, made: r.made, moved: r.moved, target: read.targetPath, items: p.items };
  }

  /** The warning when subclips with the same names are already there -> the mode to use, or null to stop. */
  async function confirmConflicts(read, p, mode) {
    const list = p.conflicts.slice(0, 6).join('\n') + (p.conflicts.length > 6 ? `\n…and ${p.conflicts.length - 6} more` : '');
    const v = await ui.modal({
      title: `${US.plural(p.conflicts.length, 'subclip')} with these names ${p.conflicts.length === 1 ? 'is' : 'are'} already in “${read.target}”`,
      body: h('div', h('p', mode === 'replace'
        ? 'Replace moves the earlier ones into a bin called “' + read.target + ' – earlier” (Premiere doesn’t let scripts delete clips; delete that bin yourself when you’re happy). Sequences that use them keep working.'
        : 'Add alongside keeps the earlier ones and names the new ones “(2)”, “(3)”…'), h('pre.mono', list)),
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: mode === 'replace' ? 'Add alongside instead' : 'Replace instead', value: 'switch' }, { label: mode === 'replace' ? 'Replace' : 'Add alongside', value: 'go', kind: 'primary' }]
    });
    return v === 'go' ? mode : v === 'switch' ? (mode === 'replace' ? 'add' : 'replace') : null;
  }

  US.tools.register({
    id: 'subclips', name: 'Subclip Maker', short: 'Subclips', icon: 'selects', group: 'selects', order: 11,
    blurb: 'Every clip in a bin (its In to Out) or on the timeline (the part used) as a subclip, for browsing long clips.',
    hostFns: ['listBins', 'subRead', 'subMake'],
    create() {
      const v = ui.toolView({ icon: 'selects', title: 'Subclip Maker', blurb: 'Make subclips of just the parts you want, with restricted In/Out, so thumbnails and scrubbing show only that part. From a bin: each clip’s own In to Out (clips without In/Out are kept whole). From the timeline: the part of each clip used in the open sequence. The originals aren’t changed.' });
      let o = opts(), bins = [];
      const set = patch => { Object.assign(o, patch); saveOpts(o); draw(); };
      const from = ui.segmented({ options: [{ value: 'bin', label: 'Clips in a bin' }, { value: 'timeline', label: 'Clips on the timeline' }], value: o.from, onChange: x => set({ from: x }) });
      const binSel = ui.select({ options: [], placeholder: 'Choose a bin…', onChange: x => { o.binId = x; saveOpts(o); look(); } });
      const into = ui.segmented({ options: [{ value: 'new', label: 'A new bin' }, { value: 'bin', label: 'A bin you choose' }], value: o.into, onChange: x => set({ into: x }) });
      const nameIn = ui.input({ value: o.newName || '', placeholder: '' });
      nameIn.addEventListener('input', US.debounce(() => { o.newName = nameIn.value; saveOpts(o); look(); }, 400));
      const intoSel = ui.select({ options: [], placeholder: 'Choose where they go…', onChange: x => { o.intoId = x; saveOpts(o); look(); } });
      const secsIn = ui.input({ value: String(o.handleSecs), placeholder: '1' });
      secsIn.addEventListener('input', US.debounce(() => { o.handleSecs = Math.max(0, Math.min(60, parseFloat(secsIn.value) || 0)); saveOpts(o); look(); }, 400));
      const mode = ui.segmented({ options: [{ value: 'replace', label: 'Replace earlier subclips' }, { value: 'add', label: 'Add alongside' }], value: o.mode, onChange: x => { o.mode = x; saveOpts(o); look(); } });
      const fromBox = h('div'), intoBox = h('div'), handleBox = h('div'), preview = h('div');
      function draw() {
        US.clear(fromBox); US.clear(intoBox); US.clear(handleBox);
        fromBox.appendChild(o.from === 'timeline' ? h('div.field-hint', US.ctx.sequence ? `The open sequence: “${US.ctx.sequence.name}” – every clip on it, the part used, in timeline order (nested sequences, titles and adjustment layers are left out).` : 'Open a sequence in the Timeline first.') : ui.field('Bin with your clips', binSel));
        nameIn.placeholder = o.from === 'timeline' ? `${US.ctx.sequence ? US.ctx.sequence.name : 'Sequence'} – Subclips` : 'Bin name – Subclips (next to the bin)';
        intoBox.appendChild(o.into === 'bin' ? ui.field('Bin', intoSel) : ui.field('Name of the new bin', nameIn, 'Leave it empty for the name shown. A bin with that name already there is used.'));
        handleBox.appendChild(ui.toggle({ label: 'Add handles', hint: 'Extra seconds before and after each subclip, never past the ends of the clip. Clips kept whole don’t change.', value: !!o.handles, onChange: x => set({ handles: x }) }));
        if (o.handles) handleBox.appendChild(ui.field('Seconds on each side', secsIn));
        look();
      }
      async function fillBins() {
        try {
          bins = (await US.host.call('listBins')).filter(b => b.path !== '(Project root)');
          const src = bins.filter(b => !/ – Subclips( – earlier)?$/.test(b.path));
          binSel.setOptions(src.map(b => ({ value: b.id, label: b.path })), src.some(b => b.id === o.binId) ? o.binId : '');
          intoSel.setOptions(bins.map(b => ({ value: b.id, label: b.path })), bins.some(b => b.id === o.intoId) ? o.intoId : '');
          if (!bins.some(b => b.id === o.intoId)) o.intoId = '';
          look();
        } catch (e) { ui.showError(e); }
      }
      let lookN = 0;
      async function look() {
        const n = ++lookN; US.clear(preview);
        const args = readArgs(o); if (!args) return;
        try {
          const read = await US.host.call('subRead', args); if (n !== lookN) return;
          const p = plan(read, o.mode, handlesOf(o));
          if (!p.items.length) { preview.appendChild(ui.note(o.from === 'timeline' ? 'No clips on this timeline.' : 'No clips in this bin (clips in bins inside it aren’t included).', 'warn')); return; }
          preview.appendChild(h('div.field-hint', `Into “${read.targetPath}” · ${US.plural(p.items.length, 'subclip')}${handlesOf(o) ? ` · ${handlesOf(o)} s handles` : ''}${p.conflicts.length ? ` · ${p.conflicts.length} already there` : ''}`));
          preview.appendChild(ui.list(p.items.slice(0, 300).map(x => ({ title: x.name, sub: x.whole ? 'No In/Out set – the whole clip' : `${US.fmtDur(x.in)} – ${US.fmtDur(x.out)}${x.handles ? ' (with handles)' : ''}`, right: US.fmtDur(x.out - x.in) }))));
          if (p.conflicts.length) preview.appendChild(ui.note(`${US.plural(p.conflicts.length, 'subclip')} with the same name ${p.conflicts.length === 1 ? 'is' : 'are'} already in “${read.target}”. You’ll be asked before anything changes.`, 'warn'));
        } catch (e) { if (n === lookN) ui.showError(e); }
      }
      const go = ui.actionButton('Make subclips', async () => {
        const args = readArgs(o);
        if (!args) return ui.showError(new US.UserError('BAD_INPUT', { title: o.from === 'timeline' ? 'Open a sequence first.' : o.into === 'bin' && !o.intoId ? 'Choose where the subclips go.' : 'Choose a bin first.' }));
        let m = o.mode;
        try {
          const read = await US.host.call('subRead', args), p = plan(read, m, handlesOf(o));
          if (p.conflicts.length) { m = await confirmConflicts(read, p, m); if (!m) return; }
        } catch (e) { return ui.showError(e); }
        await US.jobs.run({ title: 'Making subclips', tool: 'subclips' }, job => make(o, m, job));
        fillBins();
      });
      v.body.append(ui.card(ui.field('Make subclips of', from), fromBox, h('div.row', ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: fillBins }))),
        ui.card(ui.field('Put them in', into), intoBox, handleBox, ui.field('If subclips with the same names are already there', mode)), preview, go);
      US.bus.on('context', US.debounce(() => { if (o.from === 'timeline' && !v.el.closest('.hidden')) draw(); }, 600));
      draw();
      return { el: v.el, onShow() { fillBins(); } };
    }
  });

  US.subclipMaker = { plan };
})();
