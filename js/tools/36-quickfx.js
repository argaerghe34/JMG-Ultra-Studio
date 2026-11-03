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
  const GROUPS = [{ id: 'transitions', name: 'Transitions' }, { id: 'moves', name: 'Moves and speed' }, { id: 'effects', name: 'Effects' }, { id: 'sound', name: 'Sound' }];
  // what Resolve doesn't let add-ons do (the same list as resolve/host/edit.js)
  const RESOLVE_CANT = { transition: 'transitions', effect: 'effects', speed: 'speed changes', zoom: 'keyframed zooms', volume: 'volume changes' };
  const works = (p, res = RES) => !(res && RESOLVE_CANT[p.op]);

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
  /** The calls to make for a preset: [{op, params, targets}] (transitions grouped by where they go). */
  function calls(preset, targets, { where = 'cuts', seconds = 0.5, fps = 25, ends = false } = {}) {
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
    if (!works(preset)) throw new US.UserError('BAD_INPUT', { title: `Resolve doesn’t let add-ons add ${RESOLVE_CANT[preset.op]}.`, action: 'Do this one on the Edit page – the moves, opacity and Back to 100% work here.' });
    const seqId = await seqNow(), info = await US.host.call('editRead', { seqId });
    let sel = null;
    if (opts.scope !== 'all') {
      sel = await US.host.call('editSelection', { seqId });
      if (!sel.length) throw new US.UserError('NOTHING_FOUND', { title: RES ? 'There’s no clip under the playhead.' : 'No clips are selected in the Timeline.', action: RES ? 'Resolve doesn’t tell add-ons which clips are selected, so the clip under the playhead is used – move the playhead onto one, or choose Every clip.' : 'Select some clips in the Timeline, or choose Every clip.' });
      // a picked video clip brings its linked sound for sound presets, and the other way round
      if (preset.kind === 'audio' && !sel.some(s => s.kind === 'audio')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'audio' })));
      if (preset.kind === 'video' && !sel.some(s => s.kind === 'video')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'video' })));
    }
    const targets = targetsFor(info, sel, preset.kind);
    if (!targets.length) throw new US.UserError('NOTHING_FOUND', { title: preset.kind === 'audio' ? 'No sound clips to change.' : 'No video clips to change.', action: sel ? 'Select clips of that kind in the Timeline (unlocked tracks).' : 'The sequence has none on unlocked tracks.' });
    const cs = calls(preset, targets, Object.assign({ fps: info.fps || 25 }, opts));
    if (!cs.length) return { summary: `${preset.label}: no cuts between these clips – choose Start, End or Both ends.` };
    const r = { done: 0, skipped: [] };
    for (const c of cs) {
      const x = await US.host.call('editApply', { seqId, op: c.op, params: c.params, targets: c.targets });
      if (x.unsupported) throw new US.UserError('BAD_INPUT', { title: x.why });
      r.done += x.done || 0; r.skipped.push(...(x.skipped || []));
    }
    if (r.skipped.length) US.log('warn', `${preset.label}: ${r.skipped.length} skipped`, r.skipped.slice(0, 5).map(s => s.why).join('; '), 'quickfx');
    return { summary: report(preset, r, targets.length), result: r };
  }

  /* ---------- the tab ---------- */
  US.addIcon && US.addIcon('quickfx', 'M3 15 13 5M11 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM15.5 10.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6zM5 3.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z');
  US.tools.register({
    id: 'quickfx', name: 'Quick effects', short: 'Effects', icon: 'quickfx', group: 'finish', order: 28.5,
    blurb: 'Transitions, effects, moves, speed and sound fades – one click adds it to the selected clips, or every clip.',
    hostFns: ['editRead', 'editSelection', 'editApply'],
    create() {
      const v = ui.toolView({ icon: 'quickfx', title: 'Quick effects', blurb: RES ? 'Moves and opacity in one click on the clip under the playhead (or every clip). Resolve doesn’t let add-ons add transitions, effects, speed or volume, so those are greyed out.' : 'One click adds it to the clips selected in the Timeline – or to every clip. Undo with ⌘Z / Ctrl+Z in Premiere.', help: 'Choose what it goes on and, for transitions, how long and where. Then click any button. Star a button to keep it at the top. “Any by name” adds whatever is in Premiere’s Effects panel – type its name as shown there.' });
      const get = (k, d) => US.settings.get('quickfx.' + k, d), set = (k, x) => US.settings.set('quickfx.' + k, x);
      let opts = { scope: get('scope', 'selection'), seconds: get('seconds', 0.5), where: get('where', 'cuts'), ends: get('ends', false) };
      let favs = get('favs', ['dissolve', 'dipBlack', 'punch110', 'audioFade']);
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
        const btn = h('button.pad-btn.qfx-btn' + (ok ? '' : '.off'), { style: { background: p.colour }, title: ok ? `${p.label} – ${p.sub}` : `Resolve doesn’t let add-ons add ${RESOLVE_CANT[p.op]}`, onclick: () => (ok ? hit(p, btn) : say(`Resolve doesn’t let add-ons add ${RESOLVE_CANT[p.op]} – do it on the Edit page.`, 'warn')) },
          h('span.pad-label', p.label), h('span.pad-sub', p.sub),
          h('span.qfx-star' + (fav ? '.on' : ''), { title: fav ? 'Take off the favourites' : 'Keep at the top', onclick: e => { e.stopPropagation(); favs = fav ? favs.filter(x => x !== p.id) : favs.concat(p.id); set('favs', favs); draw(); } }, fav ? '★' : '☆'));
        return btn;
      }
      function draw() {
        padBox.innerHTML = '';
        const fp = favs.map(id => PRESETS.find(p => p.id === id)).filter(Boolean);
        if (fp.length) padBox.appendChild(h('div.qfx-group', h('div.qfx-title', 'Favourites'), h('div.pad-grid', fp.map(tile))));
        for (const g of GROUPS) padBox.appendChild(ui.section(g.name, [h('div.pad-grid', PRESETS.filter(p => p.group === g.id).map(tile))], { open: g.id === 'transitions' || !fp.length, hint: `${PRESETS.filter(p => p.group === g.id).length} buttons` }));
      }
      const scopeSeg = ui.segmented({ value: opts.scope, onChange: x => { opts.scope = x; set('scope', x); }, options: [{ value: 'selection', label: RES ? 'Clip under the playhead' : 'Selected clips' }, { value: 'all', label: 'Every clip' }] });
      const lenSeg = ui.segmented({ value: String(opts.seconds), onChange: x => { opts.seconds = +x; set('seconds', +x); }, options: [{ value: '0.25', label: '¼ s' }, { value: '0.5', label: '½ s' }, { value: '1', label: '1 s' }, { value: '2', label: '2 s' }] });
      const whereSel = ui.select({ value: opts.where, onChange: x => { opts.where = x; set('where', x); }, options: [{ value: 'cuts', label: 'At the cuts between them' }, { value: 'start', label: 'At the start of each' }, { value: 'end', label: 'At the end of each' }, { value: 'both', label: 'At both ends of each' }] });
      const endsBox = ui.toggle ? ui.toggle({ label: 'Also fade the first and last ends', value: opts.ends, onChange: x => { opts.ends = !!x; set('ends', !!x); } }) : null;
      // any effect or transition by its name in Premiere's Effects panel
      const nameIn = ui.input({ placeholder: 'e.g. Directional Blur, Iris Round, Ultra Key' });
      const byName = op => { const name = (nameIn.value || '').trim(); if (!name) { say('Type an effect or transition name first.', 'warn'); return; } hit({ id: 'custom', label: name, sub: '', op, params: { name }, kind: 'video' }, nameIn); };
      v.body.append(
        ui.card(h('div.field-label', 'Add to'), scopeSeg,
          h('div.field-label', { style: { marginTop: '8px' } }, 'Transitions'), h('div.row', lenSeg, whereSel), endsBox,
          status),
        padBox,
        RES ? null : ui.section('Any by name', [h('div.field-hint', 'Anything in Premiere’s Effects panel, by the name it shows there.'), nameIn, h('div.row', { style: { marginTop: '6px' } }, ui.button('Add as an effect', { small: true, onClick: () => byName('effect') }), ui.button('Add as a transition', { small: true, kind: 'ghost', onClick: () => byName('transition') }))], { open: false, hint: 'any effect or transition' }));
      say(RES ? 'Put the playhead on a clip, then click a button.' : 'Select clips in the Timeline, then click a button.');
      draw();
      return { el: v.el, onShow() {} };
    }
  });

  US.quickfx = { PRESETS, GROUPS, works, targetsFor, transitionPlaces, calls, report, apply };
})();
