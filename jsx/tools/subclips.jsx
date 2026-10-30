// JMG Ultra Studio – Subclip Maker (Premiere side, ES3): a subclip of each clip in a bin, restricted to the clip's own
// In/Out (the whole clip when none are set), so long clips show only the chosen part in thumbnails and scrubbing.
(function (U) {
    var fn = U.fn;
    function col(it, name) { try { return U.columns(it)['Column.Intrinsic.' + name]; } catch (e) { return undefined; } }
    function isSubclip(it) { var s = col(it, 'SubclipStart'); return s !== undefined && s !== ''; }
    function directClips(bin) {
        var out = [];
        for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i], seq = false;
            if (c.type !== 1) continue;
            try { seq = c.isSequence(); } catch (e) { }
            if (!seq) out.push(c);
        }
        return out;
    }
    function names(bin) { var o = []; if (bin) for (var i = 0; i < bin.children.numItems; i++) o.push(bin.children[i].name); return o; }
    function findBin(path) {
        var hit = null, want = String(path);
        U.walk(U.project().rootItem, function (c) { if (c.type === 2 && U.binPath(c) === want) { hit = c; return false; } });
        return hit;
    }

    /** The clips used on a sequence's video and audio tracks, each stretch of source once, in timeline order. */
    function timelineClips(seq) {
        var out = [], seen = {};
        function add(tracks) {
            for (var t = 0; t < tracks.numTracks; t++) {
                var tr = tracks[t];
                for (var c = 0; c < tr.clips.numItems; c++) {
                    var ti = tr.clips[c], pi = null, seqItem = false;
                    try { pi = ti.projectItem; } catch (e) { }
                    if (!pi || pi.type !== 1) continue;
                    try { seqItem = pi.isSequence(); } catch (e) { }
                    if (seqItem || U.labelParts.isAdj(pi)) continue;
                    var ip = ti.inPoint, op = ti.outPoint, k = pi.nodeId + '|' + Math.round(ip.seconds * 100) + '|' + Math.round(op.seconds * 100);
                    if (seen[k]) continue;   // the audio of a clip already taken from its video
                    seen[k] = true;
                    var dur = Number(col(pi, 'MediaDuration') || 0);
                    out.push({ id: pi.nodeId, name: pi.name, inTicks: String(ip.ticks), outTicks: String(op.ticks), 'in': ip.seconds, out: op.seconds, whole: false, start: ti.start.seconds, dur: dur ? dur / U.TICKS : 0 });
                }
            }
        }
        add(seq.videoTracks); add(seq.audioTracks);
        return out;
    }
    /**
     * What to make subclips of, and where they go. a: {from: 'bin' (default) | 'timeline', binId, seqId, into?: {binId} | {name}}
     * bin: the clips in the bin (not its sub-bins) with their own In/Out, oldest first by timecode; timeline: the clips on
     * the sequence with the part used, in timeline order. Into "<bin> – Subclips" next to the bin ("<sequence> – Subclips"
     * at the top for the timeline) unless a bin is chosen or named.
     * -> {source, target, targetPath, existing:[names], clips:[{id, name, inTicks, outTicks, in, out, whole, start, dur}]}
     */
    fn.subRead = function (a) {
        var clips = [], source = '', parentParts = [], target = '';
        if (a.from === 'timeline') {
            var seq = U.needSeq(a.seqId);
            source = seq.name; target = seq.name + ' – Subclips';
            clips = timelineClips(seq);
        } else {
            var bin = U.needItem(a.binId), path = U.binPath(bin), list = directClips(bin);
            source = path; parentParts = path.split(' / ').slice(0, -1); target = bin.name + ' – Subclips';
            for (var i = 0; i < list.length; i++) {
                var it = list[i]; if (isSubclip(it)) continue;
                var ip = it.getInPoint(), op = it.getOutPoint(), dur = col(it, 'MediaDuration'), whole = false;
                // nothing set: Premiere reports the whole clip (In at the start, Out at the end)
                if (dur) whole = Number(ip.ticks) <= 0 && Math.abs(Number(op.ticks) - Number(dur)) < U.TICKS / 10;
                clips.push({ id: it.nodeId, name: it.name, inTicks: String(ip.ticks), outTicks: String(op.ticks), 'in': ip.seconds, out: op.seconds, whole: whole, start: Number(col(it, 'MediaStart') || 0), dur: dur ? Number(dur) / U.TICKS : 0 });
            }
        }
        var targetPath = parentParts.concat([target]).join(' / ');
        if (a.into && a.into.binId) { var tb = U.needItem(a.into.binId); targetPath = U.binPath(tb); target = tb.name; }
        else if (a.into && a.into.name) { target = String(a.into.name).replace(/[\/]+/g, '-'); targetPath = parentParts.concat([target]).join(' / '); }
        return { source: source, bin: source, target: target, targetPath: targetPath, existing: names(findBin(targetPath)), clips: clips };
    };

    /**
     * Make the subclips. a: {targetPath, items:[{id, name, inTicks, outTicks}], conflicts:[names], mode:'replace'|'add'}
     * replace: earlier subclips with the same names move to "<target> – earlier" (scripts can't delete clips).
     * -> {made, moved, failed:[names], earlierPath}
     */
    fn.subMake = function (a) {
        var target = U.ensureBin(a.targetPath.split(' / ').join('/')), moved = 0, earlierPath = '';
        if (a.mode === 'replace' && a.conflicts && a.conflicts.length) {
            earlierPath = a.targetPath + ' – earlier';
            var earlier = U.ensureBin(earlierPath.split(' / ').join('/')), want = {};
            for (var k = 0; k < a.conflicts.length; k++) want[a.conflicts[k]] = true;
            for (var j = target.children.numItems - 1; j >= 0; j--) { var c = target.children[j]; if (c.type === 1 && want[c.name]) { c.moveBin(earlier); moved++; } }
        }
        var made = 0, failed = [];
        for (var i = 0; i < a.items.length; i++) {
            var s = a.items[i], it = U.needItem(s.id), sc = null;
            // hasHardBoundaries 1: restricted In/Out; takeVideo, takeAudio
            try { sc = it.createSubClip(s.name, s.inTicks, s.outTicks, 1, 1, 1); } catch (e) { sc = null; }
            if (sc) { sc.moveBin(target); made++; } else failed.push(s.name);
        }
        return { made: made, moved: moved, failed: failed, earlierPath: earlierPath };
    };
})(UStudio);
