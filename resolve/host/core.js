// JMG Ultra Studio – Resolve side: the core commands (project, Media Pool, timelines, markers, placing and cutting),
// the Resolve versions of the same names in jsx/host.jsx. Same arguments, same results; see dev/RESOLVE.md.
//
// project.path (context): Resolve projects live in a database, not a file, but the panel keys its per-project data
// (US.projectStore, Story, Guides) on this path and calls path.dirname() on it. So it is an absolute path that is never
// created as a file:  ~/Documents/JMG Ultra Studio/Resolve projects/<DbType DbName [IP]>/<Project name> [<id>].drp
// <id> is the first 12 characters of Project.GetUniqueId(), so two projects with the same name (in different folders
// or databases) never share data, and the path stays the same while the project is open or reopened. Renaming the
// project changes the path (as renaming a .prproj does in Premiere). Without an id (older Resolve) the project
// manager's folder name is used instead. storyProjectFile (resolve/host/story.js) decides where Story's shared copy goes.
//
// Times: media seconds for clips, seconds from the timeline's start for timelines. Timeline and clip marker frames are
// offsets (frame 0 = the first frame of the timeline / clip), as the README describes them; AppendToTimeline's
// recordFrame and TimelineItem.GetStart/GetEnd are absolute timeline frames (01:00:00:00 = 86400 at 24 fps).
'use strict';
const os = require('os'), path = require('path');

/** Timeline frame rates Resolve offers (Project Settings › Timeline frame rate). */
const RATES = ['16', '18', '23.976', '24', '25', '29.97', '30', '47.952', '48', '50', '59.94', '60', '72', '95.904', '96', '100', '119.88', '120'];
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').trim();

