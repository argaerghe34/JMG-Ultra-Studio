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
    // our invisible clips (projects without an adjustment layer): render ranges, and Song Splitter's / Story's layers
    var RANGE_TRACK = 'Renders', RANGE_ITEM = 'Ultra Studio render range', LABEL_ITEM = 'Ultra Studio theme label';
    function isRangeItem(pi) {
        if (!pi) return false;
        if (U.labelParts.isAdj(pi)) return true;
        try { return pi.name === RANGE_ITEM || pi.name === LABEL_ITEM; } catch (e) { return false; }
    }
    function rangeClips(tr) {
        var out = [];
        for (var c = 0; c < tr.clips.numItems; c++) { var pi = null; try { pi = tr.clips[c].projectItem; } catch (e) { } if (isRangeItem(pi)) out.push(tr.clips[c]); }
        return out;
    }
    var trim = function (x) { return String(x).replace(/^\s+|\s+$/g, ''); };
    /**
     * The render-range track: the one named a.track (any case; "Renders" when not given), else -1. Only that track
     * counts, so grading layers and Story's theme layers never export unless you choose their track.
     */
    function rangeTrack(seq, want) {
        var w = trim(want || RANGE_TRACK).toLowerCase();
        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
            var n = ''; try { n = String(seq.videoTracks[t].name); } catch (e) { }
            if (trim(n).toLowerCase() === w) return t;
        }
        return -1;
    }
    /** A timeline clip's own colour label (0–15), or null when this Premiere can't say. */
    function labelOf(ti) { try { if (typeof ti.getColorLabel === 'function') { var l = Number(ti.getColorLabel()); return isFinite(l) ? l : null; } } catch (e) { } return null; }
    function rangeOf(ti) { return { name: ti.name, start: ti.start.seconds, end: ti.end.seconds, disabled: !!ti.disabled, nodeId: ti.nodeId, label: labelOf(ti) }; }
    /** a: {seqId, all?} -> {tracks:[{index, name, count}]} – every video track holding adjustment layers (or our range
        clips), top first; with all, every video track (count 0 for the ones without) */
    fn.rangeTracks = function (a) {
        var seq = U.needSeq(a.seqId), out = [];
        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
            var n = rangeClips(seq.videoTracks[t]).length, name = '';
            try { name = String(seq.videoTracks[t].name); } catch (e) { }
            if (n || a.all) out.push({ index: t, name: name, count: n });
        }
        return { tracks: out };
    };
    /** A new, empty video track on top of all the others for render ranges, named a.name (or “Renders 2”… if taken).
        a: {seqId, name?} -> {index, name, named, log} – name is what the track is really called */
    fn.addRangeTrack = function (a) {
        var seq = U.needSeq(a.seqId), P = U.labelParts, log = [], base = trim(a.name || RANGE_TRACK), want = base, k = 2;
        while (rangeTrack(seq, want) >= 0) want = base + ' ' + (k++);
        var t = seq.videoTracks.numTracks;
        P.ensureVideoTracks(seq, t + 1);
        if (seq.videoTracks.numTracks <= t) throw U.err('HOST_SCRIPT', 'Could not add a video track', 'Premiere didn’t add a track.', 'Add a video track in the Timeline (right-click a track › Add Track), then choose it here.');
        try { U.openAndQE(seq).getVideoTrackAt(t).setName(want); } catch (e) { log.push('track name: ' + e); }
        var name = ''; try { name = String(seq.videoTracks[t].name); } catch (e) { }
        return { index: t, name: name, named: trim(name).toLowerCase() === want.toLowerCase(), log: log };
    };
    /** a: {seqId, track?} -> {track, trackName, ranges:[{name, start, end, disabled, nodeId, label}], colours} */
    fn.renderRanges = function (a) {
        var seq = U.needSeq(a.seqId), t = rangeTrack(seq, a.track), out = [], name = '', colours = true;
        if (t < 0) return { track: -1, trackName: '', ranges: out, colours: colours };
        var list = rangeClips(seq.videoTracks[t]);
        for (var i = 0; i < list.length; i++) { var r = rangeOf(list[i]); if (r.label == null) colours = false; out.push(r); }
        try { name = seq.videoTracks[t].name; } catch (e) { }
        return { track: t, trackName: name, ranges: out, colours: colours };
    };
    /**
     * Put a render range on the chosen track (a.track, default "Renders"; made on top the first time), using the
     * project's adjustment layer (or an invisible label clip when there is none).
     * a: {seqId, name, start, end, track?, label?, binPath} -> {track, kind, placed, renamed, named, log}
     */
    fn.addRenderRange = function (a) {
        var seq = U.needSeq(a.seqId), P = U.labelParts, log = [], kind = 'adjustment', want = trim(a.track || RANGE_TRACK);
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
        var t = rangeTrack(seq, want), named = true;
        if (t < 0) {
            t = seq.videoTracks.numTracks;
            P.ensureVideoTracks(seq, t + 1);
            if (seq.videoTracks.numTracks <= t) throw U.err('HOST_SCRIPT', 'Could not add a video track');
            try { U.openAndQE(seq).getVideoTrackAt(t).setName(want); } catch (e) { log.push('track name: ' + e); }
            named = rangeTrack(seq, want) === t;
        }
        var r = P.placeSections(seq.videoTracks[t], src, [{ name: a.name, start: a.start, end: a.end, label: a.label }], log);
        return { track: t, named: named, kind: kind, placed: r.placed, renamed: r.renamed, log: log };
    };
    function needRange(seq, a) {
        var t = rangeTrack(seq, a.track);
        if (t >= 0) { var list = rangeClips(seq.videoTracks[t]); for (var i = 0; i < list.length; i++) if (list[i].nodeId === a.nodeId) return { t: t, ti: list[i] }; }
        throw U.err('NOT_FOUND', 'Render range ' + a.nodeId + ' on ' + (a.track || RANGE_TRACK), 'That render range isn’t on the timeline any more.', 'Press Refresh in Deliver › Render ranges.');
    }
    /**
     * Change a render range: its name, colour, start and/or end (seconds). A new start or end lays the layer again
     * (an adjustment layer can't be stretched before its own start), keeping its name and colour.
     * a: {seqId, track, nodeId, name?, label?, start?, end?} -> {range, log}
     */
    fn.editRenderRange = function (a) {
        var seq = U.needSeq(a.seqId), f = needRange(seq, a), ti = f.ti, log = [], old = rangeOf(ti);
        var name = a.name != null && trim(a.name) ? trim(a.name) : old.name;
        var start = a.start != null ? Number(a.start) : old.start, end = a.end != null ? Number(a.end) : old.end;
        if (!(end > start) || start < 0) throw U.err('BAD_INPUT', 'Range ' + start + '–' + end, 'That range is empty.', 'Make the end later than the start.');
        var moved = Math.abs(start - old.start) > 0.001 || Math.abs(end - old.end) > 0.001;
        var recolour = a.label != null && a.label !== old.label;
        if (recolour && !moved) {
            var took = false;
            try { if (typeof ti.setColorLabel === 'function') { ti.setColorLabel(a.label); took = labelOf(ti) === a.label; } } catch (e) { log.push('colour: ' + e); }
            if (!took) moved = true;   // no clip colours by script here: lay it again in the new colour
        }
        if (!moved) {
            if (name !== old.name) { try { ti.name = name; } catch (e) { log.push('rename: ' + e); } }
            return { range: rangeOf(ti), log: log };
        }
        var src = null; try { src = ti.projectItem; } catch (e) { }
        if (!src) throw U.err('HOST_SCRIPT', 'No project item behind range ' + old.name, 'Couldn’t change that render range.', 'Delete it and add it again.');
        var label = a.label != null ? a.label : old.label, track = seq.videoTracks[f.t];
        ti.remove(false, false);
        var r = U.labelParts.placeSections(track, src, [{ name: name, start: start, end: end, label: label }], log);
        if (!r.placed) throw U.err('HOST_SCRIPT', 'Range not placed again: ' + log.join('; '), 'Couldn’t move that render range.', 'Check the track isn’t locked, then add it again.');
        var list = rangeClips(track), got = null;
        for (var i = 0; i < list.length; i++) if (Math.abs(list[i].start.seconds - start) < 0.02) got = list[i];
        return { range: got ? rangeOf(got) : { name: name, start: start, end: end, label: label }, log: log };
    };
    /** a: {seqId, track, nodeId} -> {removed: 1} */
    fn.removeRenderRange = function (a) {
        var seq = U.needSeq(a.seqId), f = needRange(seq, a);
        f.ti.remove(false, false);
        return { removed: 1 };
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
