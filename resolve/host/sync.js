// JMG Ultra Studio – Auto Sync (Resolve side): the same syncTimecodes and syncBuild as jsx/tools/sync.jsx. Resolve
// lays picture and sound on the tracks it is told to, so nothing has to be taken away or laid again here.
'use strict';

module.exports = (R, fns) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  return {
    /** The timecode each clip starts at, in seconds (null when it has none). a: {ids} -> [{id, start}] */
    syncTimecodes(a) {
      return (a.ids || []).map(id => {
        const it = R.itemById(id);
        if (!it) return { id, start: null };
        const tc = R.prop(it, 'Start TC'), fps = R.clipFps(it), frames = tc ? R.tcToFrames(tc, fps) : NaN;
        return { id, start: isFinite(frames) && fps > 0 ? frames / fps : null };
      });
    },

    /**
     * A new timeline (settings like a.likeId) with every layer where it belongs. a: {name, binPath, likeId,
     * layers: [{id, in, out, at, v: video track or null, a: audio track or null, label?}], videoNames, audioNames,
     * mute: [audio track indexes], markers} -> {id, name, placed, missing: [layer indexes], passes, named}
     */
    syncBuild(a) {
      const made = fns.newSequence({ name: a.name, binPath: a.binPath || 'JMG Ultra Studio/Auto Sync', likeId: a.likeId });
      const tl = R.open(R.needSeq(made.id)), missing = [];
      (a.layers || []).forEach((L, i) => {
        const wantV = L.v != null, wantA = L.a != null;
        if (!wantV && !wantA) return;
        try {
          const r = fns.placeClips({ seqId: made.id, clips: [{ id: L.id, in: L.in, out: L.out, at: L.at, v: wantV ? L.v : 0, a: wantA ? L.a : 0, video: wantV, audio: wantA }] });
          if (!r.placed[0]) { missing.push(i); return; }
        } catch (e) { missing.push(i); return; }
        if (L.label == null) return;
        // the pieces just laid take the camera's colour (the clip in the Media Pool keeps its own)
        const colour = R.LABEL_COLORS[L.label], rec = R.tlFrame(tl, R.num(L.at));
        if (!colour) return;
        for (const [type, idx] of [['video', wantV ? L.v : null], ['audio', wantA ? L.a : null]]) {
          if (idx == null) continue;
          for (const ti of R.list(tl.GetItemListInTrack(type, Math.round(idx) + 1)).filter(Boolean)) if (Math.abs(ti.GetStart() - rec) <= 1) tryCall(() => ti.SetClipColor(colour), false);
        }
      });
      let named = 0;
      (a.videoNames || []).forEach((n, t) => { if (t < tl.GetTrackCount('video') && tryCall(() => tl.SetTrackName('video', t + 1, n), false)) named++; });
      (a.audioNames || []).forEach((n, t) => { if (t < tl.GetTrackCount('audio') && tryCall(() => tl.SetTrackName('audio', t + 1, n), false)) named++; });
      for (const t of a.mute || []) tryCall(() => fns.muteTrack({ seqId: made.id, video: false, index: t, mute: true }), false);
      if (a.markers && a.markers.length) tryCall(() => fns.addSequenceMarkers({ seqId: made.id, markers: a.markers }), null);
      return { id: made.id, name: made.name, placed: (a.layers || []).length - missing.length, missing, passes: 1, named };
    }
  };
};
