// JMG Ultra Studio – Memory Box (Resolve side): a family's photos, videos and voice notes in one Media Pool bin, each
// clip carrying what the family wrote (Description, Comments, Keywords, People, Scene, Shot) and its Memory Box id as
// third-party metadata ("MemoryBoxId"), so the next sync updates the same clip. Same commands, arguments and results as
// jsx/tools/memorybox.jsx. Nothing is written to the media files.
'use strict';

const ID_FIELD = 'MemoryBoxId';
/** The panel's field names -> Resolve's metadata fields. */
const FIELDS = { description: 'Description', comment: 'Comments', keywords: 'Keywords', people: 'People', scene: 'Scene', shot: 'Shot' };

module.exports = (R, fns) => {
  const tryCall = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  const keyOf = item => String(tryCall(() => item.GetThirdPartyMetadata(ID_FIELD), '') || '');
  const ours = name => /^\d{3,} – /.test(String(name));
  const norm = p => String(p || '').replace(/\\/g, '/').toLowerCase();
  function setName(item, name) { if (!name) return; if (!tryCall(() => item.SetName(String(name)), false)) tryCall(() => item.SetClipProperty('Clip Name', String(name)), false); }

  /** Write the details: all at once, else field by field (one field Resolve doesn't know mustn't lose the rest). */
  function writeMeta(item, key, f) {
    const md = {};
    for (const [k, field] of Object.entries(FIELDS)) if (f[k] != null) md[field] = String(f[k]);
    if (Object.keys(md).length && !tryCall(() => item.SetMetadata(md), false)) for (const [k, v] of Object.entries(md)) tryCall(() => item.SetMetadata({ [k]: v }), false);
    if (!tryCall(() => item.SetThirdPartyMetadata({ [ID_FIELD]: String(key) }), false)) throw R.err('HOST_SCRIPT', 'SetThirdPartyMetadata failed', 'Resolve didn’t keep the Memory Box id on a clip.', 'Try again. If it keeps happening, send the activity log.');
  }

  return {
    /** Clips from Memory Box anywhere in the project (moved or not): a.family = the family id, or all when empty. */
    mbScan(a) {
      R.forget();
      const fam = a && a.family ? String(a.family) + '/' : '', out = [];
      for (const c of R.index().clips) {
        const k = keyOf(c.item);
        if (!k || (fam && !k.startsWith(fam))) continue;
        const p = R.prop(c.item, 'File Path');
        out.push({ key: k, id: c.id, name: String(c.item.GetName() || ''), path: p, offline: !!p && !R.exists(p), bin: R.binPath(c.parts) });
      }
      return out;
    },

    /**
     * a: {binPath, add: [{key, path, name, fields}], update: [{key, clipId, name, fields, relink}]}
     * -> {added: [{key, id, name, existing}], updated, relinked, failed: [{key, why}]}
     */
    mbApply(a) {
      const res = { added: [], updated: 0, relinked: 0, failed: [] };
      const add = a.add || [], upd = a.update || [];
      if (add.length) {
        let got = [];
        try { got = fns.importFiles({ paths: add.map(x => x.path), binPath: a.binPath }); } catch (e) { for (const x of add) res.failed.push({ key: x.key, why: (e && e.message) || String(e) }); }
        const byPath = new Map();
        for (const g of got) if (g && !byPath.has(norm(g.path))) byPath.set(norm(g.path), g);
        R.forget();
        for (const x of add) {
          const g = byPath.get(norm(x.path));
          if (!g) { if (got.length) res.failed.push({ key: x.key, why: 'Resolve didn’t import it' }); continue; }
          try {
            const it = R.needItem(g.id), cur = String(it.GetName() || '');
            if (!g.existing || ours(cur) || cur === String(x.path).replace(/^.*[\\/]/, '')) setName(it, x.name);
            writeMeta(it, x.key, x.fields || {});
            res.added.push({ key: x.key, id: g.id, name: String(it.GetName() || ''), existing: !!g.existing });
          } catch (e) { res.failed.push({ key: x.key, why: (e && e.message) || String(e) }); }
        }
      }
      for (const u of upd) {
        try {
          const it = R.needItem(u.clipId);
          if (u.relink && R.exists(u.relink) && tryCall(() => it.ReplaceClip(u.relink), false)) res.relinked++;
          if (u.name && ours(it.GetName()) && String(it.GetName()) !== u.name) setName(it, u.name);
          writeMeta(it, u.key, u.fields || {});   // after ReplaceClip, which replaces the clip's metadata too
          res.updated++;
        } catch (e) { res.failed.push({ key: u.key, why: (e && e.message) || String(e) }); }
      }
      R.forget();
      return res;
    }
  };
};
