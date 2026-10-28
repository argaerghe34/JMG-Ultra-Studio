/* JMG Ultra Studio – Silence Cut: finds the pauses in a sequence and cuts them out of a copy. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, kit = US.audioKit;

  const PRESETS = {
    natural: { label: 'Natural', minPause: 0.8, padding: 0.25, title: 'Only clear pauses; keeps a relaxed rhythm' },
    tight: { label: 'Tight', minPause: 0.5, padding: 0.15, title: 'Good default for interviews' },
    verytight: { label: 'Very tight', minPause: 0.3, padding: 0.08, title: 'Social-media pace' },
    podcast: { label: 'Podcast', minPause: 1.0, padding: 0.35, title: 'Removes only long gaps' }
  };

  /** Analyse a sequence's sound → {target, env, stats, duration, locked} */
  async function analyse(target, job) {
    job.set({ who: 'premiere', msg: 'Checking the sequence' });
    const locked = await US.host.call('lockedTracksWithClips', { seqId: target.id });
    job.progress(0.05);
    const a = await kit.loadAudio(target, job);
    job.check();
    job.set({ who: 'computer', msg: 'Finding the pauses' });
    const env = US.audio.envelope(a.data, a.sr, 0.02, 0.03);
    const stats = US.dsp.levelStats(env.db);
    job.progress(1);
    return { target, env, stats, duration: a.duration, locked, curve: env.db.map(v => Math.max(0, v - stats.floor + 3)) };
  }

  function pausesFor(an, s) {
    return US.dsp.findPauses(an.env, { threshold: s.threshold == null ? an.stats.auto : s.threshold, minPause: s.minPause, padding: s.padding, duration: an.duration });
  }

  /** Clone the sequence and ripple-cut the pauses out of the copy. */
  async function cutCopy(an, s, job) {
    if (an.locked.length) throw new US.UserError('BAD_INPUT', { title: `Some tracks are locked (${an.locked.join(', ')}).`, action: 'Unlock them in the Timeline (padlock icons), then try again – otherwise the cuts would knock them out of sync.' });
    const r = pausesFor(an, s);
    if (!r.cuts.length) throw new US.UserError('NOTHING_FOUND', { title: 'No pauses long enough to cut.', action: 'Lower “Shortest pause to cut” or raise the silence level.' });
    job.set({ who: 'premiere', msg: 'Making a copy of the sequence' });
    const copy = await US.host.call('cloneSequence', { seqId: an.target.id, name: `${an.target.name} – pauses cut`, binPath: 'JMG Ultra Studio/Silence Cut' });
    // times count from the start of the sequence (Premiere ignores a 01:00:00:00 start timecode here – checked)
    const ranges = r.cuts.map(c => [c.start, c.end]).sort((a, b) => b[0] - a[0]);
    const parts = kit.chunk(ranges, 20);
    let removed = 0, done = 0, dur = an.duration;
    for (const part of parts) {
      job.check();
      job.progress(0.1 + 0.85 * done / ranges.length, `Cutting pauses ${done + 1}–${done + part.length} of ${ranges.length} (from the end)`);
      const res = await US.host.call('extractRanges', { seqId: copy.id, ranges: part });
      removed += res.removed; dur = res.duration; done += part.length;
    }
    // check: the copy should be shorter by what we meant to remove (each cut snaps to whole frames)
    const fps = an.target.fps || 25, want = r.removed, slack = (2 / fps) * ranges.length + 0.05;
    if (Math.abs(removed - want) > slack) US.log('error', `Silence Cut: removed ${removed.toFixed(3)} s, expected ${want.toFixed(3)} s`, `${ranges.length} cuts, fps ${fps}`, 'silence');
    await US.host.call('openSequence', { seqId: copy.id });
    return { summary: `Cut ${US.plural(ranges.length, 'pause')} (${US.fmtDur(removed, true)}) – “${copy.name}” is ${US.fmtDur(dur)} long. The original is unchanged.`, copy, removed, cuts: ranges.length, duration: dur };
  }

  async function addMarkers(an, s, job) {
    const r = pausesFor(an, s);
    if (!r.pauses.length) throw new US.UserError('NOTHING_FOUND', { title: 'No pauses found.', action: 'Lower “Shortest pause to cut” or raise the silence level.' });
    const n = await kit.addMarkers(an.target, r.pauses.map(p => ({ start: p.start, end: p.end, name: `Pause ${(p.end - p.start).toFixed(1)} s`, comment: 'Silence Cut', color: 1 })), job, 'silence:' + an.target.id);
    return { summary: `Added ${US.plural(n, 'marker')} on “${an.target.name}”.` };
  }

  /* ---------- the Assistant can ask for this too ---------- */
  US.actions.register({
    id: 'silence.cut', tool: 'silence', title: 'Cut the pauses from the active sequence', changes: true,
    describe: 'Finds pauses in the active sequence’s sound and removes them from a copy of the sequence (the original is untouched).',
    params: {
      minPause: { type: 'number', default: 0.5, desc: 'Shortest pause to cut, in seconds' },
      padding: { type: 'number', default: 0.15, desc: 'Seconds of room to keep either side of speech' }
    },
    examples: ['cut the silences', 'remove pauses longer than 1 second', 'tighten this interview'],
    match(text) {
      const t = text.toLowerCase();
      const about = /(silen|pause|gaps?\b|dead air|quiet bits|breaths?)/.test(t) && /(cut|remove|delete|trim|tighten|kill|get rid|lose|strip)/.test(t);
      const tighten = /tighten (up )?(this|the|my)?\s*(interview|edit|cut|talk|podcast|sequence)/.test(t);
      if (!about && !tighten) return null;
      const p = {};
      const m = /(longer|more) than (\d+(?:\.\d+)?)\s*(ms|milliseconds?|s\b|secs?|seconds?)/.exec(t);
      if (m) p.minPause = /ms|milli/.test(m[3]) ? +m[2] / 1000 : +m[2];
      if (/very tight|really tight|aggressive/.test(t)) Object.assign(p, { minPause: PRESETS.verytight.minPause, padding: PRESETS.verytight.padding });
      return p;
    },
    async run(params, job) {
      const target = await kit.activeSequenceTarget();
      const an = await analyse(target, job.range(0, 0.4));
      job.range(0.4, 1);
      return cutCopy(an, { minPause: params.minPause, padding: params.padding, threshold: null }, job);
    }
  });

  US.tools.register({
    id: 'silence', name: 'Silence Cut', short: 'Silence', icon: 'silence', group: 'cut', order: 20,
    blurb: 'Removes pauses from interviews and talking heads. Always works on a copy.',
    hostFns: ['renderAudio', 'cloneSequence', 'extractRanges', 'addSequenceMarkers', 'lockedTracksWithClips'],
    create() {
      const v = ui.toolView({ icon: 'silence', title: 'Silence Cut', blurb: 'Finds the pauses in a sequence and cuts them out of a copy. Your original sequence is never changed.',
        help: h('div', h('p', 'How it works:'), h('ul',
          h('li', 'Premiere renders the sequence’s sound; Ultra Studio measures how loud it is every 20 ms.'),
          h('li', 'Anything quieter than the silence level for longer than the shortest pause is a pause. The level is set automatically from the room noise and the speech.'),
          h('li', '“Keep around speech” leaves a little air either side so words aren’t clipped.'),
          h('li', US.app.is('resolve') ? '“Make a cut copy” builds a new timeline from the parts you keep, on every track, so B-roll and music stay in sync.' : '“Make a cut copy” duplicates the sequence and ripple-deletes each pause across all tracks, so B-roll and music stay in sync.'))) });

      const settings = Object.assign({ preset: 'tight', threshold: null }, PRESETS.tight, US.settings.get('silence.settings', {}));
      let an = null;

      const picker = ui.sourcePicker({ modes: ['sequence'], kinds: ['audio'], label: 'Sequence', onChange: () => { an = null; render(); } });
      const findBtn = ui.actionButton('Find the pauses', () => US.jobs.run({ title: 'Finding pauses', tool: 'silence' }, async job => {
        const target = await kit.resolveTarget(picker, job);
        an = await analyse(target, job);
        if (settings.threshold != null && (settings.threshold < an.stats.floor - 5 || settings.threshold > an.stats.speech)) settings.threshold = null;
        render();
        const r = pausesFor(an, settings);
        return { summary: `${US.plural(r.pauses.length, 'pause')} found in “${target.name}”` };
      }), { icon: 'silence' });

      const results = h('div');
      v.body.append(ui.card(picker.el, findBtn), results);

      const tl = ui.timeline({ height: 70, onSeek: t => an && kit.goTo(an.target, t) });
      const statsBox = h('div');
      const lockNote = h('div');
      const presetSeg = ui.segmented({ options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label, title: p.title })), value: settings.preset, onChange: k => { Object.assign(settings, { preset: k, minPause: PRESETS[k].minPause, padding: PRESETS[k].padding }); minS.set(settings.minPause); padS.set(settings.padding); update(); } });
      const thrS = ui.slider({ label: 'Silence level', min: -80, max: -15, step: 1, value: -50, fmt: v => `${v} dB${an && settings.threshold == null ? ' (auto)' : ''}`, onInput: val => { settings.threshold = val; update(); }, hint: 'Quieter than this counts as silence. Set automatically from the room noise.' });
      const minS = ui.slider({ label: 'Shortest pause to cut', min: 0.2, max: 3, step: 0.05, value: settings.minPause, fmt: v => `${v.toFixed(2)} s`, onInput: val => { settings.minPause = val; settings.preset = null; presetSeg.set(null); update(); } });
      const padS = ui.slider({ label: 'Keep around speech', min: 0, max: 0.6, step: 0.01, value: settings.padding, fmt: v => `${v.toFixed(2)} s`, onInput: val => { settings.padding = val; settings.preset = null; presetSeg.set(null); update(); } });
      const autoBtn = ui.button('Auto level', { small: true, kind: 'ghost', onClick: () => { settings.threshold = null; thrS.set(Math.round(an.stats.auto)); update(); } });

      const cutBtn = ui.actionButton('Make a cut copy', () => US.jobs.run({ title: 'Cutting pauses', tool: 'silence' }, job => cutCopy(an, settings, job)), { icon: 'silence' });
      const markBtn = ui.button('Add markers instead', { icon: 'target', onClick: () => US.jobs.run({ title: 'Marking pauses', tool: 'silence' }, job => addMarkers(an, settings, job).then(r => { render(); return r; })) });
      const unmarkBtn = ui.button('Remove my markers', { kind: 'ghost', onClick: () => US.jobs.run({ title: 'Removing pause markers', tool: 'silence' }, async () => { const n = await kit.removeMarkers('silence:' + an.target.id); render(); return { summary: `Removed ${US.plural(n, 'marker')}` }; }) });

      const resultsCard = ui.card(
        h('div.card-title', 'Pauses', h('span.right', '')),
        tl.el,
        kit.legend([['Cut', kit.cssColor('var(--err)')], ['Kept as breathing room', 'rgba(255,99,99,0.35)']]),
        statsBox, presetSeg,
        h('div.grid2', minS, padS),
        h('div.row', h('div.grow', thrS), autoBtn),
        lockNote, cutBtn, h('div.row', markBtn, unmarkBtn));

      function update() {
        if (!an) return;
        US.settings.set('silence.settings', { preset: settings.preset, minPause: settings.minPause, padding: settings.padding });
        const r = pausesFor(an, settings);
        const thr = settings.threshold == null ? an.stats.auto : settings.threshold;
        thrS.querySelector('.slider-val').textContent = `${Math.round(thr)} dB${settings.threshold == null ? ' (auto)' : ''}`;
        const red = kit.cssColor('var(--err)');
        tl.draw({ duration: an.duration, curve: an.curve, curveMax: Math.max(10, an.stats.speech - an.stats.floor + 8),
          regions: r.pauses.map(p => ({ start: p.start, end: p.end, color: red, alpha: 0.22, label: `Pause ${(p.end - p.start).toFixed(2)} s` })).concat(r.cuts.map(c => ({ start: c.start, end: c.end, color: red, alpha: 0.6, label: `Cut ${(c.end - c.start).toFixed(2)} s` }))) });
        US.clear(statsBox).appendChild(ui.stats(ui.stat(String(r.cuts.length), 'pauses to cut'), ui.stat(US.fmtDur(r.removed, true), 'time saved'), ui.stat(US.fmtDur(an.duration - r.removed), 'new length')));
        resultsCard.querySelector('.card-title .right').textContent = `${an.target.name} · ${US.fmtDur(an.duration)}`;
        cutBtn.setEnabled(r.cuts.length > 0 && !an.locked.length);
        unmarkBtn.classList.toggle('hidden', !kit.recallMarkers('silence:' + an.target.id));
      }

      function render() {
        US.clear(results);
        if (!an) {
          results.appendChild(ui.empty({ icon: 'silence', title: 'Pick a sequence and press “Find the pauses”.', text: 'Works best on interviews, vlogs and talks. Nothing changes until you press “Make a cut copy”.' }));
          return;
        }
        US.clear(lockNote);
        if (an.locked.length) lockNote.appendChild(ui.note(`Tracks ${an.locked.join(', ')} are locked and have clips. Unlock them before cutting, or they’ll end up out of sync.`, 'warn'));
        thrS.set(Math.round(settings.threshold == null ? an.stats.auto : settings.threshold));
        results.appendChild(resultsCard);
        update();
      }
      render();
      return { el: v.el, onShow() { picker.refresh(); } };
    }
  });

  US.silenceCut = { PRESETS, analyse, pausesFor, cutCopy, addMarkers };
})();
