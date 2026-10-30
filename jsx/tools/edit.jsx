// JMG Ultra Studio – Ask › Edit (Premiere side, ES3): read a sequence as the AI sees it, and apply one kind of edit to
// a list of clips. Clips are found by track and start time (not ids), so the same targets work on a copy of the
// sequence. Transitions, effects and speed go through QE (Premiere's unofficial scripting layer); everything else
// through the documented object model. Every op reports what it did and why anything was skipped.
(function (U) {
    var fn = U.fn;
    var trim = function (x) { return String(x).replace(/^\s+|\s+$/g, ''); };
    function tracksOf(seq, kind) { return kind === 'audio' ? seq.audioTracks : seq.videoTracks; }
    /** The timeline clip on a track that starts at this time (within half a frame), or null. */
    function clipAt(seq, kind, track, start) {
        var tr = tracksOf(seq, kind)[track], half = 0.5 / U.seqFps(seq);
        if (!tr) return null;
        for (var c = 0; c < tr.clips.numItems; c++) if (Math.abs(tr.clips[c].start.seconds - start) <= half) return tr.clips[c];
        return null;
    }
    /** The same clip in QE (whose item lists also hold the gaps), matched by start time. */
    function qeItemAt(q, seq, kind, track, start) {
        var t = kind === 'audio' ? q.getAudioTrackAt(track) : q.getVideoTrackAt(track), half = 0.5 / U.seqFps(seq);
        for (var i = 0; i < t.numItems; i++) {
            var it = t.getItemAt(i); if (!it || it.type === 'Empty') continue;
            var s = null; try { s = it.start.secs; } catch (e) { }
            if (s == null) { try { s = U.ticksToSec(it.start.ticks); } catch (e2) { } }
            if (s != null && Math.abs(Number(s) - start) <= half) return it;
        }
        return null;
    }
    function component(ti, re) { for (var k = 0; k < ti.components.numItems; k++) { var c = ti.components[k]; if (re.test(String(c.displayName)) || re.test(String(c.matchName))) return c; } return null; }
    function property(c, re) { if (!c) return null; for (var p = 0; p < c.properties.numItems; p++) if (re.test(String(c.properties[p].displayName))) return c.properties[p]; return null; }
    /** A time on the clip's own media clock (where Premiere keeps keyframes) for a sequence time. */
    function mediaTime(ti, seqSec) {
        var speed = 1; try { speed = Math.abs(ti.getSpeed()) || 1; } catch (e) { }
        var t = new Time(); t.seconds = ti.inPoint.seconds + (seqSec - ti.start.seconds) * speed; return t;
    }
    function labelOf(ti) { try { if (typeof ti.getColorLabel === 'function') { var l = Number(ti.getColorLabel()); return isFinite(l) ? l : null; } } catch (e) { } return null; }
    var PLAIN = /^(Motion|Opacity|Time Remapping|Volume|Channel Volume|Panner|Audio Clip Mixer|Vector Motion|Speed)$/i;

    /**
     * The sequence as Ask › Edit shows it to the AI: every clip with its label and the effects added to it.
     * a: {seqId} -> {id, name, fps, duration, width, height, markers, video/audio:[{index, name, muted, locked, clips:[{name,
     * start, end, in, out, disabled, itemId, path, speed, label, effects:[names], scale}]}]}
     */
    fn.editRead = function (a) {
        var seq = U.needSeq(a.seqId), o = fn.sequenceInfo({ seqId: a.seqId });
        function add(coll, out) {
            for (var t = 0; t < coll.numTracks && t < out.length; t++) {
                var tr = coll[t];
                for (var c = 0; c < tr.clips.numItems && c < out[t].clips.length; c++) {
                    var ti = tr.clips[c], ci = out[t].clips[c], fx = [];
                    ci.label = labelOf(ti);
                    try { for (var k = 0; k < ti.components.numItems; k++) { var n = String(ti.components[k].displayName); if (!PLAIN.test(n)) fx.push(n); } } catch (e) { }
                    ci.effects = fx;
                    try { var sc = property(component(ti, /^Motion$/), /^Scale$/); if (sc && !sc.isTimeVarying()) ci.scale = Math.round(sc.getValue() * 10) / 10; } catch (e2) { }
                }
            }
        }
        add(seq.videoTracks, o.video); add(seq.audioTracks, o.audio);
        return o;
    };

    /** The clips selected in the Timeline. a: {seqId} -> [{kind, track, start, end, name}] */
    fn.editSelection = function (a) {
        var seq = U.needSeq(a.seqId), out = [], sel = [];
        try { sel = seq.getSelection() || []; } catch (e) { return out; }
        for (var i = 0; i < sel.length; i++) {
            var ti = sel[i], found = false;
            for (var pass = 0; pass < 2 && !found; pass++) {
                var coll = pass ? seq.audioTracks : seq.videoTracks;
                for (var t = 0; t < coll.numTracks && !found; t++) for (var c = 0; c < coll[t].clips.numItems; c++) {
                    if (coll[t].clips[c].nodeId === ti.nodeId) { out.push({ kind: pass ? 'audio' : 'video', track: t, start: ti.start.seconds, end: ti.end.seconds, name: ti.name }); found = true; break; }
                }
            }
        }
        return out;
    };

    /* ---------- the edits ---------- */
    function tcFrames(seq, frames) { return U.framesToTC(Math.max(1, Math.round(frames)), seq); }
    /** Add a transition at the clip's start and/or end. Tries the QE argument lists Premiere versions have used. */
    function addTransition(q, seq, kind, track, ti, p) {
        var name = p.name || (kind === 'audio' ? 'Constant Power' : 'Cross Dissolve'), tr = null;
        try { tr = kind === 'audio' ? qe.project.getAudioTransitionByName(name) : qe.project.getVideoTransitionByName(name); } catch (e) { }
        if (!tr) throw U.err('NOT_FOUND', 'No transition called ' + name, 'Premiere has no transition called “' + name + '”.', 'Use its name as the Effects panel shows it, e.g. Cross Dissolve, Dip to Black, Film Dissolve, Constant Power.');
        var at = p.at || 'both', dur = tcFrames(seq, p.frames || Math.round(U.seqFps(seq) / 2)), n = 0;
        var ends = at === 'both' ? [true, false] : [at === 'start'];
        for (var i = 0; i < ends.length; i++) {
            var it = qeItemAt(q, seq, kind, track, ti.start.seconds); if (!it) break;
            var ok = false;
            try { it.addTransition(tr, ends[i], dur, '00:00:00:00', 0.5, false, true); ok = true; } catch (e1) { }
            if (!ok) { try { it.addTransition(tr, ends[i], dur); ok = true; } catch (e2) { } }
            if (!ok) { try { it.addTransition(tr, ends[i]); ok = true; } catch (e3) { } }
            if (ok) n++;
        }
        if (!n) throw U.err('HOST_SCRIPT', 'addTransition refused', 'Premiere didn’t add the transition.');
        return n;
    }
    function addEffect(q, seq, kind, track, ti, p) {
        var eff = null;
        try { eff = kind === 'audio' ? qe.project.getAudioEffectByName(p.name) : qe.project.getVideoEffectByName(p.name); } catch (e) { }
        if (!eff) throw U.err('NOT_FOUND', 'No effect called ' + p.name, 'Premiere has no effect called “' + p.name + '”.', 'Use its name as the Effects panel shows it, e.g. Gaussian Blur, Lumetri Color, Warp Stabilizer, Black & White.');
        var it = qeItemAt(q, seq, kind, track, ti.start.seconds);
        if (!it) throw U.err('HOST_SCRIPT', 'No QE item at ' + ti.start.seconds);
        if (kind === 'audio') it.addAudioEffect(eff); else it.addVideoEffect(eff);
        return 1;
    }
    function setSpeed(q, seq, kind, track, ti, p) {
        var it = qeItemAt(q, seq, kind, track, ti.start.seconds), want = Number(p.percent) / 100;
        if (!it || !(want > 0)) throw U.err('BAD_INPUT', 'speed ' + p.percent);
        var tries = [function () { it.setSpeed(want, '', false, false, true); }, function () { it.setSpeed(want * 100, '', false, false, true); }, function () { it.setSpeed(want); }];
        for (var i = 0; i < tries.length; i++) {
            try { tries[i](); } catch (e) { continue; }
            var now = clipAt(seq, kind, track, ti.start.seconds), got = 0; try { got = Math.abs(now.getSpeed()); } catch (e2) { }
            if (Math.abs(got - want) < 0.01) return 1;
        }
        throw U.err('HOST_SCRIPT', 'setSpeed not taken', 'Premiere didn’t change the speed.', 'Use Clip › Speed/Duration for this one.');
    }
    function motion(ti, p) {
        var m = component(ti, /^Motion$/), n = 0;
        if (!m) throw U.err('HOST_SCRIPT', 'No Motion on ' + ti.name, 'That clip has no Motion settings.');
        if (p.scale != null) { var sc = property(m, /^Scale$/); sc.setTimeVarying(false); sc.setValue(Number(p.scale), true); n++; }
        if (p.rotation != null) { var r = property(m, /^Rotation$/); r.setValue(Number(p.rotation), true); n++; }
        if (p.x != null || p.y != null) { var pos = property(m, /^Position$/), v = pos.getValue(); pos.setValue([p.x != null ? Number(p.x) : v[0], p.y != null ? Number(p.y) : v[1]], true); n++; }
        return n ? 1 : 0;
    }
    function opacity(ti, p) { var o = property(component(ti, /^Opacity$/), /^Opacity$/); if (!o) throw U.err('HOST_SCRIPT', 'No Opacity'); o.setValue(Number(p.value), true); return 1; }
    /** A slow zoom across the clip (punch-in or out): Scale keyframed from → to. */
    function zoom(seq, ti, p) {
        var sc = property(component(ti, /^Motion$/), /^Scale$/);
        if (!sc) throw U.err('HOST_SCRIPT', 'No Scale');
        var from = Number(p.from != null ? p.from : 100), to = Number(p.to != null ? p.to : 110);
        var a0 = ti.start.seconds, a1 = ti.end.seconds;
        if (p.seconds > 0 && p.seconds < a1 - a0) { if (p.at === 'end') a0 = a1 - p.seconds; else a1 = a0 + p.seconds; }
        sc.setTimeVarying(true);
        var k0 = mediaTime(ti, a0), k1 = mediaTime(ti, a1 - 1 / U.seqFps(seq));
        sc.addKey(k0); sc.setValueAtKey(k0, from, true);
        sc.addKey(k1); sc.setValueAtKey(k1, to, true);
        return 1;
    }
    function volume(ti, p) {
        var lvl = property(component(ti, /^Volume$/), /^Level$/);
        if (!lvl) throw U.err('HOST_SCRIPT', 'No Volume', 'That isn’t an audio clip.');
        var f = Math.pow(10, Number(p.db) / 20), keyed = false; try { keyed = lvl.isTimeVarying(); } catch (e) { }
        if (keyed) { var ks = lvl.getKeys() || []; for (var i = 0; i < ks.length; i++) lvl.setValueAtKey(ks[i], lvl.getValueAtKey(ks[i]) * f, true); }
        else lvl.setValue(lvl.getValue() * f, true);
        return 1;
    }
    function label(ti, p) {
        if (typeof ti.setColorLabel !== 'function') throw U.err('HOST_SCRIPT', 'No setColorLabel', 'This Premiere can’t colour timeline clips from a script.', 'Colour them in the Project panel instead (that colours every use).');
        ti.setColorLabel(Number(p.label)); return 1;
    }
    function textLayer(seq, ti, p, log) {
        var base = String(app.path || ''), file = p.style === 'lowerThird' ? 'Basic Lower Third.mogrt' : 'Basic Title.mogrt', f = null;
        var tries = [base + '/Contents/Essential Graphics/' + file, base + '/Essential Graphics/' + file, base + '\\Essential Graphics\\' + file];
        for (var i = 0; i < tries.length && !f; i++) { var x = new File(tries[i]); if (x.exists) f = x.fsName; }
        if (!f) throw U.err('NOT_FOUND', file + ' not found', 'Premiere’s ' + file.replace('.mogrt', '') + ' template isn’t installed.');
        var top = textTrack(seq), at = ti ? ti.start.seconds : Number(p.start || 0), len = Number(p.seconds || 4);
        var g = seq.importMGT(f, String(Math.round(at * U.TICKS)), top, 0);
        if (!g) throw U.err('HOST_SCRIPT', 'importMGT refused', 'Premiere didn’t add the text.');
        try { var e = new Time(); e.seconds = at + len; g.end = e; } catch (e1) { log.push('length: ' + e1); }
        var mgt = null; try { mgt = g.getMGTComponent(); } catch (e2) { }
        if (mgt) for (var k = 0; k < mgt.properties.numItems; k++) {
            var pr = mgt.properties[k], v = pr.getValue();
            if (typeof v === 'string' && v.indexOf('textEditValue') >= 0) { var j = v.indexOf('{'), o = JSON.parse(v.slice(j)); o.textEditValue = String(p.text || ''); pr.setValue(v.slice(0, j) + JSON.stringify(o), true); break; }
        }
        try { g.name = String(p.text || 'Text'); } catch (e3) { }
        return 1;
    }
    /** A video track above everything for Ask's text, named "Ask text" (made the first time). */
    function textTrack(seq) {
        for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) if (trim(seq.videoTracks[t].name) === 'Ask text') return t;
        var n = seq.videoTracks.numTracks;
        U.labelParts.ensureVideoTracks(seq, n + 1);
        try { U.openAndQE(seq).getVideoTrackAt(n).setName('Ask text'); } catch (e) { }
        return n;
    }

    /**
     * Apply one kind of edit. a: {seqId, op, params, targets:[{kind, track, start} | {start, end} (a range)]}
     * ops: transition {name, at: start|end|both, frames} · effect {name} · speed {percent} · motion {scale, x, y, rotation}
     * · opacity {value} · zoom {from, to, seconds?, at?} · volume {db} · label {label} · enable {on} · remove {ripple}
     * · rename {name} · marker {name, comment, color} · text {text, style: title|lowerThird, seconds} · razor (ranges' starts/ends)
     * -> {done, skipped:[{start, track, kind, why}], log}
     */
    fn.editApply = function (a) {
        var seq = U.needSeq(a.seqId), p = a.params || {}, out = { done: 0, skipped: [], log: [] }, q = null;
        var targets = (a.targets || []).slice(0);
        // removing with ripple, last first, so earlier times stay put
        if (a.op === 'remove') targets.sort(function (x, y) { return y.start - x.start; });
        if (/^(transition|effect|speed|razor)$/.test(a.op)) q = U.openAndQE(seq);
        if (a.op === 'razor') {
            var times = {}, list = [];
            for (var r = 0; r < targets.length; r++) { times[Math.round(targets[r].start * 1000)] = targets[r].start; if (targets[r].end != null) times[Math.round(targets[r].end * 1000)] = targets[r].end; }
            for (var k in times) if (times.hasOwnProperty(k)) list.push(times[k]);
            list.sort(function (x, y) { return y - x; });
            for (var z = 0; z < list.length; z++) { try { q.razor(U.framesToTC(U.secToFrames(list[z], seq), seq)); out.done++; } catch (e) { out.skipped.push({ start: list[z], why: String(e.message || e) }); } }
            return out;
        }
        for (var i = 0; i < targets.length; i++) {
            var g = targets[i], ti = g.kind ? clipAt(seq, g.kind, g.track, g.start) : null;
            try {
                if (a.op === 'marker') {
                    var m = seq.markers.createMarker(g.start);
                    m.name = String(p.name || (ti ? ti.name : '') || 'Ask'); if (p.comment) m.comments = String(p.comment);
                    var en = new Time(); en.seconds = g.end != null ? g.end : ti ? ti.end.seconds : g.start; m.end = en;
                    if (p.color != null) { try { m.setColorByIndex(Number(p.color)); } catch (e0) { } }
                    out.done++; continue;
                }
                if (a.op === 'text') { out.done += textLayer(seq, ti, { text: p.text || g.text, style: p.style, seconds: p.seconds || (g.end != null ? g.end - g.start : 4), start: g.start }, out.log); continue; }
                if (!ti) { out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: 'not on the timeline any more' }); continue; }
                if (a.op === 'transition') out.done += addTransition(q, seq, g.kind, g.track, ti, p) ? 1 : 0;
                else if (a.op === 'effect') out.done += addEffect(q, seq, g.kind, g.track, ti, p);
                else if (a.op === 'speed') out.done += setSpeed(q, seq, g.kind, g.track, ti, p);
                else if (a.op === 'motion') out.done += motion(ti, p);
                else if (a.op === 'opacity') out.done += opacity(ti, p);
                else if (a.op === 'zoom') out.done += zoom(seq, ti, p);
                else if (a.op === 'volume') out.done += volume(ti, p);
                else if (a.op === 'label') out.done += label(ti, p);
                else if (a.op === 'enable') { ti.disabled = !p.on; out.done += (!!ti.disabled === !p.on) ? 1 : 0; }
                else if (a.op === 'rename') { ti.name = String(p.name || ti.name); out.done++; }
                else if (a.op === 'remove') { ti.remove(!!p.ripple, false); out.done++; }
                else throw U.err('BAD_INPUT', 'Unknown edit ' + a.op);
            } catch (e) {
                out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: String((e && (e.usTitle || e.message)) || e) });
                if (e && e.usCode === 'NOT_FOUND') break;   // a transition or effect that doesn't exist won't on the next clip either
            }
        }
        return out;
    };
})(UStudio);
