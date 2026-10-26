/* JMG Ultra Studio – Sound Check: loudness against a delivery target, peaks, clipping, hum, wind and dead air.
   Read-only: it never changes the sequence. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, kit = US.audioKit;

  const TARGETS = {
    social: { label: 'YouTube & social', lufs: -14, peak: -1, tol: 1 },
    podcast: { label: 'Podcast', lufs: -16, peak: -1, tol: 1 },
    broadcast: { label: 'Broadcast (UK/EBU)', lufs: -23, peak: -1, tol: 0.5 }
  };

  /** Measure one target and turn the numbers into plain findings. */
  async function check(target, tgtKey, job, { from = 0, to = 1 } = {}) {
    const T = TARGETS[tgtKey] || TARGETS.social;
    const m = await kit.measure(target, job, { from, to: from + (to - from) * 0.8 });
    job.set({ who: 'computer', msg: `Listening for hum, wind and gaps in “${target.name}”` });
    const spec = await US.dsp.quietSpectrum(m.mono16, m.sr, { check: () => job.check() });
    const hum = US.dsp.detectHum(spec);
    const wd = await US.dsp.windAndDeadAir(m.mono16, m.sr, { check: () => job.check() });
    job.progress(to);
    const L = m.meter, dur = L.duration;
    const issues = [];
    const add = (sev, title, action, times = []) => issues.push({ sev, title, action, times });
    const fmtL = v => isFinite(v) ? v.toFixed(1) : '–';

    if (!isFinite(L.integrated)) add('warn', 'Almost no sound to measure.', 'Check the right tracks are switched on, or that this is the right sequence.');
    else {
      const diff = T.lufs - L.integrated;
      if (diff > T.tol) {
        const newPeak = L.truePeakDb + diff;
        add('bad', `Too quiet for ${T.label}: ${fmtL(L.integrated)} LUFS (target ${T.lufs}).`,
          `Raise the mix by about ${diff.toFixed(1)} dB${newPeak > T.peak ? `, with a limiter on the Mix track (peaks would reach ${newPeak.toFixed(1)} dB otherwise)` : ''}. Or tick “Loudness Normalisation” at ${T.lufs} LUFS in the export settings.`);
      } else if (diff < -T.tol) {
        add('bad', `Too loud for ${T.label}: ${fmtL(L.integrated)} LUFS (target ${T.lufs}).`, `Lower the mix by about ${(-diff).toFixed(1)} dB, or tick “Loudness Normalisation” at ${T.lufs} LUFS in the export settings.`);
      } else add('ok', `Loudness is on target: ${fmtL(L.integrated)} LUFS (target ${T.lufs}).`, '');
    }
    if (L.truePeakDb > T.peak + 0.05) add(L.clips.length ? 'bad' : 'warn', `Peaks reach ${L.truePeakDb.toFixed(1)} dB (limit ${T.peak} dB).`, 'Put a limiter on the Mix track (Effects › Amplitude and Compression › Hard Limiter, maximum −1.5 dB).');
    if (L.clips.length) add('bad', `Clipping in ${US.plural(L.clips.length, 'place')}.`, 'Lower the clip or track at these points – clipped sound crackles and can’t be repaired later.', L.clips.map(c => c.start));
    if (hum) add('warn', `Mains hum at ${hum.freq} Hz in the quiet parts.`, `Try Effects › Noise Reduction/Restoration › DeHum (${hum.freq} Hz) or Essential Sound › Repair › Reduce Rumble/DeHum on the affected clips.`);
    if (wd.wind.length) add('warn', `Wind or rumble in ${US.plural(wd.wind.length, 'place')}.`, 'Add Effects › Filter and EQ › Highpass (around 80–100 Hz) to those clips, or Essential Sound › Repair › Reduce Rumble.', wd.wind.map(w => w.start));
    const dead = wd.dead.filter(d => d.start > 0.5 && d.end < dur - 0.5);
    if (dead.length) add('warn', `${US.plural(dead.length, 'silent gap')} (no sound for over 2 s).`, 'Check they’re meant to be there; fill them with room tone or music, or tighten the edit.', dead.map(d => d.start));
    if (L.range > 15 && tgtKey !== 'broadcast') add('warn', `Big jumps in loudness (range ${L.range.toFixed(0)} LU).`, 'Quiet speech may get lost on phones. Try Essential Sound › Dialogue › Loudness › Auto-Match and a little compression.');
    if (!m.stereoPreset) add('info', 'Measured in mono.', 'Premiere’s stereo WAV preset wasn’t found, so stereo mixes may read up to 3 dB quieter than they are.');
    return { target, T, meter: L, hum, wind: wd.wind, dead, issues, duration: dur, curve: Array.from(L.shortTerm) };
  }

  /**
   * A copy of the sequence at the target loudness: every clip's level changed by the same amount (held back if the
   * peaks would go over the limit), then measured again. r: a check() result for a sequence. -> {copy, after, gain, summary}
   */
  async function fixLoudness(r, job) {
    const T = r.T, L = r.meter;
    if (!r.target || r.target.kind !== 'sequence') throw new US.UserError('UNKNOWN', { title: 'Only a whole sequence can be fixed.', action: 'Check the sequence (not single clips), then press the button again.' });
    if (!isFinite(L.integrated)) throw new US.UserError('NOTHING_FOUND', { title: 'There’s almost no sound to fix.' });
    let gain = T.lufs - L.integrated, limited = false;
    if (gain > 0 && L.truePeakDb + gain > T.peak) { gain = Math.max(0, T.peak - L.truePeakDb); limited = true; }
    if (Math.abs(gain) < 0.1) throw new US.UserError('NOTHING_FOUND', { title: 'It can’t get louder without the peaks going over the limit.', action: 'Put a Hard Limiter on the Mix track (maximum −1.5 dB), check again, then fix it.' });
    job.set({ who: 'premiere', msg: `Making a copy ${gain > 0 ? 'louder' : 'quieter'} by ${Math.abs(gain).toFixed(1)} dB` });
    const copy = await US.host.call('cloneSequence', { seqId: r.target.id, name: `${r.target.name} – ${T.lufs} LUFS` });
    const g = await US.host.call('soundGain', { seqId: copy.id, db: gain });
    job.progress(0.4);
    const after = await check(Object.assign({}, r.target, { id: copy.id, name: copy.name }), Object.keys(TARGETS).find(k => TARGETS[k] === T) || 'social', job, { from: 0.4, to: 1 });
    await US.host.call('openSequence', { seqId: copy.id }); await US.refreshContext();
    const notes = [limited ? `held at ${gain.toFixed(1)} dB so the peaks stay under ${T.peak} dB – add a limiter for the rest` : '', g.capped ? `${US.plural(g.capped, 'clip')} reached Premiere’s +6 dB clip limit` : ''].filter(Boolean);
    return { copy, after, gain, summary: `“${copy.name}”: ${L.integrated.toFixed(1)} → ${after.meter.integrated.toFixed(1)} LUFS${notes.length ? ' (' + notes.join('; ') + ')' : ''}` };
  }

  /* ---------- music ducked under speech ---------- */
  /** Speech stretches, joined when the gap is too short for the music to come back up and go down again. */
  function speechRegions(spans, { gap = 1.5 } = {}) {
    const out = [];
    for (const x of spans.slice().sort((a, b) => a.start - b.start)) {
      const last = out[out.length - 1];
      if (last && x.start - last.end <= gap) last.end = Math.max(last.end, x.end); else out.push({ start: x.start, end: x.end });
    }
    return out;
  }
  /** Volume keyframes for one music clip ({start, end} on the sequence): down just before each stretch, back up after. */
  function duckKeys(regions, clip, { down = 0.4, up = 0.8 } = {}) {
    const keys = [];
    const add = (t, duck) => {
      t = +Math.min(clip.end, Math.max(clip.start, t)).toFixed(3);
      const last = keys[keys.length - 1];
      if (last && t <= last.t + 0.001) { last.duck = last.duck || duck; return; }
      keys.push({ t, duck });
    };
    for (const r of regions) {
      if (r.end + up <= clip.start || r.start - down >= clip.end) continue;
      if (r.start - down > clip.start) add(r.start - down, false);
      add(r.start, true);
      add(r.end, true);
      if (r.end + up < clip.end) add(r.end + up, false);
    }
    return keys;
  }
  const MUSIC_NAME = /\b(music|songs?|score|bed|soundtrack)\b/i, VOICE_NAME = /\b(dialog(ue)?|voice|vo|interview|mic|lav|boom|dx)\b/i;
  /**
   * Audio tracks that look like music: named so, or clips from audio-only files (WAV, MP3…) – but never a track with
   * transcribed speech or one named like dialogue (separately recorded interview sound is WAV too).
   * transcribed: Set of track indexes with transcripts. -> {tracks, sure} (sure: every guess is named like music)
   */
  function guessMusic(info, transcribed = new Set()) {
    const list = info.audio.filter(t => t.clips.length && !transcribed.has(t.index) && !VOICE_NAME.test(t.name || '') &&
      (MUSIC_NAME.test(t.name || '') || t.clips.every(c => /\.(wav|mp3|aiff?|m4a|flac|ogg|aac)$/i.test(c.path || c.name || ''))));
    return { tracks: list.map(t => t.index), sure: list.length > 0 && list.every(t => MUSIC_NAME.test(t.name || '')) };
  }
  const musicTracks = (info, transcribed) => guessMusic(info, transcribed).tracks;

  /** A copy of the sequence with the music tracks ducked under the speech. -> {copy, regions, via, summary} */
  /** Which tracks have transcribed speech (from Story), so they're never taken for music. */
  async function transcribedTracks(job, seqId) {
    if (!US.story || !US.story.timelineTranscript) return new Set();
    try { return new Set((await US.story.timelineTranscript(job, { seqId })).collected.audioTracks.filter(t => t.transcribed > 0).map(t => t.index)); } catch (e) { return new Set(); }
  }
  async function duckMusic(job, { seqId, tracks, db = 12, needSure = false }) {
    job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const info = await US.host.call('sequenceInfo', { seqId });
    if (!tracks || !tracks.length) {
      const g = guessMusic(info, await transcribedTracks(job, seqId));
      if (!g.tracks.length || (needSure && !g.sure)) throw new US.UserError('NOTHING_FOUND', { title: g.tracks.length ? 'Ultra Studio isn’t sure which track is the music.' : 'No music track found.', action: 'Open Sound Check › Duck the music under speech, tick the music track(s), then try again.' });
      tracks = g.tracks;
    }
    tracks = tracks.filter(i => info.audio[i] && info.audio[i].clips.length);
    if (!tracks.length) throw new US.UserError('NOTHING_FOUND', { title: 'The music tracks you ticked are empty.', action: 'Tick the track with the music, then try again.' });
    let spans = [], via = 'transcript';
    // speech only from the other tracks (a song with vocals may have a transcript too)
    const voice = info.audio.map(t => t.index).filter(i => !tracks.includes(i));
    if (US.story && US.story.timelineTranscript && voice.length) { try { spans = (await US.story.timelineTranscript(job, { seqId, tracks: voice })).result.entries; } catch (e) { /* no transcripts */ } }
    const copy = await US.host.call('cloneSequence', { seqId, name: `${info.name} – music ducked` });
    if (!spans.length) {
      // no transcripts: listen to everything except the music
      via = 'sound';
      for (const i of tracks) await US.host.call('muteTrack', { seqId: copy.id, index: i, mute: true });
      try {
        const a = await kit.loadAudio({ kind: 'sequence', id: copy.id, name: copy.name, duration: info.duration, fps: info.fps, extra: 0 }, job);
        const env = US.audio.envelope(a.data, a.sr, 0.02, 0.03), st = US.dsp.levelStats(env.db);
        const pauses = US.dsp.findPauses(env, { threshold: st.auto, minPause: 0.8, padding: 0.1, duration: a.duration }).pauses;
        let t = 0; for (const p of pauses) { if (p.start - t > 0.3) spans.push({ start: t, end: p.start }); t = p.end; }
        if (a.duration - t > 0.3) spans.push({ start: t, end: a.duration });
      } finally { for (const i of tracks) await US.host.call('muteTrack', { seqId: copy.id, index: i, mute: false }); }
    }
    const regions = speechRegions(spans);
    if (!regions.length) throw new US.UserError('NOTHING_FOUND', { title: 'No speech found to duck under.', action: 'Check the dialogue tracks are switched on.' });
    const clips = [];
    for (const i of tracks) info.audio[i].clips.forEach((c, index) => { const keys = duckKeys(regions, c); if (keys.length) clips.push({ track: i, index, keys }); });
    job.set({ who: 'premiere' }).progress(0.9, `Ducking ${US.plural(clips.length, 'music clip')} by ${db} dB`);
    const r = await US.host.call('soundDuck', { seqId: copy.id, clips, db });
    await US.host.call('openSequence', { seqId: copy.id }); await US.refreshContext();
    return { copy, regions, via, tracks, summary: `“${copy.name}”: music on ${tracks.map(i => 'A' + (i + 1)).join(', ')} down ${db} dB under ${US.plural(regions.length, 'stretch', 'stretches')} of speech (found from the ${via === 'transcript' ? 'transcripts' : 'sound'})${r.skipped ? ` · ${US.plural(r.skipped, 'clip')} already had volume keyframes and were left alone` : ''}` };
  }
  US.actions.register({
    id: 'sound.duck', tool: 'sound', title: 'Duck the music under speech (on a copy)', changes: true,
    describe: 'Makes a copy of the active sequence with the music lowered while people speak, with smooth fades.',
    params: { db: { type: 'number', default: 12, desc: 'How far down, in dB' } },
    examples: ['duck the music under the interviews', 'lower the music when people talk'],
    match: t => (/\bmusic\b/i.test(t) && /\b(duck|lower|dip|under|quieter|down)\b/i.test(t) ? { db: +((/(\d+)\s*db/i.exec(t) || [])[1] || 12), _score: 2.6 } : null),
    run: (p, job) => { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); return duckMusic(job, { seqId: s.id, db: p.db, needSure: true }); }
  });

  US.actions.register({
    id: 'sound.fix', tool: 'sound', title: 'Fix the loudness of the active sequence (on a copy)', changes: true,
    describe: 'Measures the active sequence and makes a copy at the target loudness (YouTube −14, podcast −16 or broadcast −23 LUFS), then measures the copy.',
    params: { target: { type: 'enum', options: Object.keys(TARGETS), default: 'social', desc: 'social, podcast or broadcast' } },
    examples: ['fix the loudness', 'make it -14 LUFS', 'normalise the sound for youtube'],
    match(t) {
      if (!/\b(fix|normali[sz]e|make|set|bring)\b/i.test(t) || !/\b(loud(ness)?|lufs|levels?|volume)\b/i.test(t)) return null;
      return { target: /broadcast|tv|bbc|ebu|r128|-?23/.test(t) ? 'broadcast' : /podcast|-?16/.test(t) ? 'podcast' : 'social', _score: 2.6 };
    },
    async run(p, job) {
      const r = await check(await kit.activeSequenceTarget(), p.target, job, { from: 0, to: 0.4 });
      job.range(0.4, 1);
      const x = await fixLoudness(r, job);
      job.range(0, 1);
      US.bus.emit('sound.result', x.after);
      return x;
    }
  });

  US.actions.register({
    id: 'sound.check', tool: 'sound', title: 'Check the sound of the active sequence',
    describe: 'Measures loudness against a delivery target and looks for peaks, clipping, hum, wind and silent gaps. Changes nothing.',
    params: { target: { type: 'enum', options: Object.keys(TARGETS), default: 'social', desc: 'Delivery target: social (−14 LUFS), podcast (−16) or broadcast (−23)' } },
    examples: ['check the sound', 'is this loud enough for YouTube?', 'check the levels for broadcast'],
    match(text) {
      const t = text.toLowerCase();
      if (!/(loud|lufs|levels?|sound|audio|clipping|hum|peaks?)/.test(t) || !/(check|measure|test|loud enough|too loud|too quiet|ok\b|okay|right)/.test(t) || /(silen|pause)/.test(t)) return null;
      return { target: /broadcast|tv|bbc|ebu|r128/.test(t) ? 'broadcast' : /podcast/.test(t) ? 'podcast' : 'social' };
    },
    async run(p, job) {
      const r = await check(await kit.activeSequenceTarget(), p.target, job);
      const bad = r.issues.filter(i => i.sev === 'bad' || i.sev === 'warn');
      if (US.tools.current !== 'sound') US.bus.emit('sound.result', r);
      return { summary: `${isFinite(r.meter.integrated) ? r.meter.integrated.toFixed(1) + ' LUFS' : 'No sound'} · ${bad.length ? US.plural(bad.length, 'thing') + ' to look at: ' + bad.map(b => b.title).join(' ') : 'all good'}` };
    }
  });

  US.tools.register({
    id: 'sound', name: 'Sound Check', short: 'Sound', icon: 'sound', group: 'finish', order: 31,
    blurb: 'Loudness for YouTube, podcast or broadcast, plus clipping, hum, wind and gaps. Changes nothing.',
    hostFns: ['renderAudio', 'presets', 'setPlayhead', 'showInSource', 'soundGain', 'soundDuck', 'muteTrack', 'cloneSequence', 'sequenceInfo'],
    create() {
      const v = ui.toolView({ icon: 'sound', title: 'Sound Check', blurb: 'Measures the mix the way YouTube, Spotify and broadcasters do, and points out anything that needs fixing. It never changes your sequence.',
        help: h('div', h('ul', h('li', 'Loudness is measured to ITU-R BS.1770 (the LUFS standard used by YouTube, podcasts and the EBU), at 48 kHz in stereo.'), h('li', 'Peaks are estimated true peaks; clipping means runs of samples stuck at full scale.'), h('li', 'Hum, wind and silent gaps are found in the quiet parts. Click an issue to jump to it.'), h('li', 'With clips selected (or a bin), each clip is checked on its own – handy for a mic check across all your interviews.'))) });
      let results = [], target = US.settings.get('sound.target', 'social');
      const picker = ui.sourcePicker({ modes: ['sequence', 'selection', 'bin'], kinds: ['audio'], label: 'Check' });
      const tgt = ui.segmented({ options: Object.entries(TARGETS).map(([k, t]) => ({ value: k, label: t.label, title: `${t.lufs} LUFS, peaks below ${t.peak} dB` })), value: target, onChange: x => { target = x; US.settings.set('sound.target', x); } });
      const goBtn = ui.actionButton('Check the sound', () => US.jobs.run({ title: 'Checking the sound', tool: 'sound' }, async job => {
        const r = await picker.resolve(job);
        const targets = r.sequence ? [{ kind: 'sequence', id: r.sequence.id, name: r.sequence.name, duration: r.sequence.duration, fps: r.sequence.fps }]
          : r.items.slice(0, 40).map(it => ({ kind: 'item', id: it.id, name: it.name, duration: it.duration, fps: it.fps || 25, item: it }));
        if (r.items && r.items.length > 40) US.ui.toast({ type: 'info', title: 'Checking the first 40 clips.', text: 'Pick a smaller bin or selection to check the rest.' });
        results = [];
        for (let i = 0; i < targets.length; i++) {
          job.check();
          const t = targets[i];
          if (t.item && t.item.offline) { results.push({ target: t, offline: true }); continue; }
          try { results.push(await check(t, target, job, { from: i / targets.length, to: (i + 1) / targets.length })); }
          catch (e) { if (US.errors.cancelled(e)) throw e; results.push({ target: t, error: US.errors.explain(e) }); }
          render();
        }
        render();
        const issues = results.reduce((n, r) => n + (r.issues ? r.issues.filter(i => i.sev === 'bad' || i.sev === 'warn').length : 1), 0);
        return { summary: targets.length === 1 && results[0].meter ? `${results[0].meter.integrated.toFixed(1)} LUFS · ${issues ? US.plural(issues, 'thing') + ' to look at' : 'all good'}` : `${US.plural(targets.length, 'clip')} checked · ${issues ? US.plural(issues, 'thing') + ' to look at' : 'all good'}` };
      }), { icon: 'sound' });
      const out = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
      // duck the music under speech
      const duckDb = ui.slider({ label: 'Duck by', min: 6, max: 24, step: 1, value: US.settings.get('sound.duckDb', 12), fmt: x => x + ' dB', onChange: x => US.settings.set('sound.duckDb', x) });
      const duckTracks = h('div'); let duckSel = [];
      async function listTracks() {
        US.clear(duckTracks);
        const s = US.ctx.sequence; if (!s) { duckTracks.appendChild(h('div.field-hint', 'Open a sequence first.')); return; }
        const info = await US.host.call('sequenceInfo', { seqId: s.id }), guess = musicTracks(info, await transcribedTracks(null, s.id));
        duckSel = guess.slice();
        duckTracks.append(h('div.field-label', 'Music on'), ...info.audio.filter(t => t.clips.length).map(t => ui.toggle({ label: `A${t.index + 1}${t.name && !/^Audio \d+$/.test(t.name) ? ' · ' + t.name : ''} · ${t.clips[0].name}${t.clips.length > 1 ? ` +${t.clips.length - 1}` : ''}`, value: guess.includes(t.index), onChange: x => { duckSel = x ? duckSel.concat(t.index) : duckSel.filter(i => i !== t.index); } })));
      }
      const duckBtn = ui.actionButton('Make a ducked copy', () => {
        if (!duckSel.length) { ui.toast({ type: 'warn', title: 'Tick the music track(s) first', text: 'Under “Music on”, tick the track that has the music.' }); return; }
        return US.jobs.run({ title: 'Ducking the music', tool: 'sound' }, job => duckMusic(job, { seqId: US.ctx.sequence && US.ctx.sequence.id, tracks: duckSel, db: duckDb.get() }));
      }, { icon: 'sound', kind: 'secondary' });
      const duckCard = ui.section('Duck the music under speech', [h('div.field-hint', 'A copy of the active sequence with the music lowered while people speak, fading down just before and back up after. Speech is found from the transcripts (or the sound).'), duckTracks, duckDb, duckBtn], { open: false });
      duckCard.querySelector('.section-head').addEventListener('click', () => listTracks().catch(ui.showError));
      v.body.append(ui.card(picker.el, ui.field('Target', tgt), goBtn), duckCard, out);
      US.bus.on('sound.result', r => { results = [r]; render(); });

      const sevIcon = { ok: ['ok', 'var(--ok)'], bad: ['error', 'var(--err)'], warn: ['warn', 'var(--warn)'], info: ['info', 'var(--info)'] };
      function issueRow(r, is) {
        let k = 0;
        const [ic, col] = sevIcon[is.sev];
        const icon = US.icon(ic, 16); icon.style.color = col;
        return h('div.list-row' + (is.times.length ? '.clickable' : ''), { onclick: is.times.length ? () => { kit.goTo(r.target, is.times[k % is.times.length]); k++; } : null, title: is.times.length ? 'Click to jump there (click again for the next one)' : '' },
          icon, h('div.list-main', h('div.list-title.sound-wrap', is.title), is.action && h('div.list-sub.sound-wrap', is.action)),
          is.times.length ? h('div.list-right', is.times.slice(0, 3).map(t => US.fmtDur(t)).join(', ') + (is.times.length > 3 ? ' …' : '')) : null);
      }
      function detail(r) {
        const L = r.meter, T = r.T;
        const tl = ui.timeline({ height: 54, onSeek: t => kit.goTo(r.target, t) });
        const red = kit.cssColor('var(--err)'), warn = kit.cssColor('var(--warn)'), dim = kit.cssColor('var(--text-3)'), ok = kit.cssColor('var(--ok)');
        const lo = T.lufs - 25;
        const card = ui.card(
          h('div.card-title', r.target.name, h('span.right', US.fmtDur(r.duration))),
          ui.stats(ui.stat(isFinite(L.integrated) ? L.integrated.toFixed(1) : '–', 'LUFS (integrated)'), ui.stat(isFinite(L.integrated) ? (L.integrated - T.lufs > 0 ? '+' : '') + (L.integrated - T.lufs).toFixed(1) : '–', `dB vs ${T.lufs}`), ui.stat(L.truePeakDb.toFixed(1), 'dB true peak'), ui.stat(L.range.toFixed(1), 'LU range')),
          tl.el,
          kit.legend([['Loudness over time (3 s)', kit.cssColor('var(--text-2)')], ['Target', ok], ['Clipping', red], ['Wind', warn], ['Silent gap', dim]]),
          h('div.list', r.issues.map(is => issueRow(r, is))),
          r.target.kind === 'sequence' && isFinite(L.integrated) && Math.abs(T.lufs - L.integrated) > T.tol
            ? ui.actionButton(`Make a copy at ${T.lufs} LUFS`, () => US.jobs.run({ title: 'Fixing the loudness', tool: 'sound' }, async job => { const x = await fixLoudness(r, job); results = [x.after]; render(); return x; }), { icon: 'sound' })
            : null);
        setTimeout(() => tl.draw({
          duration: r.duration, curve: r.curve.map(v => Math.max(0, (isFinite(v) ? v : lo) - lo)), curveMax: 30,
          regions: [{ start: 0, end: r.duration, color: ok, alpha: 0.06 }].concat(r.wind.map(w => ({ start: w.start, end: w.end, color: warn, alpha: 0.5, label: 'Wind/rumble' })), r.dead.map(d => ({ start: d.start, end: d.end, color: dim, alpha: 0.5, label: 'Silent gap' }))),
          marks: r.meter.clips.map(c => ({ t: c.start, color: red, w: 2 })).concat([{ t: 0, color: ok, w: 0 }])
        }), 0);
        return card;
      }
      function render() {
        US.clear(out);
        if (!results.length) { out.appendChild(ui.empty({ icon: 'sound', title: 'Pick a sequence (or clips) and press “Check the sound”.', text: 'Takes a few seconds per minute of sound. Nothing in your project changes.' })); return; }
        if (results.length === 1 && results[0].meter) { out.appendChild(detail(results[0])); return; }
        // several clips: one summary row each, click for details
        out.appendChild(ui.card(h('div.card-title', 'Clips checked', h('span.right', `${results.length}`)),
          h('div.list', results.map(r => {
            if (r.offline) return h('div.list-row', h('div.list-main', h('div.list-title', r.target.name), h('div.list-sub', 'Offline – relink it in Premiere to check it.')));
            if (r.error) return h('div.list-row', h('div.list-main', h('div.list-title', r.target.name), h('div.list-sub', r.error.title + ' ' + r.error.action)));
            const probs = r.issues.filter(i => i.sev === 'bad' || i.sev === 'warn');
            return h('div.list-row.clickable', { onclick: () => { const d = detail(r); out.appendChild(d); d.scrollIntoView({ behavior: 'smooth' }); } },
              h('span.swatch', { style: { background: kit.cssColor(probs.some(p => p.sev === 'bad') ? 'var(--err)' : probs.length ? 'var(--warn)' : 'var(--ok)') } }),
              h('div.list-main', h('div.list-title', r.target.name), h('div.list-sub', probs.length ? probs.map(p => p.title).join(' · ') : 'No problems found')),
              h('div.list-right', isFinite(r.meter.integrated) ? `${r.meter.integrated.toFixed(1)} LUFS` : '–'));
          }))));
      }
      render();
      return { el: v.el, onShow() { picker.refresh(); } };
    }
  });

  US.soundCheck = { check, TARGETS, fixLoudness, speechRegions, duckKeys, musicTracks, guessMusic, duckMusic };
})();
