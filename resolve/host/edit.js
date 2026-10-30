// JMG Ultra Studio – Ask › Edit (Resolve side): the same commands, arguments and results as jsx/tools/edit.jsx.
// Resolve lets add-ons change a timeline clip's Inspector values (zoom, position, rotation, opacity), its colour,
// whether it's on, delete it, and add markers – but not add transitions, effects, speed changes, keyframes or titles,
// so those come back as "Premiere only" with nothing changed.
'use strict';

const RESOLVE_CANT = { transition: 'transitions', effect: 'effects', speed: 'speed changes', zoom: 'keyframed zooms', volume: 'volume changes', text: 'text layers', razor: 'cuts', rename: 'renaming timeline clips' };

module.exports = (R, fns) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  /** The timeline item on a track (0-based, as Premiere counts) that starts at this time (within half a frame). */
  function clipAt(tl, kind, track, start) {
    const half = 0.5 / R.fps(tl);
    for (const ti of R.list(tl.GetItemListInTrack(kind === 'audio' ? 'audio' : 'video', track + 1)).filter(Boolean)) if (Math.abs(R.tlSec(tl, ti.GetStart()) - start) <= half) return ti;
    return null;
  }
  const labelOfColour = c => { const i = R.LABEL_COLORS.indexOf(String(c || '')); return i >= 0 ? i : null; };

  return {
    /** The timeline as Ask › Edit shows it: sequenceInfo plus each clip's colour and zoom (Resolve doesn't list effects). */
    editRead(a) {
      const o = fns.sequenceInfo({ seqId: a.seqId }), tl = R.needSeq(a.seqId);
      for (const kind of ['video', 'audio']) for (const tr of o[kind]) for (const c of tr.clips) {
        const ti = clipAt(tl, kind, tr.index, c.start); if (!ti) continue;
        c.label = labelOfColour(tryCall(() => ti.GetClipColor(), ''));
        c.effects = [];
        if (kind === 'video') { const z = Number(tryCall(() => ti.GetProperty('ZoomX'), NaN)); if (isFinite(z)) c.scale = Math.round(z * 1000) / 10; }
      }
      return o;
    },
    /** Resolve doesn't tell add-ons which timeline clips are selected: the clip under the playhead stands in. */
    editSelection(a) {
      const tl = R.needSeq(a.seqId), ti = tryCall(() => tl.GetCurrentVideoItem(), null);
      if (!ti) return [];
      const tt = tryCall(() => ti.GetTrackTypeAndIndex(), ['video', 1]);
      return [{ kind: 'video', track: (tt[1] || 1) - 1, start: R.tlSec(tl, ti.GetStart()), end: R.tlSec(tl, ti.GetEnd()), name: String(tryCall(() => ti.GetName(), '')), underPlayhead: true }];
    },
    /** One kind of edit on a list of clips – see jsx/tools/edit.jsx. -> {done, skipped:[{start, track, kind, why}], log, unsupported?} */
    editApply(a) {
      const tl = R.needSeq(a.seqId), p = a.params || {}, out = { done: 0, skipped: [], log: [] };
      if (RESOLVE_CANT[a.op]) return Object.assign(out, { unsupported: true, why: `Resolve doesn’t let add-ons add ${RESOLVE_CANT[a.op]} – do it on the Edit page, or use Premiere.` });
      const targets = (a.targets || []).slice();
      if (a.op === 'remove') targets.sort((x, y) => y.start - x.start);
      for (const g of targets) {
        try {
          if (a.op === 'marker') {
            const fps = R.fps(tl), f = Math.round(g.start * fps), ti = g.kind ? clipAt(tl, g.kind, g.track, g.start) : null;
            const end = g.end != null ? g.end : ti ? R.tlSec(tl, ti.GetEnd()) : g.start;
            const colour = p.color != null && R.MARKER_COLORS ? R.MARKER_COLORS[p.color] || 'Blue' : 'Blue';
            if (tl.AddMarker(f, colour, String(p.name || (ti ? tryCall(() => ti.GetName(), '') : '') || 'Ask'), String(p.comment || ''), Math.max(1, Math.round((end - g.start) * fps)), '')) out.done++;
            else out.skipped.push({ start: g.start, why: 'another marker is on that frame' });
            continue;
          }
          const ti = clipAt(tl, g.kind, g.track, g.start);
          if (!ti) { out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: 'not on the timeline any more' }); continue; }
          let ok = false;
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
          else throw R.err('BAD_INPUT', 'Unknown edit ' + a.op);
          if (ok) out.done++; else out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: 'Resolve refused the change' });
        } catch (e) { out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: String(e.message || e) }); }
      }
      if (a.op === 'remove') R.forget && R.forget();
      return out;
    }
  };
};
module.exports.RESOLVE_CANT = RESOLVE_CANT;
