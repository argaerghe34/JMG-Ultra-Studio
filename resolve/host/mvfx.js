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
