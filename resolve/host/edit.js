// JMG Ultra Studio – Ask › Edit (Resolve side): the same commands, arguments and results as jsx/tools/edit.jsx.
// Resolve lets add-ons change a timeline clip's Inspector values (zoom, position, rotation, flip, opacity), its colour,
// its name, whether it's on, delete it and add markers; from Resolve 21.1 also add transitions (AddTransition) and change
// speed (SetSpeed) and volume (the AudioVolume property), and from 21.1.2 add effects from its Effects Library
// (AddEffect). Those are looked for on the clip itself, so an older Resolve says so plainly with nothing changed.
// Keyframed zooms, text layers and razor cuts can't be made by script at all (21.2) and come back `unsupported`.
// The panel's matching list (what it offers, and the words) is US.resolveEdits in js/tools/36-quickfx.js.
'use strict';

/** What no Resolve lets add-ons do (21.2). */
const RESOLVE_CANT = { zoom: 'keyframed zooms', text: 'text layers', razor: 'cuts' };
/** What needs a newer Resolve: the first version that has it, and the words. */
const NEEDS = {
  transition: { since: '21.1', what: 'transitions', has: ti => typeof ti.AddTransition === 'function' },
  speed: { since: '21.1', what: 'speed changes', has: ti => typeof ti.SetSpeed === 'function' },
  volume: { since: '21.1', what: 'volume changes', has: ti => { try { return typeof ti.GetProperty('AudioVolume') === 'number'; } catch (e) { return false; } } },
  effect: { since: '21.1.2', what: 'effects', has: ti => typeof ti.AddEffect === 'function' },
  rename: { since: '20.2', what: 'renaming timeline clips', has: ti => typeof ti.SetName === 'function' }
};
/** Premiere's transition names -> Resolve's ('' = Resolve has none like it). Other names are taken as Resolve's own. */
const TRANSITIONS = {
  'cross dissolve': 'Cross Dissolve', 'dip to black': 'Dip To Color Dissolve', 'additive dissolve': 'Additive Dissolve', 'push': 'Push',
  'morph cut': 'Smooth Cut', 'film dissolve': '', 'dip to white': '',
  'constant power': 'Cross Fade +3 dB', 'constant gain': 'Cross Fade 0 dB', 'exponential fade': 'Cross Fade -3 dB'
};
/** Premiere's effect names -> Resolve's Effects Library names ('' = Resolve does it elsewhere). Other names are Resolve's own. */
const EFFECTS = {
  'gaussian blur': 'Gaussian Blur', 'sharpen': 'Sharpen', 'mosaic': 'Mosaic Blur', 'denoise': 'Noise Reduction',
  'black & white': '', 'lumetri color': '', 'warp stabilizer': '', 'crop': ''
};
/** Effects that are an Inspector switch in Resolve (every version). */
const FLIPS = { 'horizontal flip': 'FlipX', 'vertical flip': 'FlipY' };
const ELSEWHERE = {
  'black & white': 'set Saturation to 0 on the Color page', 'lumetri color': 'grade it on the Color page', 'warp stabilizer': 'use Stabilization in the Inspector',
  'crop': 'use Cropping in the Inspector', 'film dissolve': 'try Cross Dissolve', 'dip to white': 'use Dip to Black, then set the dip’s colour in the Inspector'
};
const key = n => String(n || '').trim().toLowerCase();
/** Is this edit possible in Resolve at all, for this name? -> '' or why not (plain words). */
function cantName(op, name) {
  const k = key(name);
  if (op === 'transition' && TRANSITIONS[k] === '') return `Resolve has no ${name} transition – ${ELSEWHERE[k] || 'choose another'}.`;
  if (op === 'effect' && EFFECTS[k] === '') return `Resolve has no ${name} effect – ${ELSEWHERE[k] || 'do it on the Edit page'}.`;
  return '';
}

