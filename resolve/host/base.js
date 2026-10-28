// JMG Ultra Studio – Resolve side: shared helpers for every command in resolve/host/*.js.
// The Resolve layer answers exactly like jsx/ does for Premiere (same command names, arguments and results), so the
// panel never needs to know which editor it is in. Times are seconds: media time for clips, from the start of the
// timeline for timelines. Ids are Resolve's GetUniqueId() strings.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

/** Premiere's marker colours 0–7 (green, red, purple, orange, yellow, white, blue, cyan) as Resolve's marker colours. */
const MARKER_COLORS = ['Green', 'Red', 'Purple', 'Sand', 'Yellow', 'Cream', 'Blue', 'Cyan'];
const MARKER_BACK = { Green: 0, Mint: 0, Red: 1, Rose: 1, Purple: 2, Lavender: 2, Fuchsia: 2, Pink: 1, Sand: 3, Cocoa: 3, Yellow: 4, Lemon: 4, Cream: 5, Blue: 6, Sky: 7, Cyan: 7 };
/** Premiere's label colours 0–15 (Violet, Iris, Caribbean, Lavender, Cerulean, Forest, Rose, Mango, Purple, Blue, Teal,
    Magenta, Tan, Green, Brown, Yellow) as the nearest of Resolve's 16 clip colours. */
const LABEL_COLORS = ['Violet', 'Navy', 'Teal', 'Purple', 'Blue', 'Olive', 'Pink', 'Orange', 'Purple', 'Blue', 'Teal', 'Pink', 'Tan', 'Green', 'Brown', 'Yellow'];
const LABEL_BACK = { Violet: 0, Navy: 1, Teal: 2, Purple: 8, Blue: 9, Olive: 5, Pink: 6, Orange: 7, Apricot: 7, Tan: 12, Beige: 12, Green: 13, Lime: 13, Brown: 14, Chocolate: 14, Yellow: 15 };
/** The panel shows these for labels in Resolve (index = Premiere label index, so tools keep their meanings). */
const LABEL_HEX = { Orange: '#e8862a', Apricot: '#f0a35a', Yellow: '#e2c13a', Lime: '#a6c83a', Olive: '#6f8a2a', Green: '#3e9e39', Teal: '#1e9c9c', Navy: '#2b4a8a', Blue: '#3a6fd6', Purple: '#8f53c9', Violet: '#a593e0', Pink: '#e46baa', Tan: '#c9a87f', Beige: '#d9c8a8', Brown: '#8a5a32', Chocolate: '#5a3a22' };

const STILL_EXT = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga)$/i;
const AUDIO_EXT = /\.(wav|bwf|mp3|aiff?|m4a|aac|flac|ogg|wma|caf)$/i;

function err(code, detail, title, action) {
  const e = new Error(detail || code);
  e.usCode = code; e.usTitle = title; e.usAction = action;
  return e;
}

/** "25", "23.976", "29.97 DF", 25 → 25 / 23.976 / 29.97 */
function parseFps(v) { const n = parseFloat(String(v == null ? '' : v)); return n > 0 ? n : 0; }
const pad2 = n => (n < 10 ? '0' : '') + n;
/** frames → "hh:mm:ss:ff" (";" for drop frame) */
function framesToTC(frames, fps, drop) {
  const base = Math.round(fps);
  frames = Math.max(0, Math.round(frames));
  if (drop) {
    const d = base === 60 ? 4 : 2, perMin = base * 60 - d, per10 = base * 600 - d * 9;
    const tens = Math.floor(frames / per10), rem = frames % per10;
    frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
  }
  const ff = frames % base, s = Math.floor(frames / base), sep = drop ? ';' : ':';
  return pad2(Math.floor(s / 3600)) + sep + pad2(Math.floor((s % 3600) / 60)) + sep + pad2(s % 60) + sep + pad2(ff);
}
/** "01:00:00:00" → frames (drop frame when ";") */
function tcToFrames(tc, fps) {
  const p = String(tc || '').split(/[:;]/).map(Number);
  if (p.length < 4 || p.some(isNaN)) return NaN;
  const base = Math.round(fps);
  let frames = (p[0] * 3600 + p[1] * 60 + p[2]) * base + p[3];
  if (/;/.test(tc) && (base === 30 || base === 60)) { const d = base === 60 ? 4 : 2, mins = p[0] * 60 + p[1]; frames -= d * (mins - Math.floor(mins / 10)); }
  return frames;
}
const list = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);

