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
     * The clips in a bin (not its sub-bins) with their own Mark In/Out, and what's already in the subclip bin next to it.
     * a: {binId} -> {bin, target, targetPath, existing:[names], clips:[{id, name, inTicks, outTicks, in, out, whole, start}]}
     */
    subRead(a) {
      const bin = R.needFolder(a.binId), parts = R.partsOf(bin), target = String(bin.GetName()) + ' – Subclips';
      const targetParts = parts.slice(0, -1).concat([target]), clips = [];
      for (const c of R.clipsIn(bin, false)) {
        const info = R.itemInfo(c.item, c.parts);
        if (info.isSequence || info.multicam || info.subclip || info.kind === 'subtitle' || info.kind === 'synthetic' || !info.path) continue;
        const fps = info.fps || 25, mk = R.clipMarks(c.item), m = mk.video || mk.audio || {};
        const i = R.num(m.in), o = R.num(m.out);
        const inS = i != null ? i / fps : 0, outS = o != null ? (o + 1) / fps : info.duration;
        const sf = R.tcToFrames(String(R.prop(c.item, 'Start TC') || ''), fps);
        clips.push({ id: info.id, name: info.name, inTicks: ticks(inS), outTicks: ticks(outS), in: inS, out: outS, whole: i == null && o == null, start: isFinite(sf) ? sf / fps : 0 });
      }
      return { bin: R.binPath(parts), target, targetPath: R.binPath(targetParts), existing: names(binAt(targetParts)), clips };
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
