/* JMG Ultra Studio – Quick effects: a pad of transitions, effects, moves, speed and sound, each added with one click to
   the clips selected in the Timeline (or every clip in the sequence). No AI – the same edits Ask › Edit makes
   (editApply), with the length and where they go set once above the pad. Favourites go to the top. The choice of
   clips and transition places is pure (unit-tested); the pad is below. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const RES = US.app.is('resolve');

  /* ---------- the pad ---------- */
  // kind: what the clips must be; op/params: as editApply takes them; at: a fixed place for a transition (fades)
  const PRESETS = [
    { id: 'dissolve', group: 'transitions', label: 'Cross Dissolve', sub: 'the classic mix', op: 'transition', params: { name: 'Cross Dissolve' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'dipBlack', group: 'transitions', label: 'Dip to Black', sub: 'out and back in', op: 'transition', params: { name: 'Dip to Black' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'dipWhite', group: 'transitions', label: 'Dip to White', sub: 'a flash of white', op: 'transition', params: { name: 'Dip to White' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'film', group: 'transitions', label: 'Film Dissolve', sub: 'like film stock', op: 'transition', params: { name: 'Film Dissolve' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'additive', group: 'transitions', label: 'Additive Dissolve', sub: 'brightens through', op: 'transition', params: { name: 'Additive Dissolve' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'push', group: 'transitions', label: 'Push', sub: 'one pushes the other', op: 'transition', params: { name: 'Push' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'morph', group: 'transitions', label: 'Morph Cut', sub: 'hides a jump cut', op: 'transition', params: { name: 'Morph Cut' }, kind: 'video', colour: '#8fb8ff' },
    { id: 'fadeIn', group: 'transitions', label: 'Fade in', sub: 'from black, at the start', op: 'transition', params: { name: 'Dip to Black' }, at: 'start', kind: 'video', colour: '#8fb8ff' },
    { id: 'fadeOut', group: 'transitions', label: 'Fade out', sub: 'to black, at the end', op: 'transition', params: { name: 'Dip to Black' }, at: 'end', kind: 'video', colour: '#8fb8ff' },

    { id: 'punch110', group: 'moves', label: 'Punch in 110%', sub: 'a closer framing', op: 'motion', params: { scale: 110 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'punch120', group: 'moves', label: 'Punch in 120%', sub: 'closer still', op: 'motion', params: { scale: 120 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'punchAlt', group: 'moves', label: 'Punch in every other', sub: 'a second “angle” – 110% on every 2nd clip', op: 'motion', params: { scale: 110 }, every: 2, kind: 'video', colour: '#ffcf7a' },
    { id: 'reset', group: 'moves', label: 'Back to 100%', sub: 'undo a punch-in', op: 'motion', params: { scale: 100 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'zoomIn', group: 'moves', label: 'Slow zoom in', sub: '100 → 110% across it', op: 'zoom', params: { from: 100, to: 110 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'zoomOut', group: 'moves', label: 'Slow zoom out', sub: '110 → 100% across it', op: 'zoom', params: { from: 110, to: 100 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'slow', group: 'moves', label: 'Slow motion', sub: '50% speed', op: 'speed', params: { percent: 50 }, kind: 'video', colour: '#ffcf7a' },
    { id: 'fast', group: 'moves', label: 'Speed up', sub: '200% speed', op: 'speed', params: { percent: 200 }, kind: 'video', colour: '#ffcf7a' },

    { id: 'bw', group: 'effects', label: 'Black & White', sub: 'no colour', op: 'effect', params: { name: 'Black & White' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'blur', group: 'effects', label: 'Blur', sub: 'Gaussian Blur', op: 'effect', params: { name: 'Gaussian Blur' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'stabilise', group: 'effects', label: 'Stabilise', sub: 'Warp Stabilizer', op: 'effect', params: { name: 'Warp Stabilizer' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'flip', group: 'effects', label: 'Flip', sub: 'mirror left–right', op: 'effect', params: { name: 'Horizontal Flip' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'sharpen', group: 'effects', label: 'Sharpen', sub: 'a little crisper', op: 'effect', params: { name: 'Sharpen' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'lumetri', group: 'effects', label: 'Lumetri Color', sub: 'ready to grade', op: 'effect', params: { name: 'Lumetri Color' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'mosaic', group: 'effects', label: 'Pixelate', sub: 'Mosaic', op: 'effect', params: { name: 'Mosaic' }, kind: 'video', colour: '#b9a4ff' },
    { id: 'half', group: 'effects', label: 'Half see-through', sub: 'opacity 50%', op: 'opacity', params: { value: 50 }, kind: 'video', colour: '#b9a4ff' },
    { id: 'solid', group: 'effects', label: 'Fully solid', sub: 'opacity 100%', op: 'opacity', params: { value: 100 }, kind: 'video', colour: '#b9a4ff' },

    { id: 'audioFade', group: 'sound', label: 'Sound fades', sub: 'Constant Power', op: 'transition', params: { name: 'Constant Power' }, kind: 'audio', colour: '#7fe0b0' },
    { id: 'audioFadeExp', group: 'sound', label: 'Smooth fades', sub: 'Exponential Fade', op: 'transition', params: { name: 'Exponential Fade' }, kind: 'audio', colour: '#7fe0b0' },
    { id: 'louder', group: 'sound', label: 'Louder', sub: '+3 dB', op: 'volume', params: { db: 3 }, kind: 'audio', colour: '#7fe0b0' },
    { id: 'quieter', group: 'sound', label: 'Quieter', sub: '−3 dB', op: 'volume', params: { db: -3 }, kind: 'audio', colour: '#7fe0b0' },
    { id: 'duck', group: 'sound', label: 'Duck under', sub: '−12 dB', op: 'volume', params: { db: -12 }, kind: 'audio', colour: '#7fe0b0' }
  ];
  /**
   * Your own buttons: a kind and a value (or a name) make a preset like the ones above. Pure, so it's tested; the
   * saved list is [{type, value, name, label}] in the settings. -> {preset} | {error}
   */
  const OWN = {
    punch: { label: 'Punch in (%)', op: 'motion', min: 10, max: 400, unit: '%', make: v => ({ params: { scale: v }, label: `Punch in ${v}%`, sub: 'your own move' }), colour: '#ffcf7a' },
    speed: { label: 'Speed (%)', op: 'speed', min: 10, max: 1000, unit: '%', make: v => ({ params: { percent: v }, label: v < 100 ? `Slow ${v}%` : `Speed ${v}%`, sub: 'your own speed' }), colour: '#ffcf7a' },
    opacity: { label: 'Opacity (%)', op: 'opacity', min: 0, max: 100, unit: '%', make: v => ({ params: { value: v }, label: `Opacity ${v}%`, sub: 'your own' }), colour: '#b9a4ff' },
    volume: { label: 'Volume (dB)', op: 'volume', min: -40, max: 15, unit: ' dB', make: v => ({ params: { db: v }, label: `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} dB`, sub: 'your own level' }), kind: 'audio', colour: '#7fe0b0' },
    effect: { label: 'Effect by name', op: 'effect', named: true, make: n => ({ params: { name: n }, label: n, sub: 'your own effect' }), colour: '#b9a4ff' },
    transition: { label: 'Transition by name', op: 'transition', named: true, make: n => ({ params: { name: n }, label: n, sub: 'your own transition' }), colour: '#8fb8ff' }
  };
  function makeOwn(o) {
    const { type, value, name, label } = o && typeof o === 'object' ? o : {};
    const k = OWN[type];
    if (!k) return { error: 'Choose what kind of button it is.' };
    let key, made;
    if (k.named) {
      const n = String(name || '').trim();
      if (!n) return { error: `Type the ${k.op}’s name as Premiere’s Effects panel shows it.` };
      key = n.toLowerCase(); made = k.make(n);
    } else {
      const v = Number(String(value == null ? '' : value).replace(',', '.').replace('−', '-'));
      if (String(value == null ? '' : value).trim() === '' || !isFinite(v)) return { error: `Type a number for ${k.label.toLowerCase()}.` };
      if (v < k.min || v > k.max) return { error: `${k.label.replace(/ \(.*/, '')} goes from ${k.min} to ${k.max}${k.unit}.` };
      const r = Math.round(v * 10) / 10;
      key = String(r); made = k.make(r);
    }
    const nice = String(label || '').trim();
    return { preset: { id: `own:${type}:${key}`, group: 'own', own: { type, value: k.named ? undefined : Number(key), name: k.named ? made.params.name : undefined, label: nice || undefined }, label: nice || made.label, sub: made.sub, op: k.op, params: made.params, kind: k.kind || 'video', colour: k.colour } };
  }
  /** The saved list -> presets (anything no longer valid is left out). */
  const ownPresets = list => (Array.isArray(list) ? list : []).map(x => makeOwn(x)).filter(x => x.preset).map(x => x.preset);
  const GROUPS = [{ id: 'transitions', name: 'Transitions' }, { id: 'moves', name: 'Moves and speed' }, { id: 'effects', name: 'Effects' }, { id: 'sound', name: 'Sound' }];
  /* ---------- what Resolve lets add-ons do: the one list Quick effects, Ask › Edit and Ask's chat use ----------
     (resolve/host/edit.js checks the same on each clip.) From Resolve's scripting changelog, checked in 21.2.0.6 on
     18 Nov 2026: transitions, speed and volume came with 21.1, effects with 21.1.2, renaming timeline clips with 20.2,
     the timeline's selected clips with 21.0.4. Keyframes, text layers and razor cuts: no Resolve yet. */
  const RESOLVE_OPS = {
    transition: { since: '21.1', what: 'transitions' }, speed: { since: '21.1', what: 'speed changes' }, volume: { since: '21.1', what: 'volume changes' },
    effect: { since: '21.1.2', what: 'effects' }, rename: { since: '20.2', what: 'renaming timeline clips' },
    zoom: { since: null, what: 'keyframed zooms' }, text: { since: null, what: 'text layers' }, razor: { since: null, what: 'cuts' }
  };
  // Premiere's names Resolve has nothing like (Resolve does them elsewhere); flips are an Inspector switch in every Resolve
  const RESOLVE_NO_NAME = { 'black & white': 'set Saturation to 0 on the Color page', 'lumetri color': 'grade it on the Color page', 'warp stabilizer': 'use Stabilization in the Inspector', 'crop': 'use Cropping in the Inspector', 'film dissolve': 'try Cross Dissolve', 'dip to white': 'use Dip to Black, then set the dip’s colour in the Inspector' };
  const FLIP = /^(horizontal|vertical) flip$/i;
  /** "21.2.0.6" -> [21, 2, 0, 6]; compare a >= b */
  const ver = v => String(v || '').split(/[^\d]+/).filter(Boolean).map(Number);
  const atLeast = (have, want) => { const a = ver(have), b = ver(want); for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; } return true; };
  /** The Resolve the panel is in ("" when unknown – then assume a current one; the host checks each clip anyway). */
  const hostVersion = () => (US.app && US.app.is && US.app.is('resolve') && US.premiere && US.premiere.version) || '';
  /** -> '' when this Resolve lets add-ons do it, else why not, in plain words. name: a transition's or effect's name. */
  function resolveWhy(op, { version = hostVersion(), name = '' } = {}) {
    const n = String(name || '').trim().toLowerCase();
    if (op === 'effect' && FLIP.test(n)) return '';
    if ((op === 'effect' || op === 'transition') && RESOLVE_NO_NAME[n]) return `Resolve has no ${name} ${op} – ${RESOLVE_NO_NAME[n]}.`;
    const o = RESOLVE_OPS[op];
    if (!o) return '';
    if (!o.since) return `Resolve doesn’t let add-ons make ${o.what} – do it on the Edit page.`;
    return !version || atLeast(version, o.since) ? '' : `Resolve ${o.since} or later lets add-ons make ${o.what} – update Resolve, or do it on the Edit page.`;
  }
  /** What this Resolve can't do, in words, for the AI and the help ("keyframed zooms, text layers or cuts"). */
  const resolveCantList = (version = hostVersion()) => { const w = Object.keys(RESOLVE_OPS).filter(op => resolveWhy(op, { version })).map(op => RESOLVE_OPS[op].what); return w.length > 1 ? w.slice(0, -1).join(', ') + ' or ' + w[w.length - 1] : w.join(''); };
  /** Can the timeline in Resolve's selected clips be read (21.0.4)? */
  const resolveSelects = (version = hostVersion()) => !version || atLeast(version, '21.0.4');
  US.resolveEdits = { OPS: RESOLVE_OPS, NO_NAME: RESOLVE_NO_NAME, why: resolveWhy, can: (op, o) => !resolveWhy(op, o), cantList: resolveCantList, selects: resolveSelects, atLeast };
  /** Does this button work here? res: in Resolve; version: Resolve's version ('' = current). */
  const works = (p, res = RES, version = hostVersion()) => !res || !resolveWhy(p.op, { version, name: p.params && p.params.name });
  const whyOff = p => resolveWhy(p.op, { name: p.params && p.params.name });

  /**
   * The clips an edit goes on. sel: the selected clips [{kind, track, start, end}] (or null for every clip); info: the
   * sequence as editRead gives it. Only clips of the kind the edit needs (an audio fade on the audio, not the picture).
   * -> [{kind, track, start, end}] in track then time order
   */
  function targetsFor(info, sel, kind) {
    const all = [];
    for (const t of (kind === 'audio' ? info.audio : info.video) || []) for (const c of t.clips || []) all.push({ kind, track: t.index != null ? t.index : 0, start: c.start, end: c.end, locked: !!t.locked });
    const pick = sel ? all.filter(c => sel.some(s => s.kind === kind && s.track === c.track && Math.abs(s.start - c.start) < 0.01)) : all;
    return pick.filter(c => !c.locked).map(({ locked, ...c }) => c).sort((a, b) => a.track - b.track || a.start - b.start);
  }
  /**
   * Where each transition goes. where: 'cuts' – at every cut between two of these clips (the start of a clip that
   * begins where the one before it on the track ends), and the outer ends too when `ends`; 'start' | 'end' | 'both'.
   * A single clip with 'cuts' gets both ends. -> [{target, at: 'start'|'end'}]
   */
  function transitionPlaces(targets, where, { ends = false, frame = 1 / 25 } = {}) {
    if (where !== 'cuts' || targets.length < 2) {
      const at = where === 'cuts' ? 'both' : where;
      return targets.flatMap(t => (at === 'both' ? ['start', 'end'] : [at]).map(a => ({ target: t, at: a })));
    }
    const out = [];
    targets.forEach((t, i) => {
      const prev = targets[i - 1], next = targets[i + 1];
      const cutBefore = prev && prev.track === t.track && Math.abs(prev.end - t.start) <= frame * 1.5;
      const cutAfter = next && next.track === t.track && Math.abs(t.end - next.start) <= frame * 1.5;
      if (cutBefore) out.push({ target: t, at: 'start' });
      else if (ends) out.push({ target: t, at: 'start' });
      if (!cutAfter && ends) out.push({ target: t, at: 'end' });
    });
    return out;
  }
  /**
   * Every n-th clip on each track, counting from the second (an interview's jump cuts become two “angles”: the 2nd,
   * 4th, 6th… clip of the track is punched in). targets in track then time order. -> the picked targets
   */
  function everyNth(targets, n) {
    const seen = {};
    return targets.filter(t => { const i = seen[t.track] = (seen[t.track] || 0) + 1; return i % n === 0; });
  }
  /** The calls to make for a preset: [{op, params, targets}] (transitions grouped by where they go). */
  function calls(preset, targets, { where = 'cuts', seconds = 0.5, fps = 25, ends = false } = {}) {
    if (preset.every > 1) targets = everyNth(targets, preset.every);
    if (!targets.length) return [];
    if (preset.op !== 'transition') return [{ op: preset.op, params: Object.assign({}, preset.params), targets }];
    const frames = Math.max(2, Math.round(seconds * fps));
    const places = transitionPlaces(targets, preset.at || where, { ends, frame: 1 / fps });
    const out = [];
    for (const at of ['start', 'end']) {
      const ts = places.filter(p => p.at === at).map(p => p.target);
      if (ts.length) out.push({ op: 'transition', params: Object.assign({}, preset.params, { at, frames }), targets: ts });
    }
    return out;
  }
  /** “Cross Dissolve on 6 clips · 1 skipped” */
  function report(preset, r, n) {
    const done = r.done || 0, sk = (r.skipped || []).length;
    if (!done && sk) return `${preset.label}: ${r.skipped[0].why}`;
    const unit = preset.op === 'transition' ? 'transition' : 'clip';
    return `${preset.label}: ${US.plural(done, unit)}${preset.op === 'transition' ? ' added' : ''}${sk ? ` · ${sk} skipped` : ''}${n && preset.op !== 'transition' && done < n && !sk ? ` of ${n}` : ''}`;
  }

  /* ---------- doing it ---------- */
  async function seqNow() {
    let s = US.ctx.sequence;
    if (!s) { await US.refreshContext(); s = US.ctx.sequence; }
    if (!s) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence is open.', action: 'Open one in the Timeline.' });
    return s.id;
  }
  /** Add a preset to the selected clips (or all). opts: {scope: 'selection'|'all', where, seconds, ends}. -> {summary} */
  async function apply(preset, opts = {}) {
    if (!works(preset)) throw new US.UserError('BAD_INPUT', { title: whyOff(preset), action: 'The moves, flips and opacity work here.' });
    const seqId = await seqNow(), info = await US.host.call('editRead', { seqId });
    let sel = null, note = '';
    if (opts.scope !== 'all') {
      sel = await US.host.call('editSelection', { seqId });
      // Resolve: “every other” needs several clips – with only one (the clip under the playhead; Resolve also selects it,
      // its picture and its sound, measured in 21.2), it takes In to Out on its track, or the whole track
      const w = RES && preset.every > 1 ? everyPick(info, sel, preset.kind) : null;
      if (w) { sel = w.sel; note = w.note; }
      if (sel && !sel.length) throw new US.UserError('NOTHING_FOUND', { title: RES ? 'No clips are selected, and there’s no clip under the playhead.' : 'No clips are selected in the Timeline.', action: RES ? 'Select clips in the Timeline (or move the playhead onto one), or choose Every clip.' : 'Select some clips in the Timeline, or choose Every clip.' });
    }
    if (sel) {
      // a picked video clip brings its linked sound for sound presets, and the other way round
      if (preset.kind === 'audio' && !sel.some(s => s.kind === 'audio')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'audio' })));
      if (preset.kind === 'video' && !sel.some(s => s.kind === 'video')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'video' })));
    }
    const targets = targetsFor(info, sel, preset.kind);
    if (!targets.length) throw new US.UserError('NOTHING_FOUND', { title: preset.kind === 'audio' ? 'No sound clips to change.' : 'No video clips to change.', action: sel ? 'Select clips of that kind in the Timeline (unlocked tracks).' : 'The sequence has none on unlocked tracks.' });
    const cs = calls(preset, targets, Object.assign({ fps: info.fps || 25 }, opts));
    if (!cs.length && preset.every) return { summary: `${preset.label}: needs at least two clips on a track – select more, or choose Every clip.` };
    if (!cs.length) return { summary: `${preset.label}: no cuts between these clips – choose Start, End or Both ends.` };
    const r = { done: 0, skipped: [] };
    for (const c of cs) {
      const x = await US.host.call('editApply', { seqId, op: c.op, params: c.params, targets: c.targets });
      if (x.unsupported) throw new US.UserError('BAD_INPUT', { title: x.why });
      r.done += x.done || 0; r.skipped.push(...(x.skipped || []));
    }
    if (r.skipped.length) US.log('warn', `${preset.label}: ${r.skipped.length} skipped`, r.skipped.slice(0, 5).map(s => s.why).join('; '), 'quickfx');
    return { summary: report(preset, r, preset.every ? cs[0].targets.length : targets.length) + note, result: r };
  }
  /**
   * Resolve's stand-in for a selection of several clips (“Punch in every other” on the clip under the playhead): the
   * clips between In and Out when they're set, else every clip – on the track of the clip under the playhead (or every
   * track). Pure. info: editRead's result; one: the clip under the playhead, if any. -> {sel: [...] | null (every clip), note}
   */
  /** Punch in every other in Resolve: fewer than two picked clips of the kind it needs -> widerPick's choice, else null (keep the pick). */
  function everyPick(info, sel, kind) {
    const ofKind = (sel || []).filter(x => x.kind === kind);
    return ofKind.length < 2 ? widerPick(info, ofKind[0] || null) : null;
  }
  function widerPick(info, one) {
    const dur = info.duration || 0, a = info.inPoint || 0, b = info.outPoint != null ? info.outPoint : dur;
    const ranged = a > 0.001 || (dur && b < dur - 0.001);
    const onTrack = t => !one || (t.kind === one.kind && t.track === one.track);
    if (!ranged && !one) return { sel: null, note: ' (every clip – Resolve had no clips selected)' };
    const sel = [];
    for (const kind of ['video', 'audio']) for (const t of info[kind] || []) for (const c of t.clips || []) {
      const x = { kind, track: t.index != null ? t.index : 0, start: c.start, end: c.end };
      if (onTrack(x) && (!ranged || (c.start < b - 0.001 && c.end > a + 0.001))) sel.push(x);
    }
    const where = one ? `${one.kind === 'audio' ? 'A' : 'V'}${one.track + 1}` : 'every track';
    return { sel, note: ranged ? ` (In to Out on ${where})` : ` (the whole of ${where})` };
  }

  /* ---------- the tab ---------- */
  US.addIcon && US.addIcon('quickfx', 'M3 15 13 5M11 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM15.5 10.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6zM5 3.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z');
  US.tools.register({
    id: 'quickfx', name: 'Quick effects', short: 'Effects', icon: 'quickfx', group: 'finish', order: 28.5,
    blurb: 'Transitions, effects, moves, speed and sound fades – one click adds it to the selected clips, or every clip.',
    hostFns: ['editRead', 'editSelection', 'editApply'],
    create() {
      const v = ui.toolView({ icon: 'quickfx', title: 'Quick effects', blurb: RES ? `One click adds it to the clips selected in the Timeline${resolveSelects() ? '' : ' (here: the clip under the playhead)'} – or to every clip. Resolve doesn’t let add-ons make ${resolveCantList() || 'everything'}, so those buttons are greyed out.` : 'One click adds it to the clips selected in the Timeline – or to every clip. Undo with ⌘Z / Ctrl+Z in Premiere.', help: 'Choose what it goes on and, for transitions, how long and where. Then click any button. Star a button to keep it at the top. “Any by name” adds whatever is in Premiere’s Effects panel – type its name as shown there.' });
      const get = (k, d) => US.settings.get('quickfx.' + k, d), set = (k, x) => US.settings.set('quickfx.' + k, x);
      let opts = { scope: get('scope', 'selection'), seconds: get('seconds', 0.5), where: get('where', 'cuts'), ends: get('ends', false) };
      let favs = get('favs', ['dissolve', 'dipBlack', 'punch110', 'audioFade']);
      let own = ownPresets(get('own', []));
      const saveOwn = () => set('own', own.map(p => p.own));
      const status = h('div.pad-status'), padBox = h('div');
      const say = (t, kind = '') => { status.textContent = t; status.className = 'pad-status' + (kind ? ' ' + kind : ''); };
      let busy = false;
      async function hit(p, btn) {
        if (busy) return;
        busy = true; btn.classList.add('busy'); say(`${p.label}…`);
        try { const r = await apply(p, opts); say(r.summary, r.result && r.result.skipped.length ? 'warn' : 'ok'); }
        catch (e) { say(e.title || e.message, 'warn'); if (!(e instanceof US.UserError)) ui.showError(e); }
        finally { busy = false; btn.classList.remove('busy'); }
      }
      function tile(p) {
        const ok = works(p), fav = favs.includes(p.id);
        const btn = h('button.pad-btn.qfx-btn' + (ok ? '' : '.off'), { style: { background: p.colour }, title: ok ? `${p.label} – ${p.sub}` : whyOff(p), onclick: () => (ok ? hit(p, btn) : say(whyOff(p), 'warn')) },
          h('span.pad-label', p.label), h('span.pad-sub', p.sub),
          h('span.qfx-star' + (fav ? '.on' : ''), { title: fav ? 'Take off the favourites' : 'Keep at the top', onclick: e => { e.stopPropagation(); favs = fav ? favs.filter(x => x !== p.id) : favs.concat(p.id); set('favs', favs); draw(); } }, fav ? '★' : '☆'),
          p.own ? h('span.qfx-star.qfx-del', { title: 'Delete this button', onclick: e => { e.stopPropagation(); own = own.filter(x => x.id !== p.id); favs = favs.filter(x => x !== p.id); saveOwn(); set('favs', favs); draw(); say(`Deleted “${p.label}”.`); } }, '×') : null);
        return btn;
      }
      function draw() {
        padBox.innerHTML = '';
        const all = PRESETS.concat(own), fp = favs.map(id => all.find(p => p.id === id)).filter(Boolean);
        if (fp.length) padBox.appendChild(h('div.qfx-group', h('div.qfx-title', 'Favourites'), h('div.pad-grid', fp.map(tile))));
        if (own.length) padBox.appendChild(ui.section('Your own buttons', [h('div.pad-grid', own.map(tile))], { open: true, hint: US.plural(own.length, 'button') }));
        for (const g of GROUPS) padBox.appendChild(ui.section(g.name, [h('div.pad-grid', PRESETS.filter(p => p.group === g.id).map(tile))], { open: g.id === 'transitions' || !fp.length, hint: `${PRESETS.filter(p => p.group === g.id).length} buttons` }));
      }
      const scopeSeg = ui.segmented({ value: opts.scope, onChange: x => { opts.scope = x; set('scope', x); }, options: [{ value: 'selection', label: RES && !resolveSelects() ? 'Clip under the playhead' : 'Selected clips' }, { value: 'all', label: 'Every clip' }] });
      const lenSeg = ui.segmented({ value: String(opts.seconds), onChange: x => { opts.seconds = +x; set('seconds', +x); }, options: [{ value: '0.25', label: '¼ s' }, { value: '0.5', label: '½ s' }, { value: '1', label: '1 s' }, { value: '2', label: '2 s' }] });
      const whereSel = ui.select({ value: opts.where, onChange: x => { opts.where = x; set('where', x); }, options: [{ value: 'cuts', label: 'At the cuts between them' }, { value: 'start', label: 'At the start of each' }, { value: 'end', label: 'At the end of each' }, { value: 'both', label: 'At both ends of each' }] });
      const endsBox = ui.toggle ? ui.toggle({ label: 'Also fade the first and last ends', value: opts.ends, onChange: x => { opts.ends = !!x; set('ends', !!x); } }) : null;
      // any effect or transition by its name in Premiere's Effects panel
      const nameIn = ui.input({ placeholder: 'e.g. Directional Blur, Iris Round, Ultra Key' });
      const byName = op => { const name = (nameIn.value || '').trim(); if (!name) { say('Type an effect or transition name first.', 'warn'); return; } hit({ id: 'custom', label: name, sub: '', op, params: { name }, kind: 'video' }, nameIn); };
      // your own buttons: a kind and a value (or a name), saved as a button
      const ownTypes = Object.keys(OWN).filter(t => works({ op: OWN[t].op }));
      const ownVal = ui.input({ placeholder: 'e.g. 115' }), ownLabel = ui.input({ placeholder: 'Its name on the button (optional)' });
      const ownType = ui.select({ value: ownTypes[0], options: ownTypes.map(t => ({ value: t, label: OWN[t].label })), onChange: t => { ownVal.value = ''; ownVal.placeholder = OWN[t].named ? (OWN[t].op === 'effect' ? 'e.g. Directional Blur' : 'e.g. Iris Round') : `${OWN[t].min} to ${OWN[t].max}${OWN[t].unit}`; } });
      function addOwn() {
        const t = ownType.value, m = makeOwn({ type: t, value: ownVal.value, name: ownVal.value, label: ownLabel.value });
        if (m.error) { say(m.error, 'warn'); return; }
        if (own.some(p => p.id === m.preset.id)) { say(`You already have “${m.preset.label}”.`, 'warn'); return; }
        own = own.concat(m.preset); saveOwn(); ownVal.value = ''; ownLabel.value = ''; draw();
        say(`Saved “${m.preset.label}” – it’s under Your own buttons.`, 'ok');
      }
      v.body.append(
        ui.card(h('div.field-label', 'Add to'), scopeSeg,
          h('div.field-label', { style: { marginTop: '8px' } }, 'Transitions'), h('div.row', lenSeg, whereSel), endsBox,
          status),
        padBox,
        ui.section('Make your own button', [h('div.field-hint', RES ? `Your own ${ownTypes.map(t => OWN[t].label.replace(/ \(.*/, '').toLowerCase()).join(', ')} – kept as a button.` : 'A punch-in, speed, opacity or volume of your own – or any effect or transition by its name in Premiere’s Effects panel – kept as a button.'), h('div.row', ownType, ownVal), ownLabel, h('div.row', { style: { marginTop: '6px' } }, ui.button('Save as a button', { small: true, onClick: addOwn }))], { open: false, hint: 'your own settings' }),
        RES && !works({ op: 'effect' }) && !works({ op: 'transition' }) ? null : ui.section('Any by name', [h('div.field-hint', RES ? 'Anything in Resolve’s Effects Library, by the name it shows there (Gaussian Blur, Cross Dissolve…).' : 'Anything in Premiere’s Effects panel, by the name it shows there.'), nameIn, h('div.row', { style: { marginTop: '6px' } }, ui.button('Add as an effect', { small: true, onClick: () => byName('effect') }), ui.button('Add as a transition', { small: true, kind: 'ghost', onClick: () => byName('transition') }))], { open: false, hint: 'any effect or transition' }));
      say(RES && !resolveSelects() ? 'Put the playhead on a clip, then click a button.' : 'Select clips in the Timeline, then click a button.');
      draw();
      return { el: v.el, onShow() {} };
    }
  });

  US.quickfx = { PRESETS, GROUPS, OWN, makeOwn, ownPresets, works, widerPick, everyPick, targetsFor, transitionPlaces, everyNth, calls, report, apply };
})();
