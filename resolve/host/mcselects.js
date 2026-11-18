// JMG Ultra Studio – MC Selects (Resolve side): the same commands as jsx/tools/mcselects.jsx. Resolve's scripting
// doesn't say which angle a multicam cut shows, but the timeline's FCPXML export does (measured in Resolve 21.2, 18 Nov
// 2026: each <mc-clip> holds <mc-source angleID="…" srcEnable="all|video">, and the multicam's <mc-angle>s list each
// angle's clips with their times). So mcRead exports the timeline to a temporary FCPXML (Timeline.Export changes
// nothing in the project), reads it and deletes it. The cuts come back with their angle, so the panel needs no saved
// project file here (Premiere: the .prproj).
'use strict';
const fs = require('fs'), path = require('path');

/* ---------- a small XML reader (enough for FCPXML: elements, attributes, no text) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] != null ? ENT[e] : m));
function parseXml(xml) {
  const root = { tag: '#root', attrs: {}, kids: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (!m[2]) continue;
    if (m[1]) { if (cur.parent) cur = cur.parent; continue; }
    const attrs = {}, ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a; while ((a = ar.exec(m[3]))) attrs[a[1]] = unent(a[2] != null ? a[2] : a[3]);
    const el = { tag: m[2], attrs, kids: [], parent: cur };
    cur.kids.push(el);
    if (!m[4]) cur = el;
  }
  return root;
}
const all = (el, tag, out = []) => { for (const k of el.kids) { if (k.tag === tag) out.push(k); all(k, tag, out); } return out; };
/** FCPXML time ("361/24s", "5s", "0s") in seconds. */
function secs(v) {
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?s?\s*$/.exec(String(v == null ? '' : v));
  return m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : 0;
}
function fileOf(src) {
  if (!src) return '';
  try { return require('url').fileURLToPath(src); } catch (e) { return decodeURIComponent(String(src).replace(/^file:\/\//, '')); }
}

/**
 * The multicam cuts of a timeline's FCPXML. -> {cuts:[{offset, at, in, out, ref, angleId, angle}], multicams:{ref: {name,
 * angles:[{index, id, name, clips:[{name, path, start, end, in, video}]}]}}}
 * cut.offset: seconds on the timeline's timecode; cut.at: seconds from its first frame; in/out and a clip's start/end
 * are times in the multicam (from its first frame); a clip's "in" is media time from the file's first frame.
 */
function parseFcpxml(xml) {
  const root = parseXml(xml), assets = new Map(), multicams = {};
  for (const a of all(root, 'asset')) {
    const rep = a.kids.find(k => k.tag === 'media-rep');
    assets.set(a.attrs.id, { name: a.attrs.name || '', path: fileOf(rep ? rep.attrs.src : a.attrs.src), start: secs(a.attrs.start), video: a.attrs.hasVideo === '1' });
  }
  for (const media of all(root, 'media')) {
    const mc = media.kids.find(k => k.tag === 'multicam'); if (!mc) continue;
    const tc0 = secs(mc.attrs.tcStart);
    const angles = mc.kids.filter(k => k.tag === 'mc-angle').map((ang, index) => ({
      index, id: ang.attrs.angleID, name: ang.attrs.name || '',
      // an angle's clips, in order (gaps between them are just time)
      clips: ang.kids.filter(k => k.tag === 'asset-clip').map(c => {
        const as = assets.get(c.attrs.ref) || { name: '', path: '', start: 0, video: true };
        const start = secs(c.attrs.offset) - tc0, dur = secs(c.attrs.duration);
        return { name: c.attrs.name || as.name, path: as.path, start, end: start + dur, in: secs(c.attrs.start) - as.start, video: as.video };
      })
    }));
    multicams[media.attrs.id] = { name: media.attrs.name || '', tc0, angles };
  }
  const cuts = [];
  for (const seq of all(root, 'sequence')) {
    const seq0 = secs(seq.attrs.tcStart);
    for (const spine of seq.kids.filter(k => k.tag === 'spine')) {
      for (const c of spine.kids) {
        if (c.tag !== 'mc-clip' || c.attrs.lane != null) continue;
        const mc = multicams[c.attrs.ref]; if (!mc) continue;
        // the picture's angle: the source that brings everything or the video
        const src = c.kids.filter(k => k.tag === 'mc-source').find(k => /^(all|video)$/i.test(k.attrs.srcEnable || 'all'));
        const angleId = src ? src.attrs.angleID : '', at = mc.angles.findIndex(a => a.id === angleId);
        const inn = secs(c.attrs.start) - mc.tc0;
        cuts.push({ offset: secs(c.attrs.offset), at: secs(c.attrs.offset) - seq0, in: inn, out: inn + secs(c.attrs.duration), ref: c.attrs.ref, angleId, angle: at >= 0 ? at : null });
      }
    }
  }
  return { cuts, multicams };
}

module.exports = (R, fns) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  const samePath = (a, b) => { const n = p => path.normalize(String(p || '')); return process.platform === 'win32' || process.platform === 'darwin' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };
  /**
   * The timeline as FCPXML in a temporary file (deleted after). Resolve 21's JavaScript API has no EXPORT_* constants;
   * measured in 21.2 they follow the README's order: 5 = FCPXML 1.9, 4 = 1.8 (both one file; 1.10 writes a bundle).
   */
  function exportXml(tl) {
    const file = path.join(R.tempDir(), `mc-${Date.now()}-${Math.round(Math.random() * 1e6)}.fcpxml`), tried = [];
    try {
      for (const t of [R.api.EXPORT_FCPXML_1_9, 5, 4].filter(x => typeof x === 'number')) {
        let ok = false;
        try { ok = tl.Export(file, t, 0); } catch (e) { tried.push(t + ': ' + e.message); continue; }
        const xml = R.exists(file) ? fs.readFileSync(file, 'utf8') : '';
        if (ok && /<fcpxml[\s>]/.test(xml)) return xml;
        tried.push(t + ': ' + (ok ? 'not FCPXML' : 'refused'));
      }
    } finally { try { if (R.exists(file)) fs.unlinkSync(file); } catch (e) { /* the temp folder is cleared later */ } }
    throw R.err('HOST_SCRIPT', 'FCPXML export failed: ' + tried.join('; '), 'Resolve couldn’t say which camera each cut shows.', 'Check the timeline opens on the Edit page, then try again.');
  }
  /** The Media Pool clip of a file (not a subclip, when there's a choice). */
  function clipOf(file) {
    if (!file) return null;
    const hits = R.index().clips.filter(c => samePath(R.props(c.item)['File Path'], file));
    return hits.find(c => !tryCall(() => R.itemInfo(c.item).subclip, false)) || hits[0] || null;
  }

  return {
    /**
     * a: {seqId} -> {name, itemId, other, cuts:[{index, start, end, startTicks, endTicks, in, out, mcId, disabled, angle}],
     * multicams:{mcId: {name, found, angles:[{index, clips:[{itemId, name, path, start, end, in}]}]}}}
     * As in Premiere (startTicks/endTicks here are the cut's timeline frames), plus each cut's angle (null: unknown).
     */
    mcRead(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl), cuts = [], mcs = {};
      let other = 0, parsed = null;
      const v1 = R.list(tl.GetItemListInTrack('video', 1)).filter(Boolean);
      const mpiOf = ti => tryCall(() => ti.GetMediaPoolItem(), null);
      const isMc = ti => { const m = mpiOf(ti); return !!m && /multicam/i.test(String(R.props(m)['Type'] || '')); };
      v1.forEach((ti, index) => {
        if (!isMc(ti)) { other++; return; }
        if (!parsed) parsed = parseFcpxml(exportXml(tl));
        const s = ti.GetStart(), e = ti.GetEnd(), mpi = mpiOf(ti), mcId = R.id(mpi);
        const x = parsed.cuts.find(c => Math.abs(c.at * fps - (s - tl.GetStartFrame())) < 0.5);
        cuts.push({ index, start: R.tlSec(tl, s), end: R.tlSec(tl, e), startTicks: String(s), endTicks: String(e), in: x ? x.in : 0, out: x ? x.out : (e - s) / fps,
          mcId, disabled: tryCall(() => ti.GetClipEnabled(), true) === false, angle: x ? x.angle : null });
        if (mcs[mcId]) return;
        const mc = x && parsed.multicams[x.ref];
        mcs[mcId] = { name: String(tryCall(() => mpi.GetName(), '') || (mc && mc.name) || ''), found: !!mc,
          angles: mc ? mc.angles.map(g => ({ index: g.index, clips: g.clips.filter(c => c.video).map(c => { const hit = clipOf(c.path); return { itemId: hit ? hit.id : '', name: c.name, path: c.path, start: c.start, end: c.end, in: c.in }; }) })) : [] };
      });
      const own = tryCall(() => tl.GetMediaPoolItem(), null);
      return { name: String(tl.GetName() || ''), itemId: own ? R.id(own) : '', cuts, multicams: mcs, other };
    },

    /**
     * A new timeline with the pieces back to back, picture only unless a.audio; each piece in its camera's colour.
     * a: {name, binPath, likeId, audio, pieces:[{itemId, in, out, label?}]} -> {id, name, placed}
     */
    mcBuild(a) {
      const pieces = (a.pieces || []).filter(p => p && p.itemId);
      const likeId = (a.likeId && R.entry(String(a.likeId))) ? a.likeId : pieces.length ? pieces[0].itemId : a.likeId;
      const made = fns.newSequence({ name: a.name, binPath: a.binPath || 'JMG Ultra Studio/MC Selects', likeId });
      const tl = R.needSeq(made.id);
      let cursor = 0, placed = 0;
      for (const p of pieces) {
        const r = fns.placeClips({ seqId: made.id, cursor, clips: [{ id: p.itemId, in: p.in, out: p.out, audio: !!a.audio }] });
        cursor = r.cursor;
        const at = r.placed[0];
        if (!at) continue;
        placed++;
        const colour = p.label != null ? R.LABEL_COLORS[Number(p.label)] : null;
        if (colour) {
          const f = R.tlFrame(tl, at.start);
          for (const kind of ['video', 'audio']) for (const ti of R.list(tl.GetItemListInTrack(kind, 1)).filter(Boolean)) if (ti.GetStart() === f) tryCall(() => ti.SetClipColor(colour), false);
        }
      }
      return { id: made.id, name: made.name, placed };
    }
  };
};
module.exports.parseFcpxml = parseFcpxml;
module.exports.secs = secs;
