// JMG Ultra Studio – Podcast (Premiere side, ES3): apply a camera switch to a sequence whose cameras are stacked on
// video tracks (synced). Each camera track is cut at every switch and only the active camera's piece stays switched
// on – nothing is deleted, so the edit stays re-switchable: switch a piece on (or another off) to change a shot.
(function (U) {
    var fn = U.fn;
    /**
     * a: {seqId, cameras:[video track index], segments:[{start, end, camera (track index)}]} (seconds, in order)
     * -> {cuts, on, off, log}
     */
    fn.podSwitch = function (a) {
        var seq = U.needSeq(a.seqId), q = U.openAndQE(seq), log = [], cuts = 0, on = 0, off = 0, i, t, c;
        var times = [];
        for (i = 1; i < a.segments.length; i++) times.push(a.segments[i].start);
        times.sort(function (x, y) { return y - x; });   // from the end, so earlier times stay put
        for (c = 0; c < a.cameras.length; c++) {
            t = a.cameras[c];
            var qt = null; try { qt = q.getVideoTrackAt(t); } catch (e) { log.push('V' + (t + 1) + ': ' + e); }
            for (i = 0; i < times.length; i++) {
                var tc = U.framesToTC(U.secToFrames(times[i], seq), seq), done = false;
                try { if (qt && typeof qt.razor === 'function') { qt.razor(tc); done = true; } } catch (e1) { }
                if (!done && c === 0) { try { q.razor(tc); done = true; } catch (e2) { log.push('razor ' + tc + ': ' + e2); } }   // older Premiere: the whole sequence, once
                if (done) cuts++;
            }
        }
        function cameraAt(sec) {
            for (var k = 0; k < a.segments.length; k++) if (sec >= a.segments[k].start - 1e-6 && sec < a.segments[k].end) return a.segments[k].camera;
            return a.segments.length ? a.segments[a.segments.length - 1].camera : -1;
        }
        for (c = 0; c < a.cameras.length; c++) {
            t = a.cameras[c];
            var tr = seq.videoTracks[t];
            for (i = 0; i < tr.clips.numItems; i++) {
                var ti = tr.clips[i], mid = (ti.start.seconds + ti.end.seconds) / 2, want = cameraAt(mid) === t;
                try { ti.disabled = !want; } catch (e3) { log.push('enable: ' + e3); }
                if (want) on++; else off++;
            }
        }
        return { cuts: cuts, on: on, off: off, log: log };
    };
})(UStudio);