module.exports = (R) => {
  const pathMemo = new Map();

  /* ---------- small helpers (candidates for base.js) ---------- */
  const tryCall = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  /** Fast kind from two clip properties (GetClipProperty(key) is quicker than the whole dict). */
  function kindOf(item) {
    const type = String(R.prop(item, 'Type')), file = String(R.prop(item, 'File Path'));
    if (/timeline/i.test(type)) return 'sequence';
    if (/still/i.test(type) || R.STILL_EXT.test(file)) return 'still';
    if (/^audio$/i.test(type) || (!/video/i.test(type) && R.AUDIO_EXT.test(file))) return 'audio';
    if (/video/i.test(type)) return 'video';
    return file ? 'video' : 'other';
  }
  const quickOk = (kind, kinds) => (!kinds || !kinds.length ? true : kinds.includes(kind) || (kinds.includes('audio') && kind === 'video'));
  function kindOk(info, kinds) {
    if (!kinds || !kinds.length) return true;
    if (kinds.includes(info.kind)) return true;
    return kinds.includes('audio') && info.kind === 'video' && info.hasAudio; // a video clip counts for sound when it has some
  }
  function quickList(raw, kinds) {
    const items = []; let skipped = 0;
    for (const it of raw) { const k = kindOf(it); if (quickOk(k, kinds)) items.push({ id: R.id(it), name: String(it.GetName() || ''), kind: k }); else skipped++; }
    return { items, skipped };
  }
  function collect(raw, kinds) {
    const out = [];
    for (const it of raw) { const info = R.itemInfo(it); if (kindOk(info, kinds)) out.push(info); }
    return out;
  }
  const selectionRaw = () => R.list(R.pool().GetSelectedClips()).filter(Boolean);
  /** A clip's subclip start in its own frames: clip marker frames count from here. */
  function clipOrigin(item) {
    const info = R.itemInfo(item);
    return { fps: info.fps || R.clipFps(item), start: info.subclip ? Math.round(info.rangeStart * (info.fps || 25)) : 0 };
  }
  const folderFor = a => (a.binId ? R.needFolder(a.binId) : R.ensureBin(a.binPath || 'JMG Ultra Studio'));
  function setName(item, name) { if (name == null || name === '') return; name = String(name); if (!tryCall(() => item.SetName(name), false)) tryCall(() => item.SetClipProperty('Clip Name', name), false); }
  function setLabel(item, label) {
    const c = label != null && label >= 0 ? R.LABEL_COLORS[label] : null;
    return c ? !!tryCall(() => item.SetClipColor(c), false) : !!tryCall(() => item.ClearClipColor(), false);
  }
  /** The "project file" path the panel keys per-project data on (see the top of this file). */
  function projectPath(pr) {
    const id = String(tryCall(() => pr.GetUniqueId(), '') || ''), name = String(tryCall(() => pr.GetName(), '') || '');
    const key = id + '|' + name;
    if (pathMemo.has(key)) return pathMemo.get(key);
    const pm = R.pm(), db = tryCall(() => pm.GetCurrentDatabase(), {}) || {};
    const dbLabel = safeName([db.DbType || 'Disk', db.DbName || 'Database', db.IpAddress || ''].filter(Boolean).join(' ')) || 'Database';
    const tag = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || safeName(tryCall(() => pm.GetCurrentFolder(), '')) || 'root';
    const p = path.join(os.homedir(), 'Documents', 'JMG Ultra Studio', 'Resolve projects', dbLabel, (safeName(name) || 'Project') + ' [' + tag + '].drp');
    pathMemo.set(key, p);
    return p;
  }
  function playheadSec(tl) {
    const tc = String(tryCall(() => tl.GetCurrentTimecode(), '') || '');
    const f = R.tcToFrames(tc, R.fps(tl));
    return isFinite(f) ? Math.max(0, R.tlSec(tl, f)) : null;
  }
  /** Every item of a track type with its times: [{ti, type, track, start, end, in, out, speed, enabled, mpi}] (seconds). */
  function itemsWithTimes(tl, type) {
    return R.trackItems(tl, type).map(x => {
      const mpi = tryCall(() => x.ti.GetMediaPoolItem(), null), t = R.itemTimes(tl, x.ti);
      return Object.assign({ mpi, enabled: tryCall(() => x.ti.GetClipEnabled(), true) !== false }, x, t);
    });
  }
  /** The Media Pool clip under a timeline time: the topmost enabled video item there, else the first audio item. */
  function clipUnder(snap, t) {
    const look = (list, fromTop) => {
      const tracks = Array.from(new Set(list.map(x => x.track))).sort((a, b) => (fromTop ? b - a : a - b));
      for (const tr of tracks) for (const x of list) {
        if (x.track !== tr || !x.enabled || !x.mpi || t < x.start - 1e-6 || t >= x.end) continue;
        return { item: x.mpi, at: x.in + (t - x.start) * x.speed, until: x.out, speed: Math.abs(x.speed) || 1 };
      }
      return null;
    };
    return look(snap.video, true) || look(snap.audio, false);
  }
  const tlMarkerFrame = (tl, fps) => s => Math.round(s * fps);
  function clipMarkerFrame(item) { const o = clipOrigin(item); return { fps: o.fps, toFrame: s => Math.round(s * o.fps) - o.start, toSec: f => (f + o.start) / o.fps }; }
  function ensureTracks(tl, v, a) {
    while (tl.GetTrackCount('video') < v) if (!tl.AddTrack('video')) throw R.err('HOST_SCRIPT', 'Resolve would not add a video track');
    while (tl.GetTrackCount('audio') < a) if (!tl.AddTrack('audio', 'stereo')) throw R.err('HOST_SCRIPT', 'Resolve would not add an audio track');
  }
  const snapRate = fps => { const r = RATES.find(x => Math.abs(Number(x) - fps) < 0.01); return r || ''; };

  return {
    ping() {
      const api = R.api;
      return { app: String(tryCall(() => api.GetProductName(), 'DaVinci Resolve')), version: String(tryCall(() => api.GetVersionString(), '')), build: '', os: process.platform === 'darwin' ? 'Macintosh' : process.platform === 'win32' ? 'Windows' : process.platform, hostScript: '1.0.0', project: !!tryCall(() => R.pm().GetCurrentProject(), null) };
    },

    /** Polled every 2.5 s: keep it to a handful of calls. */
    context() {
      const o = { project: null, sequence: null, selection: 0, app: String(tryCall(() => R.api.GetVersionString(), '')) };
      const pr = tryCall(() => R.pm().GetCurrentProject(), null);
      if (!pr) return o;
      o.project = { name: String(pr.GetName() || ''), path: projectPath(pr) };
      const tl = tryCall(() => pr.GetCurrentTimeline(), null);
      if (tl) {
        const sz = R.size(tl);
        o.sequence = { id: R.id(tl), name: String(tl.GetName() || ''), fps: R.fps(tl), duration: R.tlDuration(tl), width: sz.width, height: sz.height };
        const ph = playheadSec(tl); if (ph != null) o.sequence.playhead = ph;
      }
      o.selection = tryCall(() => R.list(pr.GetMediaPool().GetSelectedClips()).length, 0);
      return o;
    },

    listBins() { return R.index().folders.map(f => ({ id: f.id, path: R.binPath(f.parts) })); },
    listSequences() { return R.timelines().map(t => ({ id: R.id(t), name: String(t.GetName() || '') })); },

    /** Polled whenever the selection changes: counts by kind only. */
    selectionSummary(a) {
      R.project();
      let n = 0, skipped = 0;
      for (const it of selectionRaw()) { if (quickOk(kindOf(it), a.kinds)) n++; else skipped++; }
      return { count: n, skipped, skippedWhy: skipped ? 'not the right kind of clip' : '' };
    },
    selectionList(a) { R.project(); return quickList(selectionRaw(), a.kinds).items; },
    selectedItems(a) { R.project(); return collect(selectionRaw(), a.kinds); },
    binList(a) { const f = R.needFolder(a.binId); return quickList(R.clipsIn(f, a.recursive !== false).map(x => x.item), a.kinds).items; },
    binSummary(a) {
      const all = R.clipsIn(R.needFolder(a.binId), true);
      const n = all.filter(x => quickOk(kindOf(x.item), a.kinds)).length;
      return { count: n, skipped: all.length - n, sub: all.some(x => x.depth > 0) };
    },
    binItems(a) {
      const all = R.clipsIn(R.needFolder(a.binId), !!a.recursive);
      return all.map(x => R.itemInfo(x.item, x.parts)).filter(i => kindOk(i, a.kinds));
    },

    itemInfo(a) { const it = R.needItem(a.id), o = R.itemInfo(it); if (a.columns) o.columns = R.props(it); return o; },
    itemsInfo(a) { return (a.ids || []).map(id => { const it = R.itemById(id); return it ? R.itemInfo(it) : null; }); },

    sequenceInfo(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), sz = R.size(tl), drop = R.dropFrame(tl), dur = R.tlDuration(tl);
      const o = { id: R.id(tl), name: String(tl.GetName() || ''), fps, frame: 1 / fps, duration: dur, width: sz.width, height: sz.height, drop, displayFormat: String(fps) + (drop ? ' DF' : ''), video: [], audio: [], markers: [] };
      const mpi = tryCall(() => tl.GetMediaPoolItem(), null); if (mpi) o.itemId = R.id(mpi);
      // Mark In/Out (offsets from the timeline's start, the Out frame included); none set = the whole timeline
      const mk = tryCall(() => tl.GetMarkInOut(), {}) || {}, m = mk.video || mk.audio;
      o.inPoint = m && m.in != null ? Number(m.in) / fps : 0;
      o.outPoint = m && m.out != null ? (Number(m.out) + 1) / fps : dur;
      const files = new Map();
      for (const type of ['video', 'audio']) {
        const byTrack = a.clips !== false ? itemsWithTimes(tl, type) : [];
        for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) {
          const tr = { index: t - 1, name: String(tryCall(() => tl.GetTrackName(type, t), '') || ''), muted: tryCall(() => tl.GetIsTrackEnabled(type, t), true) === false, locked: !!tryCall(() => tl.GetIsTrackLocked(type, t), false), clips: [] };
          for (const x of byTrack) {
            if (x.track !== t) continue;
            const c = { name: String(tryCall(() => x.ti.GetName(), '') || ''), start: x.start, end: x.end, in: x.in, out: x.out, disabled: !x.enabled, nodeId: R.id(x.ti), speed: x.speed };
            if (x.mpi) {
              c.itemId = R.id(x.mpi);
              if (!files.has(c.itemId)) files.set(c.itemId, { path: String(R.prop(x.mpi, 'File Path') || ''), isSequence: /timeline/i.test(String(R.prop(x.mpi, 'Type'))) });
              const f = files.get(c.itemId);
              c.path = f.path; c.isSequence = f.isSequence; c.offline = !!f.path && !R.exists(f.path);
            }
            tr.clips.push(c);
          }
          o[type].push(tr);
        }
      }
      o.markers = R.readMarkers(tl, f => f / fps, fps);
      return o;
    },

    async openSequence(a) {
      const tl = R.needSeq(a.seqId);
      // Resolve 21 throws "Unable to execute script action" for a moment while busy: restoreTimeline tries again
      if (!(await R.restoreTimeline(tl))) throw R.err('HOST_SCRIPT', 'SetCurrentTimeline failed for ' + tl.GetName());
      // showing it is the point: leave pages without a timeline for the Edit page
      if (/^(media|fusion)$/.test(String(tryCall(() => R.api.GetCurrentPage(), '')))) tryCall(() => R.api.OpenPage('edit'));
      return true;
    },
    setPlayhead(a) {
      const tl = R.open(R.needSeq(a.seqId)), fps = R.fps(tl);
      const tc = R.framesToTC(tl.GetStartFrame() + Math.round(Math.max(0, Number(a.seconds) || 0) * fps), fps, R.dropFrame(tl));
      if (!tryCall(() => tl.SetCurrentTimecode(tc), false)) {
        // the playhead only moves on Cut, Edit, Color, Fairlight and Deliver
        tryCall(() => R.api.OpenPage('edit'));
        if (!tryCall(() => tl.SetCurrentTimecode(tc), false)) throw R.err('HOST_SCRIPT', 'SetCurrentTimecode ' + tc + ' failed');
      }
      return true;
    },
    /** Resolve has no way to drive the Source Viewer by script: select the clip in the Media Pool instead. */
    showInSource(a) { const it = R.needItem(a.id); tryCall(() => R.pool().SetSelectedClip(it)); return true; },
    revealItem(a) { const it = R.needItem(a.id); tryCall(() => R.pool().SetSelectedClip(it)); return true; },

    ensureBin(a) { return R.id(R.ensureBin(a.path)); },
    moveItems(a) {
      const f = folderFor(a), items = (a.ids || []).map(id => R.itemById(id)).filter(Boolean);
      if (items.length && !R.pool().MoveClips(items, f)) throw R.err('HOST_SCRIPT', 'MoveClips failed');
      R.forget();
      return R.id(f);
    },
    setLabels(a) {
      let n = 0;
      for (const x of a.items || []) { const it = R.itemById(x.id); if (it) { setLabel(it, x.label); n++; } }
      return n;
    },
    renameItem(a) { const it = R.needItem(a.id); setName(it, a.name); return true; },

    addClipMarkers(a) { const it = R.needItem(a.id), c = clipMarkerFrame(it); return R.addMarkers(it, a.markers || [], c.toFrame, c.fps); },
    removeClipMarkers(a) { return R.removeMarkers(R.needItem(a.id), a.guids || []); },
    clipMarkers(a) { const it = R.needItem(a.id), c = clipMarkerFrame(it); return R.readMarkers(it, c.toSec, c.fps); },
    /**
     * Timeline markers on the timeline, on the clips under them, or both (a.where: 'sequence' | 'clips' | 'both').
     * A clip marker's id is "clip:<item id>:<guid>"; with 'clips', a marker with no clip under it stays on the timeline.
     */
    addSequenceMarkers(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), list = a.markers || [], where = a.where;
      R.checkMarkers(list);   // a marker without a time would match the first clip (NaN compares false) and reach Resolve as NaN
      const onTl = ms => R.addMarkers(tl, ms, tlMarkerFrame(tl, fps), fps);
      if (where !== 'clips' && where !== 'both') return onTl(list);
      const snap = { video: itemsWithTimes(tl, 'video'), audio: itemsWithTimes(tl, 'audio') }, out = [], origins = new Map();
      const originOf = it => { const id = R.id(it); if (!origins.has(id)) origins.set(id, clipMarkerFrame(it)); return origins.get(id); };
      for (const mk of list) {
        const u = clipUnder(snap, mk.start);
        let placed = false;
        if (u) {
          const cm = Object.assign({}, mk, { start: u.at, end: mk.end != null && mk.end > mk.start ? Math.min(u.until, u.at + (mk.end - mk.start) * u.speed) : null });
          const c = originOf(u.item);
          out.push('clip:' + R.id(u.item) + ':' + R.addMarkers(u.item, [cm], c.toFrame, c.fps)[0]); placed = true;
        }
        if (where === 'both' || !placed) out.push(onTl([mk])[0]);
      }
      return out;
    },
    removeSequenceMarkers(a) {
      const plain = [], byItem = new Map();
      let n = 0;
      for (const g of a.guids || []) {
        const m = /^clip:(.+):([^:]+)$/.exec(g);
        if (m) (byItem.get(m[1]) || byItem.set(m[1], []).get(m[1])).push(m[2]); else plain.push(g);
      }
      for (const [id, gs] of byItem) { const it = R.itemById(id); if (it) n += R.removeMarkers(it, gs); }
      if (plain.length) n += R.removeMarkers(R.needSeq(a.seqId), plain);
      return n;
    },

    /** Subclips: a.items [{id, start, end, name, label}] (media seconds), a.binPath | a.binId → [id | null] */
    createSubclips(a) {
      const folder = folderFor(a), storage = R.api.GetMediaStorage(), out = [];
      R.inFolder(folder, () => {
        for (const s of a.items || []) {
          const it = R.needItem(s.id), file = String(R.prop(it, 'File Path') || ''), st = R.num(s.start), en = R.num(s.end);
          if (!file || st == null || en == null) { out.push(null); continue; }   // never a NaN frame to Resolve
          const fps = R.clipFps(it), f0 = Math.max(0, Math.round(st * fps)), f1 = Math.max(f0 + 1, Math.round(en * fps));
          const got = R.list(tryCall(() => storage.AddItemListToMediaPool([{ media: file, startFrame: f0, endFrame: f1 - 1 }]), []))[0];
          if (!got) { out.push(null); continue; }
          setName(got, s.name);
          if (s.label != null) setLabel(got, s.label);
          out.push(R.id(got));
        }
      });
      return out;
    },

    /**
     * New empty timeline with the like-clip's size and frame rate where Resolve allows (a timeline's frame rate can
     * only change while it is empty; when it won't, the project's is used). a: {name, binPath, likeId} → {id, name}
     */
    newSequence(a) {
      const like = R.needItem(a.likeId), info = R.itemInfo(like), folder = R.ensureBin(a.binPath || 'JMG Ultra Studio');
      const name = R.uniqueTimelineName(a.name || 'Timeline');
      const tl = R.inFolder(folder, () => R.pool().CreateEmptyTimeline(name));
      if (!tl) throw R.err('HOST_SCRIPT', 'CreateEmptyTimeline returned nothing for ' + name);
      const pr = R.project(), rate = info.hasVideo ? snapRate(info.fps) : '';
      const pw = Number(pr.GetSetting('timelineResolutionWidth')) || 0, ph = Number(pr.GetSetting('timelineResolutionHeight')) || 0, pf = R.parseFps(pr.GetSetting('timelineFrameRate'));
      const sizeDiffers = info.width > 0 && info.height > 0 && (info.width !== pw || info.height !== ph), rateDiffers = rate && Math.abs(Number(rate) - pf) > 0.001;
      if (sizeDiffers || rateDiffers) {
        tryCall(() => tl.SetSetting('useCustomSettings', '1'));
        if (rateDiffers) tryCall(() => tl.SetSetting('timelineFrameRate', rate));
        if (sizeDiffers) { tryCall(() => tl.SetSetting('timelineResolutionWidth', String(info.width))); tryCall(() => tl.SetSetting('timelineResolutionHeight', String(info.height))); }
      }
      return { id: R.id(tl), name: String(tl.GetName() || name) };
    },

    /**
     * Lay clip ranges into a timeline. a: {seqId, clips:[{id, in, out, at?, v?:0, a?:0, video?:true, audio?:true}], cursor?}
     * Without "at", clips go one after another from a.cursor (or the end). Returns {cursor, placed:[{start,end}|null], end}.
     */
    placeClips(a) {
      const tl = R.open(R.needSeq(a.seqId)), fps = R.fps(tl), pool = R.pool(), clips = a.clips || [];
      // track numbers as whole numbers ("1" + 1 would be track 11), times checked before anything is placed
      const trk = x => Math.max(0, Math.round(R.num(x) || 0)) + 1;
      let maxV = 1, maxA = 1;
      for (const c of clips) {
        maxV = Math.max(maxV, trk(c.v)); maxA = Math.max(maxA, trk(c.a));
        if (R.num(c.in) == null || R.num(c.out) == null || (c.at != null && R.num(c.at) == null)) throw R.err('BAD_INPUT', `placeClips: clip ${c.id} has no usable in/out/at (${c.in}, ${c.out}, ${c.at})`);
      }
      ensureTracks(tl, maxV, maxA);
      let cursor = R.num(a.cursor) != null ? R.num(a.cursor) : R.tlDuration(tl);
      const placed = [];
      for (const c of clips) {
        const it = R.needItem(c.id), info = R.itemInfo(it), at = c.at != null ? R.num(c.at) : cursor;
        const wantV = c.video !== false && info.hasVideo, wantA = c.audio !== false && info.hasAudio && info.kind !== 'still';
        const rec = R.tlFrame(tl, at), v = trk(c.v), au = trk(c.a), infos = [];
        if (wantV && wantA && v === au) infos.push(R.clipInfo(it, c.in, c.out, { trackIndex: v, recordFrame: rec }));
        else {
          if (wantV) infos.push(R.clipInfo(it, c.in, c.out, { trackIndex: v, recordFrame: rec, mediaType: 1 }));
          if (wantA) infos.push(R.clipInfo(it, c.in, c.out, { trackIndex: au, recordFrame: rec, mediaType: 2 }));
        }
        const got = [];
        for (const ci of infos) got.push(...R.list(pool.AppendToTimeline([ci])).filter(Boolean));
        if (infos.length > 1 && got.length > 1 && tl.SetClipsLinked) tryCall(() => tl.SetClipsLinked(got, true));
        const first = got.find(x => String(tryCall(() => x.GetTrackTypeAndIndex()[0], '')) === 'video') || got[0];
        if (first) {
          const p = { start: R.tlSec(tl, first.GetStart()), end: R.tlSec(tl, first.GetEnd()) };
          placed.push(p); if (c.at == null) cursor = p.end;
        } else {
          placed.push(null); if (c.at == null) cursor = at + (R.num(c.out) - R.num(c.in));
          if (infos.length) throw R.err('HOST_SCRIPT', `Resolve would not place ${it.GetName()} at ${at}`);
        }
      }
      return { cursor, placed, end: R.tlDuration(tl) };
    },

    /** Duplicate a timeline (for "works on a copy"). a: {seqId, name?, binPath?} → {id, name} */
    cloneSequence(a) {
      const tl = R.needSeq(a.seqId), name = R.uniqueTimelineName(a.name || (tl.GetName() + ' copy'));
      const dup = () => tl.DuplicateTimeline(name);
      const folder = a.binPath ? R.ensureBin(a.binPath) : null;
      const copy = folder ? R.inFolder(folder, dup) : dup();
      if (!copy) throw R.err('HOST_SCRIPT', 'DuplicateTimeline returned nothing');
      if (folder) {
        const mpi = tryCall(() => copy.GetMediaPoolItem(), null), fid = R.id(folder);
        R.forget();
        const e = mpi && R.entry(R.id(mpi));
        if (mpi && (!e || R.id(e.folder) !== fid)) tryCall(() => R.pool().MoveClips([mpi], folder));
        R.forget();
      }
      return { id: R.id(copy), name: String(copy.GetName() || name) };
    },

    /**
     * Ripple-remove time ranges across all tracks (like Premiere's Extract). a: {seqId, ranges:[[start,end],…]} seconds.
     * Resolve has no razor, so every item that ends after the first range is taken off and its kept parts are appended
     * again, moved left by the time removed before them. Items before the first range aren't touched. Clip enable
     * state, clip colour, clip properties (zoom, position, opacity…), item markers and links are carried over; timeline
     * markers move with the cut (a marker inside a removed range goes). Titles, generators, subtitles and retimed clips
     * can't be rebuilt by script: if any would have to move, nothing changes and a plain error says why.
     * Returns {cuts, removed, duration} like Premiere.
     */
    extractRanges(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), t0 = tl.GetStartFrame();
      let cuts = 0;
      const rs = [];
      for (const r of a.ranges || []) {
        // [start, end] in seconds (as Premiere's extractRanges); anything unreadable is skipped, never treated as "all"
        const f0 = Math.max(0, Math.round(Number(r && r[0]) * fps)), f1 = Math.round(Number(r && r[1]) * fps);
        if (!isFinite(f0) || !isFinite(f1) || f1 - f0 < 1) continue;
        cuts++; rs.push([f0, f1]);
      }
      rs.sort((x, y) => x[0] - y[0]);
      const ranges = [];
      for (const r of rs) { const last = ranges[ranges.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else ranges.push(r.slice()); }
      const before = R.tlDuration(tl);
      if (!ranges.length) return { cuts: 0, removed: 0, duration: before };
      const first = ranges[0][0];
      const removedBefore = f => { let d = 0; for (const [s, e] of ranges) { if (s >= f) break; d += Math.min(f, e) - s; } return d; };
      const shift = f => f - removedBefore(f);
      const inside = f => ranges.some(([s, e]) => f >= s && f < e);
      const keep = (s, e) => {
        const out = []; let p = s;
        for (const [rs0, re] of ranges) { if (re <= p) continue; if (rs0 >= e) break; if (rs0 > p) out.push([p, rs0]); p = Math.max(p, re); if (p >= e) break; }
        if (p < e) out.push([p, e]);
        return out;
      };

      // 1. what has to move, and can it?
      const moving = [], bad = [], lockedTracks = [];
      let untouchedEnd = 0;
      for (const type of ['video', 'audio']) {
        for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) {
          let any = false;
          for (const ti of R.list(tl.GetItemListInTrack(type, t))) {
            if (!ti) continue;
            const s = ti.GetStart() - t0, e = ti.GetEnd() - t0;
            if (e <= first) { untouchedEnd = Math.max(untouchedEnd, e); continue; }
            any = true;
            const mpi = tryCall(() => ti.GetMediaPoolItem(), null), src = Number(tryCall(() => ti.GetSourceStartFrame(), NaN)), srcEnd = Number(tryCall(() => ti.GetSourceEndFrame(), NaN));
            const cfps = mpi ? R.clipFps(mpi) : fps;
            if (!mpi || !isFinite(src)) { bad.push(`${type} ${t}: “${tryCall(() => ti.GetName(), '')}” (no Media Pool clip)`); continue; }
            if (isFinite(srcEnd) && Math.abs((srcEnd - src) - (e - s) * cfps / fps) > 1.5) { bad.push(`${type} ${t}: “${tryCall(() => ti.GetName(), '')}” (speed change)`); continue; }
            moving.push({ ti, type, track: t, s, e, mpi, src, cfps, id: R.id(ti) });
          }
          if (any && tryCall(() => tl.GetIsTrackLocked(type, t), false)) lockedTracks.push([type, t]);
        }
      }
      for (let t = 1, n = tryCall(() => tl.GetTrackCount('subtitle'), 0); t <= n; t++) {
        for (const ti of R.list(tryCall(() => tl.GetItemListInTrack('subtitle', t), []))) if (ti && ti.GetEnd() - t0 > first) bad.push(`subtitle ${t}: “${tryCall(() => ti.GetName(), '')}”`);
      }
      if (bad.length) {
        throw R.err('HOST_SCRIPT', 'Can’t rebuild: ' + bad.slice(0, 20).join('; ') + (bad.length > 20 ? ` and ${bad.length - 20} more` : ''),
          `Resolve can’t move ${bad.length === 1 ? 'one item' : bad.length + ' items'} on this timeline by script (titles, generators, subtitles or speed changes).`,
          'Nothing in your original timeline changed. Move those items to before the first cut, or render them in place, then try again.');
      }

      // 2. remember what each item carries, and plan its kept parts
      const ids = new Set(moving.map(m => m.id)), infos = [], parts = [];
      for (const m of moving) {
        m.enabled = tryCall(() => m.ti.GetClipEnabled(), true) !== false;
        m.color = String(tryCall(() => m.ti.GetClipColor(), '') || '');
        m.props = tryCall(() => m.ti.GetProperty(), null);
        m.markers = tryCall(() => R.markers(m.ti), {}) || {};
        m.links = R.list(tryCall(() => m.ti.GetLinkedItems(), [])).map(x => R.id(x)).filter(x => ids.has(x));
        for (const [ps, pe] of keep(m.s, m.e)) {
          const srcStart = m.src + Math.round((ps - m.s) * m.cfps / fps), srcLen = Math.max(1, Math.round((pe - ps) * m.cfps / fps));
          const rec = shift(ps);
          infos.push({ mediaPoolItem: m.mpi, startFrame: srcStart, endFrame: srcStart + srcLen, trackIndex: m.track, recordFrame: t0 + rec, mediaType: m.type === 'video' ? 1 : 2 });
          parts.push({ m, ps, pe, rec });
        }
      }
      // link groups: originals linked to each other share a group (smallest id)
      const group = new Map(moving.map(m => [m.id, m.id]));
      const root = id => { while (group.get(id) !== id) id = group.get(id); return id; };
      for (const m of moving) for (const l of m.links) { const x = root(m.id), y = root(l); if (x !== y) group.set(x < y ? y : x, x < y ? x : y); }

      // 3. timeline markers that move
      const tlMarks = R.markers(tl), moveMarks = [];
      for (const [k, mk] of Object.entries(tlMarks)) {
        const f = Number(k), dur = Math.max(1, Number(mk.duration) || 1);
        if (f + dur <= first) continue;
        if (inside(f)) { moveMarks.push({ f, drop: true }); continue; }
        const nf = shift(f), nd = Math.max(1, shift(f + dur) - nf);
        if (nf !== f || nd !== dur) moveMarks.push({ f, nf, nd, mk });
      }

      // 4. rebuild (on the copy the tool made)
      R.open(tl);
      for (const [type, t] of lockedTracks) tryCall(() => tl.SetTrackLock(type, t, false));
      try {
        if (moving.length && !tl.DeleteClips(moving.map(m => m.ti), false)) throw R.err('HOST_SCRIPT', 'DeleteClips failed', 'Resolve didn’t make the cuts.', 'Nothing in your original timeline changed. Try again; if it keeps happening, send the activity log to support.');
        if (infos.length) {
          const got = R.list(R.pool().AppendToTimeline(infos)).filter(Boolean);
          if (!got.length) throw R.err('HOST_SCRIPT', `AppendToTimeline placed nothing (${infos.length} parts)`, 'Resolve didn’t make the cuts.', 'Nothing in your original timeline changed. Send the activity log to support.');
        }
        // find each new part by track and start, then give it back what the original had
        const at = new Map();
        for (const type of ['video', 'audio']) for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) for (const ti of R.list(tl.GetItemListInTrack(type, t))) if (ti) at.set(`${type}:${t}:${ti.GetStart() - t0}`, ti);
        const missing = [], linkSets = new Map();
        for (const p of parts) {
          const m = p.m, ti = at.get(`${m.type}:${m.track}:${p.rec}`) || at.get(`${m.type}:${m.track}:${p.rec - 1}`) || at.get(`${m.type}:${m.track}:${p.rec + 1}`);
          if (!ti) { missing.push(`${m.type} ${m.track} at ${(p.rec / fps).toFixed(2)} s`); continue; }
          if (!m.enabled) tryCall(() => ti.SetClipEnabled(false));
          if (m.color) tryCall(() => ti.SetClipColor(m.color));
          if (m.props && typeof m.props === 'object') {
            const now = tryCall(() => ti.GetProperty(), {}) || {};
            // only real values go back (a None/NaN from GetProperty sent to SetProperty could abort Resolve)
            for (const [k, v] of Object.entries(R.clean(m.props))) if ((typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') && JSON.stringify(now[k]) !== JSON.stringify(v)) tryCall(() => ti.SetProperty(k, v));
          }
          for (const [k, mk] of Object.entries(m.markers)) {
            const o = Number(k) - (p.ps - m.s);
            if (o >= 0 && o < p.pe - p.ps) tryCall(() => ti.AddMarker(o, String(mk.color || 'Blue'), String(mk.name || ''), String(mk.note || ''), Math.max(1, Math.round(Number(mk.duration) || 1)), String(mk.customData || '')));
          }
          const key = root(m.id) + '@' + p.rec;
          (linkSets.get(key) || linkSets.set(key, []).get(key)).push(ti);
        }
        if (tl.SetClipsLinked) for (const list of linkSets.values()) if (list.length > 1) tryCall(() => tl.SetClipsLinked(list, true));
        // timeline markers: take off every one that moves, then put them back in order (one marker per frame)
        // by customData when only that marker has it (the user's own markers may share one or have none), else by frame
        const cdCount = new Map();
        for (const mk of Object.values(tlMarks)) if (mk && mk.customData) cdCount.set(mk.customData, (cdCount.get(mk.customData) || 0) + 1);
        for (const x of moveMarks) { const cd = tlMarks[x.f] && tlMarks[x.f].customData; R.deleteMarker(tl, x.f, cd && cdCount.get(cd) === 1 ? cd : ''); }
        const taken = new Set(Object.keys(R.markers(tl)).map(Number));
        for (const x of moveMarks.filter(y => !y.drop).sort((p, q) => p.nf - q.nf)) {
          let f = x.nf; while (taken.has(f)) f++;
          if (tryCall(() => tl.AddMarker(f, String(x.mk.color || 'Blue'), String(x.mk.name || ''), String(x.mk.note || ''), x.nd, String(x.mk.customData || '')), false)) taken.add(f);
        }
        // check: the timeline should now end where the plan says
        let want = untouchedEnd;
        for (const p of parts) want = Math.max(want, p.rec + (p.pe - p.ps));
        const got = tl.GetEndFrame() - t0;
        if (missing.length || Math.abs(got - want) > 1) {
          throw R.err('HOST_SCRIPT', `Rebuild: ${missing.length ? 'missing ' + missing.slice(0, 10).join(', ') + '; ' : ''}timeline ends at frame ${got}, expected ${want}`,
            'Resolve didn’t make a cut where expected.', 'Nothing in your original timeline changed. Send the activity log to support.');
        }
      } finally {
        for (const [type, t] of lockedTracks) tryCall(() => tl.SetTrackLock(type, t, true));
      }
      const after = R.tlDuration(tl);
      return { cuts, removed: before - after, duration: after };
    },

    /** Track output on/off (the eye / speaker). a: {seqId, video, index (0-based), mute} */
    muteTrack(a) {
      const tl = R.needSeq(a.seqId), type = a.video ? 'video' : 'audio', i = Math.round(R.num(a.index) || 0) + 1;
      if (i < 1 || i > tl.GetTrackCount(type)) throw R.err('NOT_FOUND', 'Track ' + a.index);
      if (!tl.SetTrackEnable(type, i, !a.mute)) throw R.err('HOST_SCRIPT', 'SetTrackEnable failed for ' + type + ' ' + i);
      return true;
    },
    setClipsDisabled(a) {
      const tl = R.needSeq(a.seqId), type = a.video ? 'video' : 'audio', i = Math.round(R.num(a.index) || 0) + 1;
      if (i < 1 || i > tl.GetTrackCount(type)) throw R.err('NOT_FOUND', 'Track ' + a.index);
      let n = 0;
      for (const ti of R.list(tl.GetItemListInTrack(type, i))) if (ti) { ti.SetClipEnabled(!a.disabled); n++; }
      return n;
    },

    importFiles(a) {
      const folder = folderFor(a), paths = [], missing = [];
      for (const p of a.paths || []) (R.exists(p) ? paths : missing).push(p);
      if (!paths.length) throw R.err('NOTHING_FOUND', 'Not on disk: ' + missing.join(', '), missing.length > 1 ? 'Those files aren’t there any more.' : 'That file isn’t there any more.', 'Check the drive is connected, then try again.');
      const got = R.inFolder(folder, () => R.list(R.pool().ImportMedia(paths)).filter(Boolean));
      return got.map(it => ({ id: R.id(it), name: String(it.GetName() || ''), path: String(R.prop(it, 'File Path') || '') }));
    },

    /** Up to a.max (default 200) clips from anywhere in the project, for self-tests and pickers. */
    sampleItems(a) {
      const out = [], max = a.max || 200;
      for (const c of R.index().clips) {
        if (out.length >= max) break;
        const i = R.itemInfo(c.item, c.parts);
        if (i.kind !== 'sequence' && i.kind !== 'other') out.push(i);
      }
      return out;
    },
    deleteSequence(a) { const tl = R.needSeq(a.seqId); if (!R.pool().DeleteTimelines([tl])) throw R.err('HOST_SCRIPT', 'DeleteTimelines failed'); R.forget(); return true; },
    saveProject() { R.project(); if (!R.pm().SaveProject()) throw R.err('HOST_SCRIPT', 'SaveProject failed'); return true; },

    /** The part of a clip Resolve will use (its Mark In/Out, or a subclip's range) and its full length, in seconds. */
    audioClipRange(a) {
      const it = R.needItem(a.id), info = R.itemInfo(it), fps = info.fps || 25;
      const tc = String(R.prop(it, 'Start TC') || ''), sf = R.tcToFrames(tc, fps), mediaStart = isFinite(sf) ? sf / fps : 0;
      if (info.subclip) return { in: info.rangeStart, out: info.rangeEnd, duration: info.duration, mediaStart, subclip: true };
      const mk = R.clipMarks(it), m = mk.audio || mk.video;
      const i = m && m.in != null ? Number(m.in) / fps : 0, o = m && m.out != null ? (Number(m.out) + 1) / fps : info.duration;
      return { in: i, out: o, duration: info.duration, mediaStart, subclip: false };
    },
    /** Usable range of each clip in media time: a subclip's own start/end, otherwise the whole media. */
    clipRanges(a) {
      return (a.ids || []).map(id => {
        const it = R.itemById(id); if (!it) return null;
        const i = R.itemInfo(it);
        return i.subclip ? { id: i.id, start: i.rangeStart, end: i.rangeEnd, subclip: true } : { id: i.id, start: 0, end: i.duration, subclip: false };
      });
    }
  };
};
