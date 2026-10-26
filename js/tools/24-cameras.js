/* JMG Ultra Studio – Camera Switch: cuts between the camera angles of an interview (stacked and synced on V1, V2…),
   at sentence ends, alternating angles or following whoever is speaking – on a copy, sound untouched. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  US.addIcon('cameras', 'M2 6h9v8H2zM11 9l4-2v6l-4-2M12 3h6v5M15 3v2');

  /* ---------- planning (pure, unit-tested) ---------- */
  const NOT_CAM = /^(Selects|Themes|Guides|Letterbox|B-roll|Captions)$/i;
  /** Camera tracks: video tracks whose clips run for most of the sequence (labels, guides, B-roll and titles left out). */
  function cameraTracks(info) {
    return info.video.filter(t => !NOT_CAM.test(t.name || '') && US.sum(t.clips.filter(c => c.path && !c.disabled && !/^Ultra /.test(c.name)).map(c => c.end - c.start)) >= 0.5 * info.duration).map(t => t.index);
  }
  /** Where a camera change sounds natural: between transcript lines (just before the next one), or in the middle of pauses. */
  function cutPoints({ entries = [], pauses = [], duration = Infinity }) {
    const pts = [];
    const lines = entries.slice().sort((a, b) => a.start - b.start);
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i].start - lines[i - 1].end;
      if (gap > -0.05) pts.push(gap < 0.6 ? (lines[i - 1].end + lines[i].start) / 2 : lines[i].start - 0.25);
    }
    for (const p of pauses) pts.push((p.start + p.end) / 2);
    return Array.from(new Set(pts.filter(t => t > 0.5 && t < duration - 0.5).map(t => +t.toFixed(2)))).sort((a, b) => a - b);
  }
  // shot lengths vary a little so the cutting doesn't feel mechanical: fractions of the min–max range, in turn
  const RHYTHM = [0.45, 0.8, 0.3, 0.65, 0.55];
  /** The next cut after `s`: a cut point between s+min and s+max, near the target length; else at s+max (or the end). */
  function nextCut(s, points, { min, max, duration, k }) {
    const target = s + min + (max - min) * RHYTHM[k % RHYTHM.length];
    const inRange = points.filter(p => p >= s + min - 1e-6 && p <= s + max + 1e-6);
    let e = inRange.length ? inRange.reduce((b, p) => (Math.abs(p - target) < Math.abs(b - target) ? p : b)) : Math.min(duration, s + max);
    if (duration - e < min) e = duration;          // no tiny shot at the end
    return e;
  }
  /**
   * Which camera shows when. mode 'alternate': cut at the cut points, each shot between `min` and `max` seconds, going
   * round the cameras starting with cams[0]. mode 'speaker': show the camera of whoever is talking (turns:
   * [{start, end, speaker}], camFor: {speaker: cam}); shots are at least `min` long, and a long answer cuts away to
   * the first camera (usually the wide) and back at cut points. -> [{start, end, cam}] covering 0…duration
   */
  function planShots({ duration, points = [], cams, mode = 'alternate', min = 4, max = 12, turns = [], camFor = {} }) {
    if (!cams.length || !(duration > 0)) return [];
    const shots = [];
    const push = (start, end, cam) => { const last = shots[shots.length - 1]; if (last && last.cam === cam) last.end = end; else if (end - start > 1e-6) shots.push({ start, end, cam }); };
    if (mode === 'speaker' && turns.length) {
      // who is talking at each moment: a turn lasts until the next one starts
      const T = turns.slice().sort((a, b) => a.start - b.start);
      const segs = [];
      for (let i = 0; i < T.length; i++) {
        const start = i === 0 ? 0 : Math.max(0, T[i].start - 0.2), end = i + 1 < T.length ? Math.max(start, T[i + 1].start - 0.2) : duration;
        const cam = camFor[T[i].speaker] != null ? camFor[T[i].speaker] : cams[0];
        const last = segs[segs.length - 1];
        if (last && last.cam === cam) last.end = end; else segs.push({ start, end, cam });
      }
      // too-short turns (a quick "yes") stay on the shot before
      const merged = [];
      for (const s of segs) {
        const last = merged[merged.length - 1];
        if (last && (s.end - s.start < min || last.cam === s.cam)) last.end = s.end; else merged.push(Object.assign({}, s));
      }
      // long answers: cut to the wide and back, at cut points
      const wide = cams[0];
      for (const s of merged) {
        if (s.end - s.start <= max * 1.5 || cams.length < 2) { push(s.start, s.end, s.cam); continue; }
        let t = s.start, k = 0, cam = s.cam;
        while (t < s.end - 1e-6) {
          let e = nextCut(t, points, { min, max, duration: s.end, k: k++ });
          push(t, e, cam);
          cam = cam === s.cam ? (s.cam === wide ? cams[1] : wide) : s.cam;
          t = e;
        }
      }
      return shots;
    }
    let s = 0, k = 0;
    while (s < duration - 1e-6) {
      const e = nextCut(s, points, { min, max, duration, k });
      push(s, e, cams[k % cams.length]);
      k++; s = e;
    }
    return shots;
  }
  /** Speaking turns from timeline transcript entries (consecutive lines of one person joined). */
  function turnsFrom(entries, nameOf = e => e.speakerKey) {
    const out = [];
    for (const e of entries.slice().sort((a, b) => a.start - b.start)) {
      const who = nameOf(e), last = out[out.length - 1];
      if (last && last.speaker === who) last.end = Math.max(last.end, e.end); else out.push({ start: e.start, end: e.end, speaker: who });
    }
    return out;
  }

  /* ---------- reading the sequence ---------- */
  /** The sequence, its camera tracks, and where cuts sound natural (transcript lines, else pauses in the sound). */
  async function readSequence(job, seqId) {
    job && job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const info = await US.host.call('sequenceInfo', { seqId });
    const cams = cameraTracks(info);
    let entries = [], names = null, via = 'pauses', pauses = [];
    if (US.story && US.story.timelineTranscript) {
      try {
        const tl = await US.story.timelineTranscript(job, { seqId, info: Object.assign({}, info, { timing: await US.host.call('storySequenceTiming', { seqId }) }) });
        entries = tl.result.entries; names = US.story.namesFor(tl);
        if (entries.length) via = 'transcript';
      } catch (e) { /* no transcripts: use the sound */ }
    }
    if (!entries.length && job) {
      job.set({ who: 'premiere', msg: 'Listening for pauses' });
      const a = await US.audioKit.loadAudio({ kind: 'sequence', id: info.id, name: info.name, duration: info.duration, fps: info.fps, extra: 0 }, job);
      const env = US.audio.envelope(a.data, a.sr, 0.02, 0.03), st = US.dsp.levelStats(env.db);
      pauses = US.dsp.findPauses(env, { threshold: st.auto, minPause: 0.35, padding: 0.05, duration: a.duration }).pauses;
    }
    const people = [];
    if (names) for (const e of entries) { const n = names.get(e.speakerKey); if (!people.includes(n)) people.push(n); }
    return { info, cams, entries, names, via, points: cutPoints({ entries, pauses, duration: info.duration }), people };
  }
  /** Plan from a read sequence and the chosen options. o: {cams, mode, min, max, start, camFor} */
  function plan(r, o) {
    const cams = o.cams.slice();
    if (o.start != null && cams.includes(o.start)) cams.splice(0, 0, ...cams.splice(cams.indexOf(o.start), 1));
    const turns = r.names ? turnsFrom(r.entries, e => r.names.get(e.speakerKey)) : [];
    const camFor = {}; for (const [who, c] of Object.entries(o.camFor || {})) if (cams.includes(c)) camFor[who] = c;   // only chosen cameras
    return planShots({ duration: r.info.duration, points: r.points, cams, mode: o.mode === 'speaker' && turns.length ? 'speaker' : 'alternate', min: o.min, max: o.max, turns, camFor });
  }
  async function makeCopy(job, seqId, o) {
    const r = await readSequence(job, seqId);
    if (!r.cams.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no camera clips in this sequence.', action: 'Open the interview sequence, then try again.' });
    if (r.cams.length === 1) return punchCopy(job, r, o);
    const cams = (o.cams && o.cams.length ? o.cams : r.cams.filter(c => !(o.off || []).includes(c))).filter(c => r.cams.includes(c));
    if (cams.length < 2) throw new US.UserError('NOTHING_FOUND', { title: 'Choose at least two cameras.' });
    const shots = plan(r, Object.assign({}, o, { cams }));
    job.check();
    job.set({ who: 'premiere' }).progress(0.8, `Cutting ${US.plural(shots.length, 'shot')} on a copy of “${r.info.name}”`);
    const copy = await US.host.call('cloneSequence', { seqId, name: `${r.info.name} – camera cut` });
    const tracks = cams.slice().sort((a, b) => a - b);
    await US.host.call('camerasApply', { seqId: copy.id, tracks, shots, drop: r.cams.filter(c => !cams.includes(c)) });
    await US.host.call('openSequence', { seqId: copy.id }); await US.refreshContext();
    const per = {}; for (const s of shots) per[s.cam] = (per[s.cam] || 0) + s.end - s.start;
    return { copy, shots, via: r.via, summary: `${US.plural(shots.length, 'shot')} in “${copy.name}” (${tracks.map(t => `V${t + 1} ${Math.round(100 * (per[t] || 0) / r.info.duration)}%`).join(', ')}) · cut ${r.via === 'transcript' ? 'between sentences' : 'in the pauses'}` };
  }

  const PUNCH = -1;   // the pretend second angle: the same camera, zoomed in
  /** One camera: a copy that punches in on every other shot, so it cuts like two angles. */
  async function punchCopy(job, r, o) {
    const zoom = (o.zoom || 115) / 100;
    const shots = planShots({ duration: r.info.duration, points: r.points, cams: [r.cams[0], PUNCH], min: o.min || 4, max: o.max || 12 });
    job.check();
    job.set({ who: 'premiere' }).progress(0.8, `Punching in on ${US.plural(shots.filter(x => x.cam === PUNCH).length, 'shot')} on a copy of “${r.info.name}”`);
    const copy = await US.host.call('cloneSequence', { seqId: r.info.id, name: `${r.info.name} – camera cut` });
    const res = await US.host.call('camerasPunch', { seqId: copy.id, track: r.cams[0], shots, closeCam: PUNCH, zoom });
    await US.host.call('openSequence', { seqId: copy.id }); await US.refreshContext();
    return { copy, shots, via: r.via, summary: `${US.plural(shots.length, 'shot')} in “${copy.name}”, ${US.plural(shots.filter(x => x.cam === PUNCH).length, 'punch-in')} at ${Math.round(zoom * 100)}% · cut ${r.via === 'transcript' ? 'between sentences' : 'in the pauses'}` };
  }

  US.actions.register({
    id: 'cameras.cut', tool: 'cameras', title: 'Cut between the camera angles', changes: true,
    describe: 'Makes a copy of the open sequence that cuts between its stacked, synced camera angles at sentence ends – alternating, or following whoever speaks.',
    params: { mode: { type: 'enum', options: ['alternate', 'speaker'], default: 'alternate', desc: 'alternate angles, or follow the speaker' }, min: { type: 'number', default: 4, desc: 'Shortest shot, seconds' }, max: { type: 'number', default: 12, desc: 'Longest shot, seconds' } },
    examples: ['cut between the cameras', 'switch angles every few seconds', 'follow whoever is speaking'],
    match(t) {
      if (!/\b(cameras?|angles?|multi-?cam)\b/i.test(t) || /\bmatch\b/i.test(t) || !/\b(cut|switch|swap|change|alternate|follow)\b/i.test(t)) return null;
      return { mode: /speak|talk|who/i.test(t) ? 'speaker' : 'alternate', _score: 2.5 };
    },
    run: (p, job) => { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); return makeCopy(job, s.id, Object.assign(US.settings.get('cameras', {}), p)); }
  });

  /* ---------- the tool ---------- */
  const COLORS = ['var(--info)', 'var(--warn)', 'var(--ok)', 'var(--accent-hi)', 'var(--err)'];
  US.tools.register({
    id: 'cameras', name: 'Camera Switch', short: 'Cams', icon: 'cameras', group: 'cut', order: 24,
    blurb: 'Cut between the camera angles of an interview, at sentence ends.',
    hostFns: ['camerasApply', 'camerasPunch', 'cloneSequence', 'sequenceInfo'],
    create() {
      const v = ui.toolView({ icon: 'cameras', title: 'Camera Switch', blurb: 'Cuts between the camera angles of an interview at the ends of sentences – alternating, or following whoever speaks. On a copy; the sound isn’t touched.',
        help: h('div', h('ul',
          h('li', 'Put the angles on top of each other, synced: V1, V2 (and V3…). Premiere can sync them for you: select the clips › right-click › Synchronize.'),
          h('li', 'With Premiere’s transcripts (Story › Read Premiere’s transcripts) the cuts fall between sentences and Ultra Studio knows who is speaking. Without them it cuts in the pauses.'),
          h('li', 'The copy keeps every angle: the upper camera tracks are cut so the chosen angle shows, and the one on the lowest track runs underneath. Fine-tune by trimming as usual.'))) });
      const S = Object.assign({ mode: 'alternate', min: 4, max: 12, start: null, camFor: {}, off: [] }, US.settings.get('cameras', {}));
      const save = () => US.settings.set('cameras', S);
      const seqLine = h('div.field-hint'), camsBox = h('div'), peopleBox = h('div'), strip = h('div.cam-strip'), stats = h('div.field-hint');
      let r = null;
      const mode = ui.segmented({ options: [{ value: 'alternate', label: 'Alternate angles' }, { value: 'speaker', label: 'Follow who’s speaking' }], value: S.mode, onChange: x => { S.mode = x; save(); draw(); } });
      const minS = ui.slider({ label: 'Shortest shot', min: 2, max: 10, step: 0.5, value: S.min, fmt: x => x + ' s', onInput: x => { S.min = x; if (S.max < x + 1) { S.max = x + 1; maxS.set(S.max); } save(); drawPlan(); } });
      const maxS = ui.slider({ label: 'Longest shot', min: 5, max: 30, step: 1, value: S.max, fmt: x => x + ' s', onInput: x => { S.max = Math.max(x, S.min + 1); save(); drawPlan(); } });
      const chosenCams = () => (r ? r.cams.filter(c => !S.off.includes(c)) : []);
      const opts = () => ({ cams: chosenCams(), mode: S.mode, min: S.min, max: S.max, start: S.start, camFor: S.camFor, zoom: S.zoom || 115 });
      function camName(i) { const t = r.info.video.find(x => x.index === i); const c = t && t.clips.find(x => x.path); return `V${i + 1}${c ? ' · ' + c.name : ''}`; }
      function draw() {
        US.clear(camsBox); US.clear(peopleBox);
        if (!r) return;
        if (r.cams.length === 1) {
          camsBox.append(ui.note(`One camera angle (${camName(r.cams[0])}). Camera Switch punches in on every other shot instead, so it cuts like a second angle. With more cameras, stack the synced angles on V1, V2… and press Re-read.`),
            ui.slider({ label: 'Punch-in', min: 105, max: 140, step: 5, value: S.zoom || 115, fmt: x => x + '%', onChange: x => { S.zoom = x; save(); } }));
          drawPlan(); return;
        }
        if (!r.cams.length) { camsBox.appendChild(ui.note('No camera clips found in this sequence.', 'warn')); return; }
        camsBox.append(...r.cams.map((i, k) => ui.toggle({ label: camName(i), value: !S.off.includes(i), hint: k === 0 ? 'Lowest track – runs underneath the others' : '', onChange: x => { S.off = x ? S.off.filter(y => y !== i) : S.off.concat(i); save(); drawPlan(); } })));
        if (S.mode === 'alternate') peopleBox.appendChild(ui.field('Start on', ui.select({ options: chosenCams().map(i => ({ value: String(i), label: camName(i) })), value: String(S.start != null && chosenCams().includes(S.start) ? S.start : chosenCams()[0]), onChange: x => { S.start = +x; save(); drawPlan(); } })));
        else if (!r.people.length) peopleBox.appendChild(ui.note('Following the speaker needs Premiere’s transcripts of these clips (Story › Read Premiere’s transcripts). Until then it alternates.', 'warn'));
        else peopleBox.append(h('div.field-label', 'Whose camera is whose'), ...r.people.map((p, k) => ui.field(p, ui.select({ options: chosenCams().map(i => ({ value: String(i), label: camName(i) })), value: String(S.camFor[p] != null ? S.camFor[p] : chosenCams()[(k + 1) % chosenCams().length]), onChange: x => { S.camFor[p] = +x; save(); drawPlan(); } }))),
          h('div.field-hint', `Long answers cut away to ${camName(chosenCams()[0])} and back.`));
        r.people.forEach((p, k) => { if (S.camFor[p] == null && chosenCams().length) S.camFor[p] = chosenCams()[(k + 1) % chosenCams().length]; });
        drawPlan();
      }
      function drawPlan() {
        US.clear(strip); stats.textContent = '';
        if (!r || !r.cams.length || (r.cams.length > 1 && chosenCams().length < 2)) return;
        const one = r.cams.length === 1, idx = one ? [r.cams[0], PUNCH] : chosenCams(), d = r.info.duration;
        const shots = one ? planShots({ duration: d, points: r.points, cams: idx, min: S.min, max: S.max }) : plan(r, opts());
        for (const s of shots) strip.appendChild(h('div.cam-shot', { title: `${s.cam === PUNCH ? 'Punch-in' : camName(s.cam)} · ${US.fmtDur(s.start, true)}–${US.fmtDur(s.end, true)}`, style: { left: (100 * s.start / d) + '%', width: (100 * (s.end - s.start) / d) + '%', background: COLORS[idx.indexOf(s.cam) % COLORS.length] }, onclick: () => US.host.call('setPlayhead', { seqId: r.info.id, seconds: s.start }).catch(ui.showError) }));
        stats.textContent = `${US.plural(shots.length, 'shot')}, ${(d / Math.max(1, shots.length)).toFixed(1)} s on average · cuts ${r.via === 'transcript' ? 'between sentences (from the transcripts)' : 'in the pauses'}`;
      }
      async function readSeq() {
        const s = US.ctx.sequence;
        seqLine.textContent = s ? `Sequence: ${s.name}` : 'Open a sequence in the Timeline first.';
        if (!s) { r = null; draw(); return; }
        await US.jobs.run({ title: 'Reading the camera angles', tool: 'cameras' }, async job => { r = await readSequence(job, s.id); draw(); return { summary: `${US.plural(r.cams.length, 'camera angle')} · ${r.via === 'transcript' ? US.plural(r.entries.length, 'transcript line') : US.plural(r.points.length, 'pause')}` }; });
      }
      const reread = ui.button('Re-read the sequence', { small: true, kind: 'ghost', onClick: () => readSeq() });
      const make = ui.actionButton('Make a camera cut copy', () => US.jobs.run({ title: 'Cutting between the cameras', tool: 'cameras' }, job => makeCopy(job, r ? r.info.id : US.ctx.sequence.id, opts())), { icon: 'cameras' });
      v.body.append(seqLine,
        ui.card(h('div.row', h('div.card-title.grow', 'Cameras'), reread), camsBox),
        ui.card(mode, peopleBox, h('div.grid2', minS, maxS), strip, stats),
        make, h('div.field-hint', 'Your sequence isn’t changed: the cuts go into a copy called “… – camera cut”.'));
      return { el: v.el, onShow() { if (!r || !US.ctx.sequence || r.info.id !== US.ctx.sequence.id) readSeq(); } };
    }
  });

  US.cameras = { cameraTracks, cutPoints, planShots, turnsFrom, nextCut, readSequence, plan, makeCopy, PUNCH };
})();
