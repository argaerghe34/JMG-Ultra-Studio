// JMG Ultra Studio – Auto Sync (Premiere side, ES3): each clip's start timecode, and the new sequence with every
// camera and recorder on its own tracks. The same commands for Resolve: resolve/host/sync.js.
(function (U) {
    var fn = U.fn;

    /**
     * The timecode each clip starts at, in seconds (null when it has none or it can't be read).
     * a: {ids} -> [{id, start}]
     */
    fn.syncTimecodes = function (a) {
        var out = [];
        for (var i = 0; i < a.ids.length; i++) {
            var it = U.itemById(a.ids[i]), start = null;
            if (it) {
                try {
                    var c = U.columns(it), v = c['Column.Intrinsic.MediaStart'];
                    if (v !== undefined && v !== null && v !== '') {
                        // ticks (a whole number), or a timecode with the clip's frame rate beside it
                        if (/^\d+$/.test(String(v))) start = U.ticksToSec(v);
                        else { var s = U.tcToSec(v, c['Column.Intrinsic.MediaTimebase']); if (!isNaN(s)) start = s; }
                    }
                } catch (e) { start = null; }
            }
            out.push({ id: a.ids[i], start: start });
        }
        return out;
    };

    /* Premiere lays both halves of a clip that has picture and sound, and chooses the other half's track itself. So:
       lay one half where it's wanted, take away whatever else of that clip arrived at that moment and isn't wanted,
       then check every wanted half is whole and lay again any that another clip's unwanted half cut into (the way
       Story's storyPlaceFromSequence does it). */
    function near(x, y, tol) { return Math.abs(x - y) <= tol; }
    function itemIdOf(ti) { try { return ti.projectItem ? ti.projectItem.nodeId : null; } catch (e) { return null; } }
    function isWanted(ti, isVideo, t, want, tol) {
        var id = itemIdOf(ti);
        if (!id) return false;
        for (var i = 0; i < want.length; i++) {
            var w = want[i];
            if (w.video === isVideo && w.index === t && w.item.nodeId === id && near(ti.start.seconds, w.at, tol) && near(ti.end.seconds, w.at + (w.to - w.from), tol * 2)) return true;
        }
        return false;
    }
    function isThere(seq, w, tol) {
        var tr = w.video ? seq.videoTracks[w.index] : seq.audioTracks[w.index];
        for (var k = 0; k < tr.clips.numItems; k++) {
            var c = tr.clips[k];
            if (near(c.start.seconds, w.at, tol) && near(c.end.seconds, w.at + (w.to - w.from), tol * 2) && itemIdOf(c) === w.item.nodeId) return true;
        }
        return false;
    }
    /** Take away what arrived with a half and isn't wanted: this clip, starting at that moment, anywhere else. */
    function clearStrays(seq, w, want, tol) {
        function sweep(coll, isVideo) {
            for (var t = 0; t < coll.numTracks; t++) {
                var tr = coll[t];
                for (var k = tr.clips.numItems - 1; k >= 0; k--) {
                    var c = tr.clips[k];
                    if (!near(c.start.seconds, w.at, tol) || itemIdOf(c) !== w.item.nodeId) continue;
                    if (isWanted(c, isVideo, t, want, tol)) continue;
                    try { c.remove(false, false); } catch (e) { }
                }
            }
        }
        sweep(seq.videoTracks, true); sweep(seq.audioTracks, false);
    }
    function layHalf(seq, w, want, tol) {
        var it = w.item, hadIn = 0, hadOut = 0, hadLabel = null, full = 0;
        try { hadIn = it.getInPoint().seconds; hadOut = it.getOutPoint().seconds; } catch (e) { }
        try { var cc = U.columns(it); full = cc['Column.Intrinsic.MediaDuration'] ? U.ticksToSec(cc['Column.Intrinsic.MediaDuration']) : 0; } catch (e1) { }
        // the timeline clip takes the item's label as it's laid; the clip in the bin keeps its own
        if (w.label !== null && w.label !== undefined) { try { hadLabel = it.getColorLabel(); it.setColorLabel(w.label); } catch (e2) { hadLabel = null; } }
        try {
            it.setInPoint(w.from, 4); it.setOutPoint(w.to, 4);
            (w.video ? seq.videoTracks[w.index] : seq.audioTracks[w.index]).overwriteClip(it, w.at);
            clearStrays(seq, w, want, tol);
        } finally {
            try {
                it.clearInPoint(); it.clearOutPoint();
                if (hadIn > 0.0001) it.setInPoint(hadIn, 4);
                if (full && hadOut > 0 && hadOut < full - 0.05) it.setOutPoint(hadOut, 4);
            } catch (e3) { }
            if (hadLabel !== null) { try { it.setColorLabel(hadLabel); } catch (e4) { } }
        }
    }

    /**
     * A new sequence (settings like a.likeId) with every layer where it belongs. a: {name, binPath, likeId,
     * layers: [{id, in, out, at, v: video track or null, a: audio track or null, label?}], videoNames, audioNames,
     * mute: [audio track indexes], markers: [{start, name, comment, color}]}
     * -> {id, name, placed, missing: [layer indexes not whole on the sequence], passes, named}
     */
    fn.syncBuild = function (a) {
        var made = fn.newSequence({ name: a.name, binPath: a.binPath || 'JMG Ultra Studio/Auto Sync', likeId: a.likeId });
        var seq = U.needSeq(made.id), want = [], i, maxV = 1, maxA = 1, L;
        var tol = Math.max(0.03, 1.5 / (U.seqFps(seq) || 25));
        for (i = 0; i < a.layers.length; i++) {
            L = a.layers[i];
            var it = U.needItem(L.id);
            if (L.v !== null && L.v !== undefined) { want.push({ layer: i, item: it, video: true, index: L.v, from: L['in'], to: L.out, at: L.at, label: L.label }); maxV = Math.max(maxV, L.v + 1); }
            if (L.a !== null && L.a !== undefined) { want.push({ layer: i, item: it, video: false, index: L.a, from: L['in'], to: L.out, at: L.at, label: L.label }); maxA = Math.max(maxA, L.a + 1); }
        }
        U.ensureTracks(seq, maxV, maxA);
        var passes = 0, laid = 1;
        while (laid && passes < 5) {
            laid = 0; passes++;
            for (i = 0; i < want.length; i++) {
                if (isThere(seq, want[i], tol)) continue;
                layHalf(seq, want[i], want, tol); laid++;
            }
        }
        var missing = [], seen = {}, placed = 0;
        for (i = 0; i < want.length; i++) {
            if (isThere(seq, want[i], tol)) continue;
            if (!seen[want[i].layer]) { seen[want[i].layer] = true; missing.push(want[i].layer); }
        }
        placed = a.layers.length - missing.length;
        // track names are a nicety (not every Premiere lets a script set them)
        var named = 0, t;
        for (t = 0; t < (a.videoNames || []).length && t < seq.videoTracks.numTracks; t++) { try { seq.videoTracks[t].name = a.videoNames[t]; if (seq.videoTracks[t].name === a.videoNames[t]) named++; } catch (e) { } }
        for (t = 0; t < (a.audioNames || []).length && t < seq.audioTracks.numTracks; t++) { try { seq.audioTracks[t].name = a.audioNames[t]; if (seq.audioTracks[t].name === a.audioNames[t]) named++; } catch (e5) { } }
        for (t = 0; t < (a.mute || []).length; t++) { try { seq.audioTracks[a.mute[t]].setMute(1); } catch (e6) { } }
        if (a.markers && a.markers.length) { try { fn.addSequenceMarkers({ seqId: made.id, markers: a.markers }); } catch (e7) { } }
        return { id: made.id, name: made.name, placed: placed, missing: missing, passes: passes, named: named };
    };
})(UStudio);
