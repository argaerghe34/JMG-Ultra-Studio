// JMG Ultra Studio – Resolve side for the sound tools (the Resolve versions of jsx/tools/audio.jsx).
// Resolve 20's scripting API has no clip volume: TimelineItem.GetProperty/SetProperty cover only picture settings
// (Pan, Tilt, Zoom, Crop, Opacity, Composite Mode, Retime, Scaling…), and there is no audio level, keyframe or Fairlight
// fader call. So soundGain and soundDuck say so plainly, with the nearest thing to do by hand; Sound Check tells you
// this before you start (js/tools/31-sound.js) and still measures, marks and mutes tracks as in Premiere.
'use strict';

const NO_VOLUME = 'Resolve doesn’t let add-ons change clip volume yet.';

module.exports = function (R) {
  return {
    /** Locked tracks that hold clips (cutting time out of the timeline would leave them out of sync). a: {seqId} → ['V2', 'A1'] */
    lockedTracksWithClips(a) {
      const tl = R.needSeq(a.seqId), out = [];
      for (const [type, letter] of [['video', 'V'], ['audio', 'A']]) {
        for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) {
          let locked = false; try { locked = !!tl.GetIsTrackLocked(type, t); } catch (e) { /* older Resolve: no locks to read */ }
          if (locked && R.list(tl.GetItemListInTrack(type, t)).filter(Boolean).length) out.push(letter + t);
        }
      }
      return out;
    },

    /** Premiere: every clip's Volume Level changed by db. Not possible by script in Resolve. a: {seqId, db} */
    soundGain(a) {
      R.needSeq(a.seqId);
      const db = Number(a.db) || 0;
      throw R.err('HOST_SCRIPT', 'soundGain: TimelineItem has no volume property in Resolve’s scripting API (Resolve 20)', NO_VOLUME,
        `Do it in Resolve: select all the clips in the timeline, right-click › Normalize Audio Levels, choose ITU-R BS.1770-4 and the target loudness (or raise the Bus 1 fader on the Fairlight page by ${Math.abs(db).toFixed(1)} dB${db < 0 ? ' down' : ''}).`);
    },
    /** Premiere: Volume keyframes ducking the music under speech. Not possible by script in Resolve. a: {seqId, clips, db} */
    soundDuck(a) {
      R.needSeq(a.seqId);
      throw R.err('HOST_SCRIPT', 'soundDuck: no clip volume or keyframe call in Resolve’s scripting API (Resolve 20)', NO_VOLUME,
        `Duck the music by hand: on the Fairlight page, add Dynamics to the music track and turn on its compressor’s sidechain from the dialogue track (about ${Math.abs(Number(a.db) || 12)} dB of reduction), or keyframe the music clips’ Volume in the Inspector.`);
    }
  };
};
module.exports.NO_VOLUME = NO_VOLUME;
