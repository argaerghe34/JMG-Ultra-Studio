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
    /**
     * Trim a clip where it lies (nothing after it moves): p.length (seconds, from its start), p.tail (seconds added to –
     * or with a minus taken off – its end), p.head (the same at its start; the picture underneath stays in step).
     */
    function trimClip(seq, ti, p) {
        var s = ti.start.seconds, e = ti.end.seconds, sp = 1, ns = s, ne = e, t;
        try { sp = Math.abs(ti.getSpeed()) || 1; } catch (x) { }
        if (p.length != null && isFinite(Number(p.length))) ne = s + Number(p.length);
        if (p.tail != null && isFinite(Number(p.tail))) ne = ne + Number(p.tail);
        if (p.head != null && isFinite(Number(p.head))) ns = Math.max(0, s - Number(p.head));
        if (!(ne - ns > 1 / U.seqFps(seq))) throw U.err('BAD_INPUT', 'trim leaves nothing', 'Nothing would be left of the clip.');
        if (ns !== s) {
            var i0 = ti.inPoint.seconds, ni = i0 + (ns - s) * sp;
            if (ni < 0) { ns = s - i0 / sp; ni = 0; }   // no more of the clip before its first frame
            t = new Time(); t.seconds = ni; ti.inPoint = t;
            t = new Time(); t.seconds = ns; ti.start = t;
        }
        if (ne !== e) { t = new Time(); t.seconds = ne; ti.end = t; }
        return 1;
    }
    /** Slide a clip earlier or later by p.seconds (it writes over what is there; nothing ripples). */
    function shift(ti, p) {
        var d = Number(p.seconds);
        if (!isFinite(d) || d === 0) throw U.err('BAD_INPUT', 'no seconds given', 'Say how many seconds to move it by.');
        if (ti.start.seconds + d < 0) d = -ti.start.seconds;
        var t = new Time(); t.seconds = d; ti.move(t);
        return 1;
    }
    function esc(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    /** The settings of an effect that a person would know by name (Premiere's own hidden ones, “_ …”, and unnamed ones left out). */
    function settingNames(c) {
        var names = [];
        for (var k = 0; k < c.properties.numItems && names.length < 40; k++) { var n = ''; try { n = String(c.properties[k].displayName || ''); } catch (e) { n = ''; } if (n && n.charAt(0) !== '_' && n !== 'Error occurred') names.push(n); }
        return names;
    }
    /**
     * Set one setting of an effect that is on the clip (Motion, Opacity, Crop, Lumetri Color, Volume, anything added):
     * p.effect and p.property as the Effect Controls panel names them; p.value, or p.keys [{at (seconds from the clip's
     * start), value}] for keyframes.
     */
    function setProp(ti, p) {
        var re = new RegExp('^' + esc(p.effect) + '$', 'i'), c = null, k0;
        for (k0 = 0; k0 < ti.components.numItems; k0++) if (re.test(String(ti.components[k0].displayName))) c = ti.components[k0];
        if (!c) for (k0 = 0; k0 < ti.components.numItems; k0++) if (re.test(String(ti.components[k0].matchName))) c = ti.components[k0];
        if (!c) { var have = []; for (k0 = 0; k0 < ti.components.numItems; k0++) have.push(String(ti.components[k0].displayName)); throw U.err('BAD_INPUT', 'no effect ' + p.effect, 'That clip has no “' + p.effect + '” (it has: ' + have.join(', ') + ') – add the effect first.'); }
        var pr = property(c, new RegExp('^' + esc(p.property) + '$', 'i'));
        if (!pr) { var names = settingNames(c); throw U.err('BAD_INPUT', 'no setting ' + p.property, '“' + p.effect + '” has no setting called “' + p.property + '”. It has: ' + names.join(', ') + '.'); }
        if (p.keys && p.keys.length) {
            pr.setTimeVarying(true);
            for (var i = 0; i < p.keys.length; i++) { var kt = mediaTime(ti, ti.start.seconds + Number(p.keys[i].at || 0)); pr.addKey(kt); pr.setValueAtKey(kt, p.keys[i].value, true); }
        } else {
            if (p.value == null) throw U.err('BAD_INPUT', 'no value', 'Give the value to set.');
            try { if (pr.isTimeVarying()) pr.setTimeVarying(false); } catch (e) { }
            pr.setValue(p.value, true);
        }
        return 1;
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
        var at = p.at || 'both', dur = tcFrames(seq, p.frames || (p.seconds ? p.seconds * U.seqFps(seq) : Math.round(U.seqFps(seq) / 2))), n = 0;
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
        if (a.op === 'remove' || a.op === 'speed' || (a.op === 'shift' && Number(p.seconds) > 0)) targets.sort(function (x, y) { return y.start - x.start; });   // from the end: a ripple doesn't move what's still to do
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
                    // times as plain numbers: Premiere 2027 refuses a Time object here ("Illegal Parameter type") – and it
                    // did so AFTER making the marker, so a failed step left one behind and a retry doubled it
                    var ms = Number(g.start), me = Number(g.end != null ? g.end : ti ? ti.end.seconds : g.start);
                    var m = seq.markers.createMarker(ms);
                    try {
                        m.name = String(p.name || (ti ? ti.name : '') || 'Ask'); if (p.comment) m.comments = String(p.comment);
                        if (isFinite(me) && me > ms) m.end = me;
                    } catch (eM) { try { seq.markers.deleteMarker(m); } catch (eD) { } throw eM; }
                    if (p.color != null && isFinite(Number(p.color))) { try { m.setColorByIndex(Number(p.color)); } catch (e0) { out.log.push('marker colour: ' + e0); } }
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
                else if (a.op === 'trim') out.done += trimClip(seq, ti, p);
                else if (a.op === 'shift') out.done += shift(ti, p);
                else if (a.op === 'set') out.done += setProp(ti, p);
                else throw U.err('BAD_INPUT', 'Unknown edit ' + a.op);
            } catch (e) {
                out.skipped.push({ start: g.start, track: g.track, kind: g.kind, why: String((e && (e.usTitle || e.message)) || e) });
                if (e && e.usCode === 'NOT_FOUND') break;   // a transition or effect that doesn't exist won't on the next clip either
            }
        }
        return out;
    };

    /**
     * The project next to the sequence or bin Ask › Edit reads, so a request can reach other sequences and clips ("the
     * logo at the end of every sequence in Shorts"). a: {maxClips} -> {bins:[paths], sequences:[{id, itemId, name, bin,
     * duration, video, audio}], clips:[{id, name, file, bin, kind}], more: clips left out}
     */
    var STILL = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga)$/i, SOUND = /\.(wav|bwf|mp3|aiff?|m4a|aac|flac|ogg|wma|caf)$/i;
    fn.editProject = function (a) {
        var max = (a && a.maxClips) || 3000, bins = [], seqBin = {}, clips = [], more = 0, seqs = [], i;
        U.walk(U.project().rootItem, function (c) {
            if (c.type === 2) { bins.push(U.binPath(c)); return; }
            if (c.type !== 1) return;
            var isSeq = false; try { isSeq = c.isSequence(); } catch (e) { }
            if (isSeq) { seqBin[c.nodeId] = U.binPath(c); return; }
            if (clips.length >= max) { more++; return; }
            var p = ''; try { p = c.getMediaPath() || ''; } catch (e) { }
            clips.push({ id: c.nodeId, name: c.name, file: p.split(/[\\\/]/).pop(), bin: U.binPath(c), kind: !p ? 'other' : STILL.test(p) ? 'still' : SOUND.test(p) ? 'audio' : 'video' });
        });
        var all = U.project().sequences;
        for (i = 0; i < all.numSequences; i++) {
            var s = all[i], itemId = ''; try { itemId = s.projectItem.nodeId; } catch (e) { }
            seqs.push({ id: s.sequenceID, itemId: itemId, name: s.name, bin: seqBin[itemId] || '(Project root)', duration: U.ticksToSec(s.end), video: s.videoTracks.numTracks, audio: s.audioTracks.numTracks });
        }
        return { bins: bins, sequences: seqs, clips: clips, more: more };
    };

    /* ---------- Ask › Undo: what the chat made, checked before it is taken away again ---------- */
    /**
     * Where sequences stand now, so Ask can tell whether one it made has been changed since.
     * a: {seqIds:[...]} -> [{id, missing:true} | {id, name, duration, clips, markers, guids:[marker ids]}]
     */
    fn.askStamp = function (a) {
        var out = [], ids = a.seqIds || [];
        for (var i = 0; i < ids.length; i++) {
            var s = U.seqById(ids[i]);
            if (!s) { out.push({ id: ids[i], missing: true }); continue; }
            var n = 0, t, guids = [];
            for (t = 0; t < s.videoTracks.numTracks; t++) n += s.videoTracks[t].clips.numItems;
            for (t = 0; t < s.audioTracks.numTracks; t++) n += s.audioTracks[t].clips.numItems;
            try { var m = s.markers.getFirstMarker(); while (m) { guids.push(m.guid); m = s.markers.getNextMarker(m); } } catch (e) { }
            out.push({ id: ids[i], name: s.name, duration: Math.round(U.ticksToSec(s.end) * 1000) / 1000, clips: n, markers: guids.length, guids: guids });
        }
        return out;
    };
    /**
     * Take away bins Ask made – only the ones with nothing left in them (a bin holding anything stays, and says so).
     * a: {paths:['JMG Ultra Studio / Ask', ...]} (as listBins gives them) -> {removed:[paths], kept:[{path, why}]}
     */
    fn.askRemoveBins = function (a) {
        var want = (a.paths || []).slice(0), removed = [], kept = [], i;
        // deepest first, so a bin emptied by removing the one inside it can go too
        want.sort(function (x, y) { return y.split(' / ').length - x.split(' / ').length; });
        for (i = 0; i < want.length; i++) {
            var found = null;
            U.walk(U.project().rootItem, function (c) { if (c.type === 2 && U.binPath(c) === want[i]) { found = c; return false; } });
            if (!found) { kept.push({ path: want[i], why: 'not there any more' }); continue; }
            if (found.children && found.children.numItems > 0) { kept.push({ path: want[i], why: 'not empty' }); continue; }
            try { found.deleteBin(); removed.push(want[i]); } catch (e) { kept.push({ path: want[i], why: 'Premiere would not remove it' }); }
        }
        return { removed: removed, kept: kept };
    };
    /**
     * Ask › dictation. Premiere gives scripts no way to start its own transcription, so this says so (Resolve's twin
     * transcribes with Resolve); the panel then uses a listening model on this computer when there is one.
     * a: {path} -> {unsupported: true, why}
     */
    fn.dictateTranscribe = function (a) {
        return { unsupported: true, why: 'Premiere can’t be asked to transcribe from a panel.' };
    };
    /* ---------- Ask: finding its way round a big project (bins with counts, clips by name, file or bin) ---------- */
    function askKind(c) {
        var isSeq = false; try { isSeq = c.isSequence(); } catch (e) { }
        if (isSeq) return 'sequence';
        var p = ''; try { p = c.getMediaPath() || ''; } catch (e2) { }
        if (!p) return 'other';
        if (/\.(wav|bwf|mp3|aiff?|m4a|aac|flac|ogg|wma|caf)$/i.test(p)) return 'audio';
        if (/\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga)$/i.test(p)) return 'still';
        return 'video';
    }
    function has(text, part) { return !part || String(text).toLowerCase().indexOf(String(part).toLowerCase()) >= 0; }
    /**
     * The project's bins with how much is in each. a: {filter (part of the path), offset, limit}
     * -> {total, bins:[{id, path, clips, bins}]} (clips and bins: directly inside it)
     */
    fn.askBins = function (a) {
        var all = [], off = Number(a.offset) || 0, lim = Number(a.limit) || 200, out = [], i;
        U.walk(U.project().rootItem, function (c) {
            if (c.type !== 2) return;
            var path = U.binPath(c);
            if (!has(path, a.filter)) return;
            var n = 0, b = 0;
            try { for (var k = 0; k < c.children.numItems; k++) { if (c.children[k].type === 2) b++; else n++; } } catch (e) { }
            all.push({ id: c.nodeId, path: path, clips: n, bins: b });
        });
        for (i = off; i < all.length && out.length < lim; i++) out.push(all[i]);
        return { total: all.length, bins: out };
    };
    /**
     * Clips by part of their name, of their file's path, or of their bin's path. a: {name, path, bin, kinds:['video'…],
     * offset, limit, idsOnly} -> {total, items:[{id, name, bin, path, kind}]} or, with idsOnly, {total, ids:[…]}
     */
    fn.askFind = function (a) {
        var off = Number(a.offset) || 0, lim = Number(a.limit) || 300, total = 0, items = [], ids = [], kinds = a.kinds || null;
        function wanted(k) { if (!kinds || !kinds.length) return true; for (var j = 0; j < kinds.length; j++) if (kinds[j] === k) return true; return false; }
        U.walk(U.project().rootItem, function (c) {
            if (c.type === 2 || c.type === 3) return;
            if (a.idsOnly) { total++; ids.push(c.nodeId); return; }
            if (!has(c.name, a.name)) return;
            var bin = U.binPath(c);
            if (!has(bin, a.bin)) return;
            var p = ''; try { p = c.getMediaPath() || ''; } catch (e) { }
            if (a.path && !has(p.replace(/\\/g, '/'), String(a.path).replace(/\\/g, '/'))) return;
            var k = askKind(c);
            if (!wanted(k)) return;
            total++;
            if (total > off && items.length < lim) items.push({ id: c.nodeId, name: c.name, bin: bin, path: p, kind: k });
        });
        return a.idsOnly ? { total: total, ids: ids } : { total: total, items: items };
    };
    /* ---------- Ask: the sequence itself, its tracks and the selection ---------- */
    /**
     * A sequence's name and its In and Out. a: {seqId, name, inPoint, outPoint (seconds; -1 clears both)}
     * -> {done:[what changed], failed:[why], was:{name}}
     */
    fn.seqSet = function (a) {
        var s = U.needSeq(a.seqId), out = { done: [], failed: [], was: { name: s.name } };
        if (a.name != null && String(a.name) !== '') { try { s.name = String(a.name); out.done.push('name'); } catch (e) { out.failed.push('name: ' + e); } }
        if (a.outPoint != null && Number(a.outPoint) >= 0) { try { s.setOutPoint(Number(a.outPoint)); out.done.push('out'); } catch (e2) { out.failed.push('out: ' + e2); } }
        if (a.inPoint != null && Number(a.inPoint) >= 0) { try { s.setInPoint(Number(a.inPoint)); out.done.push('in'); } catch (e3) { out.failed.push('in: ' + e3); } }
        return out;
    };
    /**
     * Tracks: add some, or name, lock or switch one off. a: {seqId, kind:'video'|'audio', add (how many), index, name,
     * locked, muted} -> {done:[…], failed:[…], video, audio (how many tracks there are now)}
     */
    fn.trackSet = function (a) {
        var s = U.needSeq(a.seqId), out = { done: [], failed: [] }, audio = a.kind === 'audio';
        if (Number(a.add) > 0) {
            var n = Math.min(8, Number(a.add)), before = audio ? s.audioTracks.numTracks : s.videoTracks.numTracks;
            try {
                var q = U.openAndQE(s);
                // addTracks(numVideo, videoIndex, numAudio, audioType, audioIndex, numSubmix, submixType, submixIndex)
                q.addTracks(audio ? 0 : n, s.videoTracks.numTracks, audio ? n : 0, 1, s.audioTracks.numTracks, 0, 0, 0);
            } catch (e) { out.failed.push('add: ' + e); }
            var now = audio ? s.audioTracks.numTracks : s.videoTracks.numTracks;
            if (now > before) out.done.push('added ' + (now - before)); else if (!out.failed.length) out.failed.push('add: Premiere did not add a track');
        }
        if (a.index != null) {
            var tr = audio ? s.audioTracks[Number(a.index)] : s.videoTracks[Number(a.index)];
            if (!tr) out.failed.push('there is no such track');
            else {
                if (a.name != null) { try { tr.name = String(a.name); if (String(tr.name) === String(a.name)) out.done.push('name'); else out.failed.push('name: Premiere does not let a script name a track'); } catch (e1) { out.failed.push('name: Premiere does not let a script name a track'); } }
                if (a.muted != null) { try { tr.setMute(a.muted ? 1 : 0); out.done.push(a.muted ? 'off' : 'on'); } catch (e2) { out.failed.push('mute: ' + e2); } }
                if (a.locked != null) { try { if (typeof tr.setLocked === 'function') { tr.setLocked(a.locked ? 1 : 0); out.done.push(a.locked ? 'locked' : 'unlocked'); } else out.failed.push('lock: this Premiere does not let a script lock a track'); } catch (e3) { out.failed.push('lock: ' + e3); } }
            }
        }
        out.video = s.videoTracks.numTracks; out.audio = s.audioTracks.numTracks;
        return out;
    };
    /** Select clips on the timeline (and nothing else). a: {seqId, targets:[{kind, track, start}]} -> how many are selected */
    fn.selectClips = function (a) {
        var s = U.needSeq(a.seqId), n = 0, t, c, i;
        for (t = 0; t < s.videoTracks.numTracks; t++) for (c = 0; c < s.videoTracks[t].clips.numItems; c++) { try { s.videoTracks[t].clips[c].setSelected(false, true); } catch (e) { } }
        for (t = 0; t < s.audioTracks.numTracks; t++) for (c = 0; c < s.audioTracks[t].clips.numItems; c++) { try { s.audioTracks[t].clips[c].setSelected(false, true); } catch (e2) { } }
        for (i = 0; i < (a.targets || []).length; i++) { var g = a.targets[i], ti = clipAt(s, g.kind, g.track, g.start); if (ti) { try { ti.setSelected(true, true); n++; } catch (e3) { } } }
        return n;
    };
    /**
     * The effects on timeline clips, as Effect Controls names them, each with its settings (and a number's value) – so a
     * setting can be set by its real name. a: {seqId, targets:[{kind, track, start}]}
     * -> [{start, track, kind, name, found, effects:[{name, matchName, settings:[{name, value}]}]}]
     */
    fn.clipEffects = function (a) {
        var s = U.needSeq(a.seqId), out = [];
        for (var i = 0; i < (a.targets || []).length; i++) {
            var g = a.targets[i], ti = clipAt(s, g.kind, g.track, g.start), row = { start: g.start, track: g.track, kind: g.kind, found: !!ti, name: ti ? ti.name : '', effects: [] };
            if (ti) for (var k = 0; k < ti.components.numItems; k++) {
                var c = ti.components[k], e = { name: String(c.displayName), matchName: String(c.matchName), settings: [] }, names = settingNames(c);
                for (var n = 0; n < names.length; n++) {
                    var pr = property(c, new RegExp('^' + esc(names[n]) + '$')), v = null;
                    try { v = pr.getValue(); } catch (e1) { v = null; }
                    e.settings.push({ name: names[n], value: typeof v === 'number' || typeof v === 'boolean' ? v : (v && v.length === 2 && typeof v[0] === 'number' ? [v[0], v[1]] : null) });
                }
                row.effects.push(e);
            }
            out.push(row);
        }
        return out;
    };
})(UStudio);
