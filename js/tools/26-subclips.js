/* JMG Ultra Studio – Subclip Maker: for every clip in a bin, a subclip restricted to the In and Out you set on it (the
   whole clip when there are none), in a new bin next to it, so long clips show only the chosen part when you browse. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  /** Names in filming order (timecode, then name), numbered, with the original file name kept. In "add" mode a name
   *  that's already in the subclip bin gets " (2)", " (3)"… -> {items, conflicts} */
  function plan(read, mode) {
    const clips = read.clips.slice().sort((a, b) => (a.start - b.start) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const w = Math.max(2, String(clips.length).length), have = new Set(read.existing), conflicts = [];
    const items = clips.map((c, i) => {
      const base = `${String(i + 1).padStart(w, '0')} – ${c.name}`;
      let name = base;
      if (have.has(base)) { conflicts.push(base); if (mode === 'add') for (let n = 2; have.has(name); n++) name = `${base} (${n})`; }
      return { id: c.id, name, inTicks: c.inTicks, outTicks: c.outTicks, in: c.in, out: c.out, whole: c.whole, clip: c.name };
    });
    return { items, conflicts };
  }

  const opts = () => Object.assign({ mode: 'replace', binId: '' }, US.settings.get('subclipMaker', {}));
  const saveOpts = o => US.settings.set('subclipMaker', o);

  async function make(binId, mode, job) {
    job.set({ who: 'premiere', msg: 'Reading the clips and their In/Out' });
    const read = await US.host.call('subRead', { binId });
    if (!read.clips.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no clips in that bin.', action: 'Choose the bin that holds your long clips (clips in bins inside it aren’t included).' });
    const p = plan(read, mode);
    job.progress(0.3, `Making ${US.plural(p.items.length, 'subclip')}`);
    const r = await US.host.call('subMake', { targetPath: read.targetPath, items: p.items, conflicts: p.conflicts, mode });
    const whole = p.items.filter(x => x.whole).length;
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
    id: 'subclips', name: 'Subclip Maker', short: 'Subclips', icon: 'selects', group: 'find', order: 13,
    blurb: 'Every clip in a bin as a subclip of just its In to Out, for browsing long clips.',
    hostFns: ['listBins', 'subRead', 'subMake'],
    create() {
      const v = ui.toolView({ icon: 'selects', title: 'Subclip Maker', blurb: 'Choose a bin. Every clip in it becomes a subclip of only the part between the In and Out you set, with restricted In/Out, so thumbnails and scrubbing show just that part. Clips without In/Out are kept whole. The originals aren’t changed.' });
      let o = opts();
      const binSel = ui.select({ options: [], placeholder: 'Choose a bin…', onChange: x => { o.binId = x; saveOpts(o); look(); } });
      const mode = ui.segmented({ options: [{ value: 'replace', label: 'Replace earlier subclips' }, { value: 'add', label: 'Add alongside' }], value: o.mode, onChange: x => { o.mode = x; saveOpts(o); look(); } });
      const preview = h('div');
      async function fillBins() {
        try {
          const bins = (await US.host.call('listBins')).filter(b => b.path !== '(Project root)' && !/ – Subclips( – earlier)?$/.test(b.path));
          binSel.setOptions(bins.map(b => ({ value: b.id, label: b.path })), bins.some(b => b.id === o.binId) ? o.binId : '');
          if (binSel.get()) look();
        } catch (e) { ui.showError(e); }
      }
      async function look() {
        US.clear(preview); if (!binSel.get()) return;
        try {
          const read = await US.host.call('subRead', { binId: binSel.get() }), p = plan(read, o.mode);
          if (!p.items.length) { preview.appendChild(ui.note('No clips in this bin (clips in bins inside it aren’t included).', 'warn')); return; }
          preview.appendChild(h('div.field-hint', `Into “${read.targetPath}” · ${US.plural(p.items.length, 'subclip')}${p.conflicts.length ? ` · ${p.conflicts.length} already there` : ''}`));
          preview.appendChild(ui.list(p.items.slice(0, 300).map(x => ({ title: x.name, sub: x.whole ? 'No In/Out set – the whole clip' : `${US.fmtDur(x.in)} – ${US.fmtDur(x.out)}`, right: US.fmtDur(x.out - x.in) }))));
          if (p.conflicts.length) preview.appendChild(ui.note(`${US.plural(p.conflicts.length, 'subclip')} with the same name ${p.conflicts.length === 1 ? 'is' : 'are'} already in “${read.target}”. You’ll be asked before anything changes.`, 'warn'));
        } catch (e) { ui.showError(e); }
      }
      const go = ui.actionButton('Make subclips', async () => {
        if (!binSel.get()) return ui.showError(new US.UserError('BAD_INPUT', { title: 'Choose a bin first.' }));
        let m = o.mode;
        try {
          const read = await US.host.call('subRead', { binId: binSel.get() }), p = plan(read, m);
          if (p.conflicts.length) { m = await confirmConflicts(read, p, m); if (!m) return; }
        } catch (e) { return ui.showError(e); }
        await US.jobs.run({ title: 'Making subclips', tool: 'subclips' }, job => make(binSel.get(), m, job));
        look();
      });
      v.body.append(ui.card(ui.field('Bin with your clips', binSel), h('div.row', ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: fillBins }))),
        ui.card(ui.field('If subclips with the same names are already there', mode)), preview, go);
      return { el: v.el, onShow() { fillBins(); } };
    }
  });

  US.subclipMaker = { plan };
})();
