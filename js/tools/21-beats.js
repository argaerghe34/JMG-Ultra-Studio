/* JMG Ultra Studio – Beat Cut: finds the beat in a piece of music, adds beat/bar markers and cuts clips to it. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, kit = US.audioKit;
  const VERSION = 1;

  /** Beat analysis for a music target (cached per media file for clips). */
  async function analyse(target, job) {
    const run = async () => {
      const a = await kit.loadAudio(target, job.range(0, 0.35));
      job.range(0.35, 1).set({ who: 'computer', msg: 'Listening for the beat' });
      const r = await US.dsp.analyseBeats(a.data, a.sr, { onProgress: f => job.progress(f), check: () => job.check() });
      return Object.assign(r, { offset: a.offset || 0 });
    };
    if (target.kind === 'item' && target.item.path) {
      const range = US.audio.isPlainWav(target.item.path) ? { 'in': 0, out: 0 } : await US.host.call('audioClipRange', { id: target.id });
      return US.cache.cached('beats', target.item.path, `${VERSION}-${(range['in'] || 0).toFixed(3)}-${(range.out || 0).toFixed(3)}`, run);
    }
    return run();
  }

  /** Change the beat grid: 'half' keeps every other beat (on the bar), 'double' adds the off-beats. */
  function retime(an, how) {
    const b = an.beats;
    let beats;
    if (how === 'half') beats = b.filter((_, i) => (i - an.firstDownbeatIndex) % 2 === 0);
    else beats = b.flatMap((t, i) => i + 1 < b.length ? [t, (t + b[i + 1]) / 2] : [t]);
    const down = new Set(an.downbeats.map(x => x.toFixed(3)));
    const firstDown = beats.findIndex(t => down.has(t.toFixed(3)));
    const bpb = an.beatsPerBar;
    const fd = Math.max(0, firstDown);
    const energy = beats.map(t => { const i = b.findIndex(x => x >= t - 1e-6); return an.energy[Math.max(0, i)] || 0.5; });
    return Object.assign({}, an, { bpm: how === 'half' ? an.bpm / 2 : an.bpm * 2, beats, firstDownbeatIndex: fd % bpb, downbeats: beats.filter((_, i) => i >= fd && (i - fd) % bpb === 0), energy });
  }

  function markerTimes(an, every) {
    const fd = an.firstDownbeatIndex, bpb = an.beatsPerBar;
    if (every === 'beat') return an.beats.map((t, i) => ({ t, bar: (i - fd) % bpb === 0 }));
    if (every === '2') return an.beats.map((t, i) => ({ t, i })).filter(x => (x.i - fd) % 2 === 0).map(x => ({ t: x.t, bar: (x.i - fd) % bpb === 0 }));
    if (every === 'bar') return an.downbeats.map(t => ({ t, bar: true }));
    return an.downbeats.filter((_, i) => i % 2 === 0).map(t => ({ t, bar: true }));
  }

  async function addBeatMarkers(target, an, every, job) {
    const times = markerTimes(an, every);
    const off = target.kind === 'item' ? an.offset : 0;
    let bar = 0;
    const ms = times.map(x => { if (x.bar) bar++; return { start: x.t + off, name: x.bar ? `Bar ${bar}` : 'Beat', color: x.bar ? 3 : 4, comment: `${Math.round(an.bpm)} BPM` }; });
    const n = await kit.addMarkers(target, ms, job, 'beats:' + target.id);
    return { summary: `Added ${US.plural(n, 'marker')} at ${Math.round(an.bpm)} BPM on “${target.name}”` };
  }

  /** Cut points (seconds) from 0 to `end`, every N beats, optionally faster in loud parts. */
  function cutPoints(an, { every = 2, energy = false, end }) {
    const pts = [0];
    const b = an.beats;
    let i = an.firstDownbeatIndex;
    if (b[i] > 0.15) pts.push(b[i]);
    while (i < b.length) {
      let step = every;
      if (energy) { const e = an.energy[i] == null ? 0.5 : an.energy[i]; if (e > 0.7) step = Math.max(1, every / 2); else if (e < 0.3) step = every * 2; }
      i += step;
      if (i >= b.length || b[i] >= end - 0.2) break;
      pts.push(b[i]);
    }
    pts.push(end);
    return pts.filter((t, k) => k === 0 || t - pts[k - 1] > 0.08);
  }

  /**
   * Lay clips on a new sequence, cutting on the beat, with the music underneath.
   * clips: project items (video). music: target. opts: {every, energy, length (s or 0 = whole), order}
   */
  async function montage(musicTarget, an, clips, opts, job) {
    if (musicTarget.kind !== 'item') throw new US.UserError('BAD_INPUT', { title: 'Beat Cut needs a music clip from the project.', action: 'Select the music in the Project panel under “Music”, press “Find the beat”, then try again.' });
    clips = clips.filter(c => c.id !== musicTarget.id && c.kind === 'video');
    // subclips: use their own range (media time), not the whole file
    const ranges = await US.host.call('clipRanges', { ids: clips.map(c => c.id) });
    clips = clips.map((c, i) => ranges[i] ? Object.assign({}, c, { rangeStart: ranges[i].start, duration: ranges[i].end - ranges[i].start }) : c).filter(c => c.duration > 0.3);
    if (!clips.length) throw new US.UserError('NO_SELECTION', { title: 'No video clips to cut.', action: 'Pick a bin (or select clips) under “Clips to cut”.' });
    const musicLen = an.duration;
    let end = opts.length ? Math.min(opts.length, musicLen) : musicLen;
    if (opts.length && end < musicLen) { const bar = an.downbeats.reduce((best, t) => Math.abs(t - end) < Math.abs(best - end) ? t : best, end); if (bar > 2) end = bar; }
    if (opts.order === 'shuffle') { clips = clips.slice(); for (let i = clips.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [clips[i], clips[j]] = [clips[j], clips[i]]; } }

    job.set({ who: 'premiere', msg: 'Making the new sequence' });
    const seq = await US.host.call('newSequence', { name: `Beat Cut – ${US.stem(musicTarget.name)}`, binPath: 'JMG Ultra Studio/Beat Cut', likeId: clips[0].id });
    const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
    const fps = info.fps || 25, snap = t => Math.round(t * fps) / fps;
    const pts = cutPoints(an, { every: opts.every, energy: opts.energy, end }).map(snap).filter((t, i, a) => i === 0 || t > a[i - 1]);

    // choose a piece of a clip for every gap between cut points
    const uses = new Map();
    let k = 0;
    const shots = [];
    for (let s = 0; s + 1 < pts.length; s++) {
      const dur = pts[s + 1] - pts[s];
      let clip = null;
      for (let tries = 0; tries < clips.length; tries++) { const c = clips[(k + tries) % clips.length]; if (c.duration >= dur + 0.05) { clip = c; k = (k + tries + 1) % clips.length; break; } }
      if (!clip) { clip = clips.reduce((a, b) => (b.duration > a.duration ? b : a)); }
      const used = uses.get(clip.id) || 0; uses.set(clip.id, used + 1);
      let start = null;
      if (US.selects && typeof US.selects.bestMoment === 'function') { try { start = await US.selects.bestMoment(clip, dur, used); } catch (e) { start = null; } }
      if (start == null) { const room = Math.max(0, clip.duration - dur); start = room > 0 ? (room / 2 + used * dur) % (room + 1e-9) : 0; }
      start = Math.max(0, Math.min(start, Math.max(0, clip.duration - dur)));
      const base = clip.rangeStart || 0;
      shots.push({ id: clip.id, 'in': base + start, out: base + start + Math.min(dur, clip.duration), at: pts[s], v: 0, audio: false });
    }
    const parts = kit.chunk(shots, 10);
    for (let i = 0; i < parts.length; i++) {
      job.check();
      job.progress(0.1 + 0.8 * i / parts.length, `Placing shots ${i * 10 + 1}–${Math.min(shots.length, (i + 1) * 10)} of ${shots.length}`);
      await US.host.call('placeClips', { seqId: seq.id, clips: parts[i] });
    }
    job.set({ msg: 'Laying the music underneath' });
    await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: musicTarget.id, 'in': an.offset, out: an.offset + end, at: 0, a: 0, video: false }] });
    await US.host.call('openSequence', { seqId: seq.id });
    return { summary: `Made “${seq.name}”: ${US.plural(shots.length, 'cut')} at ${Math.round(an.bpm)} BPM, ${US.fmtDur(end)} long.`, seq, shots: shots.length, end };
  }

  /* ---------- Assistant actions ---------- */
  async function musicFromSelection(job) {
    const t = await kit.selectedClipTarget();
    if (!t) throw new US.UserError('NO_SELECTION', { title: 'No music selected.', action: 'Select the music clip in the Project panel, then ask again.' });
    return { target: t, an: await analyse(t, job) };
  }
  const everyOf = t => /every bar|each bar|on the bar|bars?\b/.test(t) ? 'bar' : /every (other|2|two|second) beat/.test(t) ? '2' : /every (2|two) bars/.test(t) ? '2bars' : 'beat';
  US.actions.register({
    id: 'beats.markers', tool: 'beats', title: 'Add beat markers to the selected music clip', changes: true,
    describe: 'Finds the beat of the music clip selected in the Project panel and adds a marker on every beat (or every 2 beats, every bar, every 2 bars).',
    params: { every: { type: 'enum', options: ['beat', '2', 'bar', '2bars'], default: 'beat', desc: 'How often to add a marker' } },
    examples: ['markers on every beat', 'add a marker on each bar'],
    match(text) { const t = text.toLowerCase(); if (!/marker/.test(t) || !/(beat|bar|music|tempo|bpm)/.test(t)) return null; return { every: everyOf(t) }; },
    async run(p, job) { const { target, an } = await musicFromSelection(job.range(0, 0.6)); job.range(0.6, 1); return addBeatMarkers(target, an, p.every, job); }
  });
  US.actions.register({
    id: 'beats.montage', tool: 'beats', title: 'Cut a bin of clips to the selected music', changes: true,
    describe: 'Makes a new sequence where clips from a bin change on the beat of the music clip selected in the Project panel.',
    params: {
      bin: { type: 'string', default: '', desc: 'Name (or part of the name) of the bin with the clips' },
      every: { type: 'number', default: 2, desc: 'Cut every N beats (1, 2, 4 or 8)' },
      length: { type: 'number', default: 0, desc: 'Length in seconds (0 = the whole song)' },
      energy: { type: 'boolean', default: false, desc: 'Faster cuts in louder parts' }
    },
    examples: ['cut the BEST bin to the music', '30 second montage of the Selects bin to this track'],
    match(text) {
      const t = text.toLowerCase();
      if (!/(cut|edit|montage|sync|beat ?cut)/.test(t) || !/(beat|music|song|track)/.test(t) || /marker/.test(t)) return null;
      const m = /(?:the|my)\s+["“']?([\w\- ]+?)["”']?\s+bin/.exec(text) || /bin\s+["“']?([\w\- ]+?)["”']?(\s|$)/.exec(text);
      const p = { bin: m ? m[1].trim() : '' };
      const len = /(\d+)\s*(s|sec|second)/.exec(t); if (len) p.length = +len[1];
      const ev = /every (\d) beats?/.exec(t); if (ev) p.every = +ev[1];
      if (/faster|energy|loud/.test(t)) p.energy = true;
      return p;
    },
    async run(p, job) {
      const { target, an } = await musicFromSelection(job.range(0, 0.3));
      job.range(0.3, 1);
      const bins = await US.host.call('listBins');
      const want = (p.bin || '').toLowerCase();
      const bin = want ? bins.find(b => b.path.toLowerCase().split(' / ').pop() === want) || bins.find(b => b.path.toLowerCase().includes(want)) : null;
      if (!bin) throw new US.UserError('NO_SELECTION', { title: want ? `Can’t find a bin called “${p.bin}”.` : 'Which bin should I use?', action: 'Say the bin’s name, e.g. “cut the BEST bin to the music”, or use the Beat Cut tool.' });
      const clips = await US.host.call('binItems', { binId: bin.id, kinds: ['video'], recursive: true });
      return montage(target, an, clips, { every: [1, 2, 4, 8].includes(p.every) ? p.every : 2, energy: p.energy, length: p.length || 0, order: 'bin' }, job);
    }
  });

  US.tools.register({
    id: 'beats', name: 'Beat Cut', short: 'Beats', icon: 'beats', group: 'cut', order: 21,
    blurb: 'Finds the beat, adds beat markers and cuts your clips to the music.',
    hostFns: ['renderAudio', 'addClipMarkers', 'addSequenceMarkers', 'newSequence', 'placeClips', 'audioClipRange', 'clipRanges'],
    create() {
      const v = ui.toolView({ icon: 'beats', title: 'Beat Cut', blurb: US.app.is('resolve') ? 'Finds the beat and bars, marks them, and can cut a bin of clips to the music.' : 'Premiere has no beat detection – this finds the beat and bars, marks them, and can cut a bin of clips to the music.',
        help: h('div', h('ul', h('li', 'Select the music in the Project panel (or pick a sequence) and press “Find the beat”.'), h('li', 'If the tempo is twice or half what you feel, use “Half speed” / “Double speed”.'), h('li', '“Make the beat cut” builds a new sequence: your clips on V1 changing on the beat, the music on A1. Clips’ own sound is left out.'))) });
      let target = null, base = null, an = null;

      const musicPicker = ui.sourcePicker({ modes: ['selection', 'sequence'], kinds: ['audio'], label: 'Music', onChange: () => { an = base = null; render(); } });
      const findBtn = ui.actionButton('Find the beat', () => US.jobs.run({ title: 'Finding the beat', tool: 'beats' }, async job => {
        target = await kit.resolveTarget(musicPicker, job);
        base = an = await analyse(target, job);
        render();
        return { summary: `${Math.round(an.bpm)} BPM, ${US.plural(an.beats.length, 'beat')} in “${target.name}”${target.extra ? ` (used the first of ${target.extra + 1} selected clips)` : ''}` };
      }), { icon: 'beats' });

      const results = h('div');
      v.body.append(ui.card(musicPicker.el, findBtn), results);

      const tl = ui.timeline({ height: 46, onSeek: t => target && kit.goTo(target, t, target.kind === 'item' ? an.offset : 0) });
      const tempoStats = h('div');
      const every = ui.segmented({ options: [{ value: 'beat', label: 'Every beat' }, { value: '2', label: 'Every 2' }, { value: 'bar', label: 'Every bar' }, { value: '2bars', label: 'Every 2 bars' }], value: US.settings.get('beats.every', 'bar'), onChange: x => US.settings.set('beats.every', x) });
      const markBtn = ui.button('Add markers', { kind: 'secondary', icon: 'target', onClick: () => US.jobs.run({ title: 'Adding beat markers', tool: 'beats' }, async job => { const r = await addBeatMarkers(target, an, every.get(), job); render(); return r; }) });
      const unmarkBtn = ui.button('Remove my markers', { kind: 'ghost', onClick: () => US.jobs.run({ title: 'Removing beat markers', tool: 'beats' }, async () => { const n = await kit.removeMarkers('beats:' + target.id); render(); return { summary: `Removed ${US.plural(n, 'marker')}` }; }) });
      const markWhere = h('div.field-hint');

      const clipsPicker = ui.sourcePicker({ modes: ['bin', 'selection'], kinds: ['video'], label: 'Clips to cut' });
      const cutEvery = ui.segmented({ options: [1, 2, 4, 8].map(n => ({ value: n, label: n === 1 ? 'Every beat' : `Every ${n}` })), value: US.settings.get('beats.cutEvery', 2), onChange: x => US.settings.set('beats.cutEvery', x) });
      const length = ui.segmented({ options: [{ value: 15, label: '15 s' }, { value: 30, label: '30 s' }, { value: 60, label: '60 s' }, { value: 0, label: 'Whole song' }], value: US.settings.get('beats.length', 0), onChange: x => US.settings.set('beats.length', x) });
      const order = ui.segmented({ options: [{ value: 'bin', label: 'In bin order' }, { value: 'shuffle', label: 'Shuffled' }], value: US.settings.get('beats.order', 'bin'), onChange: x => US.settings.set('beats.order', x) });
      const energy = ui.toggle({ label: 'Faster cuts in louder parts', value: US.settings.get('beats.energy', false), onChange: x => US.settings.set('beats.energy', x), hint: 'Halves the cut length in the loudest parts and doubles it in quiet ones.' });
      const cutBtn = ui.actionButton('Make the beat cut', () => US.jobs.run({ title: 'Cutting clips to the beat', tool: 'beats' }, async job => {
        const r = await clipsPicker.resolve(job);
        return montage(target, an, r.items || [], { every: cutEvery.get(), energy: energy.get(), length: length.get(), order: order.get() }, job);
      }), { icon: 'film' });
      const montageNote = h('div');

      function render() {
        US.clear(results);
        if (!an) { results.appendChild(ui.empty({ icon: 'beats', title: 'Select a music clip and press “Find the beat”.', text: 'MP3, WAV, AAC or the sound of any clip or sequence.' })); return; }
        const accent = kit.cssColor('var(--accent)'), dim = kit.cssColor('var(--text-3)');
        const downs = new Set(an.downbeats.map(t => t.toFixed(3)));
        tl.draw({ duration: an.duration, marks: an.beats.map(t => ({ t, color: downs.has(t.toFixed(3)) ? accent : dim, w: downs.has(t.toFixed(3)) ? 2 : 1 })) });
        US.clear(tempoStats).appendChild(ui.stats(ui.stat(`${Math.round(an.bpm)}`, 'beats per minute'), ui.stat(String(an.beats.length), 'beats'), ui.stat(String(an.downbeats.length), `bars of ${an.beatsPerBar}`)));
        markWhere.textContent = target.kind === 'item' ? `Markers go on the clip “${target.name}” – you’ll see them in the Source Monitor and wherever the clip is used.` : `Markers go on the sequence “${target.name}”.`;
        unmarkBtn.classList.toggle('hidden', !kit.recallMarkers('beats:' + target.id));
        US.clear(montageNote);
        if (target.kind !== 'item') montageNote.appendChild(ui.note('To cut clips to music, pick the music as a clip (“Selected clips”) rather than a sequence.', 'warn'));
        cutBtn.setEnabled(target.kind === 'item');
        results.append(
          ui.card(h('div.card-title', 'The beat', h('span.right', target.name)), tempoStats, tl.el,
            h('div.row', ui.button('Half speed', { small: true, kind: 'ghost', onClick: () => { an = retime(an, 'half'); render(); } }), ui.button('Double speed', { small: true, kind: 'ghost', onClick: () => { an = retime(an, 'double'); render(); } }), an !== base && ui.button('Reset', { small: true, kind: 'ghost', onClick: () => { an = base; render(); } }))),
          ui.card(h('div.card-title', 'Markers'), every, markWhere, h('div.row', markBtn, unmarkBtn)),
          ui.card(h('div.card-title', 'Cut clips to the beat'), clipsPicker.el, ui.field('Change shot', cutEvery), ui.field('Length', length), ui.field('Order', order), energy, montageNote, cutBtn));
      }
      render();
      return { el: v.el, onShow() { musicPicker.refresh(); clipsPicker.refresh(); } };
    }
  });

  US.beatCut = { analyse, montage, cutPoints, retime, markerTimes };
})();
