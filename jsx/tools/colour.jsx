// JMG Ultra Studio – Colour (Premiere side, ES3). Works through Premiere's own Lumetri Color effect:
// every look, grade and camera match is an ordinary Lumetri instance the editor can open and tweak.
(function (U) {
    var fn = U.fn;
    var LUMETRI = 'Lumetri Color';
    // Lumetri property indices in Premiere 26.x (verified by probing): name -> index
    var P = { inputLut: 6, temperature: 14, tint: 15, saturation: 16, exposure: 19, contrast: 20, highlights: 21, shadows: 22, whites: 23, blacks: 24,
              look: 34, intensity: 38, faded: 40, sharpen: 41, vibrance: 42, creativeSat: 43, vignette: 110 };
    // Ultra Studio's own Lumetri is marked by a Vignette Feather of 50.37 (default 50): invisible, never set by the
    // grade controls, and it stays through trims, renames, undo and changes made in Effect Controls
    var FEATHER = 113, STAMP = 50.37;
    function isOurs(lm) { try { return Math.abs(lm.properties[FEATHER].getValue() - STAMP) < 0.005; } catch (e) { return false; } }

    function videoItems(seq, sel) {
        // sel: [{track, index}], 'selected', 'all' (V1) or 'every' (all tracks)
        var out = [], t, c;
        for (t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t];
            for (c = 0; c < tr.clips.numItems; c++) {
                var ti = tr.clips[c], take = false;
                if (sel === 'all') take = t === 0;
                else if (sel === 'every') take = true;
                else if (sel === 'selected') take = ti.isSelected();
                else for (var k = 0; k < sel.length; k++) if (sel[k].track === t && sel[k].index === c) take = true;
                if (take && String(ti.name).indexOf('Ultra Guide') !== 0 && String(ti.name).indexOf('Ultra Letterbox') !== 0) out.push({ ti: ti, track: t, index: c });
            }
        }
        return out;
    }
    /** The QE item for the n-th clip of a track (QE also counts the gaps between clips as "Empty" items). */
    function qeClip(q, track, index) {
        var t = q.getVideoTrackAt(track), n = -1;
        for (var i = 0; i < t.numItems; i++) { var it = t.getItemAt(i); if (it.type !== 'Empty' && ++n === index) return it; }
        throw U.err('HOST_SCRIPT', 'No QE item for clip ' + index + ' on V' + (track + 1));
    }
    function lumetris(ti) { var out = []; for (var c = 0; c < ti.components.numItems; c++) if (ti.components[c].displayName === LUMETRI) out.push(ti.components[c]); return out; }
    /** A fingerprint of a Lumetri instance's values, so the panel can recognise the one Ultra Studio owns. */
    function sigOf(lm) { var o = []; for (var k in P) if (P.hasOwnProperty(k)) { try { o.push(Math.round(lm.properties[P[k]].getValue() * 1000)); } catch (e) { o.push('x'); } } return o.join(','); }
    function sigs(ti) { var ls = lumetris(ti), o = []; for (var i = 0; i < ls.length; i++) o.push(sigOf(ls[i])); return o; }
    /** Where a new Lumetri landed (Premiere puts new ones at the top of the effect stack, above the editor's own). */
    function newInstance(before, after) { for (var i = 0; i < after.length; i++) if (i >= before.length || after[i] !== before[i]) return i; return after.length - 1; }
    function addLumetri(seq, it) {
        var before = sigs(it.ti), q = U.openAndQE(seq);
        qeClip(q, it.track, it.index).addVideoEffect(qe.project.getVideoEffectByName(LUMETRI));
        it.ti = seq.videoTracks[it.track].clips[it.index];
        return newInstance(before, sigs(it.ti));
    }
    function setValues(lm, values) { for (var k in values) if (values.hasOwnProperty(k) && P[k] !== undefined) lm.properties[P[k]].setValue(values[k], true); }

    /** Clips the user can work on in a sequence: [{track, index, name, start, end, itemId, path, lumetri: count, ours: Ultra Studio's Lumetri or -1}] */
    fn.colourClips = function (a) {
        var seq = U.needSeq(a.seqId), out = [], items = videoItems(seq, a.which || 'all');
        for (var i = 0; i < items.length; i++) {
            var ti = items[i].ti, pi = null; try { pi = ti.projectItem; } catch (e) { }
            var ls = lumetris(ti), ours = -1;
            for (var k = 0; k < ls.length; k++) if (isOurs(ls[k])) ours = k;
            out.push({ track: items[i].track, index: items[i].index, name: ti.name, start: ti.start.seconds, end: ti.end.seconds,
                itemId: pi ? pi.nodeId : '', path: pi ? (function () { try { return pi.getMediaPath(); } catch (e) { return ''; } })() : '',
                lumetri: ls.length, ours: ours, selected: ti.isSelected() });
        }
        return out;
    };

    /**
     * Set Lumetri values on clips. a: {seqId, clips:[{track, index, instance?}], values:{name: value}, fresh}
     * fresh adds a new instance; otherwise `instance` (position among the clip's Lumetri effects) is used, adding one
     * if the clip has none. Returns [{track, index, instance, sig}].
     */
    fn.colourSet = function (a) {
        var seq = U.needSeq(a.seqId), items = videoItems(seq, a.clips), out = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i], want = null;
            for (var k = 0; k < a.clips.length; k++) if (a.clips[k].track === it.track && a.clips[k].index === it.index) want = a.clips[k].instance;
            var ls = lumetris(it.ti), pos;
            if (a.fresh || !ls.length || (want != null && want >= ls.length)) pos = addLumetri(seq, it);
            else pos = want != null ? want : ls.length - 1;
            var lm = lumetris(it.ti)[pos];
            setValues(lm, a.values);
            if (a.stamp) lm.properties[FEATHER].setValue(STAMP, true);
            out.push({ track: it.track, index: it.index, instance: pos, sig: sigOf(lm) });
        }
        return out;
    };
    fn.colourGet = function (a) {
        var seq = U.needSeq(a.seqId), items = videoItems(seq, a.clips), out = [];
        for (var i = 0; i < items.length; i++) {
            var ls = lumetris(items[i].ti), o = { track: items[i].track, index: items[i].index, instances: ls.length, values: {} };
            var pos = a.instance != null ? a.instance : ls.length - 1;
            if (ls[pos]) { for (var k in P) if (P.hasOwnProperty(k)) { try { o.values[k] = ls[pos].properties[P[k]].getValue(); } catch (e) { } } }
            out.push(o);
        }
        return out;
    };

    fn.colourPresets = function () { var l = U.project().getAllLumetriPresetsList(); var out = []; if (l) for (var i = 0; i < l.length; i++) out.push(String(l[i])); return out; };

    /** Apply a named Lumetri preset (Premiere adds its own Lumetri instance) to clips. a: {seqId, clips, preset} -> [{track, index, instance, sig}] */
    fn.colourApplyPreset = function (a) {
        var seq = U.needSeq(a.seqId), items = videoItems(seq, a.clips), t, c, i;
        U.project().openSequence(seq.sequenceID); // presets apply to the selection in the active sequence
        var before = []; for (i = 0; i < items.length; i++) before.push(sigs(items[i].ti));
        // select exactly these clips, apply, then restore the selection
        var was = [];
        for (t = 0; t < seq.videoTracks.numTracks; t++) for (c = 0; c < seq.videoTracks[t].clips.numItems; c++) { var x = seq.videoTracks[t].clips[c]; if (x.isSelected()) was.push(x); x.setSelected(false, false); }
        for (i = 0; i < items.length; i++) items[i].ti.setSelected(true, false);
        var ok = U.project().applyLumetriPreset(a.preset);
        for (i = 0; i < items.length; i++) items[i].ti.setSelected(false, false);
        for (i = 0; i < was.length; i++) was[i].setSelected(true, false);
        if (!ok) throw U.err('HOST_SCRIPT', 'applyLumetriPreset returned false for ' + a.preset, 'Premiere didn’t apply that look.', 'Try another look; if it keeps happening, send the activity log.');
        var out = [];
        for (i = 0; i < items.length; i++) {
            var ti = seq.videoTracks[items[i].track].clips[items[i].index], now = sigs(ti), pos = newInstance(before[i], now);
            out.push({ track: items[i].track, index: items[i].index, instance: pos, sig: now[pos] });
        }
        return out;
    };

    /* ---------- log footage: Premiere's own colour management (the same as Modify › Color), Premiere 25 and later ---------- */
    /** Project items for timeline clips (a.seqId + a.clips/'selected') and/or a.itemIds, without repeats. */
    function mediaItems(a) {
        var out = [], seen = {}, i, it;
        if (a.itemIds) for (i = 0; i < a.itemIds.length; i++) { it = U.needItem(a.itemIds[i]); if (!seen[it.nodeId]) { seen[it.nodeId] = true; out.push(it); } }
        if (a.seqId) {
            var items = videoItems(U.needSeq(a.seqId), a.clips || 'selected');
            for (i = 0; i < items.length; i++) { it = null; try { it = items[i].ti.projectItem; } catch (e) { } if (it && !seen[it.nodeId]) { seen[it.nodeId] = true; out.push(it); } }
        }
        return out;
    }
    function spaceList(it) { try { var l = it.getOverrideColorSpaceList; return l && l.length ? l : null; } catch (e) { return null; } }
    /** -> {clips:[{id, name, path, current, original, supported}], spaces:[{name, log}]} */
    fn.colourSpaces = function (a) {
        var items = mediaItems(a), out = [], names = [], l = null, i;
        for (i = 0; i < items.length; i++) {
            var it = items[i], o = { id: it.nodeId, name: it.name, path: '', current: '', original: '', supported: false };
            try { o.path = it.getMediaPath(); } catch (e) { }
            try { o.current = it.getColorSpace().name; o.original = it.getOriginalColorSpace().name; } catch (e) { }
            if (spaceList(it)) { o.supported = true; l = l || spaceList(it); }
            out.push(o);
        }
        if (l) for (i = 0; i < l.length; i++) names.push({ name: l[i].name, log: !!l[i].isSceneReferred });
        return { clips: out, spaces: names };
    };
    /** Tell Premiere what the footage was filmed in. a: {seqId+clips | itemIds, space: name, or '' for the clip's own} -> count */
    fn.colourSetSpace = function (a) {
        var items = mediaItems(a), n = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i], l = spaceList(it), target = null;
            if (!l) continue;
            if (!a.space) target = it.getOriginalColorSpace();
            else for (var k = 0; k < l.length; k++) if (l[k].name === a.space) target = l[k];
            if (!target) throw U.err('HOST_SCRIPT', 'No colour space ' + a.space, 'Premiere doesn’t offer “' + a.space + '” for ' + it.name + '.', 'Choose another camera profile.');
            if (it.setOverrideColorSpace(target)) n++;
        }
        return n;
    };

    /* ---------- previews rendered by Premiere itself, on a still of the current frame ---------- */
    function previewSeq() { var seqs = U.project().sequences; for (var i = 0; i < seqs.numSequences; i++) if (seqs[i].name === 'Ultra Studio colour preview') return seqs[i]; return null; }
    /** Put a still (PNG path) on the preview sequence (made on first use), clean of any look. a: {still} -> {seqId} */
    fn.colourPreviewSetup = function (a) {
        fn.colourPreviewCleanup(); // one still at a time
        var bin = U.ensureBin('JMG Ultra Studio/.colour preview');
        var imp = JSON.parse(fn.importFiles ? U.run('importFiles', JSON.stringify({ paths: [a.still], binId: bin.nodeId })) : '{}');
        var stillId = imp.data && imp.data[0] ? imp.data[0].id : null;
        if (!stillId) throw U.err('HOST_SCRIPT', 'Could not import the preview frame');
        var s = previewSeq();
        if (s) U.project().deleteSequence(s);
        var r = JSON.parse(U.run('newSequence', JSON.stringify({ name: 'Ultra Studio colour preview', binPath: 'JMG Ultra Studio/.colour preview', likeId: stillId }))).data;
        U.run('placeClips', JSON.stringify({ seqId: r.id, clips: [{ id: stillId, 'in': 0, out: 1 }] }));
        return { seqId: r.id, stillId: stillId };
    };
    /** Render the preview still with a look/grade. Each render places a fresh copy of the still, so looks never stack.
        a: {seqId, stillId, preset?, values?, out} -> png path */
    fn.colourPreviewRender = function (a) {
        var seq = U.needSeq(a.seqId);
        U.project().openSequence(seq.sequenceID);
        U.run('placeClips', JSON.stringify({ seqId: seq.sequenceID, clips: [{ id: a.stillId, 'in': 0, out: 1, at: 0 }] }));
        var ti = seq.videoTracks[0].clips[0];
        if (a.preset) {
            ti.setSelected(true, false); var ok = U.project().applyLumetriPreset(a.preset); ti.setSelected(false, false);
            if (!ok) throw U.err('HOST_SCRIPT', 'applyLumetriPreset false: ' + a.preset);
        } else if (a.values) {
            var it = { ti: ti, track: 0, index: 0 }, pos = addLumetri(seq, it);
            setValues(lumetris(it.ti)[pos], a.values);
        }
        var q = U.openAndQE(seq), path = a.out.replace(/\.png$/i, '');
        q.exportFramePNG(U.framesToTC(U.secToFrames(0.5, seq), seq), path);
        return path + '.png';
    };
    /** Remove the preview sequence and its still. */
    fn.colourPreviewCleanup = function () {
        var s = previewSeq(); if (s) U.project().deleteSequence(s);
        var bin = null; U.walk(U.project().rootItem, function (c) { if (c.type === 2 && c.name === '.colour preview') bin = c; });
        if (bin) { try { bin.deleteBin(); } catch (e) { } }
        return true;
    };
})(UStudio);