module.exports = function makeBase(api) {
  let cache = null; // cleared at the start of every command (Resolve can change between calls)
  const R = {
    api, err, parseFps, framesToTC, tcToFrames, list, STILL_EXT, AUDIO_EXT,
    MARKER_COLORS, MARKER_BACK, LABEL_COLORS, LABEL_BACK, LABEL_HEX,
    fresh() { cache = null; },
    pm() { const pm = api && api.GetProjectManager(); if (!pm) throw err('HOST_SCRIPT', 'Resolve gave no project manager.'); return pm; },
    project() { const p = R.pm().GetCurrentProject(); if (!p) throw err('NO_PROJECT'); return p; },
    pool() { return R.project().GetMediaPool(); },
    root() { return R.pool().GetRootFolder(); },
    id: o => (o && o.GetUniqueId ? String(o.GetUniqueId()) : ''),

    /* ---------- Media Pool ---------- */
    /** Every folder and clip: {folders:[{folder, id, parts}], clips:[{item, id, folder, parts}]} (cached per command). */
    index() {
      if (cache) return cache;
      const folders = [], clips = [], byId = new Map();
      (function walk(folder, parts) {
        const fid = R.id(folder);
        folders.push({ folder, id: fid, parts });
        byId.set(fid, { folder, parts, isFolder: true });
        for (const item of list(folder.GetClipList())) { const id = R.id(item); clips.push({ item, id, folder, parts }); byId.set(id, { item, folder, parts }); }
        for (const sub of list(folder.GetSubFolderList())) walk(sub, parts.concat(sub.GetName()));
      })(R.root(), []);
      cache = { folders, clips, byId };
      return cache;
    },
    forget() { cache = null; },
    entry(id) { return id ? R.index().byId.get(String(id)) || null : null; },
    itemById(id) { const e = R.entry(id); return e && !e.isFolder ? e.item : null; },
    needItem(id) { const it = R.itemById(id); if (!it) throw err('NOT_FOUND', 'Media Pool item ' + id); return it; },
    folderById(id) { const e = R.entry(id); return e && e.isFolder ? e.folder : null; },
    needFolder(id) { const f = R.folderById(id); if (!f) throw err('NOT_FOUND', 'Bin ' + id); return f; },
    binPath: parts => (parts && parts.length ? parts.join(' / ') : '(Project root)'),
    /** clips in a folder (and, with deep, its sub-folders): [{item, id, parts, depth}] */
    clipsIn(folder, deep) {
      const out = [];
      (function walk(f, parts, depth) {
        for (const item of list(f.GetClipList())) out.push({ item, id: R.id(item), parts, depth });
        if (deep) for (const sub of list(f.GetSubFolderList())) walk(sub, parts.concat(sub.GetName()), depth + 1);
      })(folder, R.partsOf(folder), 0);
      return out;
    },
    partsOf(folder) { const fid = R.id(folder), f = R.index().folders.find(x => x.id === fid); return f ? f.parts : []; },
    /** "JMG Ultra Studio/Selects" → Folder (made if missing). The Media Pool's current folder is left as it was. */
    ensureBin(p) {
      const pool = R.pool(), keep = pool.GetCurrentFolder();
      let folder = R.root();
      for (const raw of String(p || '').split('/')) {
        const n = raw.trim(); if (!n) continue;
        folder = list(folder.GetSubFolderList()).find(f => f.GetName() === n) || pool.AddSubFolder(folder, n);
        if (!folder) throw err('HOST_SCRIPT', 'Resolve would not make the bin ' + p);
      }
      if (keep) pool.SetCurrentFolder(keep);
      R.forget();
      return folder;
    },
    /** Run fn with the Media Pool's current folder set to folder (imports and new clips land there), then put it back. */
    inFolder(folder, fn) {
      const pool = R.pool(), keep = pool.GetCurrentFolder();
      pool.SetCurrentFolder(folder);
      try { return fn(); } finally { if (keep) pool.SetCurrentFolder(keep); R.forget(); }
    },

    /* ---------- clip details, shaped like Premiere's itemInfo ---------- */
    props(item) { try { return item.GetClipProperty() || {}; } catch (e) { return {}; } },
    clipFps(item, props) { return parseFps((props || R.props(item))['FPS']) || 25; },
    quickKind(item) {
      const p = R.props(item), type = String(p['Type'] || '');
      if (/timeline/i.test(type)) return 'sequence';
      const file = String(p['File Path'] || '');
      if (/still/i.test(type) || STILL_EXT.test(file)) return 'still';
      if (/^audio$/i.test(type) || (!/video/i.test(type) && AUDIO_EXT.test(file))) return 'audio';
      if (/video/i.test(type)) return 'video';
      return file ? 'video' : 'other';
    },
    itemInfo(item, parts) {
      const p = R.props(item), type = String(p['Type'] || ''), file = String(p['File Path'] || '');
      const fps = R.clipFps(item, p), isSeq = /timeline/i.test(type);
      const o = { id: R.id(item), name: String(p['Clip Name'] || item.GetName() || ''), type: 1, path: file };
      if (parts === undefined) { const e = R.entry(o.id); parts = e ? e.parts : []; }
      o.bin = R.binPath(parts);
      const colour = String(item.GetClipColor ? item.GetClipColor() || '' : '');
      o.label = colour in LABEL_BACK ? LABEL_BACK[colour] : 0;
      o.labelName = colour;
      o.offline = !!file && !isSeq && !fs.existsSync(file);
      const proxy = String(p['Proxy Media Path'] || '');
      o.proxy = proxy && !/^none$/i.test(proxy) ? proxy : '';
      o.merged = false; o.multicam = /multicam/i.test(type);
      // the whole file, in seconds; a subclip's "Start"/"End" frames give the part it uses
      const frames = Number(p['Frames']) || tcToFrames(p['Duration'], fps) || 0;
      const res = /(\d+)\s*x\s*(\d+)/.exec(String(p['Resolution'] || ''));
      o.width = res ? Number(res[1]) : 0; o.height = res ? Number(res[2]) : 0;
      o.hasVideo = /video|still|timeline|compound|multicam/i.test(type) || (!!res && !/^audio$/i.test(type));
      o.hasAudio = /audio/i.test(type) || Number(p['Audio Ch']) > 0;
      o.fps = fps; o.fpsText = fps ? fps + ' fps' : '';
      o.isSequence = isSeq;
      const start = Number(p['Start']), end = Number(p['End']);
      o.subclip = !isSeq && isFinite(start) && isFinite(end) && end > start && (start > 0 || end < frames - 1);
      o.duration = frames / fps;
      o.rangeStart = o.subclip ? start / fps : 0;
      o.rangeEnd = o.subclip ? (end + 1) / fps : o.duration;
      o.kind = isSeq ? 'sequence' : (o.hasVideo ? (STILL_EXT.test(file) || /still/i.test(type) ? 'still' : 'video') : (o.hasAudio ? 'audio' : 'other'));
      return o;
    },

    /* ---------- timelines ---------- */
    timelines() { const pr = R.project(), out = []; for (let i = 1, n = pr.GetTimelineCount(); i <= n; i++) out.push(pr.GetTimelineByIndex(i)); return out.filter(Boolean); },
    timelineById(id) { return R.timelines().find(t => R.id(t) === String(id)) || null; },
    /** The timeline asked for, or the current one. */
    needSeq(id) {
      const t = id ? R.timelineById(id) : R.project().GetCurrentTimeline();
      if (!t) throw err(id ? 'NOT_FOUND' : 'NO_SEQUENCE', 'Timeline ' + (id || '(current)'));
      return t;
    },
    /** Make tl the current timeline (AppendToTimeline, markers at the playhead etc. work on the current one). */
    open(tl) { const pr = R.project(), cur = pr.GetCurrentTimeline(); if (!cur || R.id(cur) !== R.id(tl)) pr.SetCurrentTimeline(tl); return tl; },
    fps(tl) { return parseFps(tl && tl.GetSetting ? tl.GetSetting('timelineFrameRate') : '') || parseFps(R.project().GetSetting('timelineFrameRate')) || 25; },
    dropFrame(tl) { const v = String((tl && tl.GetSetting ? tl.GetSetting('timelineDropFrameTimecode') : '') || ''); return v === '1' || /true/i.test(v); },
    /** timeline frame (absolute, as Resolve counts) ↔ seconds from the start of the timeline */
    tlSec(tl, frame) { return (frame - tl.GetStartFrame()) / R.fps(tl); },
    tlFrame(tl, sec) { return tl.GetStartFrame() + Math.round(sec * R.fps(tl)); },
    tlDuration(tl) { return (tl.GetEndFrame() - tl.GetStartFrame()) / R.fps(tl); },
    size(tl) { return { width: Number(tl.GetSetting('timelineResolutionWidth')) || Number(R.project().GetSetting('timelineResolutionWidth')) || 1920, height: Number(tl.GetSetting('timelineResolutionHeight')) || Number(R.project().GetSetting('timelineResolutionHeight')) || 1080 }; },
    /** every item on a track type: [{ti, track (1-based), type}] */
    trackItems(tl, type) {
      const out = [];
      for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) for (const ti of list(tl.GetItemListInTrack(type, t))) if (ti) out.push({ ti, track: t, type });
      return out;
    },
    /** A timeline name not used yet: "Name", "Name 2", … */
    uniqueTimelineName(name) {
      const used = new Set(R.timelines().map(t => t.GetName()));
      let n = name, i = 2; while (used.has(n)) n = name + ' ' + (i++);
      return n;
    },

    /**
     * A clip range for AppendToTimeline / CreateTimelineFromClips. Measured in Resolve 21: here endFrame is
     * EXCLUSIVE (50..99 places 49 frames), while subclips (MediaStorage.AddItemListToMediaPool) count it inclusive
     * (125..175 is 51 frames) – Blackmagic's old example says inclusive for both. inSec/outSec are media seconds;
     * extra adds trackIndex, recordFrame, mediaType (1 video only, 2 audio only).
     */
    clipInfo(item, inSec, outSec, extra) {
      const fps = R.clipFps(item), s = Math.max(0, Math.round(inSec * fps)), e = Math.max(s + 1, Math.round(outSec * fps));
      return Object.assign({ mediaPoolItem: item, startFrame: s, endFrame: e }, extra || {});
    },
    /** a timeline item in seconds: {start, end} on the timeline, {in, out} in its media (as Premiere reports them) */
    itemTimes(tl, ti) {
      const fps = R.fps(tl), mpi = ti.GetMediaPoolItem && ti.GetMediaPoolItem(), cfps = mpi ? R.clipFps(mpi) : fps;
      const start = R.tlSec(tl, ti.GetStart()), end = R.tlSec(tl, ti.GetEnd());
      const src = Number(ti.GetSourceStartFrame ? ti.GetSourceStartFrame() : NaN);
      const inS = isFinite(src) ? src / cfps : (Number(ti.GetLeftOffset()) || 0) / fps;
      const srcEnd = Number(ti.GetSourceEndFrame ? ti.GetSourceEndFrame() : NaN);
      const outS = isFinite(srcEnd) ? srcEnd / cfps : inS + (end - start);
      return { start, end, in: inS, out: outS, speed: end > start ? Math.abs(outS - inS) / (end - start) || 1 : 1 };
    },

    /* ---------- markers ---------- */
    /**
     * A timeline's or clip's markers keyed by their real frame. Measured in Resolve 21.1: a marker added at frame 25
     * sits at 01:00:01:00 (25 fps), and DeleteMarkerAtFrame(25) removes it, but GetMarkers() reports it at 24. So
     * every read goes through here; never use GetMarkers() keys directly.
     */
    markers(owner) {
      const out = {};
      for (const [k, v] of Object.entries((owner && owner.GetMarkers && owner.GetMarkers()) || {})) out[Number(k) + R.MARKER_READ_OFFSET] = v;
      return out;
    },
    MARKER_READ_OFFSET: 1,
    /** Resolve keys markers by frame; Ultra Studio's marker ids live in their customData. */
    newGuid: () => 'us-' + crypto.randomBytes(6).toString('hex'),
    markerColor: i => MARKER_COLORS[i] || MARKER_COLORS[0],
    markerIndex: name => (name in MARKER_BACK ? MARKER_BACK[name] : 0),
    /**
     * Add markers to a timeline or a Media Pool clip. list: [{start, end?, name, comment, color}] in seconds;
     * toFrame(seconds) gives the marker frame for that owner. Two markers can't share a frame in Resolve, so a clash
     * moves the later one on by a frame. Returns the guids.
     */
    addMarkers(owner, markers, toFrame, fps) {
      const taken = new Set(Object.keys(R.markers(owner)).map(Number)), guids = [];
      for (const m of markers) {
        let f = Math.max(0, Math.round(toFrame(m.start)));
        while (taken.has(f)) f++;
        const dur = m.end != null && m.end > m.start ? Math.max(1, Math.round((m.end - m.start) * fps)) : 1;
        const g = R.newGuid();
        const ok = owner.AddMarker(f, R.markerColor(m.color), String(m.name || ''), String(m.comment || ''), dur, g);
        if (!ok) throw err('HOST_SCRIPT', `Resolve would not add the marker “${m.name || ''}” at frame ${f}.`);
        taken.add(f); guids.push(g);
      }
      return guids;
    },
    removeMarkers(owner, guids) {
      let n = 0;
      const want = new Set(guids), all = R.markers(owner);
      // by our id: in Resolve 21 DeleteMarkerAtFrame refuses the very frame GetMarkers reports for a timeline marker
      for (const [frame, info] of Object.entries(all)) if (info && want.has(info.customData)) { if ((owner.DeleteMarkerByCustomData && owner.DeleteMarkerByCustomData(info.customData)) || owner.DeleteMarkerAtFrame(Number(frame))) n++; }
      return n;
    },
    readMarkers(owner, toSec, fps) {
      return Object.entries(R.markers(owner)).map(([frame, m]) => ({
        guid: m.customData || 'frame:' + frame, start: toSec(Number(frame)), end: toSec(Number(frame)) + (Number(m.duration) > 1 ? Number(m.duration) / fps : 0),
        name: m.name || '', comment: m.note || '', color: R.markerIndex(m.color)
      })).sort((a, b) => a.start - b.start);
    },

    /* ---------- files ---------- */
    exists(p) { try { return !!p && fs.existsSync(p); } catch (e) { return false; } },
    tempDir() { const d = path.join(require('os').tmpdir(), 'JMG Ultra Studio'); fs.mkdirSync(d, { recursive: true }); return d; }
  };
  return R;
};
module.exports.MARKER_COLORS = MARKER_COLORS;
module.exports.LABEL_COLORS = LABEL_COLORS;
module.exports.LABEL_HEX = LABEL_HEX;
module.exports.framesToTC = framesToTC;
module.exports.tcToFrames = tcToFrames;