module.exports = (R, fns) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  /** The timeline item on a track (0-based, as Premiere counts) that starts at this time (within half a frame). */
  function clipAt(tl, kind, track, start) {
    const half = 0.5 / R.fps(tl);
    for (const ti of R.list(tl.GetItemListInTrack(kind === 'audio' ? 'audio' : 'video', track + 1)).filter(Boolean)) if (Math.abs(R.tlSec(tl, ti.GetStart()) - start) <= half) return ti;
    return null;
  }
  const labelOfColour = c => { const i = R.LABEL_COLORS.indexOf(String(c || '')); return i >= 0 ? i : null; };
  /** The Effects Library entry for a name (Resolve FX before third-party ones of the same name). -> {category, id, name} | null */
  let library = null;
  function findEffect(name, audio) {
    if (!library) library = {};
    const kind = audio ? 'audio' : 'video';
    if (!library[kind]) library[kind] = R.list(tryCall(() => R.api.GetEffectsList(kind), [])).filter(e => e && e.id);
    const want = key(EFFECTS[key(name)] || name), all = library[kind].filter(e => key(e.name) === want);
    return all.find(e => /^Resolve FX\//.test(e.id)) || all.find(e => e.category !== 'ofx') || all[0] || null;
  }
  /** Names of a clip's effects as Ask reads them: its Effects Library effects, and a flip as Premiere names it. */
  function effectsOf(ti) {
    const out = [];
    for (const cat of ['ofx', 'fusion', 'audio']) for (const e of R.list(tryCall(() => (typeof ti.GetEffects === 'function' ? ti.GetEffects(cat) : []), []))) {
      const info = tryCall(() => e.GetInfo(), null); if (info && info.name) out.push(String(info.name));
    }
    if (tryCall(() => ti.GetProperty('FlipX'), false) === true) out.push('Horizontal Flip');
    if (tryCall(() => ti.GetProperty('FlipY'), false) === true) out.push('Vertical Flip');
    return out;
  }
  /** Another clip on the same track touching this edge (a cut, so a transition can sit across it). */
  function neighbour(tl, ti, at) {
    const tt = tryCall(() => ti.GetTrackTypeAndIndex(), null), type = tt ? tt[0] : 'video', track = tt ? tt[1] : 1;
    const edge = at === 'start' ? ti.GetStart() : ti.GetEnd();
    return R.list(tl.GetItemListInTrack(type, track)).filter(Boolean).some(o => o !== ti && (at === 'start' ? Math.abs(o.GetEnd() - edge) < 1 : Math.abs(o.GetStart() - edge) < 1));
  }
  /** A transition at one end of a clip (across the cut when another clip meets it there, else inside the clip). -> bool */
  function addTransition(tl, ti, kind, name, at, frames) {
    const opts = { type: name, position: at, alignment: neighbour(tl, ti, at) ? 'center' : at === 'start' ? 'right' : 'left', duration: Math.max(1, Math.round(frames)) };
    const tries = [Object.assign({ category: kind === 'audio' ? 'audio' : 'simple' }, opts), opts, Object.assign({}, opts, { alignment: at === 'start' ? 'right' : 'left' })];
    for (const o of tries) if (tryCall(() => ti.AddTransition(o), null)) return true;
    return false;
  }

  return {
    /** The timeline as Ask › Edit shows it: sequenceInfo plus each clip's colour, zoom and effects (and an audio clip's volume). */
    editRead(a) {
      const o = fns.sequenceInfo({ seqId: a.seqId }), tl = R.needSeq(a.seqId);
      for (const kind of ['video', 'audio']) for (const tr of o[kind]) for (const c of tr.clips) {
        const ti = clipAt(tl, kind, tr.index, c.start); if (!ti) continue;
        c.label = labelOfColour(tryCall(() => ti.GetClipColor(), ''));
        c.effects = effectsOf(ti);
        if (kind === 'video') { const z = Number(tryCall(() => ti.GetProperty('ZoomX'), NaN)); if (isFinite(z)) c.scale = Math.round(z * 1000) / 10; }
        else { const v = tryCall(() => ti.GetProperty('AudioVolume'), null); if (typeof v === 'number' && isFinite(v)) c.volume = Math.round(v * 10) / 10; }
      }
      return o;
    },
    /**
     * The clips selected in the Timeline (Resolve 21.0.4 tells: Timeline.GetSelectedClips); with none selected, or an
     * older Resolve, the clip under the playhead stands in (underPlayhead: true).
     */
    editSelection(a) {
      const tl = R.needSeq(a.seqId), out = [];
      const one = (ti, extra) => { const tt = tryCall(() => ti.GetTrackTypeAndIndex(), ['video', 1]); return Object.assign({ kind: tt[0] === 'audio' ? 'audio' : 'video', track: (tt[1] || 1) - 1, start: R.tlSec(tl, ti.GetStart()), end: R.tlSec(tl, ti.GetEnd()), name: String(tryCall(() => ti.GetName(), '')) }, extra); };
      for (const ti of R.list(tryCall(() => (typeof tl.GetSelectedClips === 'function' ? tl.GetSelectedClips() : []), [])).filter(Boolean)) {
        const ty = tryCall(() => ti.GetType(), 'video');
        if (ty === 'video' || ty === 'audio' || ty === 'generator') out.push(one(ti, {}));
      }
      if (out.length) return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'video' ? -1 : 1) || x.track - y.track || x.start - y.start);
      const ti = tryCall(() => tl.GetCurrentVideoItem(), null);
      return ti ? [one(ti, { kind: 'video', underPlayhead: true })] : [];
    },
    /** One kind of edit on a list of clips – see jsx/tools/edit.jsx. -> {done, skipped:[{start, track, kind, why}], log, unsupported?} */
    editApply(a) {
      const tl = R.needSeq(a.seqId), p = a.params || {}, out = { done: 0, skipped: [], log: [] };
      const no = why => Object.assign(out, { unsupported: true, why });
      if (RESOLVE_CANT[a.op]) return no(`Resolve doesn’t let add-ons add ${RESOLVE_CANT[a.op]} – do it on the Edit page, or use Premiere.`);
      const flip = a.op === 'effect' && FLIPS[key(p.name)];
      if (!flip && (a.op === 'transition' || a.op === 'effect')) { const why = cantName(a.op, p.name || ''); if (why) return no(why); }
      const fps = R.fps(tl), targets = (a.targets || []).slice();
      // from the end: a ripple (delete, speed) doesn't move what's still to do
      if (a.op === 'remove' || a.op === 'speed') targets.sort((x, y) => y.start - x.start);
      let checked = false;
      for (const g of targets) {
        try {
          if (a.op === 'marker') {
            const f = Math.round(g.start * fps), ti = g.kind ? clipAt(tl, g.kind, g.track, g.start) : null;
            const end = g.end != null ? g.end : ti ? R.tlSec(tl, ti.GetEnd()) : g.start;
            const colour = p.color != null && R.MARKER_COLORS ? R.MARKER_COLORS[p.color] || 'Blue' : 'Blue';
            if (tl.AddMarker(f, colour, String(p.name || (ti ? tryCall(() => ti.GetName(), '') : '') || 'Ask'), String(p.comment || ''), Math.max(1, Math.round((end - g.start) * fps)), '')) out.done++;
            else out.skipped.push({ start: g.start, why: 'another marker is on that frame' });
            continue;
          }
          const ti = clipAt(tl, g.kind, g.track, g.start);
          if (!ti) { out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: 'not on the timeline any more' }); continue; }
          // this Resolve can't do it at all: say so once, with nothing changed
          const need = !flip && NEEDS[a.op];
          if (need && !checked && !need.has(ti)) return no(`Resolve ${need.since} or later lets add-ons make ${need.what} – update Resolve, or do it on the Edit page.`);
          checked = true;
          let ok = false, why = 'Resolve refused the change';
          if (a.op === 'motion') {
            const set = {};
            if (p.scale != null) { set.ZoomX = Number(p.scale) / 100; set.ZoomY = Number(p.scale) / 100; }
            if (p.rotation != null) set.RotationAngle = Number(p.rotation);
            // Premiere's position is 0–1 across the frame; Resolve's Pan/Tilt are pixels from the centre
            const sz = R.size(tl);
            if (p.x != null) set.Pan = (Number(p.x) - 0.5) * sz.width;
            if (p.y != null) set.Tilt = (0.5 - Number(p.y)) * sz.height;
            ok = Object.entries(set).every(([k, v]) => tryCall(() => ti.SetProperty(k, v), false));
          } else if (a.op === 'opacity') ok = !!tryCall(() => ti.SetProperty('Opacity', Number(p.value)), false);
          else if (a.op === 'label') { const c = R.LABEL_COLORS[Number(p.label)]; ok = c ? !!tryCall(() => ti.SetClipColor(c), false) : !!tryCall(() => ti.ClearClipColor(), false); }
          else if (a.op === 'enable') ok = !!tryCall(() => ti.SetClipEnabled(!!p.on), false);
          else if (a.op === 'remove') ok = !!tryCall(() => tl.DeleteClips([ti], !!p.ripple), false);
          else if (a.op === 'rename') { const n = String(p.name || '').trim(); ok = !!n && !!tryCall(() => ti.SetName(n), false); if (!n) why = 'no name given'; }
          else if (flip) {
            if (g.kind === 'audio') { why = 'a flip is for picture'; ok = false; }
            else ok = !!tryCall(() => ti.SetProperty(flip, true), false);
          } else if (a.op === 'effect') {
            const fx = findEffect(p.name, g.kind === 'audio');
            if (!fx) why = `Resolve’s Effects Library has no “${String(p.name || '')}” – use its name as Resolve shows it`;
            else ok = !!tryCall(() => ti.AddEffect(String(fx.category), String(fx.id)), null);
          } else if (a.op === 'transition') {
            const name = TRANSITIONS[key(p.name)] || String(p.name || (g.kind === 'audio' ? 'Cross Fade +3 dB' : 'Cross Dissolve'));
            const frames = p.frames || (p.seconds ? p.seconds * fps : Math.round(fps / 2));
            let n = 0;
            for (const at of p.at === 'both' || !p.at ? ['start', 'end'] : [p.at]) if (addTransition(tl, ti, g.kind, name, at, frames)) n++;
            if (n) { out.done += n; continue; }
            why = `Resolve didn’t add “${name}” – check its name in the Effects Library, and that the clip has room for it`;
          } else if (a.op === 'speed') {
            const pc = Number(p.percent);
            if (!(pc > 0)) why = 'no speed given';
            else {
              ok = !!tryCall(() => ti.SetSpeed({ Percentage: pc, RippleTimeline: true }), false);
              const got = Number((tryCall(() => (typeof ti.GetSpeed === 'function' ? ti.GetSpeed() : null), null) || {}).Percentage);
              if (ok && isFinite(got) && Math.abs(got - pc) > 0.5) { ok = false; why = `Resolve set ${got}% instead`; }
            }
          } else if (a.op === 'volume') {
            if (g.kind !== 'audio') { why = 'volume is for sound clips'; ok = false; }
            else {
              const now = Number(tryCall(() => ti.GetProperty('AudioVolume'), 0)) || 0, want = Math.max(-100, Math.min(30, Math.round((now + Number(p.db || 0)) * 10) / 10));
              if (tryCall(() => ti.GetProperty('AudioVolumeEnabled'), true) === false) tryCall(() => ti.SetProperty('AudioVolumeEnabled', true), false);
              ok = !!tryCall(() => ti.SetProperty('AudioVolume', want), false);
            }
          }
          else throw R.err('BAD_INPUT', 'Unknown edit ' + a.op);
          if (ok) out.done++; else out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why });
        } catch (e) { out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: String(e.message || e) }); }
      }
      if (a.op === 'remove' || a.op === 'speed') R.forget && R.forget();
      return out;
    },

    /** As jsx/tools/edit.jsx: bins, timelines (with their bin and track counts) and clips. a: {maxClips} */
    editProject(a) {
      const max = (a && a.maxClips) || 3000, idx = R.index(), clips = [];
      let more = 0;
      for (const c of idx.clips) {
        const kind = R.quickKind(c.item);
        if (kind === 'sequence' || R.isSubtitle(c.item)) continue;
        if (clips.length >= max) { more++; continue; }
        const file = String(R.prop(c.item, 'File Path') || '');
        clips.push({ id: c.id, name: String(tryCall(() => c.item.GetName(), '')), file: file.split(/[\\/]/).pop(), bin: R.binPath(c.parts), kind });
      }
      const sequences = R.timelines().map(tl => {
        const mpi = tryCall(() => tl.GetMediaPoolItem(), null), e = mpi ? R.entry(R.id(mpi)) : null;
        return { id: R.id(tl), itemId: mpi ? R.id(mpi) : '', name: String(tl.GetName() || ''), bin: R.binPath(e ? e.parts : []), duration: R.tlDuration(tl), video: tl.GetTrackCount('video'), audio: tl.GetTrackCount('audio') };
      });
      return { bins: idx.folders.map(f => R.binPath(f.parts)).filter(p => p !== '(Project root)'), sequences, clips, more };
    }
  };
};
module.exports.RESOLVE_CANT = RESOLVE_CANT;
module.exports.NEEDS = NEEDS;
module.exports.TRANSITIONS = TRANSITIONS;
module.exports.EFFECTS = EFFECTS;
