// JMG Ultra Studio – MC Selects (Premiere side, ES3): the cuts of a multicam edit and each camera's clips, and the
// selects sequence built from them. Which camera each cut shows isn't scriptable; the panel reads it from the saved project.
(function (U) {
    var fn = U.fn;
    function isMc(pi) { try { return !!pi && pi.isMulticamClip(); } catch (e) { return false; } }
    function mediaPath(pi) { try { return pi.getMediaPath(); } catch (e) { return ''; } }
    /** The multicam source sequence behind a multicam project item. */
    function sourceSeqOf(pi) {
        var seqs = U.project().sequences;
        for (var i = 0; i < seqs.numSequences; i++) { var p = null; try { p = seqs[i].projectItem; } catch (e) { } if (p && p.nodeId === pi.nodeId) return seqs[i]; }
        return null;
    }
    /**
     * a: {seqId} -> {name, itemId, other, cuts:[{index, start, end, startTicks, endTicks, in, out, mcId, disabled}],
     * multicams:{mcId: {name, found, angles:[{index, clips:[{itemId, name, path, start, end, in}]}]}}}
     * cut in/out are times in the multicam source sequence; a camera clip's start/end are too, its "in" is media time.
     */
    fn.mcRead = function (a) {
        var seq = U.needSeq(a.seqId), tr = seq.videoTracks[0], cuts = [], mcs = {}, other = 0, itemId = '';
        try { itemId = seq.projectItem.nodeId; } catch (e) { }
        for (var c = 0; c < tr.clips.numItems; c++) {
            var ti = tr.clips[c], pi = null; try { pi = ti.projectItem; } catch (e) { }
            if (!isMc(pi)) { other++; continue; }
            cuts.push({ index: c, start: ti.start.seconds, end: ti.end.seconds, startTicks: String(ti.start.ticks), endTicks: String(ti.end.ticks),
                'in': ti.inPoint.seconds, out: ti.outPoint.seconds, mcId: pi.nodeId, disabled: !!ti.disabled });
            if (mcs[pi.nodeId]) continue;
            var src = sourceSeqOf(pi), angles = [];
            if (src) for (var t = 0; t < src.videoTracks.numTracks; t++) {
                var st = src.videoTracks[t], clips = [];
                for (var k = 0; k < st.clips.numItems; k++) {
                    var sc = st.clips[k], sp = null; try { sp = sc.projectItem; } catch (e) { }
                    clips.push({ itemId: sp ? sp.nodeId : '', name: sc.name, path: sp ? mediaPath(sp) : '', start: sc.start.seconds, end: sc.end.seconds, 'in': sc.inPoint.seconds });
                }
                angles.push({ index: t, clips: clips });
            }
            mcs[pi.nodeId] = { name: pi.name, found: !!src, angles: angles };
        }
        return { name: seq.name, itemId: itemId, cuts: cuts, multicams: mcs, other: other };
    };

    /**
     * A new sequence with the pieces back to back, picture only unless a.audio. Each piece takes its camera's label colour.
     * a: {name, binPath, likeId, audio, pieces:[{itemId, in, out, label?}]} -> {id, name, placed}
     */
    fn.mcBuild = function (a) {
        var made = fn.newSequence({ name: a.name, binPath: a.binPath || 'JMG Ultra Studio/MC Selects', likeId: a.likeId });
        var cursor = 0, placed = 0;
        for (var i = 0; i < a.pieces.length; i++) {
            var p = a.pieces[i], it = U.needItem(p.itemId), had = null;
            // the timeline clip takes the item's label as it's placed; the clip in the bin keeps its own
            if (p.label != null) { try { had = it.getColorLabel(); it.setColorLabel(p.label); } catch (e) { had = null; } }
            try {
                var r = fn.placeClips({ seqId: made.id, cursor: cursor, clips: [{ id: p.itemId, 'in': p['in'], out: p.out, audio: !!a.audio }] });
                cursor = r.cursor; if (r.placed[0]) placed++;
            } finally { if (had != null) { try { it.setColorLabel(had); } catch (e) { } } }
        }
        try { U.project().openSequence(made.id); } catch (e) { }
        return { id: made.id, name: made.name, placed: placed };
    };
})(UStudio);
