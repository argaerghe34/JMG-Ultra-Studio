// JMG Ultra Studio – Podcast (Resolve side): the same podSwitch as jsx/tools/podcast.jsx. Resolve can't cut clips by
// script, so each camera track of the (copied) timeline is laid again as pieces – one per switch, from the same source
// times – and only the active camera's piece is switched on. Re-switchable the same way: switch a piece on or off.
// Each camera clip is parked on a spare track while its pieces are laid, so they get its grade, Fusion effects,
// Inspector settings, colour, flags and markers (resolve/host/rebuild.js); then it goes.
'use strict';

module.exports = (R) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  const RB = require('./rebuild').make(R);
  return {
    /** a: {seqId, cameras:[video track index, 0-based], segments:[{start, end, camera}]} -> {cuts, on, off, log, notes} */
    podSwitch(a) {
      const tl = R.open(R.needSeq(a.seqId)), pool = R.pool(), log = [], segs = a.segments || [], fps = R.fps(tl), t0 = tl.GetStartFrame();
      const park = RB.parker(tl), done = [];
      let on = 0, off = 0, laid = 0, lost = 0;
      try {
        for (const t of a.cameras || []) {
          // the camera's clips as they are now: what plays when, from where
          const clips = R.list(tl.GetItemListInTrack('video', t + 1)).filter(Boolean).map(ti => Object.assign({ ti, mpi: tryCall(() => ti.GetMediaPoolItem(), null) }, R.itemTimes(tl, ti))).filter(c => c.mpi);
          if (!clips.length) { log.push(`V${t + 1}: no clips`); continue; }
          if (clips.some(c => Math.abs((c.speed || 1) - 1) > 0.01)) log.push(`V${t + 1}: a clip with a speed change is laid again at normal speed – check it`);
          for (const c of clips) { c.snap = RB.snap(c.ti); c.parked = park.park(c.ti, 'video'); if (!c.parked) c.lost = RB.hasLook(c.ti); }
          const rest = clips.filter(c => !c.parked).map(c => c.ti);
          if (rest.length && !tryCall(() => tl.DeleteClips(rest, false), false)) {
            for (const c of clips) if (c.parked) park.unpark(c.ti, t + 1);
            log.push(`V${t + 1}: Resolve didn't clear the track`); continue;
          }
          R.forget && R.forget();
          let here = 0;
          for (const s of segs) {
            for (const c of clips) {
              const a0 = Math.max(s.start, c.start), a1 = Math.min(s.end, c.end);
              if (a1 - a0 < 1 / fps) continue;
              // the piece's length on the timeline (a sped-up clip's source span would run long and overlap)
              const inS = c.in + (a0 - c.start) * (c.speed || 1), outS = inS + (a1 - a0);
              let got = [];
              try { got = R.list(pool.AppendToTimeline([R.clipInfo(c.mpi, inS, outS, { trackIndex: t + 1, recordFrame: R.tlFrame(tl, a0), mediaType: 1 })])).filter(Boolean); } catch (e) { log.push(`V${t + 1} at ${a0.toFixed(2)}: ${e.message}`); }
              for (const piece of got) {
                const want = s.camera === t;
                tryCall(() => piece.SetClipEnabled(want), false); if (want) on++; else off++; here++;
                (c.pieces = c.pieces || []).push(piece);
              }
            }
          }
          // nothing could be laid again: put the camera's own clips back rather than leave the track empty
          if (!here) {
            for (const c of clips) {
              if (c.parked) park.unpark(c.ti, t + 1);
              else tryCall(() => pool.AppendToTimeline([R.clipInfo(c.mpi, c.in, c.out, { trackIndex: t + 1, recordFrame: R.tlFrame(tl, c.start), mediaType: 1 })]), null);
            }
            log.push(`V${t + 1}: Resolve wouldn't lay the pieces – the camera's clips were put back as they were`);
          }
          laid += here;
          done.push(...clips.filter(c => c.pieces));
        }
        // each piece gets what its camera clip had (its look while the clip is still parked), then the clips go
        const copy = done.filter(c => c.parked);
        if (copy.length) RB.onEditPage(() => { for (const c of copy) if (!RB.copyLook(c.ti, 'video', c.pieces) && RB.hasLook(c.ti)) c.lost = true; });
        for (const c of done) for (const p of c.pieces) RB.give(c.snap, p, Math.max(0, p.GetStart() - t0 - Math.round(c.start * fps)), p.GetEnd() - p.GetStart(), { enabled: false });
        lost = done.filter(c => c.lost).length;
      } finally {
        park.drop();
      }
      const notes = lost ? [`${lost === 1 ? 'One camera clip' : lost + ' camera clips'} didn’t get ${lost === 1 ? 'its' : 'their'} grade or effects back – Resolve wouldn’t copy them. Copy them from your original with Paste Attributes.`] : [];
      return { cuts: Math.max(0, laid - (a.cameras || []).length), on, off, log, notes };
    }
  };
};
