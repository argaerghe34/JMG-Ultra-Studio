// JMG Ultra Studio – Story (Premiere side). ES3 only.
(function () {
    var U = UStudio, fn = U.fn;

    function xmpField(item, name) {
        try { var m = new RegExp('Column\\.Intrinsic\\.' + name + '>([^<]*)<').exec(item.getProjectMetadata()); return m ? m[1] : ''; } catch (e) { return ''; }
    }
    function clipTiming(item) {
        var c = U.columns(item), fps = 25, drop = false;
        var tb = String(c['Column.Intrinsic.MediaTimebase'] || '');
        var m = /([\d.]+)\s*fps/i.exec(tb);
        if (m) fps = Number(m[1]);
        var startTicks = c['Column.Intrinsic.MediaStart'] ? Number(c['Column.Intrinsic.MediaStart']) : 0;
        drop = xmpField(item, 'MediaStart').indexOf(';') >= 0;
        return { fps: fps, drop: drop, start: startTicks / U.TICKS, audioOnly: !m };
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    /** seconds of media timecode -> "HH:MM:SS:FF" (drop-frame aware for 29.97/59.94) */
    function tc(sec, t) {
        var base = Math.round(t.fps) || 25, frames = Math.round(sec * (t.fps || 25));
        if (t.drop && (base === 30 || base === 60)) {
            var d = base === 60 ? 4 : 2, perMin = base * 60 - d, per10 = base * 600 - d * 9;
            var tens = Math.floor(frames / per10), rem = frames % per10;
            frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
        }
        var ff = frames % base, s = Math.floor(frames / base);
        var sep = t.drop ? ';' : ':';
        return pad2(Math.floor(s / 3600)) + sep + pad2(Math.floor((s % 3600) / 60)) + sep + pad2(s % 60) + sep + pad2(ff);
    }

    /** Every clip with media (no sequences). Subclips are flagged when they share a path with their master. a.paths optional filter. */
    fn.storyClips = function (a) {
        var byPath = {}, out = [], want = null, i;
        if (a && a.paths && a.paths.length) { want = {}; for (i = 0; i < a.paths.length; i++) want[a.paths[i]] = true; }
        U.walk(U.project().rootItem, function (c) {
            if (c.type !== 1) return;
            var isSeq = false; try { isSeq = c.isSequence(); } catch (e) { }
            if (isSeq) return;
            var p = ''; try { p = c.getMediaPath() || ''; } catch (e) { }
            if (!p) return;
            if (want && !want[p]) return;
            var o = { id: c.nodeId, name: c.name, path: p, bin: U.binPath(c), sub: false };
            out.push(o);
            (byPath[p] = byPath[p] || []).push({ o: o, item: c });
        });
        for (var p in byPath) {
            if (!byPath.hasOwnProperty(p) || byPath[p].length < 2) continue;
            for (i = 0; i < byPath[p].length; i++) {
                var cc = U.columns(byPath[p][i].item);
                byPath[p][i].o.sub = !!cc['Column.Intrinsic.SubclipStart'];
            }
        }
        return out;
    };

    /** Media start (timecode offset in seconds) and frame rate for clips: a.ids */
    fn.storyTiming = function (a) {
        var out = {};
        for (var i = 0; i < a.ids.length; i++) { var it = U.itemById(a.ids[i]); if (it) out[a.ids[i]] = clipTiming(it); }
        return out;
    };

    /** Open a clip in the Source Monitor at a time (seconds from the start of the media) and optionally play. */
    fn.storyCue = function (a) {
        var it = U.needItem(a.id);
        app.sourceMonitor.openProjectItem(it);
        var t = clipTiming(it);
        app.enableQE();
        var p = qe.source.player;
        try { p.stop(); } catch (e) { }
        p.startScrubbing(); p.scrubTo(tc(t.start + Math.max(0, a.seconds || 0), t)); p.endScrubbing();
        if (a.play) app.sourceMonitor.play(1);
        return { position: app.sourceMonitor.getPosition().seconds, timing: t };
    };
    fn.storyStop = function () { try { app.enableQE(); qe.source.player.stop(); } catch (e) { } return true; };

    /* ---------- placing lines with a colour label ----------
       A timeline clip takes the label of its project item when it is placed.
       "relabel" (default): give the source clip the theme colour, place it, then put the clip's own label back (no clutter).
       "subclips" (fallback): make a labelled subclip per line and place it whole (the Selects way; leaves a bin of subclips). */
    function clipAt(track, t) {
        var got = null, best = 1e9;
        for (var k = 0; k < track.clips.numItems; k++) { var d = Math.abs(track.clips[k].start.seconds - t); if (d < best) { best = d; got = track.clips[k]; } }
        return best < 0.02 ? got : null;
    }
    /** a: {seqId, clips:[{id, in, out, label?, name?}], cursor, method:'relabel'|'subclips', binPath} -> {cursor, placed:[{start,end}|null], method} */
    fn.storyPlace = function (a) {
        var seq = U.needSeq(a.seqId), cursor = a.cursor, placed = [], i;
        if (a.method === 'subclips') return placeAsSubclips(a, seq);
        for (i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], it = U.needItem(c.id), orig = null, changed = false, r = null;
            if (c.label != null) {
                try { orig = it.getColorLabel(); if (orig !== c.label) { it.setColorLabel(c.label); changed = true; } } catch (e) { }
            }
            try { r = fn.placeClips({ seqId: a.seqId, clips: [{ id: c.id, 'in': c['in'], out: c.out }], cursor: cursor }); }
            finally { if (changed) { try { it.setColorLabel(orig); } catch (e2) { } } }
            placed.push(r.placed[0]);
            cursor = r.cursor;
        }
        return { cursor: cursor, placed: placed, method: 'relabel' };
    };
    function placeAsSubclips(a, seq) {
        var bin = U.ensureBin(a.binPath || 'JMG Ultra Studio/Story/Story clips'), track = seq.videoTracks[0], cursor = a.cursor, placed = [];
        for (var i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], it = U.needItem(c.id);
            var sc = it.createSubClip(c.name || it.name, U.secToTicks(c['in']), U.secToTicks(c.out), 0, 1, 1);
            if (!sc) throw U.err('HOST_SCRIPT', 'createSubClip failed for ' + it.name);
            try { sc.moveBin(bin); } catch (e) { }
            if (c.label != null) { try { sc.setColorLabel(c.label); } catch (e) { } }
            track.overwriteClip(sc, cursor);
            var got = clipAt(track, cursor);
            if (got) { placed.push({ start: got.start.seconds, end: got.end.seconds }); cursor = got.end.seconds; }
            else { placed.push(null); cursor += c.out - c['in']; }
        }
        return { cursor: cursor, placed: placed, method: 'subclips' };
    }

    /* ---------- theme names above the clips (adjustment layer, or invisible label clips) ---------- */
    var LABEL_CLIP_NAME = 'Ultra Studio theme label';
    function isAdj(it) { try { return !!it.isAdjustmentLayer(); } catch (e) { return false; } }
    function findAdjustmentLayer() {
        var found = null;
        U.walk(U.project().rootItem, function (c) { if (c.type === 1 && isAdj(c)) { found = c; return false; } });
        return found;
    }
    function findByName(name) {
        var found = null;
        U.walk(U.project().rootItem, function (c) { if (c.type === 1 && c.name === name) { found = c; return false; } });
        return found;
    }
    function snapshotIds() { var o = {}; U.walk(U.project().rootItem, function (c) { o[c.nodeId] = true; }); return o; }
    function newItemSince(before) { var hit = null; U.walk(U.project().rootItem, function (c) { if (c.type === 1 && !before[c.nodeId]) { hit = c; return false; } }); return hit; }
    // host methods may not support .apply, so call with an explicit number of arguments
    function callN(obj, name, args) {
        switch (args.length) {
            case 2: return obj[name](args[0], args[1]);
            case 3: return obj[name](args[0], args[1], args[2]);
            case 5: return obj[name](args[0], args[1], args[2], args[3], args[4]);
            default: return obj[name](args[0], args[1], args[2], args[3], args[4], args[5]);
        }
    }
    /** Make a clip to carry theme names: an adjustment layer if this Premiere exposes a way, else transparent video. */
    function makeLabelClip(seq, log) {
        app.enableQE();
        var qp = qe.project, before = snapshotIds(), names = [], i, k, made;
        try { var ms = qp.reflect.methods; for (i = 0; i < ms.length; i++) names.push(ms[i].name); } catch (e) { log.push('reflect: ' + e); }
        var w = seq.frameSizeHorizontal, h = seq.frameSizeVertical, tb = String(seq.timebase);
        // fullest argument lists first; never call with none (a bare call could open a settings dialog and stall Premiere)
        // verified in 26.5: newTransparentVideo(width, height, ticksPerFrame, parNum, parDen) -> true, no dialog
        var shapes = [[w, h, Number(tb), 1, 1], [w, h, tb, 1, 1], [w, h, Number(tb)], [w, h]];
        var tries = [];
        for (i = 0; i < names.length; i++) if (/adjust/i.test(names[i])) tries.push(names[i]);
        tries.push('newTransparentVideo');
        for (i = 0; i < tries.length; i++) {
            if (typeof qp[tries[i]] !== 'function' && !U.contains(names, tries[i])) continue;
            for (k = 0; k < shapes.length; k++) {
                try { callN(qp, tries[i], shapes[k]); } catch (e) { log.push(tries[i] + '(' + shapes[k].length + ' args): ' + e); }
                made = newItemSince(before);
                if (made) return { item: made, kind: isAdj(made) ? 'adjustment' : 'transparent', how: tries[i] + '(' + shapes[k].length + ' args)' };
            }
        }
        return null;
    }
    function ensureVideoTracks(seq, n) {
        var add = n - seq.videoTracks.numTracks;
        if (add <= 0) return;
        var q = U.openAndQE(seq);
        q.addTracks(add, seq.videoTracks.numTracks, 0, 1, seq.audioTracks.numTracks, 0, 0, 0);
    }
    /**
     * a: {seqId, sections:[{name, start, end, label?}], binPath}. One clip per section on a new top video track,
     * named after the theme. Uses the project's adjustment layer (or makes an invisible label clip).
     * Returns {kind:'adjustment'|'transparent', how, track, placed, renamed, log}.
     */
    /** The clip that carries names: the project's adjustment layer, our label clip, or a new one. -> {src, kind, how} */
    function labelSource(seq, a, log, what) {
        var src = findAdjustmentLayer(), kind = 'adjustment', how = 'existing adjustment layer';
        if (!src) { src = findByName(LABEL_CLIP_NAME); if (src) { kind = isAdj(src) ? 'adjustment' : 'transparent'; how = 'reused label clip'; } }
        if (!src && a.create === false) throw U.err('NOTHING_FOUND', 'No adjustment layer and creating label clips is off.', 'There’s no adjustment layer in this project.', 'Add one with File › New › Adjustment Layer, then try again.');
        if (!src) {
            var made = makeLabelClip(seq, log);
            if (made) {
                src = made.item; kind = made.kind; how = made.how;
                try { src.name = LABEL_CLIP_NAME; } catch (e) { }
                try { src.moveBin(U.ensureBin(a.binPath || 'JMG Ultra Studio/Story')); } catch (e) { }
            }
        }
        if (!src) throw U.err('HOST_SCRIPT', 'No way to make a label clip. ' + log.join('; '), 'Couldn’t add the ' + (what || 'theme layer') + '.', 'Add an adjustment layer to the project (File › New › Adjustment Layer), then try again.');
        return { src: src, kind: kind, how: how };
    }
    function topFreeTrack(seq) { var top = 0; for (var t = 0; t < seq.videoTracks.numTracks; t++) if (seq.videoTracks[t].clips.numItems) top = t + 1; ensureVideoTracks(seq, top + 1); return top; }
    /** One label clip per section on a track: named and coloured per section, exact length. -> {placed, renamed} */
    function placeSections(track, src, sections, log) {
        var placed = 0, renamed = 0, origName = src.name, origLabel = null, i;
        try { origLabel = src.getColorLabel(); } catch (e) { }
        try {
            for (i = 0; i < sections.length; i++) {
                var s = sections[i], dur = s.end - s.start;
                if (!(dur > 0)) continue;
                // the timeline clip takes the item's name and label as it is placed
                try { src.name = s.name; } catch (e) { log.push('item rename: ' + e); }
                if (s.label != null) { try { src.setColorLabel(s.label); } catch (e) { } }
                try { src.setInPoint(0, 4); src.setOutPoint(dur, 4); } catch (e) { log.push('in/out: ' + e); }
                track.overwriteClip(src, s.start);
                var got = clipAt(track, s.start);
                if (!got) { log.push('not placed at ' + s.start); continue; }
                placed++;
                if (Math.abs(got.end.seconds - s.end) > 0.02) {
                    try { got.end = U.timeObj(s.end); } catch (e) { log.push('end (Time): ' + e); }
                    if (Math.abs(got.end.seconds - s.end) > 0.02) { try { got.end = U.secToTicks(s.end); } catch (e) { log.push('end (ticks): ' + e); } }
                    if (Math.abs(got.end.seconds - s.end) > 0.02) log.push('length ' + got.end.seconds + ' vs ' + s.end);
                }
                if (got.name !== s.name) { try { got.name = s.name; } catch (e) { log.push('clip rename: ' + e); } }
                if (got.name === s.name) renamed++;
            }
        } finally {
            try { src.name = origName; } catch (e) { }
            if (origLabel != null) { try { src.setColorLabel(origLabel); } catch (e) { } }
            try { src.clearInPoint(); src.clearOutPoint(); } catch (e) { }
        }
        return { placed: placed, renamed: renamed };
    }
    /**
     * a: {seqId, sections:[{name, start, end, label?}], binPath, create}. One clip per section on a new top video track,
     * named after the theme. Uses the project's adjustment layer (or makes an invisible label clip).
     * Returns {kind:'adjustment'|'transparent', how, track, placed, renamed, log}.
     */
    fn.storyThemeLayers = function (a) {
        var seq = U.needSeq(a.seqId), log = [], L = labelSource(seq, a, log);
        var top = topFreeTrack(seq);
        var r = placeSections(seq.videoTracks[top], L.src, a.sections, log);
        return { kind: L.kind, how: L.how, track: top, placed: r.placed, renamed: r.renamed, log: log };
    };

    /* ---------- highlights on a string-out ---------- */
    function trackByName(seq, name) { for (var t = 0; t < seq.videoTracks.numTracks; t++) { try { if (seq.videoTracks[t].name === name) return t; } catch (e) { } } return -1; }
    function isLabelItem(pi) { if (!pi) return false; if (isAdj(pi)) return true; try { return pi.name === LABEL_CLIP_NAME; } catch (e) { return false; } }
    /** Remove our label clips (adjustment layer / label clip) from a track; anything else stays. -> count */
    function clearLabelClips(track) {
        var n = 0;
        for (var k = track.clips.numItems - 1; k >= 0; k--) { var ti = track.clips[k], pi = null; try { pi = ti.projectItem; } catch (e) { } if (isLabelItem(pi)) { ti.remove(false, false); n++; } }
        return n;
    }
    /** Our highlight track: one named a.trackName, else the index we used last time (if it only holds our clips). */
    function highlightTrack(seq, a) {
        var idx = trackByName(seq, a.trackName || 'Selects');
        if (idx < 0 && a.trackIndex != null && a.trackIndex < seq.videoTracks.numTracks) {
            var tr = seq.videoTracks[a.trackIndex], ours = true;
            for (var k = 0; k < tr.clips.numItems; k++) { var pi = null; try { pi = tr.clips[k].projectItem; } catch (e) { } if (!isLabelItem(pi)) ours = false; }
            if (ours) idx = a.trackIndex;
        }
        return idx;
    }
    /**
     * Highlight selected lines on a string-out. a: {seqId, sections:[{name, start, end, label}], trackName:'Selects', trackIndex?, binPath, create}.
     * Re-running replaces the old highlights on that track. -> {kind, how, track, named, placed, renamed, removed, log}
     */
    fn.storyHighlights = function (a) {
        var seq = U.needSeq(a.seqId), log = [], name = a.trackName || 'Selects', removed = 0;
        var idx = highlightTrack(seq, a);
        if (idx >= 0) removed = clearLabelClips(seq.videoTracks[idx]);
        else {
            idx = topFreeTrack(seq);
            try { var q = U.openAndQE(seq); q.getVideoTrackAt(idx).setName(name); } catch (e) { log.push('track name: ' + e); }
        }
        var L = labelSource(seq, a, log, 'highlights');
        var r = placeSections(seq.videoTracks[idx], L.src, a.sections, log);
        var named = false; try { named = seq.videoTracks[idx].name === name; } catch (e) { }
        return { kind: L.kind, how: L.how, track: idx, named: named, placed: r.placed, renamed: r.renamed, removed: removed, log: log };
    };
    /** a: {seqId, trackName, trackIndex?} -> {removed} */
    fn.storyRemoveHighlights = function (a) {
        var seq = U.needSeq(a.seqId), idx = highlightTrack(seq, a);
        return { removed: idx >= 0 ? clearLabelClips(seq.videoTracks[idx]) : 0, track: idx };
    };

    /** Timecode of a sequence: its start (zero point, seconds), frame rate and drop-frame display. */
    fn.storySequenceTiming = function (a) {
        var seq = U.needSeq(a.seqId), fmt = seq.videoDisplayFormat, zero = 0;
        try { zero = U.ticksToSec(seq.zeroPoint); } catch (e) { }
        return { zero: zero, fps: U.seqFps(seq), drop: fmt === 102 || fmt === 106, displayFormat: fmt, name: seq.name };
    };

    /** Path of the open project, saving it first when a.save is set (Premiere keeps its transcripts inside it). */
    fn.storyProjectFile = function (a) {
        var pr = U.project();
        if (!pr.path) throw U.err('NO_PROJECT', 'Project has no path (unsaved or a Team Project).', 'This project hasn’t been saved to a file yet.', 'Save the project in Premiere (File › Save), then try again.');
        if (a && a.save) pr.save();
        return { path: pr.path, name: pr.name };
    };

    /**
     * Premiere captions on a sequence from an SRT file: a caption track you can style (Essential Graphics) and edit.
     * a: {seqId, srt, binPath} -> {itemId}
     */
    fn.storyCaptions = function (a) {
        var seq = U.needSeq(a.seqId);
        var imp = JSON.parse(U.run('importFiles', JSON.stringify({ paths: [a.srt], binPath: a.binPath || 'JMG Ultra Studio/Captions' })));
        var id = imp.ok && imp.data && imp.data[0] ? imp.data[0].id : null;
        if (!id) throw U.err('HOST_SCRIPT', 'Caption file not imported: ' + a.srt, 'Premiere couldn’t read the captions file.', 'Try again. If it keeps happening, send the activity log.');
        U.project().openSequence(seq.sequenceID);
        if (!seq.createCaptionTrack(U.needItem(id), 0, Sequence.CAPTION_FORMAT_SUBTITLE)) throw U.err('HOST_SCRIPT', 'createCaptionTrack returned false', 'Premiere didn’t add the captions.', 'Check the sequence isn’t locked, then try again.');
        return { itemId: id };
    };
})();
