// JMG Ultra Studio – Subclip Maker (Resolve side): a subclip of each clip in a bin, restricted to the clip's own Mark
// In/Out (the whole clip when none are set). Same commands, arguments and results as jsx/tools/subclips.jsx.
'use strict';

const TICKS = 254016000000;

module.exports = (R, fns) => {
  /** The bin at these path parts, or null. */
  const binAt = parts => { const want = R.binPath(parts), f = R.index().folders.find(x => R.binPath(x.parts) === want); return f ? R.folderById(f.id) : null; };
  const names = folder => (folder ? R.list(folder.GetClipList()).map(c => String(c.GetName() || '')) : []);
  const ticks = sec => String(Math.round(sec * TICKS));

  return {
    /**
     * What to make subclips of, and where they go. a: {from: 'bin' (default) | 'timeline', binId, seqId, into?: {binId} | {name}}
     * bin: the clips in the bin (not its sub-bins) with their own Mark In/Out; timeline: the clips on the timeline with
     * the part used, in timeline order. -> {source, target, targetPath, existing:[names], clips:[{id, name, inTicks, outTicks, in, out, whole, start, dur}]}
     */
    subRead(a) {
      let parentParts = [], target, source;
      const clips = [];
      if (a.from === 'timeline') {
        const tl = R.needSeq(a.seqId), t0 = tl.GetStartFrame(), tfps = R.fps(tl), seen = new Set();
        source = String(tl.GetName()); target = source + ' – Subclips';
        for (const type of ['video', 'audio']) for (let t = 1, n = tl.GetTrackCount(type); t <= n; t++) for (const ti of R.list(tl.GetItemListInTrack(type, t)).filter(Boolean)) {
          let mpi = null; try { mpi = ti.GetMediaPoolItem(); } catch (e) { /* a title or generator */ }
          if (!mpi) continue;
          const info = R.itemInfo(mpi, []);
          if (info.isSequence || info.multicam || !info.path) continue;
          const fps = info.fps || tfps;
          let sf = null; try { sf = ti.GetSourceStartFrame(); } catch (e) { /* older Resolve */ }
          if (sf == null || !isFinite(sf)) sf = ti.GetLeftOffset();
          const inS = sf / fps, outS = (sf + ti.GetDuration() * fps / tfps) / fps, key = `${info.id}|${Math.round(inS * 100)}|${Math.round(outS * 100)}`;
          if (seen.has(key)) continue;   // the audio of a clip already taken from its video
          seen.add(key);
          clips.push({ id: info.id, name: info.name, inTicks: ticks(inS), outTicks: ticks(outS), in: inS, out: outS, whole: false, start: (ti.GetStart() - t0) / tfps, dur: info.duration || 0 });
        }
      } else {
        const bin = R.needFolder(a.binId), parts = R.partsOf(bin);
        source = R.binPath(parts); target = String(bin.GetName()) + ' – Subclips'; parentParts = parts.slice(0, -1);
        for (const c of R.clipsIn(bin, false)) {
          const info = R.itemInfo(c.item, c.parts);
          if (info.isSequence || info.multicam || info.subclip || info.kind === 'subtitle' || info.kind === 'synthetic' || !info.path) continue;
          const fps = info.fps || 25, mk = R.clipMarks(c.item), m = mk.video || mk.audio || {};
          const i = R.num(m.in), o = R.num(m.out);
          const inS = i != null ? i / fps : 0, outS = o != null ? (o + 1) / fps : info.duration;
          const sf = R.tcToFrames(String(R.prop(c.item, 'Start TC') || ''), fps);
          clips.push({ id: info.id, name: info.name, inTicks: ticks(inS), outTicks: ticks(outS), in: inS, out: outS, whole: i == null && o == null, start: isFinite(sf) ? sf / fps : 0, dur: info.duration || 0 });
        }
      }
      let targetParts = parentParts.concat([target]);
      if (a.into && a.into.binId) { const tb = R.needFolder(a.into.binId); targetParts = R.partsOf(tb); target = String(tb.GetName()); }
      else if (a.into && a.into.name) { target = String(a.into.name).replace(/[\\/]+/g, '-'); targetParts = parentParts.concat([target]); }
      return { source, bin: source, target, targetPath: R.binPath(targetParts), existing: names(binAt(targetParts)), clips };
    },

    /**
     * Make the subclips. a: {targetPath, items:[{id, name, in, out}], conflicts:[names], mode:'replace'|'add'}
     * replace: earlier subclips with the same names move to "<target> – earlier" (as in Premiere, nothing is deleted).
     * -> {made, moved, failed:[names], earlierPath}
     */
    subMake(a) {
      const targetPath = a.targetPath.split(' / ').join('/'), target = R.ensureBin(targetPath);
      let moved = 0, earlierPath = '';
      if (a.mode === 'replace' && a.conflicts && a.conflicts.length) {
        earlierPath = a.targetPath + ' – earlier';
        const want = new Set(a.conflicts), old = R.list(target.GetClipList()).filter(c => want.has(String(c.GetName() || '')));
        if (old.length) {
          if (!R.pool().MoveClips(old, R.ensureBin(earlierPath.split(' / ').join('/')))) throw R.err('HOST_SCRIPT', 'MoveClips refused', 'Resolve didn’t move the earlier subclips aside.', 'Check the bins aren’t locked, then try again.');
          moved = old.length; R.forget();
        }
      }
      const items = a.items || [], ids = fns.createSubclips({ binPath: targetPath, items: items.map(s => ({ id: s.id, start: s.in, end: s.out, name: s.name })) });
      const failed = items.filter((s, k) => !ids[k]).map(s => s.name);
      return { made: items.length - failed.length, moved, failed, earlierPath };
    }
  };
};
