// JMG Ultra Studio – Selects (Premiere side). ES3 only.
// Subclips are laid down whole so the timeline clips keep the subclip's range and colour label (tier colours).

/** a: {seqId, ids:[subclip ids], cursor?} -> {cursor, placed:[{start,end}|null]} */
UStudio.fn.selectsPlaceWhole = function (a) {
    var seq = UStudio.needSeq(a.seqId), track = seq.videoTracks[0];
    var cursor = a.cursor != null ? a.cursor : UStudio.ticksToSec(seq.end), placed = [];
    for (var i = 0; i < a.ids.length; i++) {
        var it = UStudio.itemById(a.ids[i]);
        if (!it) { placed.push(null); continue; }
        track.overwriteClip(it, cursor);
        var got = null, best = 1e9;
        for (var k = 0; k < track.clips.numItems; k++) { var d = Math.abs(track.clips[k].start.seconds - cursor); if (d < best) { best = d; got = track.clips[k]; } }
        if (got && best < 0.02) { placed.push({ start: got.start.seconds, end: got.end.seconds }); cursor = got.end.seconds; }
        else placed.push(null);
    }
    return { cursor: cursor, placed: placed };
};

/**
 * The camera clips a sequence uses, so they can be graded. a: {seqId, allTracks:false}
 * Skips graphics/titles, adjustment layers, nested sequences, stills and switched-off clips.
 * -> {name, uses:[{itemId, name, track, start, end, in, out, speed}], skipped:{graphics, adjustment, nested, stills, disabled}}
 */
UStudio.fn.selectsSequenceUses = function (a) {
    var seq = UStudio.needSeq(a.seqId), out = [], skipped = { graphics: 0, adjustment: 0, nested: 0, stills: 0, disabled: 0 };
    var STILL = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga|svg)$/i;
    var n = a.allTracks ? seq.videoTracks.numTracks : Math.min(1, seq.videoTracks.numTracks);
    for (var t = 0; t < n; t++) {
        var tr = seq.videoTracks[t];
        for (var c = 0; c < tr.clips.numItems; c++) {
            var ti = tr.clips[c], pi = null, path = '';
            try { pi = ti.projectItem; } catch (e) { }
            if (!pi) { skipped.graphics++; continue; }
            if (ti.disabled) { skipped.disabled++; continue; }
            try { if (ti.isMGT()) { skipped.graphics++; continue; } } catch (e) { }
            try { if (pi.isAdjustmentLayer()) { skipped.adjustment++; continue; } } catch (e) { }
            try { if (pi.isSequence()) { skipped.nested++; continue; } } catch (e) { }
            try { path = pi.getMediaPath() || ''; } catch (e) { }
            if (!path) { skipped.graphics++; continue; }
            if (STILL.test(path)) { skipped.stills++; continue; }
            var sp = 1; try { sp = ti.getSpeed(); } catch (e) { }
            out.push({ itemId: pi.nodeId, name: pi.name, track: t, start: ti.start.seconds, end: ti.end.seconds, 'in': ti.inPoint.seconds, out: ti.outPoint.seconds, speed: sp || 1 });
        }
    }
    return { name: seq.name, uses: out, skipped: skipped };
};

/** Attach a file as the proxy of a clip. a: {id, path} */
UStudio.fn.selectsAttachProxy = function (a) {
    var it = UStudio.needItem(a.id);
    if (!new File(a.path).exists) throw UStudio.err('NOT_FOUND', a.path);
    return it.attachProxy(a.path, 0);
};

/**
 * Full-size stills from source clips: each clip goes on a hidden sequence made like it (so the still is the clip's own
 * size) and Premiere renders the frame. a: {stills:[{id, seconds, out}]} -> [png path or null]
 */
UStudio.fn.selectsStills = function (a) {
    var U = UStudio, out = [], seqs = {}, BIN = 'JMG Ultra Studio/.stills', active = null;
    try { active = U.project().activeSequence; } catch (e) { }
    for (var i = 0; i < a.stills.length; i++) {
        var s = a.stills[i];
        try {
            var seq = seqs[s.id];
            if (!seq) {
                var r = JSON.parse(U.run('newSequence', JSON.stringify({ name: 'Ultra Studio stills', likeId: s.id, binPath: BIN })));
                if (!r.ok) throw new Error(r.error.detail);
                seq = seqs[s.id] = U.needSeq(r.data.id);
            }
            // a short piece starting at the frame, always at 0 (each still replaces the last)
            var p = JSON.parse(U.run('placeClips', JSON.stringify({ seqId: seq.sequenceID, clips: [{ id: s.id, 'in': s.seconds, out: s.seconds + 0.5, at: 0 }] })));
            if (!p.ok) throw new Error(p.error.detail);
            var base = s.out.replace(/\.png$/i, '');
            U.openAndQE(seq).exportFramePNG(U.framesToTC(0, seq), base);
            out.push(new File(base + '.png').exists ? base + '.png' : null);
        } catch (e) { out.push(null); }
    }
    for (var k in seqs) if (seqs.hasOwnProperty(k)) { try { U.project().deleteSequence(seqs[k]); } catch (e) { } }
    U.walk(U.project().rootItem, function (c) { if (c.type === 2 && c.name === '.stills') { try { c.deleteBin(); } catch (e) { } } });
    if (active) { try { U.project().openSequence(active.sequenceID); } catch (e) { } }
    return out;
};
