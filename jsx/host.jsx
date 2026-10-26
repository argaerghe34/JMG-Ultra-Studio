// JMG Ultra Studio – Premiere side (ExtendScript, ES3: no let/const, arrow functions or array helpers).
// Every call goes through UStudio.run(name, jsonArgs) and returns {"ok":true,"data":...} or {"ok":false,"error":{...}}.
// Tool scripts in jsx/tools/*.jsx add functions with UStudio.fn.<name> = function (args) {...}.
var UStudio = (function () {
    var TICKS = 254016000000;
    var fn = {};

    function err(code, detail, title, action) {
        var e = new Error(detail || code);
        e.usCode = code; e.usTitle = title; e.usAction = action;
        return e;
    }

    function run(name, argsJson) {
        try {
            var f = fn[name];
            if (!f) throw err('HOST_SCRIPT', 'Unknown host function: ' + name);
            var args = argsJson ? JSON.parse(argsJson) : {};
            var data = f(args || {});
            return JSON.stringify({ ok: true, data: data === undefined ? null : data });
        } catch (e) {
            return JSON.stringify({ ok: false, error: {
                code: e.usCode || 'UNKNOWN', title: e.usTitle, action: e.usAction,
                detail: String(e.message || e) + (e.line ? ' (line ' + e.line + (e.fileName ? ' of ' + String(e.fileName).split('/').pop() : '') + ')' : '')
            } });
        }
    }

    /* ---------- basics ---------- */
    function project() {
        if (!app.project || !app.project.rootItem) throw err('NO_PROJECT');
        return app.project;
    }
    function secToTicks(s) { return String(Math.round(s * TICKS)); }
    function ticksToSec(t) { return Number(t) / TICKS; }
    function timeObj(s) { var t = new Time(); t.seconds = s; return t; }
    function contains(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; }

    function walk(item, cb, depth) {
        depth = depth || 0;
        if (!item || !item.children) return;
        for (var i = 0; i < item.children.numItems; i++) {
            var c = item.children[i];
            if (cb(c, depth) === false) return false;
            if (c.type === 2 /* BIN */) { if (walk(c, cb, depth + 1) === false) return false; }
        }
    }
    function itemById(id) {
        var found = null;
        if (!id) return null;
        if (project().rootItem.nodeId === id) return project().rootItem;
        walk(project().rootItem, function (c) { if (c.nodeId === id) { found = c; return false; } });
        return found;
    }
    function needItem(id) { var it = itemById(id); if (!it) throw err('NOT_FOUND', 'Project item ' + id); return it; }
    function binPath(item) {
        // treePath looks like "\\Project.prproj\\Bin\\Sub" (for a clip, the last part is the clip itself)
        var p = String(item.treePath || item.name).split('\\');
        var parts = [], last = item.type === 2 ? p.length : p.length - 1;
        for (var i = 2; i < last; i++) if (p[i]) parts.push(p[i]);
        return parts.length ? parts.join(' / ') : '(Project root)';
    }

    function seqById(id) {
        var seqs = project().sequences;
        for (var i = 0; i < seqs.numSequences; i++) if (seqs[i].sequenceID === id) return seqs[i];
        return null;
    }
    function needSeq(id) {
        var s = id ? seqById(id) : project().activeSequence;
        if (!s) throw err(id ? 'NOT_FOUND' : 'NO_SEQUENCE', 'Sequence ' + (id || '(active)'));
        return s;
    }
    function seqFps(seq) { return TICKS / Number(seq.timebase); }

    /* ---------- item details ---------- */
    var STILL_EXT = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga)$/i;
    /** "00:01:02:12" / "00:01:02;12" (drop-frame) / "00:00:03:24000" (audio samples) -> seconds, using "25.00 fps" or "48000 Hz". */
    function tcToSec(tc, timebase) {
        var m = /([\d.]+)\s*(fps|Hz)/i.exec(String(timebase || ''));
        var p = String(tc || '').split(/[:;]/);
        if (!m || p.length < 4) return NaN;
        var rate = Number(m[1]), h = Number(p[0]), mi = Number(p[1]), se = Number(p[2]), f = Number(p[3]);
        if (/hz/i.test(m[2])) return h * 3600 + mi * 60 + se + f / rate;
        var base = Math.round(rate), frames = (h * 3600 + mi * 60 + se) * base + f;
        if (String(tc).indexOf(';') >= 0 && (base === 30 || base === 60)) { var d = base === 60 ? 4 : 2, mins = h * 60 + mi; frames -= d * (mins - Math.floor(mins / 10)); }
        return frames / rate;
    }
    /**
     * Project panel columns for an item, as {ColumnID: value}. getProjectColumnsMetadata() only answers while a
     * Project panel is open, so fall back to the item's project metadata (XMP) and convert its timecodes to ticks.
     */
    function columns(item) {
        var o = {}, n = 0;
        try {
            var cols = JSON.parse(item.getProjectColumnsMetadata());
            for (var i = 0; i < cols.length; i++) { o[cols[i].ColumnID] = cols[i].ColumnValue; n++; }
        } catch (e) { }
        if (n) return o;
        try {
            var x = String(item.getProjectMetadata());
            var get = function (name) { var mm = new RegExp('Column\\.Intrinsic\\.' + name + '>([^<]*)<').exec(x); return mm ? mm[1] : ''; };
            var tb = get('MediaTimebase');
            o['Column.Intrinsic.MediaTimebase'] = tb;
            o['Column.Intrinsic.VideoInfo'] = get('VideoInfo');
            o['Column.Intrinsic.AudioInfo'] = get('AudioInfo');
            var names = ['MediaDuration', 'MediaStart', 'SubclipStart', 'SubclipEnd'];
            for (var k = 0; k < names.length; k++) {
                var sec = tcToSec(get(names[k]), tb);
                o['Column.Intrinsic.' + names[k]] = isNaN(sec) ? '' : String(Math.round(sec * TICKS));
            }
            o.__fromXMP = true;
        } catch (e2) { }
        return o;
    }
    function itemInfo(item, withCols) {
        var o = { id: item.nodeId, name: item.name, type: item.type };
        if (item.type === 2 || item.type === 3) { o.kind = 'bin'; return o; }
        var isSeq = false; try { isSeq = item.isSequence(); } catch (e) { }
        o.path = ''; try { o.path = item.getMediaPath() || ''; } catch (e) { }
        o.bin = binPath(item);
        try { o.label = item.getColorLabel(); } catch (e) { }
        try { o.offline = item.isOffline(); } catch (e) { o.offline = false; }
        try { o.proxy = item.hasProxy() ? item.getProxyPath() : ''; } catch (e) { o.proxy = ''; }
        try { o.merged = item.isMergedClip(); o.multicam = item.isMulticamClip(); } catch (e) { }
        var c = columns(item);
        o.duration = c['Column.Intrinsic.MediaDuration'] ? ticksToSec(c['Column.Intrinsic.MediaDuration']) : 0;
        var vi = c['Column.Intrinsic.VideoInfo'] || '';
        var m = /(\d+)\s*x\s*(\d+)/.exec(vi);
        o.width = m ? Number(m[1]) : 0; o.height = m ? Number(m[2]) : 0;
        o.hasVideo = !!vi; o.hasAudio = !!c['Column.Intrinsic.AudioInfo'];
        o.fpsText = c['Column.Intrinsic.MediaTimebase'] || '';
        try { var fi = item.getFootageInterpretation(); o.fps = fi.frameRate >= 1 ? fi.frameRate : 0; } catch (e) { o.fps = 0; }
        o.isSequence = isSeq;
        // subclips: duration above is the whole file; rangeStart/rangeEnd give the part the subclip uses (media time)
        var ss = c['Column.Intrinsic.SubclipStart'], se = c['Column.Intrinsic.SubclipEnd'];
        o.subclip = !!(ss && se);
        o.rangeStart = o.subclip ? ticksToSec(ss) : 0;
        o.rangeEnd = o.subclip ? ticksToSec(se) : o.duration;
        o.kind = isSeq ? 'sequence' : (o.hasVideo ? (STILL_EXT.test(o.path) ? 'still' : 'video') : (o.hasAudio ? 'audio' : 'other'));
        if (withCols) o.columns = c;
        return o;
    }
    function kindOk(info, kinds) {
        if (!kinds || !kinds.length) return info.kind !== 'bin';
        if (contains(kinds, info.kind)) return true;
        // a video clip also counts when the tool wants audio and the clip has sound
        if (contains(kinds, 'audio') && info.kind === 'video' && info.hasAudio) return true;
        return false;
    }
    function collect(items, kinds) {
        var out = [], skipped = 0, why = {};
        for (var i = 0; i < items.length; i++) {
            var info = itemInfo(items[i]);
            if (info.kind === 'bin') continue;
            if (kindOk(info, kinds)) out.push(info);
            else { skipped++; why[info.kind] = (why[info.kind] || 0) + 1; }
        }
        var whyText = []; for (var k in why) whyText.push(why[k] + ' ' + k + (why[k] > 1 ? 's' : ''));
        return { items: out, skipped: skipped, skippedWhy: whyText.join(', ') };
    }
    function selectionRaw() {
        var sel = app.getCurrentProjectViewSelection();
        var out = [];
        if (!sel) return out;
        for (var i = 0; i < sel.length; i++) {
            var it = sel[i];
            if (it.type === 2) walk(it, function (c) { if (c.type !== 2) out.push(c); });
            else out.push(it);
        }
        return out;
    }

    /* ---------- bins ---------- */
    function findChildBin(parent, name) {
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c.type === 2 && c.name === name) return c;
        }
        return null;
    }
    /** "JMG Ultra Studio/Selects" -> bin (created if missing) */
    function ensureBin(path) {
        var bin = project().rootItem;
        var parts = String(path || '').split('/');
        for (var i = 0; i < parts.length; i++) {
            var n = parts[i].replace(/^\s+|\s+$/g, '');
            if (!n) continue;
            bin = findChildBin(bin, n) || bin.createBin(n);
        }
        return bin;
    }

    /* ---------- timecode for QE calls ---------- */
    // videoDisplayFormat: 100 24, 101 25, 102 29.97DF, 103 29.97ND, 104 30, 105 50, 106 59.94DF, 107 59.94ND, 108 60, 110 23.976, 113 48
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function framesToTC(frames, seq) {
        var fmt = seq.videoDisplayFormat, fps = seqFps(seq);
        var drop = (fmt === 102 || fmt === 106);
        var base = Math.round(fps);
        if (drop) {
            var d = base === 60 ? 4 : 2, perMin = base * 60 - d, per10 = base * 600 - d * 9;
            var tens = Math.floor(frames / per10), rem = frames % per10;
            frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
        }
        var ff = frames % base, s = Math.floor(frames / base), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
        var sep = drop ? ';' : ':';
        return pad2(hh) + sep + pad2(mm) + sep + pad2(ss) + sep + pad2(ff);
    }
    function secToFrames(sec, seq) { return Math.round(sec * seqFps(seq)); }

    function openAndQE(seq) {
        project().openSequence(seq.sequenceID);
        app.enableQE();
        var q = qe.project.getActiveSequence();
        if (!q) throw err('HOST_SCRIPT', 'Could not open the sequence for editing.');
        return q;
    }

    /* ---------- presets ---------- */
    function appContents() {
        // Mac: ".../Adobe Premiere Pro 2026.app/" -> ".../Contents/"; Windows: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2026\\" -> "C:/Program Files/.../"
        var p = String(app.path || '').replace(/\\/g, '/').replace(/\/+$/, '');
        if ($.os.indexOf('Mac') >= 0 && !/\/Contents$/.test(p)) p += '/Contents';
        return p + '/';
    }
    function findPreset(rel) {
        var cands = [appContents() + rel, String(app.path).replace(/\\/g, '/').replace(/\/+$/, '') + '/' + rel];
        // fsName: the system's own form of the path (backslashes on Windows) for Media Encoder
        for (var i = 0; i < cands.length; i++) { var f = new File(cands[i]); if (f.exists) return f.fsName; }
        return '';
    }

    /* ================= public functions ================= */
    fn.ping = function () {
        return { app: 'Premiere Pro', version: app.version, build: app.build, os: $.os, hostScript: '1.0.0', project: !!(app.project && app.project.path) };
    };

    fn.context = function () {
        var o = { project: null, sequence: null, selection: 0, app: app.version };
        if (!app.project || !app.project.rootItem || !app.project.path) return o;
        o.project = { name: String(app.project.name).replace(/\.prproj$/i, ''), path: app.project.path };
        var s = app.project.activeSequence;
        if (s) {
            o.sequence = { id: s.sequenceID, name: s.name, fps: seqFps(s), duration: ticksToSec(s.end), width: s.frameSizeHorizontal, height: s.frameSizeVertical };
            try { o.sequence.playhead = s.getPlayerPosition().seconds; } catch (e) { }
        }
        try { var sel = app.getCurrentProjectViewSelection(); o.selection = sel ? sel.length : 0; } catch (e) { }
        return o;
    };

    fn.listBins = function () {
        var out = [{ id: project().rootItem.nodeId, path: '(Project root)' }];
        walk(project().rootItem, function (c) { if (c.type === 2) out.push({ id: c.nodeId, path: binPath(c) }); });
        return out;
    };

    fn.listSequences = function () {
        var out = [], seqs = project().sequences;
        for (var i = 0; i < seqs.numSequences; i++) out.push({ id: seqs[i].sequenceID, name: seqs[i].name });
        return out;
    };

    /* Cheap kind guess from the file name only – no metadata reads, so it's fast even for thousands of clips. */
    var AUDIO_EXT = /\.(wav|bwf|mp3|aiff?|m4a|aac|flac|ogg|wma|caf)$/i;
    function quickKind(c) {
        if (c.type === 2 || c.type === 3) return 'bin';
        var isSeq = false; try { isSeq = c.isSequence(); } catch (e) { }
        if (isSeq) return 'sequence';
        var p = ''; try { p = c.getMediaPath() || ''; } catch (e) { }
        if (!p) return 'other';
        return STILL_EXT.test(p) ? 'still' : AUDIO_EXT.test(p) ? 'audio' : 'video';
    }
    function quickOk(kind, kinds) {
        if (!kinds || !kinds.length) return kind !== 'bin';
        return contains(kinds, kind) || (contains(kinds, 'audio') && kind === 'video');
    }
    function quickList(raw, kinds, max) {
        var out = [], skipped = 0;
        for (var i = 0; i < raw.length; i++) {
            var k = quickKind(raw[i]);
            if (k === 'bin') continue;
            if (quickOk(k, kinds)) { if (out.length < (max || 1e9)) out.push({ id: raw[i].nodeId, name: raw[i].name, kind: k }); }
            else skipped++;
        }
        return { items: out, skipped: skipped };
    }
    /** Polled whenever the selection changes, so it must stay fast: counts by file type only. */
    fn.selectionSummary = function (a) {
        project();
        var raw = selectionRaw(), n = 0, skipped = 0;
        for (var i = 0; i < raw.length; i++) { var k = quickKind(raw[i]); if (k === 'bin') continue; if (quickOk(k, a.kinds)) n++; else skipped++; }
        return { count: n, skipped: skipped, skippedWhy: skipped ? 'not the right kind of clip' : '' };
    };
    /** Light list of the selected clips ({id,name,kind}); the panel then asks itemsInfo for details in small batches. */
    fn.selectionList = function (a) { project(); return quickList(selectionRaw(), a.kinds).items; };
    fn.binList = function (a) {
        var bin = needItem(a.binId), raw = [];
        walk(bin, function (c, d) { if (c.type !== 2 && (a.recursive !== false || d === 0)) raw.push(c); });
        return quickList(raw, a.kinds).items;
    };
    fn.selectedItems = function (a) { project(); return collect(selectionRaw(), a.kinds).items; };

    fn.binSummary = function (a) {
        var bin = needItem(a.binId), raw = [], sub = false;
        walk(bin, function (c, d) { if (c.type !== 2) { raw.push(c); if (d > 0) sub = true; } });
        var n = 0;
        for (var i = 0; i < raw.length; i++) if (quickOk(quickKind(raw[i]), a.kinds)) n++;
        return { count: n, skipped: raw.length - n, sub: sub };
    };
    fn.binItems = function (a) {
        var bin = needItem(a.binId), raw = [];
        walk(bin, function (c, d) { if (c.type !== 2 && (a.recursive || d === 0)) raw.push(c); });
        return collect(raw, a.kinds).items;
    };

    fn.itemInfo = function (a) { return itemInfo(needItem(a.id), a.columns); };
    fn.itemsInfo = function (a) { var out = []; for (var i = 0; i < a.ids.length; i++) { var it = itemById(a.ids[i]); out.push(it ? itemInfo(it) : null); } return out; };

    fn.sequenceInfo = function (a) {
        var s = needSeq(a.seqId), o = { id: s.sequenceID, name: s.name, fps: seqFps(s), frame: Number(s.timebase) / TICKS, duration: ticksToSec(s.end), width: s.frameSizeHorizontal, height: s.frameSizeVertical, displayFormat: s.videoDisplayFormat, video: [], audio: [], markers: [] };
        try { o.itemId = s.projectItem.nodeId; } catch (e) { }
        // the sequence's In and Out points (when none are set Premiere reports the whole sequence or nothing)
        try { o.inPoint = s.getInPointAsTime().seconds; o.outPoint = s.getOutPointAsTime().seconds; } catch (e) { try { o.inPoint = Number(s.getInPoint()); o.outPoint = Number(s.getOutPoint()); } catch (e2) { } }
        function tracks(coll, out, isVideo) {
            for (var t = 0; t < coll.numTracks; t++) {
                var tr = coll[t], tt = { index: t, name: tr.name, muted: false, locked: false, clips: [] };
                try { tt.muted = tr.isMuted(); } catch (e) { }
                try { tt.locked = tr.isLocked(); } catch (e) { }
                if (a.clips !== false) for (var c = 0; c < tr.clips.numItems; c++) {
                    var ti = tr.clips[c], pi = null, ci = { name: ti.name, start: ti.start.seconds, end: ti.end.seconds, 'in': ti.inPoint.seconds, out: ti.outPoint.seconds, disabled: !!ti.disabled, nodeId: ti.nodeId };
                    try { pi = ti.projectItem; } catch (e) { }
                    if (pi) { ci.itemId = pi.nodeId; try { ci.path = pi.getMediaPath(); } catch (e) { } try { ci.offline = pi.isOffline(); } catch (e) { } try { ci.isSequence = pi.isSequence(); } catch (e) { } }
                    try { ci.speed = ti.getSpeed(); } catch (e) { }
                    tt.clips.push(ci);
                }
                out.push(tt);
            }
        }
        tracks(s.videoTracks, o.video, true);
        tracks(s.audioTracks, o.audio, false);
        var m = s.markers.getFirstMarker();
        while (m) {
            o.markers.push({ guid: m.guid, start: m.start.seconds, end: m.end.seconds, name: m.name, comment: m.comments, color: m.getColorByIndex() });
            m = s.markers.getNextMarker(m);
        }
        return o;
    };

    fn.openSequence = function (a) { var s = needSeq(a.seqId); project().openSequence(s.sequenceID); return true; };
    fn.setPlayhead = function (a) {
        var s = needSeq(a.seqId);
        if (project().activeSequence !== s) project().openSequence(s.sequenceID);
        s.setPlayerPosition(secToTicks(a.seconds));
        return true;
    };
    /** Show a source clip in the Source Monitor at a time (seconds from the start of the media). */
    fn.showInSource = function (a) {
        var it = needItem(a.id);
        app.sourceMonitor.openProjectItem(it);
        if (a.seconds != null) {
            // app.sourceMonitor has no setPosition in 26.x; scrubbing the QE source player to the clip's own timecode works
            var c = columns(it), fps = 25, m = /([\d.]+)\s*fps/i.exec(String(c['Column.Intrinsic.MediaTimebase'] || ''));
            if (m) fps = Number(m[1]);
            var start = c['Column.Intrinsic.MediaStart'] ? ticksToSec(c['Column.Intrinsic.MediaStart']) : 0;
            var drop = false; try { drop = /MediaStart>[^<]*;/.test(it.getProjectMetadata()); } catch (e) { }
            var pseudo = { videoDisplayFormat: drop ? (Math.round(fps) === 60 ? 106 : 102) : 0, timebase: String(Math.round(TICKS / fps)) };
            try {
                app.enableQE();
                var pl = qe.source.player;
                try { pl.stop(); } catch (e) { }
                pl.startScrubbing(); pl.scrubTo(framesToTC(Math.round((start + Math.max(0, a.seconds)) * fps), pseudo)); pl.endScrubbing();
            } catch (e) { }
        }
        return true;
    };
    fn.revealItem = function (a) { var it = needItem(a.id); try { it.select(); } catch (e) { } return true; };

    fn.ensureBin = function (a) { return ensureBin(a.path).nodeId; };
    fn.moveItems = function (a) {
        var bin = a.binId ? needItem(a.binId) : ensureBin(a.binPath);
        for (var i = 0; i < a.ids.length; i++) { var it = itemById(a.ids[i]); if (it) it.moveBin(bin); }
        return bin.nodeId;
    };
    fn.setLabels = function (a) {
        // a.items: [{id, label}]
        var n = 0;
        for (var i = 0; i < a.items.length; i++) { var it = itemById(a.items[i].id); if (it) { it.setColorLabel(a.items[i].label); n++; } }
        return n;
    };
    fn.renameItem = function (a) { var it = needItem(a.id); it.name = a.name; return true; };

    function addMarkers(coll, list) {
        var guids = [];
        for (var i = 0; i < list.length; i++) {
            var mk = list[i];
            var m = coll.createMarker(mk.start);
            if (mk.end != null && mk.end > mk.start) m.end = mk.end;
            if (mk.name) m.name = mk.name;
            if (mk.comment) m.comments = mk.comment;
            if (mk.color != null) m.setColorByIndex(mk.color);
            if (mk.chapter) { try { m.setTypeAsChapter(); } catch (e) { } }
            guids.push(m.guid);
        }
        return guids;
    }
    function removeMarkers(coll, guids) {
        var n = 0, m = coll.getFirstMarker(), del = [];
        while (m) { if (contains(guids, m.guid)) del.push(m); m = coll.getNextMarker(m); }
        for (var i = 0; i < del.length; i++) { coll.deleteMarker(del[i]); n++; }
        return n;
    }
    /** Markers on a source clip (visible in the Source Monitor and on every use of the clip). */
    fn.addClipMarkers = function (a) { return addMarkers(needItem(a.id).getMarkers(), a.markers); };
    fn.addSequenceMarkers = function (a) { return addMarkers(needSeq(a.seqId).markers, a.markers); };
    fn.removeClipMarkers = function (a) { return removeMarkers(needItem(a.id).getMarkers(), a.guids); };
    fn.removeSequenceMarkers = function (a) { return removeMarkers(needSeq(a.seqId).markers, a.guids); };
    fn.clipMarkers = function (a) {
        var c = needItem(a.id).getMarkers(), out = [], m = c.getFirstMarker();
        while (m) { out.push({ guid: m.guid, start: m.start.seconds, end: m.end.seconds, name: m.name, comment: m.comments, color: m.getColorByIndex() }); m = c.getNextMarker(m); }
        return out;
    };

    /** Subclips: a.items [{id, start, end, name, label}], a.binPath */
    fn.createSubclips = function (a) {
        var bin = a.binId ? needItem(a.binId) : ensureBin(a.binPath), out = [];
        for (var i = 0; i < a.items.length; i++) {
            var s = a.items[i], it = needItem(s.id);
            var sc = it.createSubClip(s.name, secToTicks(s.start), secToTicks(s.end), 0, 1, 1);
            if (sc) { sc.moveBin(bin); if (s.label != null) sc.setColorLabel(s.label); out.push(sc.nodeId); } else out.push(null);
        }
        return out;
    };

    /**
     * New empty sequence with the same settings as a clip: createNewSequenceFromClips, then clear it.
     * a: {name, binPath, likeId}
     */
    fn.newSequence = function (a) {
        var like = needItem(a.likeId), bin = ensureBin(a.binPath || 'JMG Ultra Studio');
        var name = a.name, n = 2, existing = {};
        var seqs = project().sequences; for (var i = 0; i < seqs.numSequences; i++) existing[seqs[i].name] = true;
        while (existing[name]) name = a.name + ' ' + (n++);
        var seq = project().createNewSequenceFromClips(name, [like], bin);
        if (!seq) throw err('HOST_SCRIPT', 'createNewSequenceFromClips returned nothing');
        clearSequence(seq);
        return { id: seq.sequenceID, name: seq.name };
    };
    function clearSequence(seq) {
        var t, k;
        for (t = 0; t < seq.videoTracks.numTracks; t++) for (k = seq.videoTracks[t].clips.numItems - 1; k >= 0; k--) seq.videoTracks[t].clips[k].remove(false, false);
        for (t = 0; t < seq.audioTracks.numTracks; t++) for (k = seq.audioTracks[t].clips.numItems - 1; k >= 0; k--) seq.audioTracks[t].clips[k].remove(false, false);
        var m = seq.markers.getFirstMarker(), del = [];
        while (m) { del.push(m); m = seq.markers.getNextMarker(m); }
        for (var i = 0; i < del.length; i++) seq.markers.deleteMarker(del[i]);
    }
    function ensureTracks(seq, vNeeded, aNeeded) {
        var addV = Math.max(0, vNeeded - seq.videoTracks.numTracks), addA = Math.max(0, aNeeded - seq.audioTracks.numTracks);
        if (!addV && !addA) return;
        var q = openAndQE(seq);
        // addTracks(numVideo, videoIndex, numAudio, audioType, audioIndex, numSubmix, submixType, submixIndex)
        q.addTracks(addV, seq.videoTracks.numTracks, addA, 1, seq.audioTracks.numTracks, 0, 0, 0);
    }

    /**
     * Lay clip ranges into a sequence. a: {seqId, clips:[{id, in, out, at?, v?:0, a?:0, video?:true, audio?:true}], cursor?}
     * Without "at", clips go one after another from a.cursor (or the end of the sequence).
     * Returns {cursor, placed:[{start,end}]}. The source clip's own in/out points are restored afterwards.
     */
    fn.placeClips = function (a) {
        var seq = needSeq(a.seqId);
        var maxV = 1, maxA = 1, i;
        for (i = 0; i < a.clips.length; i++) { maxV = Math.max(maxV, (a.clips[i].v || 0) + 1); maxA = Math.max(maxA, (a.clips[i].a || 0) + 1); }
        ensureTracks(seq, maxV, maxA);
        var cursor = a.cursor != null ? a.cursor : ticksToSec(seq.end), placed = [];
        for (i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], it = needItem(c.id);
            var hadIn = 0, hadOut = 0, full = 0;
            try { hadIn = it.getInPoint().seconds; hadOut = it.getOutPoint().seconds; } catch (e) { }
            try { var cc = columns(it); full = cc['Column.Intrinsic.MediaDuration'] ? ticksToSec(cc['Column.Intrinsic.MediaDuration']) : 0; } catch (e) { }
            it.setInPoint(c['in'], 4); it.setOutPoint(c.out, 4);
            var at = c.at != null ? c.at : cursor;
            var track = (c.video === false) ? seq.audioTracks[c.a || 0] : seq.videoTracks[c.v || 0];
            var ok = track.overwriteClip(it, at);
            // find what we placed: the clip starting at "at" on that track
            var got = null, best = 1e9;
            for (var k = 0; k < track.clips.numItems; k++) { var d = Math.abs(track.clips[k].start.seconds - at); if (d < best) { best = d; got = track.clips[k]; } }
            if (got && best < 0.02) { placed.push({ start: got.start.seconds, end: got.end.seconds }); if (c.at == null) cursor = got.end.seconds; }
            else { placed.push(null); if (c.at == null) cursor = at + (c.out - c['in']); }
            if (c.video === false || c.audio === false) {
                // overwriteClip lays both; remove the half the caller didn't want
                var other = (c.video === false) ? seq.videoTracks[c.v || 0] : seq.audioTracks[c.a || 0];
                for (var q = other.clips.numItems - 1; q >= 0; q--) { var oc = other.clips[q]; if (Math.abs(oc.start.seconds - at) < 0.02 && oc.projectItem && oc.projectItem.nodeId === it.nodeId) oc.remove(false, false); }
            }
            // restore the clip's own in/out
            try {
                it.clearInPoint(); it.clearOutPoint();
                if (hadIn > 0.0001) it.setInPoint(hadIn, 4);
                if (full && hadOut > 0 && hadOut < full - 0.05) it.setOutPoint(hadOut, 4);
            } catch (e) { }
            if (!ok && !got) throw err('HOST_SCRIPT', 'Premiere would not place ' + it.name + ' at ' + at);
        }
        return { cursor: cursor, placed: placed, end: ticksToSec(seq.end) };
    };

    /** Duplicate a sequence (for "works on a copy"). Returns {id, name}. */
    fn.cloneSequence = function (a) {
        var s = needSeq(a.seqId), before = {}, seqs = project().sequences, i;
        for (i = 0; i < seqs.numSequences; i++) before[seqs[i].sequenceID] = true;
        s.clone();
        seqs = project().sequences;
        var copy = null;
        for (i = 0; i < seqs.numSequences; i++) if (!before[seqs[i].sequenceID]) copy = seqs[i];
        if (!copy) throw err('HOST_SCRIPT', 'Clone did not create a sequence');
        if (a.name) { try { copy.name = a.name; } catch (e) { } }
        if (a.binPath) { try { copy.projectItem.moveBin(ensureBin(a.binPath)); } catch (e) { } }
        return { id: copy.sequenceID, name: copy.name };
    };

    /**
     * Ripple-delete time ranges across all tracks (like Extract). a: {seqId, ranges:[[start,end],...]} in seconds.
     * Works from the end backwards so earlier times stay valid. Checks each cut and stops if Premiere disagrees.
     */
    fn.extractRanges = function (a) {
        var seq = needSeq(a.seqId), q = openAndQE(seq);
        var r = a.ranges.slice(0).sort(function (x, y) { return y[0] - x[0]; });
        var done = 0, removed = 0, fr = 1 / seqFps(seq);
        for (var i = 0; i < r.length; i++) {
            var f0 = secToFrames(r[i][0], seq), f1 = secToFrames(r[i][1], seq);
            if (f1 - f0 < 1) continue;
            var before = ticksToSec(seq.end);
            q.extract(framesToTC(f0, seq), framesToTC(f1, seq));
            var cut = before - ticksToSec(seq.end), want = (f1 - f0) * fr;
            if (f0 * fr < before && Math.abs(cut - Math.min(want, before - f0 * fr)) > fr * 1.5) {
                throw err('HOST_SCRIPT', 'Extract removed ' + cut.toFixed(3) + 's but expected ' + want.toFixed(3) + 's at ' + r[i][0].toFixed(2) + 's (display format ' + seq.videoDisplayFormat + ')', 'Premiere didn’t make a cut where expected.', 'Nothing in your original sequence changed. Send the activity log to support.');
            }
            removed += cut; done++;
        }
        return { cuts: done, removed: removed, duration: ticksToSec(seq.end) };
    };

    /** Track output on/off (eye / speaker icon). a: {seqId, video:true, index, mute:true} */
    fn.muteTrack = function (a) {
        var s = needSeq(a.seqId), tr = a.video ? s.videoTracks[a.index] : s.audioTracks[a.index];
        if (!tr) throw err('NOT_FOUND', 'Track ' + a.index);
        tr.setMute(a.mute ? 1 : 0); return true;
    };
    fn.setClipsDisabled = function (a) {
        var s = needSeq(a.seqId), n = 0;
        var tr = a.video ? s.videoTracks[a.index] : s.audioTracks[a.index];
        for (var i = 0; i < tr.clips.numItems; i++) { tr.clips[i].disabled = !!a.disabled; n++; }
        return n;
    };

    /* ---------- import / render / export ---------- */
    fn.importFiles = function (a) {
        var bin = a.binId ? needItem(a.binId) : ensureBin(a.binPath || 'JMG Ultra Studio');
        var before = {};
        walk(bin, function (c) { before[c.nodeId] = true; });
        project().importFiles(a.paths, true, bin, !!a.asNumberedStills);
        var out = [];
        walk(bin, function (c) { if (!before[c.nodeId] && c.type !== 2) out.push({ id: c.nodeId, name: c.name, path: (function () { try { return c.getMediaPath(); } catch (e) { return ''; } })() }); });
        return out;
    };

    fn.presets = function () {
        return {
            wav16k: findPreset('Settings/EncoderPresets/WAV_Mono_16bit_16kHz.epr'),
            wav48: findPreset('Settings/EncoderPresets/Wave48mono16.epr'),
            h264proxy: findPreset('Settings/IngestPresets/Proxy/02_H.264 MP4.epr')
        };
    };

    /** Render the sound of a sequence or clip to a WAV file. a: {seqId | id, out, preset?} */
    fn.renderAudio = function (a) {
        var preset = a.preset || findPreset('Settings/EncoderPresets/WAV_Mono_16bit_16kHz.epr');
        if (!preset) throw err('PRESET_MISSING', 'WAV_Mono_16bit_16kHz.epr not found under ' + app.path);
        var seq, temp = null, tempBin = null, active = null;
        try { active = project().activeSequence; } catch (e) { }
        if (a.seqId) seq = needSeq(a.seqId);
        else {
            var it = needItem(a.id);
            try { if (it.isOffline()) throw err('OFFLINE', it.getMediaPath()); } catch (e) { if (e.usCode) throw e; }
            tempBin = ensureBin('JMG Ultra Studio/.temp');
            temp = project().createNewSequenceFromClips('Ultra Studio temp ' + new Date().getTime(), [it], tempBin);
            if (!temp) throw err('RENDER_FAILED', 'Could not make a temporary sequence for ' + it.name);
            seq = temp;
        }
        var f = new File(a.out); if (f.exists) f.remove();
        var res = '';
        try { res = seq.exportAsMediaDirect(a.out, preset, 0); } catch (e) { res = 'threw: ' + e; } // Premiere can throw even when the file was written
        var ok = new File(a.out).exists && new File(a.out).length > 44;
        if (temp) { try { project().deleteSequence(temp); } catch (e) { } try { if (tempBin.children.numItems === 0) tempBin.deleteBin(); } catch (e) { } }
        if (active) { try { project().openSequence(active.sequenceID); } catch (e) { } }
        if (!ok) throw err('RENDER_FAILED', 'exportAsMediaDirect: ' + res);
        return { path: a.out, size: new File(a.out).length };
    };

    /** Export one frame of a sequence as PNG. a: {seqId, seconds, outBase} -> path */
    fn.exportFrame = function (a) {
        var seq = needSeq(a.seqId), q = openAndQE(seq);
        var tc = framesToTC(secToFrames(a.seconds, seq), seq);
        var r = q.exportFramePNG(tc, a.outBase);
        var p = a.outBase.replace(/\.png$/i, '') + '.png';
        if (!new File(p).exists) throw err('RENDER_FAILED', 'exportFramePNG ' + tc + ' -> ' + r);
        return p;
    };

    /* ---------- Media Encoder (exports run there, so Premiere never blocks; progress comes back as events) ---------- */
    var ENC_EVENT = 'com.jmgphotography.ultrastudio.encoder';
    function sendEvent(obj) {
        try {
            if (!$.global.__usPlugPlug) $.global.__usPlugPlug = new ExternalObject('lib:PlugPlugExternalObject');
            var ev = new CSXSEvent(); ev.type = ENC_EVENT; ev.data = JSON.stringify(obj); ev.dispatch();
        } catch (e) { }
    }
    /** Forward Media Encoder job events to the panel (once per session). */
    fn.encoderListen = function () {
        if ($.global.__usEncoderBound) return true;
        app.encoder.bind('onEncoderJobQueued', function (id) { sendEvent({ kind: 'queued', job: id }); });
        app.encoder.bind('onEncoderJobProgress', function (id, p) { sendEvent({ kind: 'progress', job: id, progress: p }); });
        app.encoder.bind('onEncoderJobComplete', function (id, path) { sendEvent({ kind: 'complete', job: id, path: path }); });
        app.encoder.bind('onEncoderJobError', function (id, msg) { sendEvent({ kind: 'error', job: id, message: msg }); });
        app.encoder.bind('onEncoderJobCanceled', function (id) { sendEvent({ kind: 'cancelled', job: id }); });
        $.global.__usEncoderBound = true;
        return true;
    };
    fn.encoderPresets = function () {
        return {
            h264: findPreset('MediaIO/systempresets/4E49434B_48323634/01 - Match Source - High bitrate.epr'),
            proxy: findPreset('Settings/IngestPresets/Proxy/02_H.264 MP4.epr'),          // ingest preset: not usable for plain exports
            analysis: findPreset('MediaIO/systempresets/4E49434B_48323634/High Quality 720 HD.epr'), // small H.264 copies for analysis
            wav: findPreset('MediaIO/systempresets/3F3F3F3F_57415645/Waveform Audio 48kHz 16-bit.epr')
        };
    };
    /** Queue a project item (whole clip, ignoring its In/Out) in Media Encoder. a: {id, out, preset} -> job id */
    fn.queueItemExport = function (a) {
        var it = needItem(a.id);
        app.encoder.launchEncoder();
        return app.encoder.encodeProjectItem(it, a.out, a.preset, 0 /* entire */, a.removeWhenDone === false ? 0 : 1);
    };

    /** Queue a sequence in Media Encoder. a: {seqId, out, preset, workArea:0 entire|1 in-out|2 work area} */
    fn.queueExport = function (a) {
        var seq = needSeq(a.seqId);
        app.encoder.launchEncoder();
        var id = app.encoder.encodeSequence(seq, a.out, a.preset, a.workArea || 0, a.removeWhenDone === false ? 0 : 1);
        return id;
    };
    fn.startEncoderBatch = function () { app.encoder.startBatch(); return true; };

    fn.autoReframe = function (a) {
        var seq = needSeq(a.seqId);
        var r = seq.autoReframeSequence(a.num, a.den, a.motion || 'default', a.name, !!a.nested);
        if (!r) throw err('HOST_SCRIPT', 'Auto Reframe did not create a sequence');
        if (a.binPath) { try { r.projectItem.moveBin(ensureBin(a.binPath)); } catch (e) { } }
        return { id: r.sequenceID, name: r.name };
    };

    /** The part of a clip Premiere will use (its In/Out points) and its full length, in seconds. */
    fn.audioClipRange = function (a) {
        var it = needItem(a.id), c = columns(it);
        var full = c['Column.Intrinsic.MediaDuration'] ? ticksToSec(c['Column.Intrinsic.MediaDuration']) : 0;
        var start = c['Column.Intrinsic.MediaStart'] ? ticksToSec(c['Column.Intrinsic.MediaStart']) : 0;
        var i = 0, o = full;
        try { i = it.getInPoint().seconds; o = it.getOutPoint().seconds; } catch (e) { }
        var ss = c['Column.Intrinsic.SubclipStart'], se = c['Column.Intrinsic.SubclipEnd'];
        if (ss !== undefined && ss !== '' && se !== undefined && se !== '') return { 'in': ticksToSec(ss), out: ticksToSec(se), duration: full, mediaStart: start, subclip: true };
        return { 'in': i, out: o, duration: full, mediaStart: start, subclip: false };
    };

    /**
     * Usable range of each clip in media time: a subclip's own start/end, otherwise the whole media.
     * (placeClips takes media time, and itemInfo().duration is the whole file even for subclips.)
     */
    fn.clipRanges = function (a) {
        var out = [];
        for (var i = 0; i < a.ids.length; i++) {
            var it = itemById(a.ids[i]);
            if (!it) { out.push(null); continue; }
            var c = columns(it);
            var full = c['Column.Intrinsic.MediaDuration'] ? ticksToSec(c['Column.Intrinsic.MediaDuration']) : 0;
            var ss = c['Column.Intrinsic.SubclipStart'], se = c['Column.Intrinsic.SubclipEnd'];
            if (ss !== undefined && ss !== '' && se !== undefined && se !== '') out.push({ id: it.nodeId, start: ticksToSec(ss), end: ticksToSec(se), subclip: true });
            else out.push({ id: it.nodeId, start: 0, end: full, subclip: false });
        }
        return out;
    };

    fn.listFns = function () { var o = []; for (var k in fn) if (fn.hasOwnProperty(k)) o.push(k); return o; };
    /** Up to a.max (default 200) clips from anywhere in the project, for self-tests and pickers. */
    fn.sampleItems = function (a) {
        var out = [], max = a.max || 200;
        walk(project().rootItem, function (c) {
            if (out.length >= max) return false;
            if (c.type === 1) { var i = itemInfo(c); if (i.kind !== 'sequence' && i.kind !== 'bin' && i.kind !== 'other') out.push(i); }
        });
        return out;
    };
    fn.deleteSequence = function (a) { var s = needSeq(a.seqId); project().deleteSequence(s); return true; };
    fn.saveProject = function () { project().save(); return true; };

    return {
        fn: fn, run: run, err: err, TICKS: TICKS, project: project, walk: walk, itemById: itemById, needItem: needItem, needSeq: needSeq,
        seqById: seqById, seqFps: seqFps, itemInfo: itemInfo, ensureBin: ensureBin, binPath: binPath, secToTicks: secToTicks, ticksToSec: ticksToSec,
        timeObj: timeObj, framesToTC: framesToTC, tcToSec: tcToSec, secToFrames: secToFrames, openAndQE: openAndQE, findPreset: findPreset, contains: contains, columns: columns
    };
})();
