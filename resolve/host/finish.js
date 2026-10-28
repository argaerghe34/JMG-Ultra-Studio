// JMG Ultra Studio – Resolve side for Safe Zones, Final Check and Deliver (the Resolve versions of jsx/tools/finish.jsx).
// Guides: the guide PNG on its own top video track for the timeline's length; hidden = the track switched off (it then
// doesn't render). Render ranges: Premiere uses adjustment layers on a "Renders" track; Resolve can't make adjustment
// clips by script, so a range is a duration marker on the timeline whose customData starts "us-range-" – its length is
// the part that renders and its name the file name (both editable in Resolve).
'use strict';
const path = require('path');
const { engine } = require('./render');

const GUIDE_PREFIX = 'Ultra Guide';
const RANGE_TAG = 'us-range-', RANGE_COLOR = 'Fuchsia';

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
      const c = items(tl, t).filter(ti => isGuide(ti, prefix)).length;
      if (c) out.push({ track: t, count: c, hidden: !tl.GetIsTrackEnabled('video', t) });
    }
    return out;
  }
  /** Render-range markers: [{frame, info}] (frames from the start of the timeline, as Resolve keys them) */
  function rangeMarkers(tl) {
    return Object.entries(R.markers(tl)).filter(([, m]) => m && String(m.customData || '').indexOf(RANGE_TAG) === 0)
      .map(([f, m]) => ({ frame: Number(f), m })).sort((a, b) => a.frame - b.frame);
  }

  return {
    /**
     * Put a guide still on a top video track for the whole timeline. Our track ("Guides", or "Letterbox" for bars, or one
     * holding clips named prefix…) is reused – its old guide clips replaced – unless something else is on it.
     * a: {seqId, itemId, trackName?, prefix?} → {track (0-based), start, end}
     */
    placeGuide(a) {
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
        // a still may come out shorter than asked (Resolve's still length): carry on from where it ended
        let at = first;
        for (let guard = 0; at < last && guard < 500; guard++) {
          const got = R.list(pool.AppendToTimeline([R.clipInfo(item, 0, (last - at) / fps, { trackIndex: top, recordFrame: at, mediaType: 1 })])).filter(Boolean);
          const end = Math.max(...got.map(ti => ti.GetEnd()), at);
          if (!got.length || end <= at) break;
          placed.push(...got); at = end;
        }
      } finally { if (was && R.id(was) !== R.id(tl)) pr.SetCurrentTimeline(was); }
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
        if (tl.DeleteClips(mine, false)) n += mine.length;
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
    fitToSize(a) {
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
        try { tl.SetSetting('timelineFrameRate', String(R.fps(src))); } catch (e) { /* project rate */ }
        R.open(tl);
        const mpi = src.GetMediaPoolItem && src.GetMediaPoolItem(), frames = src.GetEndFrame() - src.GetStartFrame();
        const got = mpi && frames > 0 ? R.list(pool.AppendToTimeline([{ mediaPoolItem: mpi, startFrame: 0, endFrame: frames, trackIndex: 1, recordFrame: tl.GetStartFrame() }])).filter(Boolean) : [];
        if (!got.length) {
          pool.DeleteTimelines([tl]);
          via = 'copy';
          tl = R.inFolder(bin, () => src.DuplicateTimeline(name));
          if (!tl) throw R.err('HOST_SCRIPT', 'Nesting and DuplicateTimeline both refused', 'Resolve couldn’t make the full-size timeline.', 'Change the timeline’s size by hand in Timeline › Timeline Settings.');
          E.intoBin(tl, bin);
          E.setSize(tl, W, H, 'scaleToCrop');
        }
      } finally { if (was && R.timelineById(R.id(was))) pr.SetCurrentTimeline(was); }
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

    /** a: {seqId} → {track, trackName, ranges:[{name, start, end, disabled, nodeId}]} (track -1 when there are none) */
    renderRanges(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl);
      const ranges = rangeMarkers(tl).map(({ frame, m }) => ({ name: String(m.name || ''), start: frame / fps, end: (frame + Math.max(1, Number(m.duration) || 1)) / fps, disabled: false, nodeId: String(m.customData) }));
      return { track: ranges.length ? 0 : -1, trackName: ranges.length ? 'Render range markers' : '', ranges };
    },
    /**
     * Add a render range: a duration marker over start–end, named. (A marker can't share a frame with another, so a
     * clash moves it on a frame.) a: {seqId, name, start, end} → {track, named, kind:'marker', placed, renamed, log}
     */
    addRenderRange(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), log = [];
      if (!(a.end > a.start)) throw R.err('BAD_INPUT', 'Empty range ' + a.start + '–' + a.end, 'That range is empty.', 'Set In and Out points around the part to render, or move the playhead into the edit.');
      const taken = new Set(Object.keys(R.markers(tl)).map(Number));
      let f = Math.max(0, Math.round(a.start * fps));
      const want = f;
      while (taken.has(f)) f++;
      if (f !== want) log.push(`moved on ${f - want} frame(s): another marker was at the start`);
      const dur = Math.max(1, Math.round(a.end * fps) - f);
      const ok = tl.AddMarker(f, RANGE_COLOR, String(a.name || 'Render'), 'Ultra Studio render range: its length is the part that renders, its name the file name.', dur, RANGE_TAG + R.newGuid().replace(/^us-/, ''));
      if (!ok) throw R.err('HOST_SCRIPT', `AddMarker at ${f} refused`, 'Resolve didn’t add the render range.', 'Check the timeline isn’t locked, then try again.');
      return { track: -1, named: true, kind: 'marker', placed: 1, renamed: 1, log };
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
