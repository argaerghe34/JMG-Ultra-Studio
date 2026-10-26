// JMG Ultra Studio – B-roll (Premiere side, ES3): lay cutaways on their own track over the talking heads.
(function (U) {
    var fn = U.fn;

    function audioEmpty(seq, k) { return k >= seq.audioTracks.numTracks || seq.audioTracks[k].clips.numItems === 0; }
    function videoEmpty(seq, k) { return k >= seq.videoTracks.numTracks || seq.videoTracks[k].clips.numItems === 0; }

    /**
     * Place B-roll shots on a new top track. A clip placed on video track k brings its sound onto audio track k, so the
     * track is chosen where that audio track is empty – nobody's interview or music is ever overwritten.
     * a: {seqId, shots:[{id, in, out, at}], trackName:'B-roll', keepSound:false} -> {track, placed, sound}
     */
    fn.brollPlace = function (a) {
        var seq = U.needSeq(a.seqId), name = a.trackName || 'B-roll';
        var k = seq.videoTracks.numTracks;
        while (!audioEmpty(seq, k) || !videoEmpty(seq, k)) k++;
        var clips = [];
        for (var i = 0; i < a.shots.length; i++) {
            var s = a.shots[i];
            clips.push({ id: s.id, 'in': s['in'], out: s.out, at: s.at, v: k, a: k, audio: !!a.keepSound });
        }
        var r = JSON.parse(U.run('placeClips', JSON.stringify({ seqId: seq.sequenceID, clips: clips })));
        if (!r.ok) throw U.err('HOST_SCRIPT', r.error && r.error.detail || 'placeClips failed');
        try { U.openAndQE(seq).getVideoTrackAt(k).setName(name); } catch (e) { }
        var placed = 0; for (i = 0; i < r.data.placed.length; i++) if (r.data.placed[i]) placed++;
        return { track: k, placed: placed, sound: !!a.keepSound };
    };
})(UStudio);
