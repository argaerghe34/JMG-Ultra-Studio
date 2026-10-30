/* JMG Ultra Studio – Podcast: cuts between the cameras of a video podcast by who is speaking, like an editor would.
   Each mic is heard on its own (rendered here, nothing leaves the computer) and measured against its own quiet and
   talking levels, so a voice that bleeds into another mic doesn't steal the shot. Rules on top: a minimum and maximum
   shot length, a short delay after the new voice starts, "mm-hm"s ignored, the wide on crosstalk and long silences,
   reaction shots when one person talks for a long time, wides at the start and end. Every switch is listed for checking.
   The result is a copy of the sequence with all cameras still stacked – cut at each switch, only the active one on –
   so it stays re-switchable. Pure logic first (unit-tested), then the tool. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const kit = () => US.audioKit;

  /* ---------- who is speaking, from each mic's level ---------- */
  const pct = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))] : -100; };
  /** Each mic's quiet and talking levels (dB) from its own sound. */
  const calibrate = envs => envs.map(db => { const floor = pct(db, 0.1), speech = Math.max(floor + 6, pct(db, 0.95)); return { floor, speech }; });
  /**
   * Runs of who is speaking: [{start, end, who}] – who is the mic's index, 'cross' (two at once) or 'none'.
   * A mic counts when it is above `sensitivity` of the way from its quiet to its talking level; the speaker is the mic
   * furthest above its own quiet (so bleed into another mic loses); two within crossMargin of each other is crosstalk.
   */
  function speakerRuns(envs, { hop = 0.02, sensitivity = 0.45, crossMargin = 0.12, minRun = 0.3 } = {}) {
    const cal = calibrate(envs), n = Math.min(...envs.map(e => e.length));
    const label = new Array(n);
    for (let f = 0; f < n; f++) {
      let best = -1, bv = -1, second = -1;
      for (let i = 0; i < envs.length; i++) {
        const v = (envs[i][f] - cal[i].floor) / (cal[i].speech - cal[i].floor);
        if (v > bv) { second = bv; bv = v; best = i; } else if (v > second) second = v;
      }
      label[f] = bv < sensitivity ? 'none' : second >= sensitivity && bv - second < crossMargin ? 'cross' : best;
    }
    // runs, then very short ones joined to the one before
    let runs = [];
    for (let f = 0; f < n;) { let g = f; while (g < n && label[g] === label[f]) g++; runs.push({ start: f * hop, end: g * hop, who: label[f] }); f = g; }
    for (let pass = 0; pass < 2; pass++) {
      const out = [];
      for (const r of runs) { const last = out[out.length - 1]; if (last && (r.end - r.start < minRun || last.who === r.who)) last.end = r.end; else out.push(Object.assign({}, r)); }
      runs = out;
    }
    return { runs, cal };
  }

  /* ---------- the rules ---------- */
  const PACING = {
    longform: { label: 'Long-form', minHold: 4, maxHold: 30, title: 'Calm: long holds, few cutaways – interviews, conversations' },
    standard: { label: 'Standard', minHold: 2.5, maxHold: 20, title: 'Most podcasts' },
    promo: { label: 'Promo', minHold: 1.5, maxHold: 6, title: 'Lively: short holds, frequent cutaways – trailers and clips' }
  };
  const RULES = { pacing: 'standard', minHold: 2.5, maxHold: 20, delayFrames: 3, backchannel: 1.2, wideOnCross: true, crossMin: 1.0, wideOnSilence: 3, introWide: 3, outroWide: 3, reactions: true, reactionLen: 2.5, wideLen: 5, snap: true, seed: 1 };
  // a small, repeatable random: the same seed gives the same edit
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  /**
   * The switch plan. runs: speakerRuns(); setup: {cameras:[{track, shows: mic index | 'wide'}]}; boundaries: sentence ends
   * (seconds) to snap cutaways to; fps for the delay. -> [{start, end, camera (track), why}] covering 0..duration
   */
  function plan(runs, setup, rules = RULES, { duration = runs.length ? runs[runs.length - 1].end : 0, fps = 25, boundaries = [] } = {}) {
    const R = Object.assign({}, RULES, rules), rand = rng(R.seed), delay = R.delayFrames / fps;
    // the panel's switches are on/off: on means the usual length (wides 3 s at the ends, on silences over 3 s)
    const secs = (v, d) => (v === true ? d : v === false || v == null ? 0 : +v || 0);
    R.introWide = secs(R.introWide, 3); R.outroWide = rules.outroWide === undefined ? R.introWide : secs(R.outroWide, 3); R.wideOnSilence = secs(R.wideOnSilence, 3);
    // a camera names the mic of the person it shows by the mic's audio track (so adding or removing a mic changes nothing)
    const micOf = sh => (typeof sh === 'number' && setup.mics ? setup.mics.findIndex(m => m.track === sh) : sh);
    const cams = (setup.cameras || []).map(c => Object.assign({}, c, { shows: c.shows === 'wide' ? 'wide' : micOf(c.shows) })).filter(c => c.shows === 'wide' || c.shows >= 0);
    const wides = cams.filter(c => c.shows === 'wide').map(c => c.track);
    const of = who => cams.filter(c => c.shows === who).map(c => c.track);
    const pick = list => (list.length ? list[Math.floor(rand() * list.length) % list.length] : null);
    const nameOf = who => (setup.names && setup.names[who]) || `Speaker ${who + 1}`;
    // 1. the shot each moment wants
    const wants = [];
    let cur = null;   // who the current shot is on
    runs.forEach((r, i) => {
      const len = r.end - r.start;
      if (typeof r.who === 'number') {
        if (r.who === cur) return;
        const back = runs.slice(i + 1).find(x => x.who !== 'none');
        // a short "mm-hm" between someone else's sentences: stay on the speaker
        if (cur != null && typeof cur === 'number' && len < R.backchannel && back && back.who === cur) return;
        const cam = pick(of(r.who)) != null ? pick(of(r.who)) : pick(wides);
        if (cam != null) wants.push({ t: r.start + delay, camera: cam, why: `${nameOf(r.who)} speaks` });
        cur = r.who;
      } else if (r.who === 'cross' && R.wideOnCross && len >= R.crossMin && wides.length) { wants.push({ t: r.start + delay, camera: pick(wides), why: 'Talking over each other – wide' }); cur = 'wide'; }
      else if (r.who === 'none' && R.wideOnSilence > 0 && len >= R.wideOnSilence && wides.length && i > 0 && i < runs.length - 1) { wants.push({ t: r.start + 0.5, camera: pick(wides), why: 'A long silence – wide' }); cur = 'wide'; }
    });
    if (!wants.length) { const c = pick(wides) != null ? pick(wides) : cams.length ? cams[0].track : 0; return [{ start: 0, end: duration, camera: c, why: 'Nobody detected speaking' }]; }
    // 2. segments
    let segs = [];
    if (R.introWide > 0 && wides.length) segs.push({ start: 0, end: 0, camera: pick(wides), why: 'Opening wide' });
    for (const w of wants) {
      const t = Math.max(0, Math.min(duration, w.t));
      if (!segs.length) { segs.push({ start: 0, end: 0, camera: w.camera, why: w.why }); continue; }
      const last = segs[segs.length - 1];
      if (last.camera === w.camera) continue;
      if (segs.length === 1 && last.why === 'Opening wide' && t < R.introWide) { segs.push({ start: R.introWide, end: 0, camera: w.camera, why: w.why }); continue; }
      if (t <= last.start) { last.camera = w.camera; last.why = w.why; continue; }   // never before the shot already planned
      segs.push({ start: t, end: 0, camera: w.camera, why: w.why });
    }
    for (let i = 0; i < segs.length; i++) segs[i].end = i + 1 < segs.length ? segs[i + 1].start : duration;
    segs = segs.filter(s => s.end - s.start > 1e-6);
    // 3. minimum hold: a shot shorter than that goes to the one before
    const joinShort = () => { const out = []; for (const s of segs) { const last = out[out.length - 1]; if (last && (s.end - s.start < R.minHold || last.camera === s.camera)) last.end = s.end; else out.push(Object.assign({}, s)); } segs = out; };
    joinShort();
    // 4. maximum hold: a cutaway (reaction of someone listening, or the wide) inside a long shot, near a sentence end
    const snapTo = t => { if (!R.snap || !boundaries.length) return t; let best = t, d = 2.01; for (const b of boundaries) { const x = Math.abs(b - t); if (x < d) { d = x; best = b; } } return best; };
    if (R.maxHold > 0) {
      const out = [];
      let flip = 0;
      for (const s of segs) {
        let a = s.start; const pieces = [];
        while (s.end - a > R.maxHold + R.minHold) {
          // someone listening: a camera on another person than the one on screen
          const onScreen = (cams.find(c => c.track === s.camera) || {}).shows;
          const listeners = cams.filter(c => typeof c.shows === 'number' && c.shows !== onScreen && c.track !== s.camera).map(c => c.track);
          const useReaction = R.reactions && listeners.length && (flip++ % 2 === 0 || !wides.length);
          const cam = useReaction ? pick(listeners) : pick(wides.filter(w => w !== s.camera));
          if (cam == null) break;
          const len = useReaction ? R.reactionLen : R.wideLen;
          const at = Math.min(s.end - len - R.minHold, Math.max(a + R.minHold, snapTo(a + R.maxHold)));
          if (at <= a + 0.5) break;
          pieces.push({ start: a, end: at, camera: s.camera, why: a === s.start ? s.why : 'Back to the speaker' });
          pieces.push({ start: at, end: at + len, camera: cam, why: useReaction ? `Held ${Math.round(at - s.start)} s – reaction` : `Held ${Math.round(at - s.start)} s – wide` });
          a = at + len;
        }
        pieces.push({ start: a, end: s.end, camera: s.camera, why: a === s.start ? s.why : 'Back to the speaker' });
        out.push(...pieces);
      }
      segs = out;
    }
    // 5. a closing wide
    if (R.outroWide > 0 && wides.length && duration - R.outroWide > (segs.length ? segs[segs.length - 1].start + R.minHold : 0)) {
      const t = duration - R.outroWide, last = segs[segs.length - 1];
      if (!wides.includes(last.camera)) { last.end = t; segs.push({ start: t, end: duration, camera: pick(wides), why: 'Closing wide' }); }
    }
    return segs.filter(s => s.end - s.start > 1e-6);
  }
  /** Switches as review-list items (every segment after the first); unticking one keeps the shot before. */
  function switches(segs, names = {}) {
    return segs.slice(1).map((s, i) => ({ id: `sw-${Math.round(s.start * 100)}`, kind: /reaction/.test(s.why) ? 'reaction' : /wide/i.test(s.why) ? 'wide' : 'speaker', start: s.start, end: s.end, title: `→ ${names[s.camera] || `V${s.camera + 1}`}`, sub: `${s.why} · holds ${US.fmtDur(s.end - s.start, true)}`, on: true, i: i + 1 }));
  }
  /** The segments with the unticked switches left out (the shot before carries on). */
  function applyTicks(segs, items) {
    const off = new Set(items.filter(x => !x.on).map(x => x.i)), out = [];
    segs.forEach((s, i) => { const last = out[out.length - 1]; if (last && (off.has(i) || last.camera === s.camera)) last.end = s.end; else out.push(Object.assign({}, s)); });
    return out;
  }
  /** Shots per camera and the average shot. */
  function stats(segs) {
    const by = {}; for (const s of segs) by[s.camera] = (by[s.camera] || 0) + s.end - s.start;
    const total = segs.reduce((n, s) => n + s.end - s.start, 0);
    return { shots: segs.length, average: segs.length ? total / segs.length : 0, share: by, total };
  }

  /* ---------- running it ---------- */
  const presets = () => US.settings.get('podcast.presets', {}) || {};
  const setupFor = seqId => (US.settings.get('podcast.setups', {}) || {})[seqId] || null;
  const saveSetup = (seqId, s) => US.settings.set('podcast.setups', Object.assign({}, US.settings.get('podcast.setups', {}), { [seqId]: s }));
  /** Each mic's level (dB every 20 ms), rendered one track at a time. */
  async function listen(target, mics, job) {
    const envs = [];
    for (let k = 0; k < mics.length; k++) {
      job.check();
      const out = require('path').join(US.fsx.tempDir(), `pod-${US.fsx.hash(target.id + '|' + mics[k].track + '|' + Date.now())}.wav`);
      job.range(k / mics.length, (k + 1) / mics.length).set({ who: 'premiere', msg: `Rendering mic ${k + 1} of ${mics.length} (${mics[k].name}) on its own` });
      await kit().retry(() => US.host.call('renderAudio', { seqId: target.id, out, soloAudio: mics[k].track }), job);
      const a = await US.audio.readWav(out, { targetRate: 16000, check: () => job.check() });
      try { require('fs').unlinkSync(out); } catch (e) { /* temp */ }
      envs.push(US.audio.envelope(a.data, a.sr, 0.02).db);
    }
    job.range(0, 1);
    return envs;
  }
  /** Sentence ends heard in the sequence (Story's transcripts), for cutaways to land on. */
  async function sentenceEnds(target, job) {
    try { const tl = await US.story.timelineTranscript(job, { seqId: target.id }); return tl.result.entries.filter(e => /[.!?]["”’]?$/.test(String(e.text).trim())).map(e => e.end); } catch (e) { return []; }
  }
  async function makeCopy(target, setup, segs, job) {
    const locked = await US.host.call('lockedTracksWithClips', { seqId: target.id });
    if (locked.length) throw new US.UserError('BAD_INPUT', { title: `Some tracks are locked (${locked.join(', ')}).`, action: 'Unlock them in the Timeline, then try again.' });
    job.set({ who: 'premiere', msg: 'Making a copy of the sequence' });
    const copy = await US.host.call('cloneSequence', { seqId: target.id, name: `${target.name} – switched`, binPath: 'JMG Ultra Studio/Podcast' });
    job.set({ msg: `Cutting between the cameras (${US.plural(segs.length, 'shot')})` });
    const r = await US.host.call('podSwitch', { seqId: copy.id, cameras: setup.cameras.map(c => c.track), segments: segs.map(s => ({ start: s.start, end: s.end, camera: s.camera })) });
    if (r.log && r.log.length) US.log('warn', 'Podcast switch notes', r.log.join('\n'), 'podcast');
    await US.host.call('openSequence', { seqId: copy.id });
    const st = stats(segs);
    return { summary: `“${copy.name}”: ${US.plural(st.shots, 'shot')}, ${US.fmtDur(st.average, true)} on average. Every camera is still there – switch a piece on or off to change a shot. The original is unchanged.`, copy };
  }

  US.actions.register({
    id: 'podcast.switch', tool: 'podcast', title: 'Cut between the podcast cameras by who is speaking', changes: true,
    describe: 'Uses the mics and cameras set up in Podcast for the active sequence: hears each mic on its own (on this computer), cuts to whoever is speaking with the editor’s rules (shot lengths, wides on crosstalk, reaction shots) and makes a copy with every camera kept, re-switchable.',
    params: { pacing: { type: 'enum', options: ['longform', 'standard', 'promo'], default: 'standard', desc: 'How lively the cutting is' } },
    examples: ['switch the podcast cameras', 'auto edit this podcast', 'cut the multicam podcast by who is talking'],
    match: t => (/\bpodcast\b/i.test(t) && /\b(switch|cut|edit|multicam|cameras?|angles?)\b/i.test(t) ? { _score: 2.6 } : null),
    run: async (p, job) => {
      const target = await kit().activeSequenceTarget(), setup = setupFor(target.id);
      if (!setup || !setup.mics || !setup.mics.length || !setup.cameras.length) throw new US.UserError('BAD_INPUT', { title: 'Set up this sequence’s mics and cameras first.', action: 'Open Podcast, say which track is whose mic and which camera shows whom – once per show (save it as a preset).' });
      const envs = await listen(target, setup.mics, job), runs = speakerRuns(envs).runs;
      const rules = Object.assign({}, RULES, US.settings.get('podcast.rules', {}), PACING[p.pacing] ? { minHold: PACING[p.pacing].minHold, maxHold: PACING[p.pacing].maxHold } : {});
      const segs = plan(runs, setup, rules, { duration: target.duration, fps: target.fps || 25, boundaries: await sentenceEnds(target, job) });
      return makeCopy(target, setup, segs, job);
    }
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'podcast', name: 'Podcast', short: 'Podcast', icon: 'cameras', group: 'cut', order: 19,
    blurb: 'Cuts between the cameras of a video podcast by who is speaking – with an editor’s rules, re-switchable.',
    hostFns: ['sequenceInfo', 'renderAudio', 'cloneSequence', 'podSwitch', 'lockedTracksWithClips', 'openSequence', 'setPlayhead'],
    create() {
      const v = ui.toolView({ icon: 'cameras', title: 'Podcast', blurb: 'For a synced podcast sequence: the cameras stacked on video tracks, each person’s mic on its own audio track. Say whose mic is whose and what each camera shows, and Ultra Studio cuts to whoever is speaking – holding shots long enough, ignoring “mm-hm”s, going wide when people talk over each other, and cutting to a listener now and then. Every switch is listed for you to check, and the copy keeps every camera, so you can change any shot by switching a piece on or off.' });
      let target = null, info = null, setup = null, envs = null, runs = null, bounds = [], segs = [], items = [];
      const rules = Object.assign({}, RULES, US.settings.get('podcast.rules', {}));
      const saveRules = () => US.settings.set('podcast.rules', rules);
      const picker = ui.sourcePicker({ modes: ['sequence'], kinds: ['audio'], label: 'Sequence', onChange: () => { target = null; envs = null; draw(); } });
      const setupBox = h('div'), rulesBox = h('div'), out = h('div');
      const readBtn = ui.actionButton('Read the tracks', () => US.jobs.run({ title: 'Reading the podcast sequence', tool: 'podcast' }, async job => {
        target = await kit().resolveTarget(picker, job);
        info = await US.host.call('sequenceInfo', { seqId: target.id });
        setup = setupFor(target.id) || guessSetup(info);
        envs = null; drawSetup(); draw();
        return { summary: `${US.plural(info.audio.filter(t => t.clips.length).length, 'audio track')}, ${US.plural(info.video.filter(t => t.clips.length).length, 'video track')} in “${target.name}”` };
      }), { icon: 'refresh' });
      function guessSetup(i) {
        const mics = i.audio.filter(t => t.clips.length).map((t, k) => ({ track: t.index, name: /^audio \d+$/i.test(t.name) || !t.name ? `Speaker ${k + 1}` : t.name }));
        const vids = i.video.filter(t => t.clips.length);
        // a guess: the first video track is the wide, the others one per speaker in order
        const cameras = vids.map((t, k) => ({ track: t.index, shows: vids.length > mics.length && k === 0 ? 'wide' : (mics[Math.min(mics.length - 1, k - (vids.length > mics.length ? 1 : 0))] || {}).track })).filter(c => c.shows != null);
        return { mics, cameras };
      }
      function drawSetup() {
        US.clear(setupBox);
        if (!info || !setup) return;
        const store = () => { saveSetup(target.id, setup); envs = envs && envs.length === setup.mics.length ? envs : null; recompute(); };
        const micRows = info.audio.filter(t => t.clips.length).map(t => {
          const m = setup.mics.find(x => x.track === t.index);
          const nameIn = ui.input({ value: m ? m.name : '', placeholder: 'Not a mic', onInput: x => { const mm = setup.mics.find(y => y.track === t.index); if (x.trim()) { if (mm) mm.name = x.trim(); else setup.mics.push({ track: t.index, name: x.trim() }); } else setup.mics = setup.mics.filter(y => y.track !== t.index); setup.mics.sort((a, b) => a.track - b.track); envs = null; store(); drawCams(); } });
          return h('div.pod-row', h('span.pod-track', `A${t.index + 1}`), h('span.field-hint.pod-clip', (t.clips[0] || {}).name || ''), nameIn);
        });
        const camBox = h('div');
        function drawCams() {
          US.clear(camBox);
          for (const t of info.video.filter(x => x.clips.length)) {
            const c = setup.cameras.find(x => x.track === t.index);
            const opts = [{ value: 'none', label: 'Not a camera' }, { value: 'wide', label: 'Wide / everyone' }].concat(setup.mics.map(m => ({ value: String(m.track), label: m.name })));
            const sel = ui.select({ options: opts, value: c ? String(c.shows) : 'none', onChange: x => { setup.cameras = setup.cameras.filter(y => y.track !== t.index); if (x !== 'none') setup.cameras.push({ track: t.index, shows: x === 'wide' ? 'wide' : +x }); setup.cameras.sort((a, b) => a.track - b.track); store(); } });
            camBox.appendChild(h('div.pod-row', h('span.pod-track', `V${t.index + 1}`), h('span.field-hint.pod-clip', (t.clips[0] || {}).name || ''), sel));
          }
        }
        drawCams();
        const presetSel = ui.select({ options: [{ value: '', label: 'Presets…' }].concat(Object.keys(presets()).map(k => ({ value: k, label: k }))), value: '', onChange: k => { const p = presets()[k]; if (!p) return; setup = JSON.parse(JSON.stringify(p)); envs = null; store(); drawSetup(); } });
        const savePreset = ui.button('Save as a preset', { small: true, kind: 'ghost', onClick: async () => { const nm = await ui.promptText({ title: 'Save this setup', label: 'A name for this show’s setup – reuse it on every episode', ok: 'Save' }); if (nm) { US.settings.set('podcast.presets', Object.assign({}, presets(), { [nm.trim()]: JSON.parse(JSON.stringify(setup)) })); drawSetup(); } } });
        setupBox.append(ui.card(h('div.card-title', 'Mics and cameras'),
          h('div.field-label', 'Mics – one person each (leave a track empty if it isn’t a mic)'), ...micRows,
          h('div.field-label', 'Cameras – who each one shows'), camBox,
          h('div.row', presetSel, savePreset)));
      }
      const pacing = ui.segmented({ options: Object.entries(PACING).map(([k, p]) => ({ value: k, label: p.label, title: p.title })), value: rules.pacing, onChange: k => { Object.assign(rules, { pacing: k, minHold: PACING[k].minHold, maxHold: PACING[k].maxHold }); minS.set(rules.minHold); maxS.set(rules.maxHold); saveRules(); recompute(); } });
      const sl = (label, key, min, max, step, fmt, hint) => ui.slider({ label, min, max, step, value: rules[key], fmt, hint, onInput: x => { rules[key] = x; if (key === 'minHold' || key === 'maxHold') { rules.pacing = null; pacing.set(null); } saveRules(); recompute(); } });
      const minS = sl('Shortest shot', 'minHold', 1, 8, 0.5, x => `${x} s`, 'A shot is never shorter than this – a quick reply doesn’t flash a cut.');
      const maxS = sl('Longest shot', 'maxHold', 0, 60, 1, x => (x ? `${x} s` : 'no limit'), 'After this long on one person, a reaction shot or the wide.');
      const tg = (label, key, hint) => ui.toggle({ label, hint, value: !!rules[key], onChange: x => { rules[key] = x; saveRules(); recompute(); } });
      rulesBox.append(ui.card(h('div.card-title', 'How it cuts'), pacing, h('div.grid2', minS, maxS),
        h('div.grid2', sl('Cut after the voice starts', 'delayFrames', 0, 12, 1, x => `${x} frames`, 'A few frames late reads as natural; on the first frame looks robotic.'), sl('Ignore replies shorter than', 'backchannel', 0, 3, 0.1, x => `${x.toFixed(1)} s`, '“Yeah”, “mm-hm” while someone else is talking don’t get a shot.')),
        tg('Wide when people talk over each other', 'wideOnCross'), tg('Wide on long silences', 'wideOnSilence', 'Silences longer than 3 seconds.'),
        tg('Reaction shots in long answers', 'reactions', 'Cuts to someone listening, then back.'), tg('Wide at the start and the end', 'introWide'),
        tg('Cutaways on sentence ends', 'snap', 'Uses Story’s transcripts of the clips, when there are any.'),
        h('div.row', ui.button('Shuffle the variety', { small: true, kind: 'ghost', title: 'When a person has more than one camera, or several listeners could react: a different, repeatable choice', onClick: () => { rules.seed = (rules.seed || 1) + 1; saveRules(); recompute(); } }))));
      const listenBtn = ui.actionButton('Listen to the mics', () => US.jobs.run({ title: 'Listening to each mic', tool: 'podcast' }, async job => {
        if (!setup || setup.mics.length < 2) throw new US.UserError('BAD_INPUT', { title: 'Name at least two mics first.' });
        if (!setup.cameras.length) throw new US.UserError('BAD_INPUT', { title: 'Say what at least one camera shows.' });
        envs = await listen(target, setup.mics, job);
        bounds = await sentenceEnds(target, job);
        recompute();
        return { summary: `${US.plural(segs.length, 'shot')} planned for “${target.name}”` };
      }), { icon: 'cameras' });
      const tl = ui.timeline({ height: 46, onSeek: t => target && kit().goTo(target, t) });
      const COLS = ['#3d7ff0', '#e2483f', '#3fbf4a', '#f08a24', '#a35bd6', '#2fc6d6', '#e9d33a', '#e6e6e6'];
      function camName(track) { const c = setup && setup.cameras.find(x => x.track === track); return c ? `V${track + 1} ${c.shows === 'wide' ? 'Wide' : (setup.mics.find(m => m.track === c.shows) || {}).name || ''}`.trim() : `V${track + 1}`; }
      function recompute() {
        if (!envs || !setup) { draw(); return; }
        runs = speakerRuns(envs).runs;
        const names = Object.fromEntries(setup.mics.map((m, k) => [k, m.name]));
        segs = plan(runs, Object.assign({}, setup, { names }), rules, { duration: target.duration, fps: target.fps || 25, boundaries: rules.snap ? bounds : [] });
        items = switches(segs, Object.fromEntries(setup.cameras.map(c => [c.track, camName(c.track)])));
        draw();
      }
      function draw() {
        US.clear(out);
        if (!target || !envs) return;
        const final = applyTicks(segs, items), st = stats(final), colour = t => COLS[setup.cameras.findIndex(c => c.track === t) % COLS.length];
        tl.draw({ duration: target.duration, regions: final.map(s => ({ start: s.start, end: s.end, color: colour(s.camera), alpha: 0.55, label: camName(s.camera) })) });
        out.append(ui.card(h('div.card-title', 'The edit', h('span.right', target.name)), tl.el,
          kit().legend(setup.cameras.map(c => [`${camName(c.track)} · ${Math.round(100 * (st.share[c.track] || 0) / (st.total || 1))}%`, colour(c.track)])),
          ui.stats(ui.stat(String(st.shots), 'shots'), ui.stat(US.fmtDur(st.average, true), 'average shot'), ui.stat(US.fmtDur(target.duration), 'long')),
          h('div.field-label', 'Every switch – untick one to stay on the shot before'),
          ui.reviewList({ items, kinds: { speaker: 'Speaker changes', wide: 'Wides', reaction: 'Reactions' }, onJump: x => kit().goTo(target, Math.max(0, x.start - 2)), onChange: () => { const f = applyTicks(segs, items); tl.draw({ duration: target.duration, regions: f.map(s => ({ start: s.start, end: s.end, color: colour(s.camera), alpha: 0.55, label: camName(s.camera) })) }); } }),
          ui.actionButton('Make the switched copy', () => US.jobs.run({ title: 'Switching the cameras', tool: 'podcast' }, job => makeCopy(target, setup, applyTicks(segs, items), job)), { icon: 'cameras' })));
      }
      v.body.append(ui.card(picker.el, readBtn), setupBox, rulesBox, ui.card(listenBtn, h('div.field-hint', 'Premiere renders each mic on its own (the others muted for a moment, then put back) and Ultra Studio measures them here – nothing leaves the computer. Changing a rule redraws the edit straight away.')), out);
      return { el: v.el, onShow() { picker.refresh(); } };
    }
  });

  US.podcast = { calibrate, speakerRuns, plan, switches, applyTicks, stats, RULES, PACING, rng };
})();
