// JMG Ultra Studio – Resolve side for Safe Zones, Final Check and Deliver (the Resolve versions of jsx/tools/finish.jsx).
// Guides: the guide PNG on its own top video track for the timeline's length; hidden = the track switched off (it then
// doesn't render). Render ranges: Premiere uses adjustment layers on a "Renders" track; Resolve can't make adjustment
// clips by script, so a range is a duration marker on the timeline whose customData starts "us-range-" – its length is
// the part that renders and its name the file name (both editable in Resolve). Other groups of ranges stand for
// Premiere's other layer tracks – Song Splitter's "Songs" – with customData "us-lyr-<group>~<id>"; their colour is the
// marker's colour (Premiere label → LABEL_MARKER, and back).
'use strict';
const path = require('path');
const { engine } = require('./render');

const GUIDE_PREFIX = 'Ultra Guide';
const RANGE_TAG = 'us-range-', RANGE_COLOR = 'Fuchsia', LAYER_TAG = 'us-lyr-', RENDERS = 'Renders';
const { LABEL_MARKER } = require('./story');
/** A marker colour back to the first Premiere label that uses it (Forest → Green → 5), or null. */
const labelOfColour = c => { const i = LABEL_MARKER.indexOf(String(c || '')); return i >= 0 ? i : null; };
const groupKey = g => String(g || RENDERS).trim().toLowerCase();
/** The group a marker's customData puts it in ('' for markers that aren't ranges) */
function groupOf(cd) {
  cd = String(cd || '');
  if (cd.indexOf(RANGE_TAG) === 0) return RENDERS;
  const m = /^us-lyr-([^~]*)~/.exec(cd);
  return m ? decodeURIComponent(m[1]) : '';
}

