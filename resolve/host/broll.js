// JMG Ultra Studio – B-roll (Resolve side). Same command, arguments and result as jsx/tools/broll.jsx.
'use strict';

module.exports = (R) => ({
  /**
   * Place B-roll shots on a new top track. The track is chosen where both video track k and audio track k are empty,
   * so nobody's interview or music is ever overwritten (the sound, when kept, goes on audio track k).
   * a: {seqId, shots:[{id, in, out, at}], trackName:'B-roll', keepSound:false} -> {track (0-based, as Premiere), placed, sound}
   */
  brollPlace(a) {
    const tl = R.needSeq(a.seqId), name = a.trackName || 'B-roll';
    const empty = (type, k) => k > tl.GetTrackCount(type) || !R.list(tl.GetItemListInTrack(type, k)).length;
    let k = tl.GetTrackCount('video') + 1;
    while (!empty('video', k) || !empty('audio', k)) k++;
    while (tl.GetTrackCount('video') < k) if (!tl.AddTrack('video')) throw R.err('HOST_SCRIPT', 'Resolve would not add video track ' + k);
    if (a.keepSound) while (tl.GetTrackCount('audio') < k) if (!tl.AddTrack('audio', 'stereo')) throw R.err('HOST_SCRIPT', 'Resolve would not add audio track ' + k);
    R.open(tl);
    let placed = 0, firstErr = null;
    for (const s of a.shots || []) {
      const it = R.itemById(s.id); if (!it) continue;
      // a shot without a usable time is skipped: undefined/NaN never reaches AppendToTimeline (it can abort Resolve)
      if (R.num(s.at) == null || R.num(s.in) == null || R.num(s.out) == null || R.isSubtitle(it)) continue;
      const rec = R.tlFrame(tl, R.num(s.at));
      try {
        const v = R.list(R.pool().AppendToTimeline([R.clipInfo(it, s.in, s.out, { trackIndex: k, recordFrame: rec, mediaType: 1 })])).filter(Boolean);
        if (a.keepSound && R.itemInfo(it).hasAudio) R.pool().AppendToTimeline([R.clipInfo(it, s.in, s.out, { trackIndex: k, recordFrame: rec, mediaType: 2 })]);
        if (v.length) placed++;
      } catch (e) { firstErr = firstErr || e; }   // Resolve throws a refusal: the other shots still go on
    }
    if (!placed && firstErr) throw firstErr;
    try { tl.SetTrackName('video', k, name); } catch (e) { /* the name is a nicety */ }
    return { track: k - 1, placed, sound: !!a.keepSound };
  }
});
