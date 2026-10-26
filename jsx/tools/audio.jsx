// JMG Ultra Studio – Premiere side for the sound tools (Silence Cut, Beat Cut, Song Splitter, Sound Check). ES3.

/** Locked tracks that hold clips (cutting time out of the sequence would leave them out of sync). */
UStudio.fn.lockedTracksWithClips = function (a) {
    var s = UStudio.needSeq(a.seqId), out = [], t;
    for (t = 0; t < s.videoTracks.numTracks; t++) { var v = s.videoTracks[t]; if (v.isLocked() && v.clips.numItems) out.push('V' + (t + 1)); }
    for (t = 0; t < s.audioTracks.numTracks; t++) { var au = s.audioTracks[t]; if (au.isLocked() && au.clips.numItems) out.push('A' + (t + 1)); }
    return out;
};

/**
 * Change the loudness of a whole sequence (the copy) by `db`: every clip's Volume Level on the tracks that play,
 * keyframes included. Clip Level can't go above +6 dB, so clips that would are held there and counted.
 * a: {seqId, db} -> {clips, capped, keyframed}
 */
UStudio.fn.soundGain = function (a) {
    var U = UStudio, seq = U.needSeq(a.seqId), f = Math.pow(10, a.db / 20), MAX = Math.pow(10, (6 - 15) / 20);
    var out = { clips: 0, capped: 0, keyframed: 0 };
    for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        var tr = seq.audioTracks[t]; try { if (tr.isMuted()) continue; } catch (e) { }
        for (var c = 0; c < tr.clips.numItems; c++) {
            var ti = tr.clips[c], lvl = null;
            for (var k = 0; k < ti.components.numItems && !lvl; k++) {
                var cp = ti.components[k];
                if (cp.displayName !== 'Volume') continue;
                for (var p = 0; p < cp.properties.numItems; p++) if (cp.properties[p].displayName === 'Level') lvl = cp.properties[p];
            }
            if (!lvl) continue;
            var keyed = false; try { keyed = lvl.isTimeVarying(); } catch (e) { }
            if (keyed) {
                var keys = lvl.getKeys() || [];
                for (var i = 0; i < keys.length; i++) { var v = lvl.getValueAtKey(keys[i]) * f; if (v > MAX) { v = MAX; out.capped++; } lvl.setValueAtKey(keys[i], v, true); }
                out.keyframed++;
            } else {
                var nv = lvl.getValue() * f; if (nv > MAX) { nv = MAX; out.capped++; }
                lvl.setValue(nv, true);
            }
            out.clips++;
        }
    }
    return out;
};

/**
 * Duck music clips under speech with Volume keyframes. a: {seqId, clips:[{track, index, keys:[{t (sequence s), duck}]}],
 * db} -> {clips, skipped}. Key times are converted to the clip's own media time (where Premiere keeps them); a clip that
 * already has volume keyframes is left alone.
 */
UStudio.fn.soundDuck = function (a) {
    var U = UStudio, seq = U.needSeq(a.seqId), f = Math.pow(10, -Math.abs(a.db) / 20), out = { clips: 0, skipped: 0 };
    for (var i = 0; i < a.clips.length; i++) {
        var c = a.clips[i], ti = seq.audioTracks[c.track].clips[c.index], lvl = null;
        for (var k = 0; k < ti.components.numItems && !lvl; k++) { var cp = ti.components[k]; if (cp.displayName === 'Volume') for (var p = 0; p < cp.properties.numItems; p++) if (cp.properties[p].displayName === 'Level') lvl = cp.properties[p]; }
        if (!lvl) { out.skipped++; continue; }
        var keyed = false; try { keyed = lvl.isTimeVarying(); } catch (e) { }
        if (keyed) { out.skipped++; continue; }
        var base = lvl.getValue(), speed = 1; try { speed = Math.abs(ti.getSpeed()) || 1; } catch (e) { }
        lvl.setTimeVarying(true);
        for (var j = 0; j < c.keys.length; j++) {
            var t = new Time(); t.seconds = ti.inPoint.seconds + (c.keys[j].t - ti.start.seconds) * speed;
            lvl.addKey(t); lvl.setValueAtKey(t, c.keys[j].duck ? base * f : base, true);
        }
        out.clips++;
    }
    return out;
};
