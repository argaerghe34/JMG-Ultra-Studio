// JMG Ultra Studio – Deliver › Other editors (Resolve side): a timeline out to another editor, and another editor's
// timeline file in as a new timeline. Same commands, arguments and results as jsx/tools/nle.jsx.
// The converting (FCPXML ↔ FCP 7 XML ↔ EDL ↔ OTIO) is in the panel: js/tools/33-deliver-nlexml.js.
'use strict';
const fs = require('fs'), path = require('path');

module.exports = (R) => {
  const tryCall = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  /** a frame rate as a whole-number fraction (23.976 → 24000/1001) */
  function rateOf(fps) {
    const up = Math.round(fps * 1.001);
    if (Math.abs(fps - Math.round(fps)) > 0.005 && Math.abs(fps - up * 1000 / 1001) < 0.005) return { num: up * 1000, den: 1001 };
    return { num: Math.round(fps) || 25, den: 1 };
  }
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const Q = (n, d) => { const g = gcd(n, d); return { n: n / g, d: d / g }; };

  /**
   * The timeline as the panel's plain timeline (see 33-deliver-nlexml.js): every clip with its file, in point (in
   * timeline frames from the file's first frame), place and length, colour, on/off, link, markers; timeline markers;
   * and what doesn't come across (titles, generators, Fusion, compound and multicam clips, speed changes).
   */
  function readTimeline(tl) {
    const fps = R.fps(tl), rate = rateOf(fps), start = tl.GetStartFrame(), sz = R.size(tl);
    const out = { name: String(tl.GetName() || 'Timeline'), rate, drop: R.dropFrame(tl), width: sz.width, height: sz.height, tcStart: start, duration: tl.GetEndFrame() - start, video: [], audio: [], markers: [], media: {}, lost: {}, source: 'resolve' };
    const lose = (k, n = 1) => { out.lost[k] = (out.lost[k] || 0) + n; };
    const mediaIds = new Map(), linkOf = new Map();
    const mediaFor = mpi => {
      const id = R.id(mpi);
      if (mediaIds.has(id)) return mediaIds.get(id);
      const p = R.props(mpi), cfps = R.clipFps(mpi, p), cr = rateOf(cfps);
      const tcf = R.tcToFrames(String(p['Start TC'] || ''), cfps);
      const frames = Number(p['Frames']) || 0, res = /(\d+)\s*x\s*(\d+)/.exec(String(p['Resolution'] || '')), type = String(p['Type'] || ''), file = String(p['File Path'] || '');
      const mid = 'm' + (mediaIds.size + 1);
      out.media[mid] = { id: mid, name: String(p['Clip Name'] || mpi.GetName() || path.basename(file)), path: file, rate: cr,
        tcStartSec: isFinite(tcf) && tcf > 0 ? Q(tcf * cr.den, cr.num) : { n: 0, d: 1 }, durationSec: frames ? Q(frames * cr.den, cr.num) : null,
        hasVideo: /video/i.test(type) || !!p['Video Codec'] || !!res && !/^audio$/i.test(type), hasAudio: Number(p['Audio Ch']) > 0 || /audio/i.test(type), channels: Number(p['Audio Ch']) || 0,
        width: res ? Number(res[1]) : 0, height: res ? Number(res[2]) : 0 };
      mediaIds.set(id, mid);
      return mid;
    };
    for (const type of ['video', 'audio']) {
      for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) {
        const tr = { name: String(tryCall(() => tl.GetTrackName(type, t), '') || ''), enabled: tryCall(() => tl.GetIsTrackEnabled(type, t), true) !== false, clips: [] };
        for (const ti of R.list(tryCall(() => tl.GetItemListInTrack(type, t), []))) {
          if (!ti) continue;
          const name = String(tryCall(() => ti.GetName(), '') || '');
          const mpi = tryCall(() => ti.GetMediaPoolItem(), null);
          const kind = mpi ? String(R.props(mpi)['Type'] || '') : '';
          if (!mpi || /generator|fusion|title|adjustment/i.test(kind)) { lose(type === 'video' ? `titles and generated clips (left out: ${name || 'title'})` : 'generated sound'); continue; }
          if (/subtitle/i.test(kind)) { lose('subtitles (left out – export them as SRT)'); continue; }
          if (/timeline|compound/i.test(kind)) { lose('nested timelines and compound clips (left out – send them on their own)'); continue; }
          if (/multicam/i.test(kind)) { lose('multicam clips (left out – flatten them first)'); continue; }
          const file = String(R.props(mpi)['File Path'] || '');
          if (!file) { lose('clips without a media file (left out)'); continue; }
          const mid = mediaFor(mpi), cfps = R.clipFps(mpi);
          const s = ti.GetStart(), e = ti.GetEnd();
          const src = Number(tryCall(() => ti.GetSourceStartFrame(), NaN));
          const inF = isFinite(src) ? Math.round(src * fps / cfps) : Number(tryCall(() => ti.GetLeftOffset(), 0)) || 0;
          const times = tryCall(() => R.itemTimes(tl, ti), null);
          if (times && Math.abs((times.speed || 1) - 1) > 0.01) lose('speed changes (clips play at normal speed – check their length)');
          if (type === 'video' && tryCall(() => ti.GetFusionCompCount(), 0) > 0) lose('Fusion effects');
          const id = R.id(ti), linked = R.list(tryCall(() => ti.GetLinkedItems(), [])).map(x => R.id(x));
          const link = [id].concat(linked).sort()[0];
          linkOf.set(id, link);
          const markers = Object.entries(tryCall(() => R.markers(ti), {}) || {}).map(([f, m]) => ({ at: Number(f), dur: Number(m.duration) > 1 ? Number(m.duration) : 0, name: String(m.name || ''), note: String(m.note || ''), colour: String(m.color || '') }));
          tr.clips.push({ media: mid, name: name || out.media[mid].name, at: s - start, len: e - s, in: inF, enabled: tryCall(() => ti.GetClipEnabled(), true) !== false, colour: String(tryCall(() => ti.GetClipColor(), '') || ''), link, channel: 1, markers });
        }
        out[type].push(tr);
      }
    }
    out.markers = Object.entries(R.markers(tl)).map(([f, m]) => ({ at: Number(f), dur: Number(m.duration) > 1 ? Number(m.duration) : 0, name: String(m.name || ''), note: String(m.note || ''), colour: String(m.color || '') })).sort((a, b) => a.at - b.at);
    return out;
  }

  return {
    /**
     * The timeline for another editor. a: {seqId, path}. Resolve's own FCP 7 XML export is used when the API offers it
     * (its EXPORT_* values aren't on the JavaScript API in Resolve 21 – measured); otherwise the timeline comes back for
     * the panel to write: {path, native: 'xmeml'} or {model}.
     */
    nleExport(a) {
      const tl = R.needSeq(a.seqId);
      const kind = R.api && R.api.EXPORT_FCP_7_XML, none = R.api && R.api.EXPORT_NONE;
      if (a.path && kind != null) {
        try {
          fs.mkdirSync(path.dirname(a.path), { recursive: true });
          if (tl.Export(a.path, kind, none != null ? none : 0) && R.exists(a.path) && /<xmeml/.test(fs.readFileSync(a.path, 'utf8').slice(0, 4000))) return { path: a.path, native: 'xmeml', model: readTimeline(tl) };
        } catch (e) { /* the panel writes it from the timeline */ }
      }
      return { model: readTimeline(tl) };
    },
    /**
     * Another editor's timeline file as a new timeline (FCPXML, FCP 7 XML, EDL, OTIO or AAF – Resolve reads them all).
     * a: {path, name, binPath, mediaFolder}. The clips go into binPath (default "JMG Ultra Studio/From other editors");
     * Resolve looks in mediaFolder for media that isn't where the file says. -> {seqId, name, clips}
     */
    nleImport(a) {
      if (!a.path || !R.exists(a.path)) throw R.err('NOTHING_FOUND', 'Not on disk: ' + a.path, 'That timeline file isn’t there any more.', 'Choose it again.');
      const name = R.uniqueTimelineName(a.name || path.basename(a.path).replace(/\.[^.]+$/, ''));
      const bin = R.ensureBin(a.binPath || 'JMG Ultra Studio/From other editors');
      const opts = R.clean({ timelineName: name, importSourceClips: true, sourceClipsPath: a.mediaFolder && R.exists(a.mediaFolder) ? a.mediaFolder : null });
      const before = new Set(R.timelines().map(t => R.id(t)));
      let tl = null, why = '';
      try { tl = R.inFolder(bin, () => R.pool().ImportTimelineFromFile(a.path, opts)); } catch (e) { why = e.message; }
      R.forget && R.forget();
      if (!tl) tl = R.timelines().find(t => !before.has(R.id(t))) || null;
      if (!tl) throw R.err('HOST_SCRIPT', `ImportTimelineFromFile refused ${a.path}${why ? ': ' + why : ''}`, 'Resolve couldn’t read that timeline file.', 'Try the FCP 7 XML (.xml) version of it, or open it in the editor that made it and export it again.');
      let clips = 0;
      for (const type of ['video', 'audio']) clips += R.trackItems(tl, type).length;
      return { seqId: R.id(tl), name: String(tl.GetName() || name), clips };
    }
  };
};
