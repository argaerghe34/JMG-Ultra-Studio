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
  const pathMemo = new Map(), RB = require('./rebuild').make(R);

  /* ---------- small helpers (candidates for base.js) ---------- */
  const tryCall = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  /** Fast kind from two clip properties (GetClipProperty(key) is quicker than the whole dict). */
  const kindOf = item => R.quickKind(item);   // a subtitle file is 'other' (see R.isSubtitle)
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
      { const ph = playheadSec(tl); if (ph != null) o.playhead = ph; }
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
    /**
     * Change markers: a.markers [{guid, name?, comment?, color?, start?, end?}] on the timeline (a.seqId), a clip (a.id),
     * or a clip marker shown on a timeline ("clip:<item id>:<guid>"). Resolve can't edit a marker, so each is taken
     * off and added again with the changes (its id changes). -> {done, guids: {old: new}}
     */
    updateMarkers(a) {
      const out = { done: 0, guids: {} };
      const ownerOf = g => {
        const m = /^clip:(.+):([^:]+)$/.exec(g);
        if (m || !a.seqId) { const it = R.needItem(m ? m[1] : a.id), c = clipMarkerFrame(it); return { owner: it, guid: m ? m[2] : g, prefix: m ? 'clip:' + m[1] + ':' : '', toFrame: c.toFrame, toSec: c.toSec, fps: c.fps }; }
        const tl = R.needSeq(a.seqId), fps = R.fps(tl);
        return { owner: tl, guid: g, prefix: '', toFrame: tlMarkerFrame(tl, fps), toSec: f => f / fps, fps };
      };
      for (const ch of a.markers || []) {
        const o = ownerOf(ch.guid), m = R.readMarkers(o.owner, o.toSec, o.fps).find(x => x.guid === o.guid);
        if (!m) continue;
        const next = { start: ch.start != null ? Number(ch.start) : m.start, name: ch.name != null ? ch.name : m.name, comment: ch.comment != null ? ch.comment : m.comment, color: ch.color != null ? Number(ch.color) : m.color };
        const len = m.end - m.start; next.end = ch.end != null ? Number(ch.end) : len > 0 ? next.start + len : null;
        if (!R.removeMarkers(o.owner, [o.guid])) continue;
        let g;
        try { g = R.addMarkers(o.owner, [next], o.toFrame, o.fps)[0]; } catch (e) { R.addMarkers(o.owner, [m], o.toFrame, o.fps); throw e; }   // put the old one back
        out.done++; out.guids[ch.guid] = o.prefix + g;
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
     * Resolve has no razor: resolve/host/rebuild.js lays the timeline again after the first range – items that only
     * move are moved (keeping their grade, Fusion and effects), cut clips are laid again in pieces with their grade,
     * effects, colour, flags, markers, enabled state and links copied across, titles and generators are trimmed and
     * moved. Timeline markers move with the cut (one inside a removed range goes). Clips with a speed change that would
     * be cut are refused before anything changes; what couldn't come across is named in notes.
     * Returns {cuts, removed, duration, notes} like Premiere (plus notes).
     */
    extractRanges(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl);
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
      if (!ranges.length) return { cuts: 0, removed: 0, duration: before, notes: [] };
      // the kept spans, each moved left by what was removed before it
      const segs = [];
      let p = 0, gone = 0;
      for (const [s, e] of ranges) { if (s > p) segs.push({ s: p, e: s, to: p - gone }); gone += e - s; p = e; }
      segs.push({ s: p, e: Infinity, to: p - gone });
      const { notes } = RB.remap(tl, segs, { from: ranges[0][0], verb: 'cut' });
      const after = R.tlDuration(tl);
      return { cuts, removed: before - after, duration: after, notes };
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
      // the same details as a bin listing (duration, size, fps…), so a clip can be placed straight away
      const info = it => { const base = { id: R.id(it), name: String(it.GetName() || ''), path: String(R.prop(it, 'File Path') || '') }; try { return Object.assign(base, R.itemInfo(it) || {}); } catch (e) { return base; } };
      const fresh = got.map(info), tryInfo = it => { try { return R.itemInfo(it) || {}; } catch (e) { return {}; } };
      // a file Resolve didn't import again (it's already in the project): the clip that's there, marked existing – the
      // one with the file's own name first, then one in this folder; never a subclip or multicam clip. In a.paths' order.
      const norm = x => String(x || '').replace(/\\/g, '/').toLowerCase(), byPath = new Map();
      for (const f of fresh) { const k = norm(f.path); if (!byPath.has(k)) byPath.set(k, []); byPath.get(k).push(f); }
      const left = new Map();
      for (const p of paths) if (!byPath.has(norm(p)) && !left.has(norm(p))) left.set(norm(p), { file: p.replace(/^.*[\\/]/, ''), best: null, score: -1 });
      if (left.size) {
        R.forget();
        const fid = folder ? R.id(folder) : '';
        for (const c of R.index().clips) {
          const l = left.get(norm(R.prop(c.item, 'File Path')));
          if (!l) continue;
          const type = String(R.prop(c.item, 'Type') || '');
          if (/multicam|compound|timeline/i.test(type) || tryInfo(c.item).subclip) continue;
          const score = (String(c.item.GetName() || '') === l.file ? 2 : 0) + (fid && c.folder && R.id(c.folder) === fid ? 1 : 0);
          if (score > l.score) { l.best = c.item; l.score = score; }
        }
      }
      const out = [], used = new Set();
      for (const p of paths) {
        const k = norm(p);
        if (used.has(k)) continue;
        used.add(k);
        if (byPath.has(k)) out.push(...byPath.get(k));
        else if (left.get(k) && left.get(k).best) out.push(Object.assign(info(left.get(k).best), { existing: true }));
      }
      for (const f of fresh) if (!used.has(norm(f.path))) out.push(f);
      return out;
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
