// JMG Ultra Studio – Podcast (Resolve side): the same podSwitch as jsx/tools/podcast.jsx. Resolve can't cut clips by
// script, so each camera track of the (copied) timeline is laid again as pieces – one per switch, from the same source
// times – and only the active camera's piece is switched on. Re-switchable the same way: switch a piece on or off.
'use strict';

module.exports = (R) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  return {
    /** a: {seqId, cameras:[video track index, 0-based], segments:[{start, end, camera}]} -> {cuts, on, off, log} */
    podSwitch(a) {
      const tl = R.open(R.needSeq(a.seqId)), pool = R.pool(), log = [], segs = a.segments || [];
      let on = 0, off = 0;
      for (const t of a.cameras || []) {
        // the camera's clips as they are now: what plays when, from where
        const clips = R.list(tl.GetItemListInTrack('video', t + 1)).filter(Boolean).map(ti => Object.assign({ ti, mpi: tryCall(() => ti.GetMediaPoolItem(), null) }, R.itemTimes(tl, ti))).filter(c => c.mpi);
        if (!clips.length) { log.push(`V${t + 1}: no clips`); continue; }
        if (!tl.DeleteClips(clips.map(c => c.ti), false)) { log.push(`V${t + 1}: Resolve didn't clear the track`); continue; }
        R.forget && R.forget();
        for (const s of segs) {
          for (const c of clips) {
            const a0 = Math.max(s.start, c.start), a1 = Math.min(s.end, c.end);
            if (a1 - a0 < 1 / R.fps(tl)) continue;
            const inS = c.in + (a0 - c.start) * c.speed, outS = inS + (a1 - a0) * c.speed;
            let got = [];
            try { got = R.list(pool.AppendToTimeline([R.clipInfo(c.mpi, inS, outS, { trackIndex: t + 1, recordFrame: R.tlFrame(tl, a0), mediaType: 1 })])).filter(Boolean); } catch (e) { log.push(`V${t + 1} at ${a0.toFixed(2)}: ${e.message}`); }
            for (const piece of got) { const want = s.camera === t; tryCall(() => piece.SetClipEnabled(want), false); if (want) on++; else off++; }
          }
        }
      }
      return { cuts: Math.max(0, segs.length - 1) * (a.cameras || []).length, on, off, log };
    }
  };
};
