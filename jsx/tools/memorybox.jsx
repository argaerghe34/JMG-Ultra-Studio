// JMG Ultra Studio – Memory Box (Premiere side, ES3): a family's photos, videos and voice notes in one bin, each clip
// carrying what the family wrote (Description, Comment, Log Note, Scene, Shot, Client) and its Memory Box id in the
// project metadata field "Memory Box id", so the next sync updates the same clip instead of importing it again.
// Everything is written to the project only – never to the media files (no XMP written into the photos).
(function (U) {
    var fn = U.fn;
    var NS = 'http://ns.adobe.com/premierePrivateProjectMetaData/1.0/';
    var ID_FIELD = 'MemoryBoxId';
    var FIELDS = { description: 'Column.PropertyText.Description', comment: 'Column.PropertyText.Comment', logNote: 'Column.Intrinsic.LogNote',
        scene: 'Column.PropertyText.Scene', shot: 'Column.PropertyText.Shot', client: 'Column.PropertyText.Client' };

    function xmpLib() {
        if (typeof XMPMeta === 'undefined') { try { if (!ExternalObject.AdobeXMPScript) ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript'); } catch (e) { } }
        if (typeof XMPMeta === 'undefined') throw U.err('HOST_SCRIPT', 'AdobeXMPScript is not available', 'Premiere couldn’t write the clip details.', 'Restart Premiere, then try again.');
    }
    var schemaReady = false;
    function ensureSchema() {
        if (schemaReady) return;
        try { app.project.addPropertyToProjectMetadataSchema(ID_FIELD, 'Memory Box id', 2); } catch (e) { }
        schemaReady = true;
    }
    function keyOf(item) {
        var md = ''; try { md = String(item.getProjectMetadata()); } catch (e) { return ''; }
        if (md.indexOf(ID_FIELD) < 0) return '';
        var m = /MemoryBoxId>([^<]*)</.exec(md) || /MemoryBoxId="([^"]*)"/.exec(md);
        return m ? unescapeXml(m[1]) : '';
    }
    function unescapeXml(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&'); }
    function mediaPath(item) { try { return item.getMediaPath() || ''; } catch (e) { return ''; } }
    function isOffline(item) { try { if (item.isOffline()) return true; } catch (e) { } var p = mediaPath(item); return p ? !new File(p).exists : false; }

    function writeMeta(item, key, f) {
        xmpLib(); ensureSchema();
        var x = new XMPMeta(item.getProjectMetadata()), names = [ID_FIELD];
        x.setProperty(NS, ID_FIELD, key);
        for (var k in FIELDS) {
            if (!FIELDS.hasOwnProperty(k) || f[k] === undefined || f[k] === null) continue;
            x.setProperty(NS, FIELDS[k], String(f[k]));
            names.push(FIELDS[k]);
        }
        item.setProjectMetadata(x.serialize(), names);
    }
    // a name Ultra Studio gave (story order first) is kept up to date; one the editor changed is left alone
    function ours(name) { return /^\d{3,} – /.test(String(name)); }

    /** Clips from Memory Box anywhere in the project (moved or not): a.family = the family id, or all when empty. */
    fn.mbScan = function (a) {
        var out = [], fam = a && a.family ? String(a.family) + '/' : '';
        U.walk(U.project().rootItem, function (c) {
            if (c.type !== 1) return;
            var k = keyOf(c);
            if (!k || (fam && k.indexOf(fam) !== 0)) return;
            out.push({ key: k, id: c.nodeId, name: c.name, path: mediaPath(c), offline: isOffline(c), bin: U.binPath(c) });
        });
        return out;
    };

    /**
     * a: {binPath, add: [{key, path, name, fields}], update: [{key, clipId, name, fields, relink}]}
     * New files are imported into the bin (a file already in the project gives back the clip that's there), named
     * and given their details; clips already here are updated where they are. -> {added, updated, relinked, failed}
     */
    fn.mbApply = function (a) {
        var bin = U.ensureBin(a.binPath), res = { added: [], updated: 0, relinked: 0, failed: [] }, i;
        var add = a.add || [], upd = a.update || [];
        if (add.length) {
            var paths = [];
            for (i = 0; i < add.length; i++) paths.push(add[i].path);
            var got = [];
            try { got = fn.importFiles({ paths: paths, binId: bin.nodeId }); } catch (e) { for (i = 0; i < add.length; i++) res.failed.push({ key: add[i].key, why: String(e.message || e) }); got = []; }
            var norm = function (p) { return String(p || '').replace(/\\/g, '/').toLowerCase(); }, byPath = {};
            for (i = 0; i < got.length; i++) if (got[i] && !byPath[norm(got[i].path)]) byPath[norm(got[i].path)] = got[i];
            for (i = 0; i < add.length; i++) {
                var g = byPath[norm(add[i].path)];
                if (!g) { if (got.length) res.failed.push({ key: add[i].key, why: 'Premiere didn’t import it' }); continue; }
                try {
                    var it = U.needItem(g.id);
                    if (!g.existing || ours(it.name) || it.name === String(add[i].path).replace(/^.*[\/\\]/, '')) it.name = add[i].name;
                    writeMeta(it, add[i].key, add[i].fields || {});
                    res.added.push({ key: add[i].key, id: it.nodeId, name: it.name, existing: !!g.existing });
                } catch (e2) { res.failed.push({ key: add[i].key, why: String(e2.message || e2) }); }
            }
        }
        for (i = 0; i < upd.length; i++) {
            var u = upd[i];
            try {
                var c = U.needItem(u.clipId);
                if (u.relink && new File(u.relink).exists) {
                    var can = true; try { can = c.canChangeMediaPath(); } catch (e3) { }
                    if (can && c.changeMediaPath(u.relink, true)) res.relinked++;
                }
                if (u.name && ours(c.name) && c.name !== u.name) c.name = u.name;
                writeMeta(c, u.key, u.fields || {});
                res.updated++;
            } catch (e4) { res.failed.push({ key: u.key, why: String(e4.message || e4) }); }
        }
        return res;
    };
})(UStudio);
