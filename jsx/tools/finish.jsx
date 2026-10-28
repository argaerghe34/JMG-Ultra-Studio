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

    /* ---------- render ranges: adjustment layers above the edit, each one exported under its own name ---------- */
    var RANGE_TRACK = 'Renders', RANGE_ITEM = 'Ultra Studio render range';
    function isRangeItem(pi) {
        if (!pi) return false;
        if (U.labelParts.isAdj(pi)) return true;
        try { return pi.name === RANGE_ITEM; } catch (e) { return false; }
    }
    function rangeClips(tr) {
        var out = [];
        for (var c = 0; c < tr.clips.numItems; c++) { var pi = null; try { pi = tr.clips[c].projectItem; } catch (e) { } if (isRangeItem(pi)) out.push(tr.clips[c]); }
        return out;
    }
    /** The track named "Renders" (any case), else -1. Only that track counts, so grading layers and Story's theme layers never export. */
    function rangeTrack(seq) {
        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
            var n = ''; try { n = String(seq.videoTracks[t].name); } catch (e) { }
            if (n.replace(/^\s+|\s+$/g, '').toLowerCase() === RANGE_TRACK.toLowerCase()) return t;
        }
        return -1;
    }
    /** a: {seqId} -> {track, trackName, ranges:[{name, start, end, disabled, nodeId}]} */
    fn.renderRanges = function (a) {
        var seq = U.needSeq(a.seqId), t = rangeTrack(seq), out = [], name = '';
        if (t < 0) return { track: -1, trackName: '', ranges: out };
        var list = rangeClips(seq.videoTracks[t]);
        for (var i = 0; i < list.length; i++) out.push({ name: list[i].name, start: list[i].start.seconds, end: list[i].end.seconds, disabled: !!list[i].disabled, nodeId: list[i].nodeId });
        try { name = seq.videoTracks[t].name; } catch (e) { }
        return { track: t, trackName: name, ranges: out };
    };
    /**
     * Put a render range on the "Renders" track (made on top the first time), using the project's adjustment layer
     * (or an invisible label clip when there is none). a: {seqId, name, start, end, binPath} -> {track, kind, placed, renamed, log}
     */
    fn.addRenderRange = function (a) {
        var seq = U.needSeq(a.seqId), P = U.labelParts, log = [], kind = 'adjustment';
        if (!(a.end > a.start)) throw U.err('BAD_INPUT', 'Empty range ' + a.start + '–' + a.end, 'That range is empty.', 'Set In and Out points around the part to render, or move the playhead into the edit.');
        var src = P.findAdjustmentLayer() || P.findByName(RANGE_ITEM);
        if (src && !P.isAdj(src)) kind = 'transparent';
        if (!src) {
            var made = P.makeLabelClip(seq, log);
            if (made) {
                src = made.item; kind = made.kind;
                if (kind !== 'adjustment') { try { src.name = RANGE_ITEM; } catch (e) { } }
                try { src.moveBin(U.ensureBin(a.binPath || 'JMG Ultra Studio/Deliver')); } catch (e) { }
            }
        }
        if (!src) throw U.err('HOST_SCRIPT', 'No way to make a range clip. ' + log.join('; '), 'Couldn’t add the render range.', 'Add an adjustment layer to the project (File › New › Adjustment Layer), then try again.');
        var t = rangeTrack(seq), named = true;
        if (t < 0) {
            t = seq.videoTracks.numTracks;
            P.ensureVideoTracks(seq, t + 1);
            if (seq.videoTracks.numTracks <= t) throw U.err('HOST_SCRIPT', 'Could not add a video track');
            try { U.openAndQE(seq).getVideoTrackAt(t).setName(RANGE_TRACK); } catch (e) { log.push('track name: ' + e); }
            named = rangeTrack(seq) === t;
        }
        var r = P.placeSections(seq.videoTracks[t], src, [{ name: a.name, start: a.start, end: a.end }], log);
        return { track: t, named: named, kind: kind, placed: r.placed, renamed: r.renamed, log: log };
    };

    // Premiere takes a sequence In/Out in seconds in some versions and ticks in others: check it took.
    // "None" reads as -400000 s and setting it clears the point (it may clear both), so that goes first.
    var NO_POINT = -400000;
    function setInOut(seq, i, o) {
        function put(v) {
            try {
                if (i < 0 || o < 0) { seq.setInPoint(v(NO_POINT)); seq.setOutPoint(v(NO_POINT)); if (i >= 0) seq.setInPoint(v(i)); if (o >= 0) seq.setOutPoint(v(o)); }
                else { seq.setOutPoint(v(o)); seq.setInPoint(v(i)); seq.setOutPoint(v(o)); }   // out first: a new In can't pass the old Out
            } catch (e) { }
        }
        function near(got, want) { return want < 0 ? true : Math.abs(got - want) < 0.01; }   // with a point cleared, Premiere may report the other as it likes
        function took() { try { return near(seq.getInPointAsTime().seconds, i) && near(seq.getOutPointAsTime().seconds, o); } catch (e) { return false; } }
        put(function (s) { return s; });
        if (!took()) put(function (s) { return U.secToTicks(s); });
        if (!took()) put(function (s) { return U.timeObj(s); });
        return took();
    }
    /**
     * Queue one part of a sequence in Media Encoder: its In/Out are set to the range while queuing (Media Encoder
     * takes a copy of the sequence then) and put back afterwards. a: {seqId, out, preset, start, end} -> {id, restored}
     */
    fn.queueRangeExport = function (a) {
        var seq = U.needSeq(a.seqId), hadIn = null, hadOut = null, id, restored = true;
        try { hadIn = seq.getInPointAsTime().seconds; hadOut = seq.getOutPointAsTime().seconds; } catch (e) { }
        app.encoder.launchEncoder();
        try {
            if (!setInOut(seq, a.start, a.end)) throw U.err('HOST_SCRIPT', 'Could not set In/Out to ' + a.start + '–' + a.end, 'Premiere didn’t take the range.', 'Check the sequence isn’t locked, then try again.');
            id = app.encoder.encodeSequence(seq, a.out, a.preset, 1 /* in to out */, a.removeWhenDone === false ? 0 : 1);
        } finally {
            if (hadIn != null) restored = setInOut(seq, hadIn, hadOut);
        }
        return { id: id, restored: restored, hadIn: hadIn, hadOut: hadOut };
    };
    /** The file extension a Media Encoder preset writes ('mp4', 'mov', …), or '' if Premiere can't tell. a: {seqId, preset} */
    fn.presetExtension = function (a) {
        var seq = U.needSeq(a.seqId), x = '';
        try { x = String(seq.getExportFileExtension(a.preset) || ''); } catch (e) { }
        return x.replace(/^\./, '');
    };
})(UStudio);
