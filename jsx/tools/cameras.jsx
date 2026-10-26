// JMG Ultra Studio – Camera Switch (Premiere side, ES3): cut the stacked camera angles of a sequence (the copy).
(function (U) {
    var fn = U.fn;
    /**
     * Each camera track above the lowest keeps its picture only where that camera is chosen; the lowest stays whole
     * underneath. Only video is cut – every sound stays as it was. a: {seqId, tracks:[indexes, lowest first],
     * shots:[{start, end, cam}], drop:[camera tracks left out – emptied]} -> {cuts, removed}
     */
    fn.camerasApply = function (a) {
        var seq = U.needSeq(a.seqId), q = U.openAndQE(seq), cuts = 0, removed = 0, i, j, c;
        // cameras that weren't chosen would cover (or show through) the others: leave them out of the copy
        for (j = 0; j < (a.drop || []).length; j++) { var dt = seq.videoTracks[a.drop[j]]; for (c = dt.clips.numItems - 1; c >= 0; c--) { dt.clips[c].remove(false, false); removed++; } }
        var camAt = function (t) { for (var k = 0; k < a.shots.length; k++) if (t >= a.shots[k].start && t < a.shots[k].end) return a.shots[k].cam; return a.shots.length ? a.shots[a.shots.length - 1].cam : -1; };
        for (j = 1; j < a.tracks.length; j++) {
            var idx = a.tracks[j], qt = q.getVideoTrackAt(idx);
            for (i = 1; i < a.shots.length; i++) { qt.razor(U.framesToTC(U.secToFrames(a.shots[i].start, seq), seq)); cuts++; }
            var tr = seq.videoTracks[idx];
            for (c = tr.clips.numItems - 1; c >= 0; c--) {
                var ti = tr.clips[c];
                if (camAt((ti.start.seconds + ti.end.seconds) / 2) !== idx) { ti.remove(false, false); removed++; }
            }
        }
        return { cuts: cuts, removed: removed };
    };
})(UStudio);

/**
 * One camera: fake a second angle by punching in on some shots. The track is razored at the shot changes and the
 * pieces of "close" shots are scaled by `zoom` (on top of any scale they already had), centred on `x`, `y` (0–1).
 * a: {seqId, track, shots:[{start, end, cam}], closeCam, zoom: 1.15, x: 0.5, y: 0.5} -> {cuts, zoomed}
 */
UStudio.fn.camerasPunch = function (a) {
    var U = UStudio, seq = U.needSeq(a.seqId), q = U.openAndQE(seq), qt = q.getVideoTrackAt(a.track), cuts = 0, zoomed = 0, i, c, p;
    for (i = 1; i < a.shots.length; i++) { qt.razor(U.framesToTC(U.secToFrames(a.shots[i].start, seq), seq)); cuts++; }
    var camAt = function (t) { for (var k = 0; k < a.shots.length; k++) if (t >= a.shots[k].start && t < a.shots[k].end) return a.shots[k].cam; return -1; };
    var tr = seq.videoTracks[a.track];
    for (c = 0; c < tr.clips.numItems; c++) {
        var ti = tr.clips[c];
        if (camAt((ti.start.seconds + ti.end.seconds) / 2) !== a.closeCam) continue;
        for (var k = 0; k < ti.components.numItems; k++) {
            var cp = ti.components[k];
            if (cp.displayName !== 'Motion' && cp.matchName !== 'AE.ADBE Motion') continue;
            for (p = 0; p < cp.properties.numItems; p++) {
                var pr = cp.properties[p];
                if (pr.displayName === 'Scale') pr.setValue(pr.getValue() * (a.zoom || 1.15), true);
                // keep the face in frame: move the picture so (x, y) stays where it was after the zoom
                if (pr.displayName === 'Position' && (a.x != null || a.y != null)) {
                    var z = a.zoom || 1.15, x = a.x == null ? 0.5 : a.x, y = a.y == null ? 0.5 : a.y;
                    pr.setValue([0.5 - (x - 0.5) * (z - 1), 0.5 - (y - 0.5) * (z - 1)], true);
                }
            }
        }
        zoomed++;
    }
    return { cuts: cuts, zoomed: zoomed };
};
