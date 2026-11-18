// JMG Ultra Studio – Resolve side: laying a timeline's items again where Premiere would razor (Silence Cut, fillers,
// Take Sets, Song Splitter's cut copies, Story's insert at the playhead, Podcast's switches). No commands here:
// core.js, story.js and podcast.js use make(R).
//
// Resolve has no razor by script. What happens to each item after the first change:
// - it only moves: it is moved (TimelineItem.SetPosition, Resolve 21.1.2+), so it keeps everything – grade, Fusion,
//   effects, speed, takes, flags, markers;
// - a Media Pool clip that has to be cut is parked on a spare track (still there, to copy from), laid again in pieces
//   from the same source frames, and each piece gets the original's attributes (CopyAttributes: grade, Fusion effects,
//   plugins, zoom/position/crop… – else CopyGrades), clip colour, flags, markers, enabled state and properties; then
//   the parked original and the spare track go. Only the current grade version comes across (CopyAttributes's limit);
// - a title, generator or Fusion clip (no Media Pool clip) can't be laid again: it is trimmed and moved to cover what's
//   left of it (one piece). If Resolve won't, it is taken off the copy and named in the result's notes;
// - subtitles stay where they are, named in the notes (moving subtitle items by script isn't measured, and laying one
//   crashes Resolve 21.1);
// - a clip with a speed change that would have to be cut is refused plainly before anything changes.
// Older Resolve (no SetPosition): every Media Pool clip after the change is laid again (nothing to copy grades from),
// titles and generators are refused, as before 1.3.39.
'use strict';

const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
const ONE = 1e-9;

