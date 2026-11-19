// JMG Ultra Studio – mVFX (Resolve side): the same commands as jsx/tools/mvfx.jsx. The Documentary pack is a set of
// Fusion templates (.setting files the panel writes from the presets): mvfxTemplates puts them in Resolve's own
// Fusion › Templates › Edit › Titles / Generators folder (so they also sit in the Effects Library), mvfxApply inserts
// one at the playhead (InsertFusionTitleIntoTimeline / InsertFusionGeneratorIntoTimeline) and sets its Text+ inputs,
// mvfxFreeze holds the frame at the playhead (exportFrame → a still above the edit), mvfxLook puts a look's .cube on
// each clip's first node (SetLUT). Resolve doesn't let add-ons keyframe, so mvfxMove says so – the panel sets a still
// punch-in through editApply instead.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

module.exports = (R, fns) => {
  const tryCall = (f, d) => { try { const v = f(); return v == null ? d : v; } catch (e) { return d; } };
  const TRACK = 'mVFX', SUB = 'JMG Ultra Studio';
  /** Where Resolve reads a person's own Fusion templates from (made if missing). kind: 'titles' | 'generators' */
  function templatesDir(kind) {
    const base = process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Fusion', 'Templates', 'Edit')
      : path.join(os.homedir(), 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'Fusion', 'Templates', 'Edit');
    return path.join(base, kind === 'generators' ? 'Generators' : 'Titles', SUB);
  }
  function clipAt(tl, kind, track, start) {
    const half = 0.5 / R.fps(tl);
    for (const ti of R.list(tl.GetItemListInTrack(kind === 'audio' ? 'audio' : 'video', track + 1)).filter(Boolean)) if (Math.abs(R.tlSec(tl, ti.GetStart()) - start) <= half) return ti;
    return null;
  }
  /** Our n-th video track ("mVFX 1" the lowest), made on top when missing. -> 1-based index */
  function ourTrack(tl, n) {
    const want = (TRACK + ' ' + n).toLowerCase();
    for (let t = 1, c = tl.GetTrackCount('video'); t <= c; t++) if (String(tl.GetTrackName('video', t) || '').trim().toLowerCase() === want) return t;
    const c = tl.GetTrackCount('video');
    if (!tl.AddTrack('video') || tl.GetTrackCount('video') <= c) throw R.err('HOST_SCRIPT', 'AddTrack video refused', 'Resolve didn’t add a video track.', 'Check the timeline isn’t locked, then try again.');
    const t = tl.GetTrackCount('video');
    try { tl.SetTrackName('video', t, TRACK + ' ' + n); } catch (e) { /* a help only */ }
    return t;
  }
  /** The track a timeline item sits on (Resolve 19+ tells; else -1). */
  function trackOf(ti) { const r = tryCall(() => ti.GetTrackTypeAndIndex(), null); if (!r) return -1; const i = Array.isArray(r) ? r[1] : r.trackIndex != null ? r.trackIndex : r[1]; return Number(i) > 0 ? Number(i) : -1; }
  /** The Edit page, where titles can be inserted (put back afterwards). */
  async function onEditPage(fn) {
    const api = R.api, page = api.GetCurrentPage ? api.GetCurrentPage() : '';
    if (!/^(edit|cut)$/.test(page || '')) api.OpenPage('edit');
    try { return await fn(); } finally { try { if (page && api.GetCurrentPage && api.GetCurrentPage() !== page && page !== 'media') api.OpenPage(page); } catch (e) { /* stays */ } }
  }
  /** The playhead at `sec` of a timeline (frames from its start). */
  function setPlayhead(tl, sec) {
    const fps = R.fps(tl), f = Math.max(tl.GetStartFrame(), R.tlFrame(tl, Math.max(0, Number(sec) || 0)));
    const tc = R.framesToTC(f, fps, R.dropFrame(tl));
    if (!tryCall(() => tl.SetCurrentTimecode(tc), false)) throw R.err('HOST_SCRIPT', 'SetCurrentTimecode ' + tc + ' refused', 'Resolve wouldn’t move the playhead.', 'Open the timeline on the Edit page, then try again.');
    return f;
  }

  const MODES = { overlay: 'Overlay', screen: 'Screen', multiply: 'Multiply', add: 'Add' };
  /** Blend mode and strength of a clip on the timeline (Inspector › Composite). What Resolve refuses goes in the log. */
  function dress(ti, a, log) {
    if (a.blend && a.blend !== 'normal' && !tryCall(() => ti.SetProperty('CompositeMode', MODES[a.blend] || 'Normal'), false)) log.push('blend mode not set (' + a.blend + ')');
    if (a.alpha != null && a.alpha < 1 && !tryCall(() => ti.SetProperty('Opacity', Math.round(Number(a.alpha) * 100)), false)) log.push('strength not set');
  }

  return {
    /**
     * Write the pack's template files where Resolve looks for them. a: {write:[{name, kind: 'titles'|'generators', body}]}
     * -> {dir, written:[names], restart: true when a file is new (the Effects Library lists it after a restart)}
     */
    mvfxTemplates(a) {
      const written = [], dirs = new Set(); let restart = false;
      for (const t of a.write || []) {
        const dir = templatesDir(t.kind); fs.mkdirSync(dir, { recursive: true }); dirs.add(dir);
        const file = path.join(dir, String(t.name).replace(/[\\/:*?"<>|]+/g, '-') + '.setting');
        if (!fs.existsSync(file)) restart = true;
        fs.writeFileSync(file, String(t.body), 'utf8');
        written.push(t.name);
      }
      return { dir: dirs.size === 1 ? Array.from(dirs)[0] : path.dirname(templatesDir('titles')), written, restart };
    },

    /**
     * Insert a title or generator of the pack at `start`. a: {seqId, start, seconds, name, title?: {name, inputs:{op:{input: value}}},
     * generator?: {name, blend}} -> {placed, track (0-based), trackName, start, end, note, log}
     */
    async mvfxApply(a) {
      const tl = R.needSeq(a.seqId), log = [], pr = R.project(), was = pr.GetCurrentTimeline();
      const spec = a.title || a.generator;
      if (!spec) return { placed: 0, log: ['Resolve takes a title or generator; Premiere’s layers aren’t used here'], note: '' };
      try {
        return await onEditPage(async () => {
          R.open(tl);
          setPlayhead(tl, a.start);
          const tries = [spec.name, SUB + '/' + spec.name, SUB + '\\' + spec.name];
          let ti = null;
          for (const name of tries) {
            ti = tryCall(() => (a.title ? tl.InsertFusionTitleIntoTimeline(name) : tl.InsertFusionGeneratorIntoTimeline(name)), null);
            if (ti) { log.push('inserted as ' + name); break; }
            log.push('not found as ' + name);
          }
          if (!ti) throw R.err('NOT_FOUND', 'Insert refused: ' + log.join('; '), `Resolve couldn’t find “${spec.name}” in its Effects Library.`, 'Press “Install the whole pack”, restart Resolve, then try again – or drag it from Effects Library › ' + (a.title ? 'Titles' : 'Generators') + ' › JMG Ultra Studio.');
          // the words and colours again, in case Resolve inserted an older copy of the template
          const inputs = (a.title && a.title.inputs) || {};
          if (Object.keys(inputs).length) {
            const comp = tryCall(() => ti.GetFusionCompByIndex(1), null);
            if (!comp) log.push('no Fusion comp to set the words in');
            else for (const [op, vals] of Object.entries(inputs)) {
              const tool = tryCall(() => comp.FindTool(op), null);
              if (!tool) { log.push('no tool ' + op); continue; }
              for (const [k, v] of Object.entries(vals)) if (!tryCall(() => { tool.SetInput(k, v); return true; }, false)) log.push(`${op}.${k} not set`);
            }
          }
          if (a.generator && a.generator.blend && a.generator.blend !== 'normal') {
            const mode = { overlay: 'Overlay', screen: 'Screen', multiply: 'Multiply', add: 'Add' }[a.generator.blend];
            if (!tryCall(() => ti.SetProperty('CompositeMode', mode), false)) log.push('blend mode not set (' + mode + ')');
          }
          try { ti.SetClipColor && ti.SetClipColor('Tan'); } catch (e) { /* a help only */ }
          const t = trackOf(ti), fps = R.fps(tl);
          const start = R.tlSec(tl, ti.GetStart()), end = R.tlSec(tl, ti.GetEnd());
          const note = Math.abs((end - start) - Number(a.seconds)) > 0.5 ? `Resolve laid it ${Math.round((end - start) * 10) / 10} s long – trim it in the Timeline` : '';
          return { placed: 1, track: t > 0 ? t - 1 : -1, trackName: t > 0 ? String(tl.GetTrackName('video', t) || '') : '', start, end, note, log, fps };
        });
      } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
    },

    /**
     * An animated title: the PNG frames the panel drew, imported as one image-sequence clip and laid on a free mVFX
     * track. a: {seqId, first (the first frame's path), frames, fps, start, seconds, name, binPath, blend?, alpha?,
     * anim? (Premiere's fade keyframes – Resolve doesn't let add-ons keyframe, so it's left out here)}
     * -> {itemId, track (0-based), trackName, start, end, note, log}
     */
    async mvfxClip(a) {
      const tl = R.needSeq(a.seqId), pr = R.project(), was = pr.GetCurrentTimeline(), log = [];
      const m = /^(.*?)(\d+)(\.[a-z0-9]+)$/i.exec(path.basename(a.first));
      if (!m || !R.exists(a.first)) throw R.err('NOTHING_FOUND', 'No frames at ' + a.first, 'The title’s frames aren’t there.', 'Try again.');
      const first = Number(m[2]), n = Math.max(1, Number(a.frames) || 1), pattern = path.join(path.dirname(a.first), m[1] + '%0' + m[2].length + 'd' + m[3]);
      const folder = R.ensureBin(a.binPath || 'JMG Ultra Studio/mVFX');
      let got = R.inFolder(folder, () => R.list(R.pool().ImportMedia([{ FilePath: pattern, StartIndex: first, EndIndex: first + n - 1 }])).filter(Boolean));
      if (!got.length) { log.push('sequence import gave nothing; importing the first frame'); got = R.inFolder(folder, () => R.list(R.pool().ImportMedia([a.first])).filter(Boolean)); }
      if (!got.length) throw R.err('HOST_SCRIPT', 'ImportMedia gave nothing for ' + pattern, 'Resolve didn’t import the title’s frames.', 'Try again – or drag the folder into the Media Pool by hand.');
      const item = got[0];
      if (a.name) tryCall(() => item.SetClipProperty('Clip Name', String(a.name)), false);
      try {
        R.open(tl);
        const half = 0.5 / R.fps(tl), end = Number(a.start) + Number(a.seconds);
        let t = 0;
        for (let k = 1; k <= 12 && !t; k++) { const c = ourTrack(tl, k); if (!R.list(tl.GetItemListInTrack('video', c)).filter(Boolean).some(ti => R.tlSec(tl, ti.GetStart()) < end - half && R.tlSec(tl, ti.GetEnd()) > Number(a.start) + half)) t = c; }
        if (!t) throw R.err('BAD_INPUT', 'Twelve mVFX tracks are busy at ' + a.start, 'There are already twelve titles on top of each other here.', 'Move the playhead, or remove some.');
        const placed = R.list(R.pool().AppendToTimeline([R.clipInfo(item, 0, Number(a.seconds), { trackIndex: t, recordFrame: R.tlFrame(tl, a.start), mediaType: 1 })])).filter(Boolean);
        if (!placed.length) throw R.err('HOST_SCRIPT', 'AppendToTimeline placed nothing on V' + t, 'Resolve didn’t place the title.', 'Check the track isn’t locked, then try again.');
        const ti = placed[0], start = R.tlSec(tl, ti.GetStart()), stop = R.tlSec(tl, ti.GetEnd());
        try { ti.SetClipColor && ti.SetClipColor('Tan'); } catch (e) { /* a help only */ }
        dress(ti, a, log);
        return { itemId: R.id(item), track: t - 1, trackName: String(tl.GetTrackName('video', t) || ''), start, end: stop, log, note: Math.abs((stop - start) - Number(a.seconds)) > 0.2 ? `Resolve laid it ${Math.round((stop - start) * 10) / 10} s long` : '' };
      } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
    },

    /** Hold the frame at a.at: exportFrame → a still on an mVFX track at the playhead (Resolve lays stills 5 s long). a: {seqId, at, seconds, outBase, binPath} */
    async mvfxFreeze(a) {
      const tl = R.needSeq(a.seqId), pr = R.project(), was = pr.GetCurrentTimeline();
      const file = await fns.exportFrame({ seqId: a.seqId, seconds: a.at, outBase: a.outBase });
      const items = fns.importFiles({ paths: [file], binPath: a.binPath || 'JMG Ultra Studio/mVFX' });
      if (!items.length) throw R.err('HOST_SCRIPT', 'Frame not imported: ' + file, 'Resolve didn’t import the frame.', 'Try again.');
      const item = R.needItem(items[0].id);
      try {
        R.open(tl);
        const t = ourTrack(tl, 1), fps = R.fps(tl), rec = R.tlFrame(tl, a.at);
        const got = R.list(R.pool().AppendToTimeline([R.clipInfo(item, 0, Math.min(5, Number(a.seconds) || 3), { trackIndex: t, recordFrame: rec, mediaType: 1 })])).filter(Boolean);
        if (!got.length) throw R.err('HOST_SCRIPT', 'AppendToTimeline placed nothing on V' + t, 'Resolve didn’t place the held frame.', 'Check the track isn’t locked, then try again.');
        const ti = got[0], start = R.tlSec(tl, ti.GetStart()), end = R.tlSec(tl, ti.GetEnd());
        return { itemId: items[0].id, track: t - 1, start, end, path: file, note: Math.abs((end - start) - Number(a.seconds)) > 0.5 ? `Resolve holds stills ${Math.round((end - start) * 10) / 10} s – trim it in the Timeline` : '' };
      } finally { if (was && R.id(was) !== R.id(tl)) await R.restoreTimeline(was); }
    },

    /**
     * A picture dragged from the mVFX tab and dropped on the timeline (Resolve placed the file itself): found by its
     * file, then given its blend mode and strength. Resolve keeps the still's own length (trim it in the Timeline) and
     * takes no fade keyframes. a: {path, seconds?, blend?, alpha?, anim?, name?, binPath?}
     * -> {found: false} | {found: true, seqId, track (0-based), trackName, start, end, log}
     */
    mvfxDropped(a) {
      let tl = null; try { tl = R.project().GetCurrentTimeline(); } catch (e) { /* no project */ }
      if (!tl) return { found: false };
      const same = (x, y) => String(x || '').replace(/\\/g, '/').toLowerCase() === String(y || '').replace(/\\/g, '/').toLowerCase();
      const hit = R.trackItems(tl, 'video').find(o => { const mpi = tryCall(() => o.ti.GetMediaPoolItem(), null); return mpi && same(R.prop(mpi, 'File Path'), a.path); });
      if (!hit) return { found: false };
      const log = [], start = R.tlSec(tl, hit.ti.GetStart()), end = R.tlSec(tl, hit.ti.GetEnd());
      dress(hit.ti, a, log);
      try { hit.ti.SetClipColor && hit.ti.SetClipColor('Tan'); } catch (e) { /* a help only */ }
      if (a.seconds && Math.abs((end - start) - Number(a.seconds)) > 0.2) log.push('Resolve kept the still’s own length');
      return { found: true, seqId: R.id(tl), track: hit.track - 1, trackName: String(tl.GetTrackName('video', hit.track) || ''), start, end, log };
    },

    /** Resolve doesn't let add-ons keyframe: said plainly (the panel sets a still punch-in through editApply). */
    mvfxMove(a) { return { done: 0, skipped: [], unsupported: true, why: 'Resolve doesn’t let add-ons keyframe moves – add them on the Edit page (Inspector › Transform keyframes), or use Premiere.' }; },

    /** A look: its .cube on the first node of each clip. a: {seqId, targets, look:{id, lut, label}} -> {done, skipped, log} */
    mvfxLook(a) {
      const tl = R.needSeq(a.seqId), out = { done: 0, skipped: [], log: [] };
      if (!R.exists(a.look && a.look.lut)) throw R.err('NOT_FOUND', 'LUT missing: ' + (a.look && a.look.lut), 'The look’s LUT file isn’t there.', 'Try again – the panel writes it to Documents › JMG Ultra Studio › Looks.');
      for (const g of a.targets || []) {
        const ti = clipAt(tl, g.kind || 'video', g.track, g.start);
        if (!ti) { out.skipped.push({ start: g.start, why: 'not on the timeline any more' }); continue; }
        if (tryCall(() => ti.SetLUT(1, a.look.lut), false)) out.done++;
        else out.skipped.push({ start: g.start, why: 'Resolve refused the LUT on node 1' });
      }
      if (!out.done && out.skipped.length) throw R.err('HOST_SCRIPT', out.skipped[0].why, 'Resolve didn’t take the look.', 'On the Color page, right-click a node › LUTs and pick ' + path.basename(a.look.lut) + ' (in Documents › JMG Ultra Studio › Looks).');
      return out;
    }
  };
};
