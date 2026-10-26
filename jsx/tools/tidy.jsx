// JMG Ultra Studio – project check (Premiere side, ES3): what's used, unused, offline or imported twice. Never deletes.
(function (U) {
    var fn = U.fn;
    /** -> {items:[{id, name, path, bin, offline, used, subclip, sequence}], sequences} */
    fn.tidyAudit = function () {
        var P = U.project(), usedId = {}, usedPath = {}, s, t, c, seqs = P.sequences;
        for (s = 0; s < seqs.numSequences; s++) {
            var sq = seqs[s], groups = [sq.videoTracks, sq.audioTracks];
            for (var g = 0; g < 2; g++) for (t = 0; t < groups[g].numTracks; t++) {
                var tr = groups[g][t];
                for (c = 0; c < tr.clips.numItems; c++) {
                    var pi = null; try { pi = tr.clips[c].projectItem; } catch (e) { }
                    if (!pi) continue;
                    usedId[pi.nodeId] = true;
                    try { var mp = pi.getMediaPath(); if (mp) usedPath[mp] = true; } catch (e) { }
                }
            }
        }
        var items = [];
        U.walk(P.rootItem, function (it) {
            if (it.type === 2 || it.type === 3) return;   // bins
            var o = { id: it.nodeId, name: it.name, path: '', bin: '', offline: false, used: !!usedId[it.nodeId], subclip: false, sequence: false };
            try { o.sequence = it.isSequence(); } catch (e) { }
            try { o.path = it.getMediaPath() || ''; } catch (e) { }
            try { o.offline = it.isOffline(); } catch (e) { }
            try { o.bin = U.binPath(it); } catch (e) { }
            if (o.path && !o.sequence) { try { var cc = U.columns(it); o.subclip = !!(cc['Column.Intrinsic.SubclipStart'] && cc['Column.Intrinsic.SubclipEnd']); } catch (e) { } }
            if (!o.used && o.path && usedPath[o.path]) o.used = true;   // a subclip or another copy of it is used
            items.push(o);
        });
        return { items: items, sequences: seqs.numSequences };
    };
    /** Move items into a bin (made if needed). a: {ids, binPath} -> count */
    fn.tidyMove = function (a) {
        var bin = U.ensureBin(a.binPath), n = 0;
        for (var i = 0; i < a.ids.length; i++) { var it = U.itemById(a.ids[i]); if (it) { it.moveBin(bin); n++; } }
        return n;
    };
})(UStudio);
