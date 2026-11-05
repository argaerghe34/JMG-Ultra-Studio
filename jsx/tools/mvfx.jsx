// JMG Ultra Studio – mVFX (Premiere side, ES3): the Documentary pack as native, editable things in the sequence.
// mvfxApply lays a title's layers on tracks named "mVFX 1, 2, 3…" above the edit: each text layer is Premiere's own
// Basic Title template (Essential Graphics) with the words, font, size and colour set in its Source Text, the rules and
// bars are PNG stills the panel painted, and the in/out animation is keyframes on Opacity and Motion › Position.
// mvfxFreeze holds the frame at the playhead (exported as PNG, placed above). mvfxMove keyframes a camera move on
// clips; mvfxLook puts a Lumetri Color effect with a look's settings on them. mvfxTemplates is Resolve's (nothing here).
(function (U) {
    var fn = U.fn;
    var trim = function (x) { return String(x).replace(/^\s+|\s+$/g, ''); };
    var TRACK = 'mVFX';

    function component(ti, re) { try { for (var k = 0; k < ti.components.numItems; k++) { var c = ti.components[k]; if (re.test(String(c.displayName)) || re.test(String(c.matchName))) return c; } } catch (e) { } return null; }
    function property(c, re) { if (!c) return null; try { for (var p = 0; p < c.properties.numItems; p++) if (re.test(String(c.properties[p].displayName))) return c.properties[p]; } catch (e) { } return null; }
    function mediaTime(ti, seqSec) { var speed = 1; try { speed = Math.abs(ti.getSpeed()) || 1; } catch (e) { } var t = new Time(); t.seconds = ti.inPoint.seconds + (seqSec - ti.start.seconds) * speed; return t; }
    function timeObj(s) { var t = new Time(); t.seconds = s; return t; }
    function clipAt(seq, kind, track, start) {
        var tr = (kind === 'audio' ? seq.audioTracks : seq.videoTracks)[track], half = 0.5 / U.seqFps(seq);
        if (!tr) return null;
        for (var c = 0; c < tr.clips.numItems; c++) if (Math.abs(tr.clips[c].start.seconds - start) <= half) return tr.clips[c];
        return null;
    }
    /** Our n-th track ("mVFX 1" is the lowest of ours, made above everything the first time). -> track index */
    function ourTrack(seq, n, log) {
        var want = TRACK + ' ' + n, t;
        for (t = 0; t < seq.videoTracks.numTracks; t++) { var nm = ''; try { nm = trim(seq.videoTracks[t].name); } catch (e) { } if (nm.toLowerCase() === want.toLowerCase()) return t; }
        t = seq.videoTracks.numTracks;
        U.labelParts.ensureVideoTracks(seq, t + 1);
        if (seq.videoTracks.numTracks <= t) throw U.err('HOST_SCRIPT', 'Could not add a video track', 'Premiere didn’t add a track.', 'Add a video track in the Timeline (right-click a track › Add Track), then try again.');
        try { U.openAndQE(seq).getVideoTrackAt(t).setName(want); } catch (e2) { log.push('track name: ' + e2); }
        return t;
    }
    /** Premiere's Basic Title template, or null. */
    function basicTitle() {
        var base = String(app.path || ''), tries = [base + '/Contents/Essential Graphics/Basic Title.mogrt', base + '/Essential Graphics/Basic Title.mogrt', base + '\\Essential Graphics\\Basic Title.mogrt'];
        for (var i = 0; i < tries.length; i++) { var f = new File(tries[i]); if (f.exists) return f.fsName; }
        return null;
    }
    /** The property holding the text's Source Text JSON (MGT component first, then any Text component). */
    function textProperty(ti) {
        var found = null;
        function look(c) { try { for (var i = 0; i < c.properties.numItems && !found; i++) { var v = c.properties[i].getValue(); if (typeof v === 'string' && v.indexOf('textEditValue') >= 0) found = c.properties[i]; } } catch (e) { } }
        try { var mgt = ti.getMGTComponent(); if (mgt) look(mgt); } catch (e) { }
        try { for (var k = 0; k < ti.components.numItems && !found; k++) look(ti.components[k]); } catch (e2) { }
        return found;
    }
    /**
     * Words, font, size and colour into a text layer's Source Text. Premiere keeps them as JSON ("textEditValue",
     * "fontEditValue", "fontSizeEditValue", colours as arrays); only the keys this Premiere has are set, and what it had
     * is reported, so the panel can scale the layer when the size can't be set.
     */
    function setText(ti, L, log) {
        var p = textProperty(ti), out = { words: false, font: false, size: false, colour: false, keys: [], baseSize: 0 };
        if (!p) { log.push('no Source Text'); return out; }
        var v = p.getValue(), i = v.indexOf('{'), o;
        try { o = JSON.parse(v.slice(i)); } catch (e) { log.push('text JSON: ' + e); return out; }
        for (var k in o) if (o.hasOwnProperty(k)) out.keys.push(k);
        o.textEditValue = String(L.text); out.words = true;
        if (o.hasOwnProperty('fontEditValue') && L.font) { o.fontEditValue = String(L.font); out.font = true; }
        if (o.hasOwnProperty('fontSizeEditValue') && L.size) { out.baseSize = Number(o.fontSizeEditValue) || 0; o.fontSizeEditValue = Number(L.size); out.size = true; }
        if (o.hasOwnProperty('fontFSBoldValue') && L.bold != null) o.fontFSBoldValue = !!L.bold;
        if (L.colour) {
            var rgb = hexRgb(L.colour);
            for (var k2 in o) if (o.hasOwnProperty(k2) && /fill|textcolou?r|colou?r/i.test(k2) && !/stroke|shadow|background|box/i.test(k2)) {
                var cv = o[k2];
                if (cv && typeof cv === 'object' && cv.length >= 3) { var big = cv[0] > 1 || cv[1] > 1 || cv[2] > 1; o[k2] = big ? [rgb[0], rgb[1], rgb[2]].concat(cv.length > 3 ? [cv[3]] : []) : [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255].concat(cv.length > 3 ? [cv[3]] : []); out.colour = true; }
            }
        }
        p.setValue(v.slice(0, i) + JSON.stringify(o), true);
        return out;
    }
    function hexRgb(hex) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '')); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]; }
    /** Keyframes: an opacity fade in/out, a move in (rise/slide), a burst (0 → full → 0), a drift, a flicker. */
    function animate(seq, ti, anim, pos, log) {
        if (!anim || anim.type === 'none') return;
        var fps = U.seqFps(seq), s = ti.start.seconds, e = ti.end.seconds, len = e - s, f = 1 / fps;
        var op = property(component(ti, /^Opacity$/), /^Opacity$/), full = 100;
        try { if (op && op.getValue() <= 1) full = 1; } catch (e0) { }
        function okey(t, val) { var k = mediaTime(ti, t); op.addKey(k); op.setValueAtKey(k, val * full / 100, true); }
        if (!op) { log.push('no Opacity'); return; }
        try {
            op.setTimeVarying(true);
            if (anim.type === 'burst') { okey(s, 0); okey(s + len / 2, 100); okey(e - f, 0); }
            else if (anim.type === 'flicker') { var n = Math.min(80, Math.floor(len * fps / 2)), seed = 7; for (var i = 0; i <= n; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; okey(s + i * 2 * f, 40 + (seed / 2147483648) * 60); } }
            else {
                var inS = Math.min(anim.inSec || 0.5, len / 2.5), outS = Math.min(anim.outSec || 0.5, len / 2.5);
                okey(s, 0); okey(s + inS, 100); if (outS > 0) { okey(e - outS, 100); okey(e - f, 0); }
            }
        } catch (e1) { log.push('opacity keys: ' + e1); }
        var mv = (anim.dx || anim.dy) && (anim.type === 'rise' || anim.type === 'slide' || anim.type === 'drift');
        if (!mv) return;
        var posP = property(component(ti, /^Motion$/), /^Position$/);
        if (!posP) { log.push('no Position'); return; }
        try {
            posP.setTimeVarying(true);
            var x0 = pos ? pos[0] : posP.getValue()[0], y0 = pos ? pos[1] : posP.getValue()[1];
            function pkey(t, x, y) { var k = mediaTime(ti, t); posP.addKey(k); posP.setValueAtKey(k, [x, y], true); try { posP.setInterpolationTypeAtKey(k, 5, true); } catch (e3) { } }
            if (anim.type === 'drift') { var m = Math.max(2, Math.round(len / 1.5)), sd = 3; for (var j = 0; j <= m; j++) { sd = (sd * 1103515245 + 12345) % 2147483648; var rx = sd / 2147483648 - 0.5; sd = (sd * 1103515245 + 12345) % 2147483648; var ry = sd / 2147483648 - 0.5; pkey(s + (len * j) / m, x0 + (j ? rx * 2 * anim.dx : 0), y0 + (j ? ry * 2 * anim.dy : 0)); } }
            else { pkey(s, x0 + (anim.dx || 0), y0 + (anim.dy || 0)); pkey(s + Math.min(anim.inSec || 0.5, len / 2.5), x0, y0); }
        } catch (e2) { log.push('position keys: ' + e2); }
    }
    /** A still (PNG) laid for `seconds` at `start` on track t (stills are placed up to their own length, then stretched). */
    function placeStill(seq, t, it, start, seconds, log) {
        var tr = seq.videoTracks[t], full = 0;
        try { var cc = U.columns ? U.columns(it) : null; full = cc && cc['Column.Intrinsic.MediaDuration'] ? U.ticksToSec(cc['Column.Intrinsic.MediaDuration']) : 0; } catch (e) { }
        var want = full > 0 ? Math.min(seconds, full) : Math.min(seconds, 5);
        it.setInPoint(0, 4); it.setOutPoint(want, 4);
        tr.overwriteClip(it, start);
        try { it.clearInPoint(); it.clearOutPoint(); } catch (e1) { }
        var got = null, best = 1e9;
        for (var k = 0; k < tr.clips.numItems; k++) { var d = Math.abs(tr.clips[k].start.seconds - start); if (d < best) { best = d; got = tr.clips[k]; } }
        if (!got || best > 0.05) throw U.err('HOST_SCRIPT', 'Still not placed on V' + (t + 1), 'Premiere didn’t place the picture.', 'Check the track isn’t locked, then try again.');
        if (seconds > want + 0.02) { try { got.end = timeObj(start + seconds); } catch (e2) { log.push('stretch: ' + e2); } }
        return got;
    }
    /**
     * Lay a preset's layers. a: {seqId, start, seconds, name, layers:[{kind:'still', itemId, anim, name, blend?, alpha?} |
     * {kind:'text', text, font, size (px), colour, bold, x, y (px, the text's centre), anim, name}]}
     * -> {placed, track (the first), trackName, tracks, start, end, text:[{words, font, size, colour, keys}], log}
     */
    fn.mvfxApply = function (a) {
        var seq = U.needSeq(a.seqId), log = [], out = { placed: 0, tracks: [], text: [], start: a.start, end: a.start + a.seconds, log: log };
        var W = seq.frameSizeHorizontal, H = seq.frameSizeVertical, mogrt = null;
        for (var i = 0; i < a.layers.length; i++) {
            var L = a.layers[i], t = ourTrack(seq, i + 1, log), ti = null;
            if (L.kind === 'still') {
                ti = placeStill(seq, t, U.needItem(L.itemId), a.start, a.seconds, log);
                if (L.alpha != null && L.alpha < 1) { var op = property(component(ti, /^Opacity$/), /^Opacity$/); if (op) { try { op.setValue(Number(L.alpha) * (op.getValue() <= 1 ? 1 : 100), true); } catch (e0) { } } }
                if (L.blend && L.blend !== 'normal') { var bm = property(component(ti, /^Opacity$/), /^Blend Mode$/); if (bm) { try { bm.setValue({ overlay: 17, screen: 10, multiply: 3, add: 11 }[L.blend] || 0, true); } catch (e1) { log.push('blend: ' + e1); } } else log.push('no Blend Mode'); }
                animate(seq, ti, L.anim, null, log);
            } else {
                if (!mogrt) { mogrt = basicTitle(); if (!mogrt) throw U.err('NOT_FOUND', 'Basic Title.mogrt not found under ' + app.path, 'Premiere’s Basic Title template isn’t installed.', 'Reinstall Premiere’s Essential Graphics templates, or make the text with the Type tool.'); }
                try { ti = seq.importMGT(mogrt, String(Math.round(a.start * U.TICKS)), t, 0); } catch (e2) { log.push('importMGT: ' + e2); }
                if (!ti) throw U.err('HOST_SCRIPT', 'importMGT refused on V' + (t + 1) + ': ' + log.join('; '), 'Premiere didn’t add the text layer.', 'Check the track isn’t locked, then try again.');
                try { ti.end = timeObj(a.start + a.seconds); } catch (e3) { log.push('end: ' + e3); }
                var r = setText(ti, L, log);
                out.text.push(r);
                // the words sit centred on the frame: move the whole graphic so they sit where the preset wants them
                var m = component(ti, /^Motion$/), pos = property(m, /^Position$/), sc = property(m, /^Scale$/);
                var px = [Number(L.x), Number(L.y)];
                if (pos) { try { pos.setValue(px, true); } catch (e4) { log.push('position: ' + e4); } }
                if (!r.size && sc && L.size) { var base = r.baseSize || 100; try { sc.setValue(100 * Number(L.size) / base, true); } catch (e5) { log.push('scale: ' + e5); } }
                animate(seq, ti, L.anim, px, log);
            }
            try { ti.name = String(L.name || a.name || 'mVFX'); } catch (e6) { }
            out.placed++; out.tracks.push(t);
            if (i === 0) { out.track = t; try { out.trackName = String(seq.videoTracks[t].name); } catch (e7) { out.trackName = ''; } }
        }
        if (!out.placed) throw U.err('BAD_INPUT', 'No layers', 'There was nothing to add.', 'Type some words first.');
        if (W && H && out.text.length && !out.text[0].colour) out.note = 'Premiere kept the template’s colour – change it in Essential Graphics';
        return out;
    };

    /** Hold the frame at a.at: exported as PNG and laid above the edit for a.seconds. a: {seqId, at, seconds, outBase, binPath} -> {itemId, track, start, end, path} */
    fn.mvfxFreeze = function (a) {
        var seq = U.needSeq(a.seqId), log = [];
        var file = fn.exportFrame({ seqId: a.seqId, seconds: a.at, outBase: a.outBase });
        var items = fn.importFiles({ paths: [file], binPath: a.binPath || 'JMG Ultra Studio/mVFX' });
        if (!items.length) throw U.err('HOST_SCRIPT', 'Frame not imported: ' + file, 'Premiere didn’t import the frame.', 'Try again.');
        var it = U.needItem(items[0].id), t = ourTrack(seq, 1, log);
        var ti = placeStill(seq, t, it, a.at, a.seconds, log);
        try { ti.name = 'Freeze ' + U.framesToTC(U.secToFrames(a.at, seq), seq); } catch (e) { }
        return { itemId: items[0].id, track: t, start: ti.start.seconds, end: ti.end.seconds, path: file, log: log };
    };

    /**
     * A camera move: Motion › Scale and Position keyframed. a: {seqId, targets:[{kind, track, start, end}], keys:[{at (s from
     * the clip's start), scale, x, y (fractions of the frame)}], ease} -> {done, skipped:[{start, why}], log}
     */
    fn.mvfxMove = function (a) {
        var seq = U.needSeq(a.seqId), out = { done: 0, skipped: [], log: [] }, W = seq.frameSizeHorizontal, H = seq.frameSizeVertical;
        for (var i = 0; i < a.targets.length; i++) {
            var g = a.targets[i], ti = clipAt(seq, g.kind || 'video', g.track, g.start);
            if (!ti) { out.skipped.push({ start: g.start, why: 'not on the timeline any more' }); continue; }
            try {
                var m = component(ti, /^Motion$/), sc = property(m, /^Scale$/), pos = property(m, /^Position$/);
                if (!sc || !pos) throw new Error('no Motion');
                var base = pos.getValue(), bx = base[0], by = base[1];
                if (sc.isTimeVarying()) { var ks = sc.getKeys() || []; for (var r = 0; r < ks.length; r++) sc.removeKey(ks[r]); }
                if (pos.isTimeVarying()) { var kp = pos.getKeys() || []; for (var r2 = 0; r2 < kp.length; r2++) pos.removeKey(kp[r2]); }
                sc.setTimeVarying(true); pos.setTimeVarying(true);
                for (var k = 0; k < a.keys.length; k++) {
                    var key = a.keys[k], t = mediaTime(ti, ti.start.seconds + key.at);
                    sc.addKey(t); sc.setValueAtKey(t, Number(key.scale), true);
                    pos.addKey(t); pos.setValueAtKey(t, [bx + Number(key.x || 0) * W, by + Number(key.y || 0) * H], true);
                    if (a.ease) { try { sc.setInterpolationTypeAtKey(t, 5, true); pos.setInterpolationTypeAtKey(t, 5, true); } catch (e1) { } }
                }
                out.done++;
            } catch (e) { out.skipped.push({ start: g.start, why: String(e.message || e) }); }
        }
        return out;
    };

    /**
     * A look: a Lumetri Color effect on each clip with the look's settings (the .cube is saved for its Input LUT by hand).
     * a: {seqId, targets, look:{id, lut, lumetri:{Temperature: 28, …}, label}} -> {done, skipped, set:[names], log}
     */
    fn.mvfxLook = function (a) {
        var seq = U.needSeq(a.seqId), q = U.openAndQE(seq), out = { done: 0, skipped: [], set: [], log: [] };
        var eff = null; try { eff = qe.project.getVideoEffectByName('Lumetri Color'); } catch (e) { }
        for (var i = 0; i < a.targets.length; i++) {
            var g = a.targets[i], ti = clipAt(seq, g.kind || 'video', g.track, g.start);
            if (!ti) { out.skipped.push({ start: g.start, why: 'not on the timeline any more' }); continue; }
            try {
                var lum = component(ti, /^Lumetri/);
                if (!lum) {
                    if (!eff) throw new Error('No Lumetri Color effect');
                    var tr = q.getVideoTrackAt(g.track), half = 0.5 / U.seqFps(seq), it = null;
                    for (var j = 0; j < tr.numItems && !it; j++) { var x = tr.getItemAt(j); if (!x || x.type === 'Empty') continue; var s = null; try { s = x.start.secs; } catch (e1) { } if (s == null) { try { s = U.ticksToSec(x.start.ticks); } catch (e2) { } } if (s != null && Math.abs(Number(s) - g.start) <= half) it = x; }
                    if (!it) throw new Error('No QE item');
                    it.addVideoEffect(eff);
                    ti = clipAt(seq, g.kind || 'video', g.track, g.start); lum = component(ti, /^Lumetri/);
                }
                if (!lum) throw new Error('Lumetri not added');
                var want = a.look.lumetri || {}, setNames = [];
                for (var name in want) if (want.hasOwnProperty(name)) {
                    var re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), p = property(lum, re);
                    if (p) { try { p.setValue(Number(want[name]), true); setNames.push(name); } catch (e3) { out.log.push(name + ': ' + e3); } } else out.log.push('no ' + name);
                }
                if (!setNames.length) { var names = []; try { for (var pp = 0; pp < lum.properties.numItems && pp < 60; pp++) names.push(lum.properties[pp].displayName); } catch (e4) { } throw new Error('Lumetri has none of the settings; it has: ' + names.join(', ')); }
                if (out.set.length < setNames.length) out.set = setNames;
                out.done++;
            } catch (e) { out.skipped.push({ start: g.start, why: String(e.message || e) }); }
        }
        if (!out.done && out.skipped.length) throw U.err('HOST_SCRIPT', out.skipped[0].why, 'Premiere didn’t take the look.', 'Add Lumetri Color by hand and load the .cube (' + a.look.lut + ') as its Input LUT.');
        return out;
    };

    /** Resolve's Fusion templates – nothing to install for Premiere. a: {write:[{name, kind, body}]} -> {dir, written, restart} */
    fn.mvfxTemplates = function (a) { return { dir: '', written: [], restart: false, note: 'Premiere needs no templates: titles are made with Basic Title.' }; };
})(UStudio);
