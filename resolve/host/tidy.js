// JMG Ultra Studio – project check (Resolve side): what's used, unused, offline or imported twice. Never deletes.
// Same commands, arguments and results as jsx/tools/tidy.jsx.
'use strict';

module.exports = (R) => ({
  /** -> {items:[{id, name, path, bin, offline, used, subclip, sequence}], sequences} */
  tidyAudit() {
    const usedId = new Set(), usedPath = new Set(), tls = R.timelines();
    for (const tl of tls) for (const type of ['video', 'audio']) for (const { ti } of R.trackItems(tl, type)) {
      const mpi = ti.GetMediaPoolItem ? ti.GetMediaPoolItem() : null;
      if (!mpi) continue;
      usedId.add(R.id(mpi));
      const f = String(R.props(mpi)['File Path'] || '');
      if (f) usedPath.add(f);
    }
    const items = R.index().clips.map(c => {
      const info = R.itemInfo(c.item, c.parts);
      const o = { id: c.id, name: info.name, path: info.isSequence ? '' : info.path, bin: info.bin, offline: info.offline, used: usedId.has(c.id), subclip: !!info.subclip, sequence: info.isSequence };
      if (!o.used && o.path && usedPath.has(o.path)) o.used = true;   // a subclip or another copy of it is used
      return o;
    });
    return { items, sequences: tls.length };
  },
  /** Move items into a bin (made if needed; '' is the root). a: {ids, binPath} -> count */
  tidyMove(a) {
    const bin = a.binPath ? R.ensureBin(a.binPath) : R.root(), items = (a.ids || []).map(id => R.itemById(id)).filter(Boolean);
    if (!items.length) return 0;
    if (!R.pool().MoveClips(items, bin)) throw R.err('HOST_SCRIPT', 'MoveClips refused', 'Resolve didn’t move the clips.', 'Check the bins aren’t locked, then try again.');
    R.forget();
    return items.length;
  }
});
