// JMG Ultra Studio – Resolve side for Safe Zones, Final Check and Deliver (the Resolve versions of jsx/tools/finish.jsx).
// Guides: the guide PNG on its own top video track for the timeline's length; hidden = the track switched off (it then
// doesn't render). Render ranges: Premiere uses adjustment layers on a "Renders" track; Resolve can't make adjustment
// clips by script, so a range is a duration marker on the timeline whose customData starts "us-range-" – its length is
// the part that renders and its name the file name (both editable in Resolve). Other groups of ranges stand for
// Premiere's other layer tracks – Song Splitter's "Songs" – with customData "us-lyr-<group>~<id>"; their colour is the
// marker's colour (Premiere label → LABEL_MARKER, and back). Ranges can also be Text+ titles on a video track named
// like the group (Premiere's text layers): added, renamed, moved, recoloured and deleted by script (Resolve 21.1.2+:
// TimelineItem.SetName, SetPosition / Timeline.MoveItems, SetRightOffset); where Resolve won't, a marker is added.
'use strict';
const path = require('path'), fs = require('fs');
const { engine } = require('./render');

const GUIDE_PREFIX = 'Ultra Guide';
const RANGE_TAG = 'us-range-', RANGE_COLOR = 'Fuchsia', RANGE_LABEL = 11 /* magenta: Resolve's Pink */, LAYER_TAG = 'us-lyr-', RENDERS = 'Renders';
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
  /* text layers as ranges: Text / Text+ titles on the video track named like the group (Premiere: text layers on the
     range track). Their nodeId is "text:<item id>". */
  const TEXT_ID = 'text:';
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  /** A title (Text, Text+, a Fusion title): no media behind it. On the range track (onTrack) any such clip counts. */
  function isTextItem(ti, onTrack) {
    if (tryCall(() => ti.GetMediaPoolItem(), null)) return false;
    if (onTrack || /(text\+?|title|titel|titre|título|titolo)/i.test(itemName(ti))) return true;
    return tryCall(() => ti.GetFusionCompCount(), 0) > 0;
  }
  /** The words a Text+ title shows, or '' (plain Text titles don't tell scripts). */
  function textOfItem(ti) {
    const comp = compOf(ti);
    if (!comp) return '';
    const tools = Object.values(tryCall(() => comp.GetToolList(false, 'TextPlus'), {}) || {});
    if (tools.length && tools.every(t => typeof t.GetInput === 'function')) {
      for (const t of tools) { const v = tryCall(() => t.GetInput('StyledText'), ''); if (String(v || '').trim()) return String(v).trim(); }
      return '';
    }
    // Resolve 21.2's JavaScript API: a Fusion tool has no GetInput/SetInput (measured 19 Nov 2026) – the comp runs Lua
    // instead (Composition.Execute), which writes the words to a temporary file
    const file = path.join(R.tempDir(), `words-${process.pid}-${Date.now()}-${Math.round(Math.random() * 1e6)}.txt`);
    try {
      fusionLua(comp, `local f = io.open(${luaStr(file)}, "w"); if f then for _, t in pairs(comp:GetToolList(false, "TextPlus")) do local v = t:GetInput("StyledText"); if v and v ~= "" then f:write(v); break end end; f:close() end`);
      return R.exists(file) ? fs.readFileSync(file, 'utf8').trim() : '';
    } finally { try { if (R.exists(file)) fs.unlinkSync(file); } catch (e) { /* temp */ } }
  }
  const compOf = ti => tryCall(() => (ti.GetFusionCompCount() > 0 ? ti.GetFusionCompByIndex(1) : null), null);
  /** A Lua string literal (long brackets, so nothing in the text needs escaping). */
  function luaStr(s) { s = String(s); let eq = ''; while (s.indexOf(']' + eq + ']') >= 0) eq += '='; return `[${eq}[${s}]${eq}]`; }
  /** Run Lua in a title's Fusion comp. Resolve 21.2 runs it, then throws "Unknown object type … key:result": ignored. */
  function fusionLua(comp, lua) { try { comp.Execute(lua); } catch (e) { /* the result can't come back; the script ran */ } }
  /** Video tracks named like the group (any case), 1-based. */
  const textTracks = (tl, group) => { const out = []; for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) if (groupKey(tl.GetTrackName('video', t)) === groupKey(group)) out.push(t); return out; };
  function textRanges(tl, fps, group) {
    const t0 = tl.GetStartFrame(), out = [];
    for (const t of textTracks(tl, group)) for (const ti of items(tl, t)) {
      if (!isTextItem(ti, true)) continue;
      const plain = itemName(ti), plainDefault = /^(text\+?|fusion title)?\s*\d*$/i.test(plain.trim()), words = plainDefault ? textOfItem(ti) : '';
      out.push({ name: plainDefault && words ? words : plain || words || 'Text', start: (ti.GetStart() - t0) / fps, end: (ti.GetEnd() - t0) / fps,
        disabled: tryCall(() => ti.GetClipEnabled(), true) === false, nodeId: TEXT_ID + R.id(ti), label: labelOfClip(tryCall(() => ti.GetClipColor(), '')), kind: 'text', track: t });
    }
    return out;
  }

  /* ---------- placing, renaming and moving titles (copied from mvfx.js's insertion, which stays as it is) ---------- */
  /** A title's clip colour: Premiere label → Resolve clip colour (R.LABEL_COLORS), and back (older ones: marker names). */
  const clipColourOf = label => (label != null && R.LABEL_COLORS[label]) || null;
  function labelOfClip(c) { const i = R.LABEL_COLORS.indexOf(String(c || '')); return i >= 0 ? i : labelOfColour(c); }
  /** The Edit page, where titles can be inserted (put back afterwards). */
  async function onEditPage(fn) {
    const api = R.api, page = tryCall(() => api.GetCurrentPage(), '');
    if (!/^(edit|cut)$/.test(page || '')) tryCall(() => api.OpenPage('edit'), false);
    try { return await fn(); } finally { try { if (page && api.GetCurrentPage() !== page && page !== 'media') api.OpenPage(page); } catch (e) { /* stays */ } }
  }
  const playheadTo = (tl, frame) => !!tryCall(() => tl.SetCurrentTimecode(R.framesToTC(frame, R.fps(tl), R.dropFrame(tl))), false)
    && R.tcToFrames(String(tryCall(() => tl.GetCurrentTimecode(), '')), R.fps(tl)) === frame;
  /** The video track a timeline item is on (1-based; -1 if Resolve doesn't say). */
  function trackOf(tl, ti) {
    const p = tryCall(() => ti.GetPosition(), null);
    if (p && Number(p.trackIndex) > 0) return Number(p.trackIndex);
    const r = tryCall(() => ti.GetTrackTypeAndIndex(), null), i = r ? (Array.isArray(r) ? r[1] : r.trackIndex) : null;
    if (Number(i) > 0) return Number(i);
    const id = R.id(ti);
    for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) if (items(tl, t).some(x => R.id(x) === id)) return t;
    return -1;
  }
  /** Every clip on the timeline as text, to see that adding a title moved nothing else. */
  function layout(tl, skipId) {
    const out = [];
    for (const kind of ['video', 'audio']) for (let t = 1, n = tl.GetTrackCount(kind); t <= n; t++) {
      for (const ti of R.list(tl.GetItemListInTrack(kind, t)).filter(Boolean)) if (R.id(ti) !== skipId) out.push(`${kind}${t}:${ti.GetStart()}-${ti.GetEnd()}`);
    }
    return out.sort().join(',');
  }
  const freeOn = (tl, t, f, e, skipId) => !items(tl, t).some(x => R.id(x) !== skipId && x.GetStart() < e && x.GetEnd() > f);
  /** A video track named like the group with room for frames f–e; a new one on top, named so, when none has. */
  function roomFor(tl, group, f, e, skipId) {
    for (const t of textTracks(tl, group)) if (freeOn(tl, t, f, e, skipId)) return { t, named: true, made: false };
    const n = tl.GetTrackCount('video');
    if (!tryCall(() => tl.AddTrack('video'), false) || tl.GetTrackCount('video') <= n) throw R.err('HOST_SCRIPT', 'AddTrack video refused', 'Resolve didn’t add a video track.', 'Check the timeline isn’t locked, then try again.');
    const t = tl.GetTrackCount('video');
    tryCall(() => tl.SetTrackName('video', t, String(group)), false);
    return { t, named: groupKey(tl.GetTrackName('video', t)) === groupKey(group), made: true };
  }
  /** A title's length in frames: its end moved with the right offset (the frames left after its end). */
  function setLength(ti, frames) {
    const now = ti.GetEnd() - ti.GetStart();
    if (now === frames) return true;
    const ro = Number(tryCall(() => ti.GetRightOffset(), NaN));
    if (isFinite(ro)) tryCall(() => ti.SetRightOffset(Math.max(0, ro + now - frames), false, false), false);
    return ti.GetEnd() - ti.GetStart() === frames;
  }
  /** Move a title to track t at frame f (SetPosition, else Timeline.MoveItems). */
  function moveTo(tl, ti, t, f) {
    if (trackOf(tl, ti) === t && ti.GetStart() === f) return true;
    const pos = { trackIndex: t, startFrame: f };
    if (!tryCall(() => ti.SetPosition(pos, false), false)) tryCall(() => tl.MoveItems([ti], pos, false), false);
    return trackOf(tl, ti) === t && ti.GetStart() === f;
  }
  /** The words a Text+ title shows. */
  function setWords(ti, words) {
    const comp = compOf(ti);
    if (!comp) return false;
    const tools = Object.values(tryCall(() => comp.GetToolList(false, 'TextPlus'), {}) || {});
    if (tools.length && tools.every(t => typeof t.SetInput === 'function')) {
      let ok = false;
      for (const t of tools) if (tryCall(() => { t.SetInput('StyledText', String(words)); return true; }, false)) ok = true;
      return ok;
    }
    // Resolve 21.2's JavaScript API: through Lua in the comp (see textOfItem), then read back
    fusionLua(comp, `for _, t in pairs(comp:GetToolList(false, "TextPlus")) do t:SetInput("StyledText", ${luaStr(words)}) end`);
    return textOfItem(ti) === String(words).trim();
  }
  /** A title's name: the clip's name and the words it shows (either is enough for the list). */
  function nameTitle(ti, name) { const a = !!tryCall(() => ti.SetName(String(name)), false); const b = setWords(ti, name); return a || b; }
  const drop = (tl, ti) => { if (ti) tryCall(() => tl.DeleteClips([ti], false), false); };
  /**
   * A Text+ title over start–end (seconds) on a track named like the group, named and coloured. Inserted after the last
   * frame (an insert there can't push the edit along), trimmed there, then moved into place. -> {ti, t, named} or null
   * (the reason in log) when Resolve won't – nothing is left behind then.
   */
  async function placeTitle(tl, a, log) {
    const f = R.tlFrame(tl, a.start), e = R.tlFrame(tl, a.end), group = String(a.track || RENDERS), pr = P(), was = pr.GetCurrentTimeline();
    let ti = null, made = null;
    try {
      return await onEditPage(async () => {
        R.open(tl);
        const before = layout(tl, ''), keep = tryCall(() => tl.GetCurrentTimecode(), '');
        if (!playheadTo(tl, tl.GetEndFrame())) { log.push('the playhead couldn’t go after the last frame'); return null; }
        for (const kind of ['Text+', 'Text']) {
          ti = tryCall(() => (kind === 'Text+' ? tl.InsertFusionTitleIntoTimeline(kind) : tl.InsertTitleIntoTimeline(kind)), null);
          if (ti) break;
          log.push(`no ${kind} title inserted`);
        }
        if (keep) tryCall(() => tl.SetCurrentTimecode(keep), false);
        if (!ti) return null;
        if (layout(tl, R.id(ti)) !== before) {
          drop(tl, ti);
          throw R.err('HOST_SCRIPT', 'Inserting a title moved other clips', 'Resolve moved clips while adding the title.', 'Press Cmd+Z (Ctrl+Z on Windows) in Resolve to undo, then add the range as a range marker.');
        }
        if (!setLength(ti, e - f)) { log.push(`the title’s length couldn’t be set (${ti.GetEnd() - ti.GetStart()} frames, not ${e - f})`); drop(tl, ti); return null; }
        made = roomFor(tl, group, f, e, R.id(ti));
        if (!moveTo(tl, ti, made.t, f)) {
          log.push(`the title couldn’t be moved to V${made.t} at ${f}`); drop(tl, ti);
          if (made.made && !items(tl, made.t).length) tryCall(() => tl.DeleteTrack('video', made.t), false);
          return null;
        }
        if (!nameTitle(ti, a.name)) log.push('the title’s name couldn’t be set');
        tryCall(() => ti.SetClipColor(clipColourOf(R.num(a.label)) || clipColourOf(RANGE_LABEL)), false);
        return { ti, t: made.t, named: made.named };
      });
    } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
  }
  /** Move or trim a title to frames f–e: shorter first, then moved (to another track of the group if its own is busy), then longer. */
  function retime(tl, ti, f, e, group) {
    const id = R.id(ti);
    if (e - f < ti.GetEnd() - ti.GetStart() && !setLength(ti, e - f)) return false;
    let t = trackOf(tl, ti);
    if (!freeOn(tl, t, f, e, id)) t = roomFor(tl, group, f, e, id).t;
    if (!moveTo(tl, ti, t, f)) return false;
    return setLength(ti, e - f);
  }
  function needText(tl, a) {
    for (const t of textTracks(tl, a.track)) for (const ti of items(tl, t)) if (TEXT_ID + R.id(ti) === String(a.nodeId)) return ti;
    throw R.err('NOT_FOUND', 'Text range ' + a.nodeId, 'That text layer isn’t on the timeline any more.', 'Press Refresh in Deliver › Render ranges.');
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

    /**
     * a: {seqId, track?, kinds?} → {track, trackName, ranges:[{name, start, end, disabled, nodeId, label, kind}], colours, hidden}
     * (track -1 when there are none). kinds: 'adjustment' (Premiere's word – here the range markers), 'text' (Text / Text+
     * titles on the video track named like the group) or 'both'.
     */
    renderRanges(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), group = a.track || RENDERS, k = a.kinds || 'adjustment';
      const ranges = (k !== 'text' ? rangeMarkers(tl, group).map(({ frame, m }) => Object.assign(rangeOf(fps, frame, m), { kind: 'marker' })) : [])
        .concat(k !== 'adjustment' ? textRanges(tl, fps, group) : []);
      // Resolve 21.2 refuses track states of a timeline that isn't open ("No sequence scene"): then not known, so shown
      const hidden = k !== 'adjustment' && textTracks(tl, group).some(t => tryCall(() => tl.GetIsTrackEnabled('video', t), true) === false);
      return { track: ranges.length ? 0 : -1, trackName: ranges.length ? String(group) : '', ranges: ranges.map(({ track, ...r }) => r), colours: true, hidden };
    },
    /** a: {seqId, kinds?} → {tracks:[{index, name, count}]} – every group of range markers on the timeline (Renders, Songs…),
        and with text kinds every video track holding Text titles */
    rangeTracks(a) {
      const tl = R.needSeq(a.seqId), count = new Map(), k = a.kinds || 'adjustment';
      if (k !== 'text') for (const m of Object.values(R.markers(tl))) { const g = m && groupOf(m.customData); if (g) count.set(g, (count.get(g) || 0) + 1); }
      if (k !== 'adjustment') for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) {
        const name = String(tl.GetTrackName('video', t) || `Video ${t}`), ours = count.has(name) || groupKey(name) === groupKey(RENDERS) || [...count.keys()].some(x => groupKey(x) === groupKey(name));
        const c = items(tl, t).filter(ti => isTextItem(ti, ours)).length;
        if (c) { const key = [...count.keys()].find(x => groupKey(x) === groupKey(name)) || name; count.set(key, (count.get(key) || 0) + c); }
      }
      return { tracks: [...count.entries()].map(([name, n], i) => ({ index: i, name, count: n })) };
    },
    /** Switch the text tracks of a group on or off, so titles used as ranges don't show in the renders.
        a: {seqId, track, on} → {track, was} (was: 1 shown, 0 hidden, -1 no such track) */
    rangeTrackOutput(a) {
      const tl = R.needSeq(a.seqId), ts = textTracks(tl, a.track || RENDERS);
      if (!ts.length) return { track: -1, was: -1 };
      const states = ts.map(t => !!tl.GetIsTrackEnabled('video', t)), was = states.some(Boolean) ? 1 : 0;
      // putting back: each track as it was (a.states from the switch-off), not all on
      ts.forEach((t, k) => tl.SetTrackEnable('video', t, a.states && a.states.length === ts.length ? !!a.states[k] : !!a.on));
      return { track: ts[0] - 1, was, states };
    },
    /**
     * Premiere's “new track on top for render ranges”. Range markers: a group needs nothing made – just a name no other
     * group has. Text titles (a.kinds 'text' or 'both'): a new video track on top with that name.
     * a: {seqId, name?, kinds?} → {index, name, named, log}
     */
    addRangeTrack(a) {
      const tl = R.needSeq(a.seqId), have = new Set();
      for (const m of Object.values(R.markers(tl))) { const g = m && groupOf(m.customData); if (g) have.add(String(g).toLowerCase()); }
      const titles = a.kinds === 'text' || a.kinds === 'both';
      if (titles) for (let t = 1, n = tl.GetTrackCount('video'); t <= n; t++) have.add(String(tl.GetTrackName('video', t) || '').trim().toLowerCase());
      const base = String(a.name || RENDERS).trim() || RENDERS;
      let name = base, k = 2; while (have.has(name.toLowerCase())) name = `${base} ${k++}`;
      if (!titles) return { index: -1, name, named: true, log: [] };
      const n = tl.GetTrackCount('video');
      if (!tryCall(() => tl.AddTrack('video'), false) || tl.GetTrackCount('video') <= n) throw R.err('HOST_SCRIPT', 'AddTrack video refused', 'Resolve didn’t add a video track.', 'Check the timeline isn’t locked, then try again.');
      const t = tl.GetTrackCount('video');
      tryCall(() => tl.SetTrackName('video', t, name), false);
      const got = String(tl.GetTrackName('video', t) || '');
      return { index: t - 1, name: groupKey(got) === groupKey(name) ? name : got, named: groupKey(got) === groupKey(name), log: [] };
    },
    /**
     * Add a render range: a duration marker over start–end, named, in group a.track ("Renders" by default) and the
     * colour of Premiere label a.label (else fuchsia). A marker can't share a frame with another, so a clash moves it
     * on a frame. With a.as 'text' (Premiere: a text layer) it's a Text+ title showing its name on a video track named
     * like the group (made on top the first time); if Resolve won't place one, a marker as above (log says why).
     * a: {seqId, name, start, end, track?, label?, as?} → {track, named, kind:'marker'|'text', placed, renamed, log}
     */
    async addRenderRange(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), log = [], start = R.num(a.start), end = R.num(a.end);
      if (start == null || end == null || !(end > start)) throw R.err('BAD_INPUT', 'Empty range ' + a.start + '–' + a.end, 'That range is empty.', 'Set In and Out points around the part to render, or move the playhead into the edit.');
      if (a.as === 'text') {
        const got = await placeTitle(tl, { name: String(a.name || 'Render'), start, end, track: a.track, label: a.label }, log);
        if (got) return { track: got.t - 1, named: got.named, kind: 'text', placed: 1, renamed: 1, log };
        log.unshift('added as a range marker: Resolve didn’t place the title');
      }
      const taken = new Set(Object.keys(R.markers(tl)).map(Number)), label = R.num(a.label);
      const r = putRange(tl, fps, { name: a.name, start, end, colour: label != null && LABEL_MARKER[label] ? LABEL_MARKER[label] : RANGE_COLOR, note: 'Ultra Studio render range: its length is the part that renders, its name the file name.', customData: tagFor(a.track || RENDERS) }, taken);
      if (!r.ok) throw R.err('HOST_SCRIPT', `AddMarker at ${r.frame} refused${r.why ? ': ' + r.why : ''}`, 'Resolve didn’t add the render range.', 'Check the timeline isn’t locked, then try again.');
      if (r.frame !== Math.round(start * fps)) log.push(`moved on ${r.frame - Math.round(start * fps)} frame(s): another marker was at the start`);
      return { track: -1, named: true, kind: 'marker', placed: 1, renamed: 1, log };
    },
    /** Change a range: name, colour (Premiere label), start, end – the marker is laid again with the same id. a: {seqId, track, nodeId, name?, label?, start?, end?} → {range, log} */
    async editRenderRange(a) {
      if (String(a.nodeId).indexOf(TEXT_ID) === 0) {
        // a text title: renamed (its clip name and words), moved and trimmed in place, recoloured – the same title
        const tl = R.needSeq(a.seqId), ti = needText(tl, a), label = R.num(a.label), fps = R.fps(tl), t0 = tl.GetStartFrame();
        const name = a.name != null ? String(a.name).trim() : '';
        // Resolve 21.2 edits a title (and runs Lua in its Fusion comp) only in the open timeline: opened, then put back
        const was = P().GetCurrentTimeline();
        R.open(tl);
        try {
          if (name && !nameTitle(ti, name)) throw R.err('HOST_SCRIPT', 'SetName and StyledText refused', 'Resolve didn’t rename that title.', 'Type the new name in the title (Inspector) instead – the list follows by itself.');
          if (R.num(a.start) != null || R.num(a.end) != null) {
            const f = R.num(a.start) != null ? R.tlFrame(tl, R.num(a.start)) : ti.GetStart(), e = R.num(a.end) != null ? R.tlFrame(tl, R.num(a.end)) : ti.GetEnd();
            if (!(e > f) || f < t0) throw R.err('BAD_INPUT', 'Range ' + (f - t0) / fps + '–' + (e - t0) / fps, 'That range is empty.', 'Make the end later than the start.');
            if (!retime(tl, ti, f, e, a.track || RENDERS)) throw R.err('HOST_SCRIPT', `Title not moved to ${f}–${e} (now ${ti.GetStart()}–${ti.GetEnd()})`, 'Resolve didn’t move that title.', 'Drag its ends in the Timeline instead – the list follows by itself.');
          }
          if (clipColourOf(label)) ti.SetClipColor(clipColourOf(label));
          return { range: textRanges(tl, fps, a.track).map(({ track, ...r }) => r).find(r => r.nodeId === String(a.nodeId)) || null, log: [] };
        } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
      }
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
      if (String(a.nodeId).indexOf(TEXT_ID) === 0) {
        const tl = R.needSeq(a.seqId), ti = needText(tl, a);
        if (!tl.DeleteClips([ti], false)) throw R.err('HOST_SCRIPT', 'Text range not deleted', 'Couldn’t delete that title.', 'Check the track isn’t locked, then try again.');
        return { removed: 1 };
      }
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
    /** As jsx/tools/finish.jsx: the timelines in a bin (and the bins inside it with a.recursive). a: {binId, recursive} */
    binSequences(a) {
      const byItem = new Map();
      for (const tl of R.timelines()) { const mpi = tryCall(() => tl.GetMediaPoolItem(), null); if (mpi) byItem.set(R.id(mpi), tl); }
      return R.clipsIn(R.needFolder(a.binId), !!a.recursive).filter(x => byItem.has(x.id)).map(x => {
        const tl = byItem.get(x.id), sz = R.size(tl);
        return { id: R.id(tl), name: String(tl.GetName() || ''), bin: R.binPath(x.parts), duration: R.tlDuration(tl), width: sz.width, height: sz.height };
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