module.exports = function (R) {
  const E = engine(R);
  const P = () => R.project();
  const itemName = ti => { let n = ''; try { n = String(ti.GetName() || ''); } catch (e) { /* none */ } if (!n) { try { const m = ti.GetMediaPoolItem(); n = m ? String(m.GetName() || '') : ''; } catch (e) { /* none */ } } return n; };
  const isGuide = (ti, prefix) => itemName(ti).indexOf(prefix) === 0;
  const items = (tl, t) => R.list(tl.GetItemListInTrack('video', t)).filter(Boolean);
  const samePath = (a, b) => { const n = p => path.normalize(String(p || '')); return process.platform === 'win32' || process.platform === 'darwin' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };

  /** Guide tracks: [{track (1-based), count, hidden}] */
  function guides(tl, prefix) {
    const out = [];
    for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) {
      // a guide laid in several 5 s pieces (Resolve's still length) is one guide, as in Premiere
      const c = new Set(items(tl, t).filter(ti => isGuide(ti, prefix)).map(ti => String(ti.GetName()))).size;
      if (c) out.push({ track: t, count: c, hidden: !tl.GetIsTrackEnabled('video', t) });
    }
    return out;
  }
  /** The range markers of a group (default "Renders"): [{frame, m}] (frames from the start of the timeline) */
  function rangeMarkers(tl, group) {
    const want = groupKey(group);
    return Object.entries(R.markers(tl)).filter(([, m]) => m && groupOf(m.customData) && groupKey(groupOf(m.customData)) === want)
      .map(([f, m]) => ({ frame: Number(f), m })).sort((a, b) => a.frame - b.frame);
  }
  const tagFor = group => (groupKey(group) === groupKey(RENDERS) ? RANGE_TAG + R.newGuid().replace(/^us-/, '') : LAYER_TAG + encodeURIComponent(String(group).trim()) + '~' + R.newGuid().replace(/^us-/, ''));
  const rangeOf = (fps, frame, m) => ({ name: String(m.name || ''), start: frame / fps, end: (frame + Math.max(1, Number(m.duration) || 1)) / fps, disabled: false, nodeId: String(m.customData), label: labelOfColour(m.color) });
  /** Add one range marker over start–end (seconds); a frame already holding a marker moves it on a frame. -> {frame, ok, why} */
  function putRange(tl, fps, { name, start, end, colour, note, customData }, taken) {
    let f = Math.max(0, Math.round(start * fps));
    const endF = Math.round(end * fps);
    while (taken.has(f)) f++;
    const dur = Math.max(1, endF - f);
    let ok = false, why = '';
    try { ok = tl.AddMarker(f, colour, String(name || 'Render'), note, dur, customData); } catch (e) { why = e.message; }
    if (ok) taken.add(f);
    return { frame: f, ok, why };
  }
  function needRange(tl, a) {
    const hit = rangeMarkers(tl, a.track).find(x => String(x.m.customData) === String(a.nodeId));
    if (!hit) throw R.err('NOT_FOUND', 'Range marker ' + a.nodeId, 'That render range isn’t on the timeline any more.', 'Press Refresh in Deliver › Render ranges.');
    return hit;
  }

  return {
    /**
     * Put a guide still on a top video track for the whole timeline. Our track ("Guides", or "Letterbox" for bars, or one
     * holding clips named prefix…) is reused – its old guide clips replaced – unless something else is on it.
     * a: {seqId, itemId, trackName?, prefix?} → {track (0-based), start, end}
     */
    async placeGuide(a) {
      const tl = R.needSeq(a.seqId), item = R.needItem(a.itemId), pr = P(), pool = R.pool();
      const fps = R.fps(tl), first = tl.GetStartFrame(), last = tl.GetEndFrame();
      if (!(last > first)) throw R.err('BAD_INPUT', 'Timeline is empty', 'This timeline is empty.', 'Add some clips first, then put the guide on.');
      const trackName = a.trackName || 'Guides', prefix = a.prefix || GUIDE_PREFIX;
      let top = -1;
      for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) {
        if (String(tl.GetTrackName('video', t) || '') === trackName || items(tl, t).some(ti => isGuide(ti, prefix))) top = t;
      }
      if (top > 0) {
        const old = items(tl, top).filter(ti => isGuide(ti, prefix));
        if (old.length) tl.DeleteClips(old, false);
        if (items(tl, top).length) top = -1;   // something else is on it: use a new track
      }
      if (top < 0) {
        const n = tl.GetTrackCount('video');
        if (!tl.AddTrack('video') || tl.GetTrackCount('video') <= n) throw R.err('HOST_SCRIPT', 'AddTrack video refused', 'Resolve didn’t add a video track.', 'Check the timeline isn’t locked, then try again.');
        top = tl.GetTrackCount('video');
      }
      try { tl.SetTrackName('video', top, trackName); } catch (e) { /* the name is only a help */ }
      tl.SetTrackEnable('video', top, true);
      const was = pr.GetCurrentTimeline();
      R.open(tl);
      const placed = [];
      try {
        // Resolve 21 lays a still for its still length (5 s) whatever is asked: carry on from where it ended. The
        // last piece is asked for ending at the timeline's end: Resolve then starts it where the space begins (it
        // keeps the end and trims the start), so the guide ends with the edit instead of making it longer.
        let at = first, len = 0;
        for (let guard = 0; at < last && guard < 500; guard++) {
          const short = len && last - at < len, rec = short ? Math.max(first, last - len) : at;
          const got = R.list(pool.AppendToTimeline([R.clipInfo(item, 0, (short ? len : last - at) / fps, { trackIndex: top, recordFrame: rec, mediaType: 1 })])).filter(Boolean);
          if (!got.length) break;
          const start = Math.min(...got.map(ti => ti.GetStart())), end = Math.max(...got.map(ti => ti.GetEnd()));
          if (end <= at) break;
          if (!len) len = end - start;
          placed.push(...got); at = end;
        }
      } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
      if (!placed.length) throw R.err('HOST_SCRIPT', 'AppendToTimeline placed nothing on V' + top, 'Resolve didn’t place the guide.', 'Check the timeline isn’t locked, then try again.');
      return { track: top - 1, start: R.tlSec(tl, Math.min(...placed.map(ti => ti.GetStart()))), end: R.tlSec(tl, Math.max(...placed.map(ti => ti.GetEnd()))) };
    },

    /** The Media Pool clip for a guide PNG we imported before (so it isn't imported twice). a: {path} → id | null */
    findGuideItem(a) {
      const hit = R.index().clips.find(c => samePath(R.props(c.item)['File Path'], a.path));
      return hit ? hit.id : null;
    },
    /** Where the guides are in this timeline, and are they hidden? a: {seqId} → [{track (0-based), count, hidden}] */
    guideStatus(a) { return guides(R.needSeq(a.seqId), GUIDE_PREFIX).map(g => ({ track: g.track - 1, count: g.count, hidden: g.hidden })); },
    /** Show/hide every guide track (switched-off tracks don't render). a: {seqId, show} → tracks changed */
    showGuides(a) {
      const tl = R.needSeq(a.seqId); let n = 0;
      for (const g of guides(tl, GUIDE_PREFIX)) { tl.SetTrackEnable('video', g.track, !!a.show); n++; }
      return n;
    },
    /** Remove guide clips (prefix: "Ultra Guide", or "Ultra Letterbox" for bars), and their track once it's empty. a: {seqId, prefix?} → clips removed */
    removeGuides(a) {
      const tl = R.needSeq(a.seqId), prefix = a.prefix || GUIDE_PREFIX;
      let n = 0;
      for (let t = tl.GetTrackCount('video'); t >= 1; t--) {
        const mine = items(tl, t).filter(ti => isGuide(ti, prefix));
        if (!mine.length) continue;
        // a guide laid in several pieces (Resolve lays a still 5 s at a time) counts once, as in Premiere
        const guidesHere = new Set(mine.map(ti => String(ti.GetName()))).size;   // before deleting: Resolve drops the objects then
        if (tl.DeleteClips(mine, false)) n += guidesHere;
        // an emptied track of ours goes too (never V1)
        if (t > 1 && !items(tl, t).length && /^(guides|letterbox)$/i.test(String(tl.GetTrackName('video', t) || '').trim())) { try { tl.DeleteTrack('video', t); } catch (e) { /* leave it */ } }
      }
      return n;
    },

    /**
     * A new timeline of an exact frame size holding the given one, scaled to fill (e.g. a 608×1080 Smart Reframe →
     * 1080×1920). The timeline goes in as a nested timeline; if Resolve refuses, a resized copy is made instead.
     * a: {seqId, width, height, name, binPath} → {id, name, width, height, scale}
     */
    async fitToSize(a) {
      const src = R.needSeq(a.seqId), pr = P(), pool = R.pool(), s = R.size(src), W = Math.round(a.width), H = Math.round(a.height);
      if (!(W > 0 && H > 0)) throw R.err('BAD_INPUT', 'fitToSize ' + W + '×' + H);
      const bin = R.ensureBin(a.binPath || 'JMG Ultra Studio/Deliver');
      const name = R.uniqueTimelineName(a.name || `${src.GetName()} ${W}×${H}`);
      const was = pr.GetCurrentTimeline();
      let tl = null, via = 'nested';
      try {
        tl = R.inFolder(bin, () => pool.CreateEmptyTimeline(name));
        if (!tl) throw R.err('HOST_SCRIPT', 'CreateEmptyTimeline ' + name, 'Resolve couldn’t make the full-size timeline.', 'Check the project isn’t locked, then try again.');
        E.intoBin(tl, bin);
        E.setSize(tl, W, H, 'scaleToCrop');
        try { tl.SetSetting('timelineFrameRate', String(R.fps(src))); } catch (e) { /* project rate */ }   // while it's empty
        R.open(tl);
        const mpi = src.GetMediaPoolItem && src.GetMediaPoolItem(), frames = src.GetEndFrame() - src.GetStartFrame();
        // Resolve 21 throws a refusal rather than answering []: either way, the resized copy below takes over
        let got = [];
        if (mpi && frames > 0) { try { got = R.list(pool.AppendToTimeline([{ mediaPoolItem: mpi, startFrame: 0, endFrame: frames, trackIndex: 1, recordFrame: tl.GetStartFrame() }])).filter(Boolean); } catch (e) { got = []; } }
        if (!got.length) {
          try { pool.DeleteTimelines([tl]); } catch (e) { /* left in the bin */ }
          via = 'copy';
          tl = R.inFolder(bin, () => src.DuplicateTimeline(name));
          if (!tl) throw R.err('HOST_SCRIPT', 'Nesting and DuplicateTimeline both refused', 'Resolve couldn’t make the full-size timeline.', 'Change the timeline’s size by hand in Timeline › Timeline Settings.');
          E.intoBin(tl, bin);
          E.setSize(tl, W, H, 'scaleToCrop');
        }
      } finally { await R.restoreTimeline(was); }
      const z = R.size(tl);
      return { id: R.id(tl), name: tl.GetName(), width: z.width, height: z.height, scale: Math.max(W / s.width, H / s.height) * 100, via };
    },

    /* ---------- the Render Queue ---------- */
    /** Built-in choices for Deliver › Render ranges, plus Resolve's own render presets. */
    deliverPresets() {
      let names = [];
      try { names = R.list(P().GetRenderPresetList()).map(x => (x && typeof x === 'object' ? x.PresetName || x.name || x.Name : x)).filter(Boolean).map(String); } catch (e) { /* none */ }
      return {
        h264: E.token('h264'), youtube1080: E.token('youtube1080'), youtube2160: E.token('youtube2160'), prores: E.token('prores'), wav: E.token('wav'),
        renderPresets: names.filter(n => n.indexOf('JMG Ultra Studio – your render settings') !== 0).map(n => ({ path: 'preset:' + n, name: n }))
      };
    },

    /** a: {seqId, track?} → {track, trackName, ranges:[{name, start, end, disabled, nodeId, label}], colours} (track -1 when there are none) */
    renderRanges(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), group = a.track || RENDERS;
      const ranges = rangeMarkers(tl, group).map(({ frame, m }) => rangeOf(fps, frame, m));
      return { track: ranges.length ? 0 : -1, trackName: ranges.length ? String(group) : '', ranges, colours: true };
    },
    /** a: {seqId} → {tracks:[{index, name, count}]} – every group of range markers on the timeline (Renders, Songs…) */
    rangeTracks(a) {
      const tl = R.needSeq(a.seqId), count = new Map();
      for (const m of Object.values(R.markers(tl))) { const g = m && groupOf(m.customData); if (g) count.set(g, (count.get(g) || 0) + 1); }
      return { tracks: [...count.entries()].map(([name, n], i) => ({ index: i, name, count: n })) };
    },
    /**
     * Add a render range: a duration marker over start–end, named, in group a.track ("Renders" by default) and the
     * colour of Premiere label a.label (else fuchsia). A marker can't share a frame with another, so a clash moves it
     * on a frame. a: {seqId, name, start, end, track?, label?} → {track, named, kind:'marker', placed, renamed, log}
     */
    addRenderRange(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), log = [], start = R.num(a.start), end = R.num(a.end);
      if (start == null || end == null || !(end > start)) throw R.err('BAD_INPUT', 'Empty range ' + a.start + '–' + a.end, 'That range is empty.', 'Set In and Out points around the part to render, or move the playhead into the edit.');
      const taken = new Set(Object.keys(R.markers(tl)).map(Number)), label = R.num(a.label);
      const r = putRange(tl, fps, { name: a.name, start, end, colour: label != null && LABEL_MARKER[label] ? LABEL_MARKER[label] : RANGE_COLOR, note: 'Ultra Studio render range: its length is the part that renders, its name the file name.', customData: tagFor(a.track || RENDERS) }, taken);
      if (!r.ok) throw R.err('HOST_SCRIPT', `AddMarker at ${r.frame} refused${r.why ? ': ' + r.why : ''}`, 'Resolve didn’t add the render range.', 'Check the timeline isn’t locked, then try again.');
      if (r.frame !== Math.round(start * fps)) log.push(`moved on ${r.frame - Math.round(start * fps)} frame(s): another marker was at the start`);
      return { track: -1, named: true, kind: 'marker', placed: 1, renamed: 1, log };
    },
    /** Change a range: name, colour (Premiere label), start, end – the marker is laid again with the same id. a: {seqId, track, nodeId, name?, label?, start?, end?} → {range, log} */
    editRenderRange(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), hit = needRange(tl, a), old = rangeOf(fps, hit.frame, hit.m), log = [];
      const start = R.num(a.start) != null ? R.num(a.start) : old.start, end = R.num(a.end) != null ? R.num(a.end) : old.end;
      if (!(end > start) || start < 0) throw R.err('BAD_INPUT', 'Range ' + start + '–' + end, 'That range is empty.', 'Make the end later than the start.');
      const label = R.num(a.label);
      const colour = label != null && LABEL_MARKER[label] ? LABEL_MARKER[label] : String(hit.m.color || RANGE_COLOR);
      const name = a.name != null && String(a.name).trim() ? String(a.name).trim() : old.name;
      if (!R.deleteMarker(tl, hit.frame, hit.m.customData)) throw R.err('HOST_SCRIPT', 'Range marker not deleted at ' + hit.frame, 'Couldn’t change that render range.', 'Check the timeline isn’t locked, then try again.');
      const taken = new Set(Object.keys(R.markers(tl)).map(Number));
      const r = putRange(tl, fps, { name, start, end, colour, note: String(hit.m.note || ''), customData: String(hit.m.customData) }, taken);
      if (!r.ok) {
        // put the old one back rather than lose it
        putRange(tl, fps, { name: old.name, start: old.start, end: old.end, colour: String(hit.m.color || RANGE_COLOR), note: String(hit.m.note || ''), customData: String(hit.m.customData) }, taken);
        throw R.err('HOST_SCRIPT', `AddMarker at ${r.frame} refused: ${r.why}`, 'Resolve didn’t take the change.', 'Check the timeline isn’t locked, then try again.');
      }
      const now = rangeMarkers(tl, a.track).find(x => String(x.m.customData) === String(hit.m.customData));
      return { range: now ? rangeOf(fps, now.frame, now.m) : null, log };
    },
    /** a: {seqId, track, nodeId} → {removed: 1} */
    removeRenderRange(a) {
      const tl = R.needSeq(a.seqId), hit = needRange(tl, a);
      if (!R.deleteMarker(tl, hit.frame, hit.m.customData)) throw R.err('HOST_SCRIPT', 'Range marker not deleted', 'Couldn’t delete that render range.', 'Check the timeline isn’t locked, then try again.');
      return { removed: 1 };
    },
    /**
     * Song Splitter's layers: Resolve can't make adjustment clips by script, so each section is a range marker in the
     * group a.trackName, in its colour; running it again replaces that group. a: {seqId, trackName, sections:[{name,
     * start, end, label}]} → {kind:'marker', how, track, named, placed, renamed, removed, log}
     */
    labelLayers(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), group = a.trackName || 'Songs', log = [];
      const bad = (a.sections || []).filter(x => R.num(x.start) == null || R.num(x.end) == null);
      if (bad.length) throw R.err('BAD_INPUT', `${bad.length} section(s) without times`);
      let removed = 0;
      for (const { frame, m } of rangeMarkers(tl, group)) if (R.deleteMarker(tl, frame, m.customData)) removed++;
      const taken = new Set(Object.keys(R.markers(tl)).map(Number));
      let placed = 0;
      for (const x of a.sections || []) {
        if (!(R.num(x.end) > R.num(x.start))) continue;
        const r = putRange(tl, fps, { name: x.name, start: R.num(x.start), end: R.num(x.end), colour: LABEL_MARKER[R.num(x.label)] || RANGE_COLOR, note: 'Ultra Studio · ' + group, customData: tagFor(group) }, taken);
        if (r.ok) placed++; else log.push(`“${x.name}” not added at ${r.frame}: ${r.why}`);
      }
      return { kind: 'marker', how: 'range markers', track: -1, named: true, placed, renamed: placed, removed, log };
    },
    /** a: {seqId, trackName} → {removed, track} */
    removeLabelLayers(a) {
      const tl = R.needSeq(a.seqId);
      let removed = 0;
      for (const { frame, m } of rangeMarkers(tl, a.trackName || 'Songs')) if (R.deleteMarker(tl, frame, m.customData)) removed++;
      return { removed, track: -1 };
    },
    /**
     * Queue one part of a timeline: the render's own Mark In/Out (the timeline's In/Out are never touched).
     * a: {seqId, out, preset, start, end} → {id, restored, hadIn, hadOut}
     */
    async queueRangeExport(a) {
      const tl = R.needSeq(a.seqId);
      return E.withRestore(async () => {
        const job = E.addJob(tl, a.out, a.preset, { start: a.start, end: a.end });
        if (a.removeWhenDone === false) E.keep.add(job.id);
        return { id: job.id, restored: true, hadIn: null, hadOut: null, file: job.file };
      });
    },
    /** The file extension a preset writes ('mp4', 'mov', …), or '' if Resolve can't tell. a: {seqId, preset} */
    async presetExtension(a) {
      const p = String(a.preset || '');
      if (p.indexOf(E.TOKEN) === 0) { const r = E.RECIPES[p.slice(E.TOKEN.length)]; return !r ? '' : r.audioOnly ? 'wav' : E.extOf(E.formatKey(r.format) || r.format); }
      const tl = R.needSeq(a.seqId);
      try { return await E.withRestore(async () => E.applyPreset(p, tl).ext); } catch (e) { return ''; }
    }
  };
};