function make(R) {
  const nameOf = ti => String(tryCall(() => ti.GetName(), '') || '');
  const canEdit = ti => !!ti && typeof ti.SetPosition === 'function';
  const num = (x, d) => { const n = Number(x); return isFinite(n) ? n : d; };

  /** A grade, a LUT, Fusion or effects on the item – only asked when they couldn't be copied, to say so. */
  function hasLook(ti) {
    if (tryCall(() => ti.GetFusionCompCount(), 0) > 0) return true;
    for (const k of ['ofx', 'fusion']) if (R.list(tryCall(() => (ti.GetEffects ? ti.GetEffects(k) : []), [])).length) return true;
    const g = tryCall(() => ti.GetNodeGraph(), null);
    if (g && (tryCall(() => g.GetNumNodes(), 1) > 1 || tryCall(() => g.GetLUT(1), ''))) return true;
    const cdl = tryCall(() => (ti.GetCDL ? ti.GetCDL(1) : null), null);
    if (cdl && typeof cdl === 'object') {
      const vals = k => String(cdl[k] == null ? '' : cdl[k]).trim().split(/\s+/).filter(Boolean).map(Number);
      const off = (k, want) => vals(k).some(v => isFinite(v) && Math.abs(v - want) > 1e-4);
      if (off('Slope', 1) || off('Power', 1) || off('Offset', 0) || off('Saturation', 1)) return true;
    }
    return false;
  }

  /** What an item carries that a new piece can be given by hand: enabled, colour, flags, properties, its markers. */
  function snap(ti) {
    return {
      enabled: tryCall(() => ti.GetClipEnabled(), true) !== false,
      color: String(tryCall(() => ti.GetClipColor(), '') || ''),
      flags: R.list(tryCall(() => (ti.GetFlagList ? ti.GetFlagList() : []), [])).map(String).filter(Boolean),
      props: tryCall(() => ti.GetProperty(), null),
      markers: tryCall(() => R.markers(ti), {}) || {}
    };
  }
  /** Give a piece what its original had. off = frames from the original's start to the piece's start, len = its length. */
  function give(sn, piece, off, len, { enabled = true } = {}) {
    if (enabled && !sn.enabled) tryCall(() => piece.SetClipEnabled(false));
    if (sn.color) tryCall(() => piece.SetClipColor(sn.color));
    if (sn.flags.length && piece.AddFlag) {
      const has = new Set(R.list(tryCall(() => piece.GetFlagList(), [])).map(String));
      for (const f of sn.flags) if (!has.has(f)) { tryCall(() => piece.AddFlag(f)); has.add(f); }
    }
    if (sn.props && typeof sn.props === 'object') {
      const now = tryCall(() => piece.GetProperty(), {}) || {};
      // only real values go back (a None/NaN from GetProperty sent to SetProperty could abort Resolve)
      for (const [k, v] of Object.entries(R.clean(sn.props))) if ((typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') && JSON.stringify(now[k]) !== JSON.stringify(v)) tryCall(() => piece.SetProperty(k, v));
    }
    for (const [k, mk] of Object.entries(sn.markers)) {
      const o = Number(k) - off;
      if (o >= 0 && o < len) tryCall(() => piece.AddMarker(o, String(mk.color || 'Blue'), String(mk.name || ''), String(mk.note || ''), Math.max(1, Math.round(Number(mk.duration) || 1)), String(mk.customData || '')));
    }
  }
  /** The original's grade, Fusion effects, plugins and Inspector settings onto its pieces. true when Resolve did it. */
  function copyLook(src, type, pieces) {
    if (!pieces.length) return true;
    const opts = type === 'video' ? { allVideoAttributes: true } : { allAudioAttributes: true };
    if (src.CopyAttributes && tryCall(() => src.CopyAttributes(pieces, opts), false)) return true;
    return type === 'video' && !!src.CopyGrades && !!tryCall(() => src.CopyGrades(pieces), false);
  }
  /** Run fn on the Edit page (CopyAttributes works on the Edit and Cut pages), then put the page back. */
  function onEditPage(fn) {
    const api = R.api, page = String(tryCall(() => (api && api.GetCurrentPage ? api.GetCurrentPage() : ''), '') || '');
    const move = page && !/^(edit|cut)$/i.test(page) && api.OpenPage;
    if (move) tryCall(() => api.OpenPage('edit'));
    try { return fn(); } finally { if (move) tryCall(() => api.OpenPage(page)); }
  }

  /**
   * Spare tracks that hold originals while their pieces are laid (so there's something to copy the look from).
   * park(ti, type, subType?) → true when it's on the spare track; drop() deletes what's parked and the spare tracks.
   */
  function parker(tl) {
    const tracks = new Map(), parked = [];
    return {
      get count() { return parked.length; },
      park(ti, type, sub) {
        if (!canEdit(ti)) return false;
        const key = type + ':' + (type === 'audio' ? sub || '' : ''), s = num(tryCall(() => ti.GetStart(), NaN), NaN), e = num(tryCall(() => ti.GetEnd(), NaN), NaN);
        if (!isFinite(s) || !isFinite(e)) return false;
        if (!tracks.has(key)) tracks.set(key, []);
        const list = tracks.get(key);
        // a spare track with room at that time (items that overlap in time need one each), else a new one
        let t = list.find(x => !x.spans.some(([a, b]) => a < e && b > s));
        if (!t) {
          if (list.refused || list.length >= 8) return false;
          const ok = tryCall(() => (type === 'audio' && sub ? tl.AddTrack('audio', sub) : tl.AddTrack(type)), false);
          if (!ok) { list.refused = true; return false; }
          t = { type, index: tl.GetTrackCount(type), spans: [] };
          list.push(t);
        }
        tryCall(() => ti.SetPosition({ trackIndex: t.index }, false), false);
        const at = tryCall(() => ti.GetTrackTypeAndIndex(), []);
        if (at && String(at[0]) === type && Number(at[1]) === t.index) { parked.push(ti); t.spans.push([s, e]); return true; }
        return false;
      },
      /** put a parked item back on its own track (when the job can't go on) */
      unpark(ti, track) { tryCall(() => ti.SetPosition({ trackIndex: track }, false)); const i = parked.indexOf(ti); if (i >= 0) parked.splice(i, 1); },
      drop() {
        if (parked.length) tryCall(() => tl.DeleteClips(parked.splice(0), false));
        // the highest first, so the other spare tracks keep their numbers
        const list = Array.from(tracks.values()).flat().sort((a, b) => b.index - a.index);
        for (const t of list) if (!R.list(tryCall(() => tl.GetItemListInTrack(t.type, t.index), [])).filter(Boolean).length) tryCall(() => tl.DeleteTrack(t.type, t.index));
        tracks.clear();
      }
    };
  }

  /** Move an item to a start frame on its own track; true when it's there. */
  function moveTo(ti, f) {
    if (num(tryCall(() => ti.GetStart(), NaN), NaN) === f) return true;
    tryCall(() => ti.SetPosition({ startFrame: f }, false), false);
    return num(tryCall(() => ti.GetStart(), NaN), NaN) === f;
  }
  /** Trim an edge by d frames (+ shorter, − longer): Resolve's offsets are the handles left beyond each edge. */
  function trimBy(ti, side, d) {
    if (!d) return true;
    const get = ti['Get' + side + 'Offset'], set = ti['Set' + side + 'Offset'];
    if (typeof get !== 'function' || typeof set !== 'function') return false;
    const cur = num(tryCall(() => get(), NaN), NaN);
    if (!isFinite(cur) || cur + d < 0) return false;
    return !!tryCall(() => set(cur + d, false, false), false);
  }

  /**
   * Lay the items of tl again by a map of kept spans: segs [{s, e, to}] in frames from the timeline's first frame,
   * sorted, not overlapping (e may be Infinity); what no span covers is removed, a span starts again at `to`.
   * Items that end by `from` aren't touched. Timeline markers move with their span (one in a removed part goes).
   * Throws a plain error before changing anything when something can't be done safely; afterwards, what couldn't
   * come across is in the returned notes. → {notes: [string]}
   */
  function remap(tl, segs, { from = 0, verb = 'cut' } = {}) {
    const fps = R.fps(tl), t0 = tl.GetStartFrame();
    const pieces = (s, e) => {
      const out = [];
      for (const g of segs) { const a = Math.max(s, g.s), b = Math.min(e, g.e); if (b > a) out.push({ ps: a, pe: b, rec: g.to + a - g.s }); }
      return out;
    };
    const destOf = f => { for (const g of segs) if (f >= g.s && f < g.e) return g.to + f - g.s; return null; };

    // 1. what has to change, and can it?
    const items = [], bad = [], lockedTracks = [];
    let untouchedEnd = 0, sample = null, transitions = 0, subs = 0, subEnd = 0;
    for (const type of ['video', 'audio']) {
      for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) {
        let any = false;
        for (const ti of R.list(tl.GetItemListInTrack(type, t))) {
          if (!ti) continue;
          const s = ti.GetStart() - t0, e = ti.GetEnd() - t0;
          if (String(tryCall(() => ti.GetType(), '')) === 'transition') { if (e > from) transitions++; continue; }
          const ps = e > from ? pieces(s, e) : null;
          const whole = !!ps && ps.length === 1 && ps[0].ps === s && ps[0].pe === e;
          if (!ps || (whole && ps[0].rec === s)) { untouchedEnd = Math.max(untouchedEnd, e); continue; }
          any = true; sample = sample || ti;
          const mpi = tryCall(() => ti.GetMediaPoolItem(), null), src = num(tryCall(() => ti.GetSourceStartFrame(), NaN), NaN), srcEnd = num(tryCall(() => ti.GetSourceEndFrame(), NaN), NaN);
          const media = !!mpi && isFinite(src), cfps = mpi ? R.clipFps(mpi) : fps;
          const retimed = media && isFinite(srcEnd) && Math.abs((srcEnd - src) - (e - s) * cfps / fps) > 1.5;
          items.push({ ti, type, track: t, s, e, ps, whole, mpi, src, cfps, media, retimed, id: R.id(ti), name: nameOf(ti) });
        }
        if (any && tryCall(() => tl.GetIsTrackLocked(type, t), false)) lockedTracks.push([type, t]);
      }
    }
    for (let t = 1, n = tryCall(() => tl.GetTrackCount('subtitle'), 0); t <= n; t++) {
      for (const ti of R.list(tryCall(() => tl.GetItemListInTrack('subtitle', t), []))) {
        if (!ti) continue;
        const e = num(tryCall(() => ti.GetEnd(), NaN), NaN) - t0;
        if (isFinite(e)) subEnd = Math.max(subEnd, e);
        if (e > from) subs++;
      }
    }
    const edit = canEdit(sample);
    for (const m of items) {
      if (!m.ps.length) m.act = 'drop';
      else if (m.whole && edit) m.act = 'move';
      else if (m.media && !m.retimed) m.act = 'cut';
      else if (!m.media && edit) m.act = 'shape';
      else bad.push(`${m.type} ${m.track}: “${m.name}” (${m.media ? 'speed change' : 'no Media Pool clip'})`);
    }
    if (bad.length) {
      const speed = bad.every(b => /speed change\)$/.test(b));
      throw R.err('HOST_SCRIPT', 'Can’t rebuild: ' + bad.slice(0, 20).join('; ') + (bad.length > 20 ? ` and ${bad.length - 20} more` : ''),
        speed ? `Resolve can’t ${verb} ${bad.length === 1 ? 'a clip' : bad.length + ' clips'} with a speed change by script.` : `Resolve can’t move ${bad.length === 1 ? 'one item' : bad.length + ' items'} on this timeline by script (titles, generators or speed changes).`,
        speed ? `Nothing in your original timeline changed. Render ${bad.length === 1 ? 'that clip' : 'those clips'} in place (or take the speed change off), then try again.`
          : 'Nothing in your original timeline changed. Update Resolve (21.1.2 or later moves titles and generators), or move those items to before the first cut, then try again.');
    }
    // links between the items that change: originals linked to each other share a group (smallest id)
    const ids = new Set(items.map(m => m.id)), group = new Map(items.map(m => [m.id, m.id]));
    const root = id => { while (group.get(id) !== id) id = group.get(id); return id; };
    for (const m of items) for (const l of R.list(tryCall(() => m.ti.GetLinkedItems(), [])).map(x => R.id(x)).filter(x => ids.has(x))) { const x = root(m.id), y = root(l); if (x !== y) group.set(x < y ? y : x, x < y ? x : y); }

    // 2. timeline markers that move
    const tlMarks = R.markers(tl), moveMarks = [];
    for (const [k, mk] of Object.entries(tlMarks)) {
      const f = Number(k), dur = Math.max(1, Number(mk.duration) || 1);
      if (f + dur <= from) continue;
      const nf = destOf(f);
      if (nf == null) { moveMarks.push({ f, drop: true }); continue; }
      const ps = pieces(f, f + dur), last = ps[ps.length - 1], nd = Math.max(1, last.rec + (last.pe - last.ps) - nf);
      if (nf !== f || nd !== dur) moveMarks.push({ f, nf, nd, mk });
    }

    // 3. change it (on the copy the tool made)
    const notes = [], taken = [], kept = [], park = parker(tl), lay = [], deleted = new Set();
    let lost = 0;
    R.open(tl);
    for (const [type, t] of lockedTracks) tryCall(() => tl.SetTrackLock(type, t, false));
    try {
      // what is cut is remembered, then parked (to copy its look from) or deleted; what's removed goes
      for (const m of items.filter(x => x.act === 'cut')) {
        m.snap = snap(m.ti);
        m.parked = edit && park.park(m.ti, m.type, m.type === 'audio' ? String(tryCall(() => tl.GetTrackSubType('audio', m.track), '') || '') : '');
        if (!m.parked && m.type === 'video') m.lost = hasLook(m.ti);
        lay.push(m);
      }
      const gone = items.filter(m => m.act === 'drop' || (m.act === 'cut' && !m.parked)).map(m => m.ti);
      if (gone.length && !tryCall(() => tl.DeleteClips(gone, false), false)) throw R.err('HOST_SCRIPT', 'DeleteClips failed', 'Resolve didn’t make the cuts.', 'Nothing in your original timeline changed. Try again; if it keeps happening, send the activity log to support.');
      // moves and trims: towards the start first in time order, towards the end from the last, so nothing lands on
      // an item that hasn't moved yet
      const ops = items.filter(m => m.act === 'move' || m.act === 'shape');
      for (const m of ops) { const l = m.ps[m.ps.length - 1]; m.to = m.ps[0].rec; m.len = l.rec + (l.pe - l.ps) - m.to; m.delta = m.to - m.s; }
      ops.sort((a, b) => ((a.delta < 0) !== (b.delta < 0) ? (a.delta < 0 ? -1 : 1) : a.delta < 0 ? a.s - b.s : b.s - a.s));
      for (const m of ops) {
        let ok;
        if (m.act === 'move') ok = moveTo(m.ti, t0 + m.to);
        else {
          // a title or generator across a change: trim its start and end to what's left, move it, stretch it if needed
          const head = m.ps[0].ps - m.s, shrink = (m.e - m.s - head) - m.len;
          ok = trimBy(m.ti, 'Left', head) && (shrink <= 0 || trimBy(m.ti, 'Right', shrink)) && moveTo(m.ti, t0 + m.to);
          if (ok && shrink < 0 && !trimBy(m.ti, 'Right', shrink)) { kept.push(m.name); continue; }
          ok = ok && m.ti.GetStart() - t0 === m.to && m.ti.GetEnd() - t0 === m.to + m.len;
        }
        if (ok) continue;
        // Resolve wouldn't: a Media Pool clip is laid again from the Media Pool, anything else comes off the copy
        if (m.media && !m.retimed) { m.snap = snap(m.ti); if (m.type === 'video') m.lost = hasLook(m.ti); m.act = 'cut'; lay.push(m); }
        else taken.push(m.name);
        deleted.add(m);
        if (!tryCall(() => tl.DeleteClips([m.ti], false), false)) throw R.err('HOST_SCRIPT', `Neither moved nor deleted: ${m.type} ${m.track} “${m.name}”`, 'Resolve didn’t make the cuts.', 'Nothing in your original timeline changed. Send the activity log to support.');
      }
      // the cut clips laid again, piece by piece, from the same source frames
      const infos = [], parts = [];
      for (const m of lay) for (const p of m.ps) {
        const srcStart = m.src + Math.round((p.ps - m.s) * m.cfps / fps), srcLen = Math.max(1, Math.round((p.pe - p.ps) * m.cfps / fps));
        infos.push({ mediaPoolItem: m.mpi, startFrame: srcStart, endFrame: srcStart + srcLen, trackIndex: m.track, recordFrame: t0 + p.rec, mediaType: m.type === 'video' ? 1 : 2 });
        parts.push({ m, ps: p.ps, pe: p.pe, rec: p.rec });
      }
      if (infos.length) {
        const got = R.list(R.pool().AppendToTimeline(infos)).filter(Boolean);
        if (!got.length) throw R.err('HOST_SCRIPT', `AppendToTimeline placed nothing (${infos.length} parts)`, 'Resolve didn’t make the cuts.', 'Nothing in your original timeline changed. Send the activity log to support.');
      }
      // find each new part by track and start, then give it back what the original had
      const at = new Map();
      for (const type of ['video', 'audio']) for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) for (const ti of R.list(tl.GetItemListInTrack(type, t))) if (ti) at.set(`${type}:${t}:${ti.GetStart() - t0}`, ti);
      const missing = [], linkSets = new Map(), byOrig = new Map();
      for (const p of parts) {
        const m = p.m, ti = at.get(`${m.type}:${m.track}:${p.rec}`) || at.get(`${m.type}:${m.track}:${p.rec - 1}`) || at.get(`${m.type}:${m.track}:${p.rec + 1}`);
        if (!ti) { missing.push(`${m.type} ${m.track} at ${(p.rec / fps).toFixed(2)} s`); continue; }
        p.ti = ti;
        (byOrig.get(m) || byOrig.set(m, []).get(m)).push(p);
        const key = root(m.id) + '@' + p.rec;
        (linkSets.get(key) || linkSets.set(key, []).get(key)).push(ti);
      }
      const copy = [...byOrig.keys()].filter(m => m.parked);
      if (copy.length) onEditPage(() => { for (const m of copy) if (!copyLook(m.ti, m.type, byOrig.get(m).map(p => p.ti)) && m.type === 'video' && hasLook(m.ti)) m.lost = true; });
      for (const [m, ps] of byOrig) for (const p of ps) give(m.snap, p.ti, p.ps - m.s, p.pe - p.ps);
      lost = lay.filter(m => m.lost).length;
      park.drop();
      if (tl.SetClipsLinked) for (const list of linkSets.values()) if (list.length > 1) tryCall(() => tl.SetClipsLinked(list, true));
      // timeline markers: take off every one that moves, then put them back in order (one marker per frame)
      // by customData when only that marker has it (the user's own markers may share one or have none), else by frame
      const cdCount = new Map();
      for (const mk of Object.values(tlMarks)) if (mk && mk.customData) cdCount.set(mk.customData, (cdCount.get(mk.customData) || 0) + 1);
      for (const x of moveMarks) { const cd = tlMarks[x.f] && tlMarks[x.f].customData; R.deleteMarker(tl, x.f, cd && cdCount.get(cd) === 1 ? cd : ''); }
      const busy = new Set(Object.keys(R.markers(tl)).map(Number));
      for (const x of moveMarks.filter(y => !y.drop).sort((p, q) => p.nf - q.nf)) {
        let f = x.nf; while (busy.has(f)) f++;
        if (tryCall(() => tl.AddMarker(f, String(x.mk.color || 'Blue'), String(x.mk.name || ''), String(x.mk.note || ''), x.nd, String(x.mk.customData || '')), false)) busy.add(f);
      }
      // check: the timeline should now end where the plan says (subtitles left where they were may end it later)
      let want = untouchedEnd;
      for (const m of ops) if (!deleted.has(m)) want = Math.max(want, kept.includes(m.name) ? m.ti.GetEnd() - t0 : m.to + m.len);
      for (const p of parts) want = Math.max(want, p.rec + (p.pe - p.ps));
      const got = tl.GetEndFrame() - t0;
      if (missing.length || got < want - 1 - ONE || got > Math.max(want, subEnd) + 1) {
        throw R.err('HOST_SCRIPT', `Rebuild: ${missing.length ? 'missing ' + missing.slice(0, 10).join(', ') + '; ' : ''}timeline ends at frame ${got}, expected ${want}`,
          'Resolve didn’t make a cut where expected.', 'Nothing in your original timeline changed. Send the activity log to support.');
      }
    } finally {
      park.drop();
      for (const [type, t] of lockedTracks) tryCall(() => tl.SetTrackLock(type, t, true));
    }

    // 4. what couldn't come across, in plain words
    const names = l => l.slice(0, 3).map(n => `“${n}”`).join(', ') + (l.length > 3 ? ` and ${l.length - 3} more` : '');
    if (taken.length) notes.push(`${names(taken)} ${taken.length === 1 ? 'was' : 'were'} taken off this copy: Resolve wouldn’t move ${taken.length === 1 ? 'it' : 'them'} by script (your original still has ${taken.length === 1 ? 'it' : 'them'}).`);
    if (kept.length) notes.push(`${names(kept)} couldn’t be lengthened over the inserted part – check ${kept.length === 1 ? 'it' : 'them'} in the Timeline.`);
    if (lost) notes.push(`${lost === 1 ? 'One cut clip' : lost + ' cut clips'} didn’t get ${lost === 1 ? 'its' : 'their'} grade or effects back – Resolve wouldn’t copy them. Copy them from your original with Paste Attributes.`);
    if (subs) notes.push('Subtitles weren’t moved (Resolve can’t move them safely by script): make the captions again for this timeline.');
    if (transitions) {
      let now = 0;
      for (const type of ['video', 'audio']) for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) for (const ti of R.list(tl.GetItemListInTrack(type, t))) if (ti && String(tryCall(() => ti.GetType(), '')) === 'transition' && ti.GetEnd() - t0 > from) now++;
      if (now < transitions) notes.push(`${transitions - now === 1 ? 'A transition' : transitions - now + ' transitions'} went with the ${verb === 'insert' ? 'insert' : 'cuts'} – add ${transitions - now === 1 ? 'it' : 'them'} again where you want ${transitions - now === 1 ? 'it' : 'them'}.`);
    }
    return { notes };
  }

  return { remap, snap, give, copyLook, hasLook, parker, onEditPage, moveTo, canEdit };
}

// gathered like the command modules (resolve/host/index.js), but it adds no commands
module.exports = () => ({});
module.exports.make = make;
