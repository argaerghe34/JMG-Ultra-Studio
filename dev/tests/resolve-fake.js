// A small in-memory stand-in for DaVinci Resolve's scripting API (the JavaScript one a Workflow Integration plugin
// gets), so resolve/host/*.js can be unit-tested on any computer. It follows the documented behaviour in
// "Developer/Scripting/README.txt" (Resolve 20). What it can't prove – how real Resolve behaves – the e2e tests check.
//
//   const F = require('./resolve-fake').make();         // a project "Test" with one empty timeline-less Media Pool
//   F.addMedia('/m/I001.mp4', { fps: 25, frames: 2500 }) // a clip in the root bin (or { bin: 'Interviews' })
//   const host = require('../../resolve/host').connect({ api: F.resolve });
//   await host.run('listBins')                           // → { ok: true, data: [...] }
'use strict';
const fs = require('fs'), path = require('path');

function make({ fps = 25, width = 1920, height = 1080, projectName = 'Test' } = {}) {
  let nextId = 1;
  const uid = p => `${p}-${(nextId++).toString(16).padStart(6, '0')}`;
  const media = {}; // path -> {fps, frames, width, height, audioCh, type}
  const log = [];   // what was asked of "Resolve", for tests that check calls

  function markerHost(o, ownerName) {
    o._markers = {};
    o.AddMarker = (frame, color, name, note, duration, customData) => {
      frame = Number(frame);
      if (o._markers[frame] != null) return false; // one marker per frame, like Resolve
      o._markers[frame] = { color, name, note, duration: Number(duration) || 1, customData: customData || '' };
      log.push(['AddMarker', ownerName(), frame]);
      return true;
    };
    // like Resolve 21.1: GetMarkers reports each marker one frame before where it is (AddMarker/DeleteMarkerAtFrame use the real frame)
    o.GetMarkers = () => { const r = {}; for (const [k, v] of Object.entries(o._markers)) r[Number(k) - 1] = JSON.parse(JSON.stringify(v)); return r; };
    o.DeleteMarkerAtFrame = f => { if (o._markers[Number(f)] == null) return false; delete o._markers[Number(f)]; return true; };
    o.DeleteMarkersByColor = c => { for (const k of Object.keys(o._markers)) if (c === 'All' || o._markers[k].color === c) delete o._markers[k]; return true; };
    o.GetMarkerByCustomData = cd => { const k = Object.keys(o._markers).find(k => o._markers[k].customData === cd); return k == null ? {} : { [k]: o._markers[k] }; };
    o.DeleteMarkerByCustomData = cd => { const k = Object.keys(o._markers).find(k => o._markers[k].customData === cd); if (k == null) return false; delete o._markers[k]; return true; };
    o.UpdateMarkerCustomData = (f, cd) => { if (!o._markers[f]) return false; o._markers[f].customData = cd; return true; };
    return o;
  }

  /* ---------- Media Pool ---------- */
  function folder(name) {
    const f = { _name: name, _clips: [], _subs: [], _id: uid('folder') };
    f.GetName = () => f._name;
    f.GetClipList = () => f._clips.slice();
    f.GetSubFolderList = () => f._subs.slice();
    f.GetUniqueId = () => f._id;
    f.GetIsFolderStale = () => false;
    return f;
  }
  function clip(file, info, startFrame, endFrame) {
    const m = Object.assign({ fps, frames: 250, width, height, audioCh: 2, type: 'Video + Audio' }, info || {});
    const it = { _id: uid('clip'), _file: file, _color: '', _mark: {}, _m: m, _proxy: '' };
    it._name = m.name || path.basename(file);
    it._start = startFrame != null ? startFrame : 0;
    it._end = endFrame != null ? endFrame : m.frames - 1;
    it._props = () => {
      const isTl = /timeline/i.test(m.type), frames = isTl ? m.frames : it._end - it._start + 1;
      const p = { 'Clip Name': it._name, 'File Path': isTl ? '' : file, 'FPS': m.fps, 'Frames': String(frames), 'Type': m.type,
        'Resolution': /^audio$/i.test(m.type) ? '' : `${m.width}x${m.height}`, 'Audio Ch': String(m.audioCh), 'Start': String(it._start), 'End': String(it._end),
        'Proxy Media Path': it._proxy || '', 'Video Codec': /video|timeline/i.test(m.type) ? 'H.264' : '' };
      return p;
    };
    it.GetName = () => it._name;
    it.SetName = n => { it._name = n; return true; };
    it.GetClipProperty = k => (k ? it._props()[k] : it._props());
    it.SetClipProperty = (k, v) => { if (k === 'Clip Name') { it._name = v; return true; } return false; };
    it.GetMetadata = () => ({});
    it.SetMetadata = () => true;
    it.GetUniqueId = () => it._id;
    it.GetMediaId = () => 'media-' + file;
    it.GetClipColor = () => it._color;
    it.SetClipColor = c => { it._color = c; return true; };
    it.ClearClipColor = () => { it._color = ''; return true; };
    it.GetMarkInOut = () => JSON.parse(JSON.stringify(it._mark));
    it.SetMarkInOut = (a, b, type = 'all') => { const v = { in: a, out: b }; if (type === 'all') it._mark = { video: v, audio: v }; else it._mark[type] = v; return true; };
    it.ClearMarkInOut = () => { it._mark = {}; return true; };
    it.LinkProxyMedia = p => { it._proxy = p; return true; };
    it.UnlinkProxyMedia = () => { it._proxy = ''; return true; };
    it.GetFlagList = () => [];
    markerHost(it, () => 'clip:' + it._name);
    return it;
  }

  const root = folder('Master');
  let current = root;
  function findItemFolder(item) { let r = null; (function walk(f) { if (f._clips.includes(item)) r = f; f._subs.forEach(walk); })(root); return r; }

  /* ---------- timelines ---------- */
  const timelines = [];
  let currentTl = null;
  function timeline(name) {
    const tl = { _name: name, _id: uid('timeline'), _start: 86400, _v: [[]], _a: [[]], _vOn: [true], _aOn: [true], _vLock: [false], _aLock: [false], _vName: ['Video 1'], _aName: ['Audio 1'], _settings: {}, _playhead: 86400 };
    tl.GetName = () => tl._name;
    tl.SetName = n => { if (timelines.some(t => t !== tl && t._name === n)) return false; tl._name = n; return true; };
    tl.GetUniqueId = () => tl._id;
    tl.GetStartFrame = () => tl._start;
    tl.GetEndFrame = () => Math.max(tl._start, ...tl._v.concat(tl._a).flat().map(i => i._end));
    tl.GetStartTimecode = () => '01:00:00:00';
    tl.GetSetting = k => (k == null ? Object.assign({ timelineFrameRate: String(fps) }, tl._settings) : k in tl._settings ? tl._settings[k] : k === 'timelineFrameRate' ? String(fps) : k === 'timelineResolutionWidth' ? String(width) : k === 'timelineResolutionHeight' ? String(height) : '');
    tl.SetSetting = (k, v) => { tl._settings[k] = String(v); return true; };
    const arr = t => (t === 'video' ? tl._v : t === 'audio' ? tl._a : []);
    tl.GetTrackCount = t => arr(t).length;
    tl.AddTrack = (t) => { const a = arr(t); a.push([]); (t === 'video' ? tl._vOn : tl._aOn).push(true); (t === 'video' ? tl._vLock : tl._aLock).push(false); (t === 'video' ? tl._vName : tl._aName).push((t === 'video' ? 'Video ' : 'Audio ') + a.length); return true; };
    tl.DeleteTrack = (t, i) => { const a = arr(t); if (i < 1 || i > a.length) return false; a.splice(i - 1, 1); return true; };
    tl.GetItemListInTrack = (t, i) => (arr(t)[i - 1] || []).slice().sort((a, b) => a._start - b._start);
    tl.SetTrackEnable = (t, i, on) => { (t === 'video' ? tl._vOn : tl._aOn)[i - 1] = !!on; return true; };
    tl.GetIsTrackEnabled = (t, i) => (t === 'video' ? tl._vOn : tl._aOn)[i - 1] !== false;
    tl.SetTrackLock = (t, i, on) => { (t === 'video' ? tl._vLock : tl._aLock)[i - 1] = !!on; return true; };
    tl.GetIsTrackLocked = (t, i) => !!(t === 'video' ? tl._vLock : tl._aLock)[i - 1];
    tl.GetTrackName = (t, i) => (t === 'video' ? tl._vName : tl._aName)[i - 1] || '';
    tl.SetTrackName = (t, i, n) => { (t === 'video' ? tl._vName : tl._aName)[i - 1] = n; return true; };
    tl.DeleteClips = (items, ripple) => {
      for (const it of items) {
        const a = arr(it._type)[it._track - 1], i = a.indexOf(it); if (i < 0) continue;
        a.splice(i, 1);
        if (ripple) { const len = it._end - it._start; for (const tr of tl._v.concat(tl._a)) for (const o of tr) if (o._start >= it._end) { o._start -= len; o._end -= len; } }
      }
      return true;
    };
    tl.GetCurrentTimecode = () => require('../../resolve/host/base').framesToTC(tl._playhead, fps, false);
    tl.SetCurrentTimecode = tc => { tl._playhead = require('../../resolve/host/base').tcToFrames(tc, fps); return true; };
    tl.GetCurrentVideoItem = () => tl._v.flat().find(i => i._start <= tl._playhead && i._end > tl._playhead) || null;
    tl.DuplicateTimeline = n => { const c = timeline(n || tl._name + ' copy'); for (const k of ['_v', '_a']) c[k] = tl[k].map(tr => tr.map(it => cloneItem(it, c))); c._settings = Object.assign({}, tl._settings); c._markers = JSON.parse(JSON.stringify(tl._markers)); timelines.push(c); return c; };
    tl.GetMediaPoolItem = () => tl._mpi;
    tl.GetMarkInOut = () => JSON.parse(JSON.stringify(tl._mark || {}));
    tl.SetMarkInOut = (a, b) => { tl._mark = { video: { in: a, out: b }, audio: { in: a, out: b } }; return true; };
    tl.ClearMarkInOut = () => { tl._mark = {}; return true; };
    tl.InsertGeneratorIntoTimeline = () => null;
    tl.Export = (file) => { fs.writeFileSync(file, 'fake export of ' + tl._name); return true; };
    markerHost(tl, () => 'timeline:' + tl._name);
    // the timeline's own Media Pool entry
    tl._mpi = clip('', { type: 'Timeline', name, frames: 0 });
    tl._mpi._props = () => ({ 'Clip Name': tl._name, 'File Path': '', 'FPS': fps, 'Frames': String(tl.GetEndFrame() - tl._start), 'Type': 'Timeline', 'Resolution': `${width}x${height}`, 'Audio Ch': '2' });
    return tl;
  }
  function timelineItem(tl, type, track, mpi, startFrame, endFrame, recordFrame) {
    const ti = { _id: uid('item'), _type: type, _track: track, _mpi: mpi, _srcStart: startFrame, _srcEnd: endFrame, _start: recordFrame, _end: recordFrame + (endFrame - startFrame) /* endFrame is exclusive here (measured in Resolve 21) */, _enabled: true, _color: '', _props: { ZoomX: 1, ZoomY: 1, Pan: 0, Tilt: 0, Opacity: 100 } };
    ti.GetName = () => (mpi ? mpi._name : 'Item');
    ti.GetUniqueId = () => ti._id;
    ti.GetStart = () => ti._start;
    ti.GetEnd = () => ti._end;
    ti.GetDuration = () => ti._end - ti._start;
    ti.GetSourceStartFrame = () => ti._srcStart;
    ti.GetSourceEndFrame = () => ti._srcStart + (ti._end - ti._start);
    ti.GetLeftOffset = () => ti._srcStart;
    ti.GetRightOffset = () => 0;
    ti.GetMediaPoolItem = () => mpi;
    ti.GetTrackTypeAndIndex = () => [type, track];
    ti.SetClipEnabled = on => { ti._enabled = !!on; return true; };
    ti.GetClipEnabled = () => ti._enabled;
    ti.GetClipColor = () => ti._color;
    ti.SetClipColor = c => { ti._color = c; return true; };
    ti.ClearClipColor = () => { ti._color = ''; return true; };
    ti.GetProperty = k => (k ? ti._props[k] : Object.assign({}, ti._props));
    ti.SetProperty = (k, v) => { if (typeof k === 'object') { Object.assign(ti._props, k); return true; } ti._props[k] = v; return true; };
    ti.GetLinkedItems = () => tl._v.concat(tl._a).flat().filter(o => o !== ti && o._mpi === mpi && o._start === ti._start);
    ti.SmartReframe = () => true;
    markerHost(ti, () => 'item:' + ti.GetName());
    return ti;
  }
  function cloneItem(it, tl) { const c = timelineItem(tl, it._type, it._track, it._mpi, it._srcStart, it._srcEnd, it._start); c._end = it._end; c._enabled = it._enabled; c._color = it._color; return c; }
  function place(tl, info, type, track, at) {
    const a = type === 'video' ? tl._v : tl._a;
    while (a.length < track) tl.AddTrack(type);
    const ti = timelineItem(tl, type, track, info.mediaPoolItem, info.startFrame, info.endFrame, at);
    // overwrite whatever was there
    a[track - 1] = a[track - 1].filter(o => o._end <= ti._start || o._start >= ti._end);
    a[track - 1].push(ti);
    return ti;
  }

  /* ---------- project ---------- */
  const settings = { timelineFrameRate: String(fps), timelineResolutionWidth: String(width), timelineResolutionHeight: String(height) };
  const renderJobs = [];
  let renderSettings = {}, renderFormat = { format: 'mp4', codec: 'H264' }, renderMode = 1;
  const pool = {
    GetRootFolder: () => root,
    AddSubFolder: (parent, name) => { if (parent._subs.some(f => f._name === name)) return null; const f = folder(name); parent._subs.push(f); return f; },
    GetCurrentFolder: () => current,
    SetCurrentFolder: f => { current = f; return true; },
    CreateEmptyTimeline: name => { if (timelines.some(t => t._name === name)) return null; const tl = timeline(name); timelines.push(tl); current._clips.push(tl._mpi); currentTl = tl; return tl; },
    CreateTimelineFromClips: (name, clips) => { const tl = pool.CreateEmptyTimeline(name); if (!tl) return null; pool.AppendToTimeline(clips); return tl; },
    AppendToTimeline: (clips) => {
      const tl = currentTl; if (!tl) return [];
      const out = [];
      for (const c0 of [].concat(clips)) {
        const c = c0 && c0.mediaPoolItem ? c0 : { mediaPoolItem: c0, startFrame: c0._start, endFrame: c0._end + 1 };
        const m = c.mediaPoolItem._m, hasV = /video|still|timeline/i.test(m.type), hasA = /audio/i.test(m.type) || m.audioCh > 0;
        const track = c.trackIndex || 1;
        const end = Math.max(tl._start, ...((c.mediaType === 2 ? tl._a : tl._v)[track - 1] || []).map(i => i._end));
        const at = c.recordFrame != null ? Math.round(c.recordFrame) : end;
        if (hasV && c.mediaType !== 2) out.push(place(tl, c, 'video', track, at));
        if (hasA && c.mediaType !== 1 && !/still/i.test(m.type)) out.push(place(tl, c, 'audio', track, at));
      }
      log.push(['AppendToTimeline', out.length]);
      return out;
    },
    ImportMedia: (items) => [].concat(items).map(p => { const file = typeof p === 'string' ? p : p.FilePath; if (!media[file] && !fs.existsSync(file)) return null; const it = clip(file, media[file]); current._clips.push(it); return it; }).filter(Boolean),
    MoveClips: (items, target) => { for (const it of items) { const f = findItemFolder(it); if (f) f._clips.splice(f._clips.indexOf(it), 1); target._clips.push(it); } return true; },
    DeleteClips: (items) => { for (const it of items) { const f = findItemFolder(it); if (f) f._clips.splice(f._clips.indexOf(it), 1); } return true; },
    DeleteTimelines: (tls) => { for (const t of tls) { const i = timelines.indexOf(t); if (i >= 0) timelines.splice(i, 1); const f = findItemFolder(t._mpi); if (f) f._clips.splice(f._clips.indexOf(t._mpi), 1); if (currentTl === t) currentTl = timelines[0] || null; } return true; },
    DeleteFolders: (fs2) => { (function walk(f) { f._subs = f._subs.filter(s => !fs2.includes(s)); f._subs.forEach(walk); })(root); return true; },
    GetSelectedClips: () => F.selected.slice(),
    SetSelectedClip: it => { F.selected = [it]; return true; },
    ImportTimelineFromFile: () => null,
    GetUniqueId: () => 'pool-1'
  };
  const project = {
    GetName: () => projectName,
    GetUniqueId: () => 'project-1',
    GetMediaPool: () => pool,
    GetTimelineCount: () => timelines.length,
    GetTimelineByIndex: i => timelines[i - 1] || null,
    GetCurrentTimeline: () => currentTl,
    SetCurrentTimeline: tl => { if (!timelines.includes(tl)) return false; currentTl = tl; log.push(['SetCurrentTimeline', tl._name]); return true; },
    GetSetting: k => (k == null ? Object.assign({}, settings) : settings[k] || ''),
    SetSetting: (k, v) => { settings[k] = String(v); return true; },
    GetRenderFormats: () => ({ MP4: 'mp4', QuickTime: 'mov', Wave: 'wav', 'Audio Only': 'wav' }),
    GetRenderCodecs: f => (f === 'wav' ? { 'Linear PCM': 'LinearPCM' } : { 'H.264': 'H264', 'H.265': 'H265', 'Apple ProRes 422 HQ': 'ProRes422HQ' }),
    GetCurrentRenderFormatAndCodec: () => Object.assign({}, renderFormat),
    SetCurrentRenderFormatAndCodec: (format, codec) => { renderFormat = { format, codec }; return true; },
    GetCurrentRenderMode: () => renderMode,
    SetCurrentRenderMode: m => { renderMode = m; return true; },
    GetRenderPresetList: () => ['H.264 Master', 'YouTube - 1080p', 'Vimeo - 1080p', 'ProRes 422 HQ', 'Audio Only'],
    LoadRenderPreset: n => project.GetRenderPresetList().includes(n),
    SetRenderSettings: s => { renderSettings = Object.assign({}, renderSettings, s); return true; },
    GetRenderSettings: () => Object.assign({}, renderSettings),
    AddRenderJob: () => { const id = uid('job'); renderJobs.push({ JobId: id, settings: Object.assign({}, renderSettings), format: Object.assign({}, renderFormat), timeline: currentTl && currentTl._name, status: 'Ready' }); return id; },
    DeleteRenderJob: id => { const i = renderJobs.findIndex(j => j.JobId === id); if (i < 0) return false; renderJobs.splice(i, 1); return true; },
    DeleteAllRenderJobs: () => { renderJobs.length = 0; return true; },
    GetRenderJobList: () => renderJobs.map(j => ({ JobId: j.JobId, TargetDir: j.settings.TargetDir, OutputFilename: (j.settings.CustomName || j.timeline) + '.' + j.format.format, TimelineName: j.timeline, MarkIn: j.settings.MarkIn, MarkOut: j.settings.MarkOut })),
    // rendering writes each job's file at once ("Complete"), unless F.renderFails is set
    StartRendering: (...ids) => {
      const want = ids.flat().filter(x => typeof x === 'string');
      for (const j of renderJobs) if (!want.length || want.includes(j.JobId)) {
        if (F.renderFails) { j.status = 'Failed'; continue; }
        const file = path.join(j.settings.TargetDir || '/tmp', (j.settings.CustomName || j.timeline) + '.' + j.format.format);
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, F.renderContent ? F.renderContent(j) : 'fake render'); } catch (e) { j.status = 'Failed'; continue; }
        j.status = 'Complete'; j.file = file;
      }
      return true;
    },
    StopRendering: () => {},
    IsRenderingInProgress: () => false,
    GetRenderJobStatus: id => { const j = renderJobs.find(x => x.JobId === id); return j ? { JobStatus: j.status, CompletionPercentage: j.status === 'Complete' ? 100 : 0, Error: j.status === 'Failed' ? 'fake failure' : '' } : {}; },
    ExportCurrentFrameAsStill: file => { try { fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex')); return true; } catch (e) { return false; } },
    RefreshLUTList: () => true
  };
  let saved = 0;
  const pm = {
    GetCurrentProject: () => (F.noProject ? null : project),
    SaveProject: () => { saved++; return true; },
    GetCurrentDatabase: () => ({ DbType: 'Disk', DbName: 'Local Database' }),
    GetCurrentFolder: () => ''
  };
  const storage = {
    GetMountedVolumeList: () => ['/'],
    AddItemListToMediaPool: (...items) => items.flat().map(x => {
      if (typeof x === 'string') { const it = clip(x, media[x]); current._clips.push(it); return it; }
      const it = clip(x.media, media[x.media], x.startFrame, x.endFrame); current._clips.push(it); return it;
    })
  };
  let page = 'edit';
  const resolve = {
    GetProjectManager: () => pm,
    GetMediaStorage: () => storage,
    GetProductName: () => 'DaVinci Resolve Studio',
    GetVersion: () => [20, 3, 1, 0, ''],
    GetVersionString: () => '20.3.1',
    GetCurrentPage: () => page,
    OpenPage: p => { page = p; return true; }
  };

  const F = {
    resolve, project, pool, root, timelines, log, media, selected: [],
    get saved() { return saved; }, get currentTimeline() { return currentTl; }, get renderJobs() { return renderJobs; },
    renderFails: false, renderContent: null, noProject: false,
    /** Register a media file (it needn't exist on disk) and import it: F.addMedia('/m/a.mp4', {fps, frames, type, bin}) */
    addMedia(file, info = {}) {
      media[file] = Object.assign({ fps, frames: 250, width, height, audioCh: 2, type: 'Video + Audio' }, info);
      const keep = current; current = info.bin ? F.bin(info.bin) : root;
      const [it] = pool.ImportMedia([file]); current = keep; return it;
    },
    bin(p) { let f = root; for (const n of p.split('/')) f = f._subs.find(s => s._name === n) || pool.AddSubFolder(f, n); return f; },
    /** A timeline made from clips laid end to end: F.addTimeline('Cut', [{item, in, out, track?, at?}]) with frames */
    addTimeline(name, parts = []) {
      const tl = pool.CreateEmptyTimeline(name);
      for (const p of parts) pool.AppendToTimeline([{ mediaPoolItem: p.item, startFrame: p.in, endFrame: p.out, trackIndex: p.track || 1, recordFrame: p.at != null ? tl._start + p.at : undefined, mediaType: p.mediaType }]);
      return tl;
    }
  };
  return F;
}

module.exports = { make };
