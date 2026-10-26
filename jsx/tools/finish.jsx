// JMG Ultra Studio – Premiere side for Safe Zones, Final Check and Deliver (ES3).
(function (U) {
    var fn = U.fn;
    var GUIDE_PREFIX = 'Ultra Guide';

    /** Put a guide image on a new top video track for the whole sequence. a: {seqId, itemId} */
    fn.placeGuide = function (a) {
        var seq = U.needSeq(a.seqId), it = U.needItem(a.itemId);
        var dur = U.ticksToSec(seq.end);
        if (dur <= 0) throw U.err('BAD_INPUT', 'Sequence is empty', 'This sequence is empty.', 'Add some clips first, then put the guide on.');
        // reuse our track (named "Guides", or "Letterbox" for bars) if there is one – old clips on it are replaced –
        // otherwise add a fresh track on top. a.prefix: name prefix of the clips that belong on it.
        var trackName = a.trackName || 'Guides', prefix = a.prefix || GUIDE_PREFIX;
        var top = -1, t, c;
        for (t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr0 = seq.videoTracks[t], isOurs = tr0.name === trackName;
            for (c = 0; c < tr0.clips.numItems && !isOurs; c++) if (String(tr0.clips[c].name).indexOf(prefix) === 0) isOurs = true;
            if (isOurs) top = t;
        }
        if (top >= 0) {
            var trg = seq.videoTracks[top];
            for (c = trg.clips.numItems - 1; c >= 0; c--) trg.clips[c].remove(false, false);
            if (trg.clips.numItems) top = -1; // something else is on it: use a new track
        }
        if (top < 0) {
            var q = U.openAndQE(seq);
            top = seq.videoTracks.numTracks;
            q.addTracks(1, top, 0, 1, seq.audioTracks.numTracks, 0, 0, 0);
            if (seq.videoTracks.numTracks <= top) throw U.err('HOST_SCRIPT', 'Could not add a video track');
        }
        // stills are rounded to whole frames on placement, so the guide can end a frame early – harmless for a guide
        it.setInPoint(0, 4); it.setOutPoint(dur, 4);
        seq.videoTracks[top].overwriteClip(it, 0);
        try { it.clearInPoint(); it.clearOutPoint(); } catch (e) { }
        try { U.openAndQE(seq).getVideoTrackAt(top).setName(trackName); } catch (e) { }
        try { seq.videoTracks[top].setMute(0); } catch (e) { }
        var tr = seq.videoTracks[top];
        if (!tr.clips.numItems) throw U.err('HOST_SCRIPT', 'Guide was not placed');
        return { track: top, start: tr.clips[0].start.seconds, end: tr.clips[0].end.seconds };
    };

    /** The project item for a guide PNG we imported before (so we don't import it twice). */
    fn.findGuideItem = function (a) {
        var found = null;
        U.walk(U.project().rootItem, function (c) { if (c.type === 1) { try { if (c.getMediaPath() === a.path) { found = c.nodeId; return false; } } catch (e) { } } });
        return found;
    };

    /** Where are guides in this sequence, and are they visible? */
    fn.guideStatus = function (a) {
        var seq = U.needSeq(a.seqId), out = [];
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t], n = 0;
            for (var c = 0; c < tr.clips.numItems; c++) if (String(tr.clips[c].name).indexOf(GUIDE_PREFIX) === 0) n++;
            if (n) out.push({ track: t, count: n, hidden: tr.isMuted() });
        }
        return out;
    };
    /** Show/hide every guide track (the eye icon). Hidden tracks don't export. */
    fn.showGuides = function (a) {
        var seq = U.needSeq(a.seqId), st = fn.guideStatus(a), n = 0;
        for (var i = 0; i < st.length; i++) { seq.videoTracks[st[i].track].setMute(a.show ? 0 : 1); n++; }
        return n;
    };
    /** Remove guide clips (leaves the empty track). */
    fn.removeGuides = function (a) {
        var seq = U.needSeq(a.seqId), n = 0, GUIDE_PREFIX = a.prefix || 'Ultra Guide';
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t];
            for (var c = tr.clips.numItems - 1; c >= 0; c--) if (String(tr.clips[c].name).indexOf(GUIDE_PREFIX) === 0) { tr.clips[c].remove(false, false); n++; }
        }
        return n;
    };

    /**
     * Wrap a sequence in a new one of an exact frame size (e.g. an Auto Reframe result of 607x1080 → 1080x1920),
     * scaled to fill. a: {seqId, width, height, name, binPath} -> {id, name}
     */
    fn.fitToSize = function (a) {
        var src = U.needSeq(a.seqId), bin = U.ensureBin(a.binPath || 'JMG Ultra Studio/Deliver');
        var ns = U.project().createNewSequenceFromClips(a.name, [src.projectItem], bin);
        if (!ns) throw U.err('HOST_SCRIPT', 'Could not create the full-size sequence');
        var st = ns.getSettings(); st.videoFrameWidth = a.width; st.videoFrameHeight = a.height; ns.setSettings(st);
        var ti = ns.videoTracks[0].clips[0], scale = Math.max(a.width / src.frameSizeHorizontal, a.height / src.frameSizeVertical) * 100;
        for (var c = 0; c < ti.components.numItems; c++) {
            var cp = ti.components[c];
            if (cp.displayName !== 'Motion' && cp.matchName !== 'AE.ADBE Motion') continue;
            for (var p = 0; p < cp.properties.numItems; p++) {
                var pr = cp.properties[p];
                if (pr.displayName === 'Scale') pr.setValue(scale, true);
                if (pr.displayName === 'Position') pr.setValue([0.5, 0.5], true);
            }
        }
        return { id: ns.sequenceID, name: ns.name, width: ns.frameSizeHorizontal, height: ns.frameSizeVertical, scale: scale };
    };

    /* ---------- Media Encoder ---------- */
    fn.deliverPresets = function () {
        return {
            h264: U.findPreset('MediaIO/systempresets/4E49434B_48323634/01 - Match Source - High bitrate.epr'),
            youtube1080: U.findPreset('MediaIO/systempresets/4E49434B_48323634/YouTube 1080p HD.epr'),
            youtube2160: U.findPreset('MediaIO/systempresets/4E49434B_48323634/YouTube 2160p 4K.epr'),
            wav: U.findPreset('MediaIO/systempresets/3F3F3F3F_57415645/Waveform Audio 48kHz 16-bit.epr')
        };
    };
})(UStudio);
