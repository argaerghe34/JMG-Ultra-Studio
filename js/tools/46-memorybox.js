/* JMG Ultra Studio – Memory Box: a family's photos and videos from Memory Box, in one bin, with everything the family
   told us about them. Connect once (Memory Box's address and an access key), pick the family, see what's there and
   what's new since you last synced, filter by person, decade, chapter or tag, and bring it in: the originals are saved
   in full resolution in a folder you choose (never twice), and each clip carries its story, people, date, place,
   occasion, chapters and voice note. Bring it in again later and the same clips are updated, not duplicated.
   Settings for Memory Box itself (families, people, chapters) stay in Memory Box: "Open in Memory Box". */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, MB = US.memoryBox, net = MB.net;
  const path = require('path');

  const opts = () => Object.assign({ familyId: '', folder: '', voiceNotes: true, scope: 'all', source: 'online', downloadRoot: '' }, US.settings.get('memoryBox', {}));
  const saveOpts = o => US.settings.set('memoryBox', o);
  const defaultFolder = () => path.join(US.fsx.exportsDir(), 'Memory Box');
  /** What this project has from each family: {[familyId]: {snapshot, etag, json, at}} – kept with the project only. */
  const store = () => US.projectStore((US.ctx.project && US.ctx.project.path) || 'none');
  const famState = id => (store().get('memoryBox', {}) || {})[id] || null;
  function saveFam(id, patch) { const all = store().get('memoryBox', {}) || {}; all[id] = Object.assign({}, all[id], patch); store().set('memoryBox', all); }
  const editor = () => (US.app.is('resolve') ? 'Resolve' : 'Premiere');
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

  /**
   * Bring items into the editor: originals saved on this computer (or used where a team download already has them),
   * then one bin, updated by id. -> {summary, added, updated, relinked, skipped, failed, downloaded}
   */
  async function bringIn(model, items, source, { voiceNotes = true }, job) {
    if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
    job.set({ who: 'computer', msg: source.kind === 'online' ? 'Saving the originals from Memory Box' : 'Checking the files in the download' });
    const got = await net.ensureLocal(model, items, source, { voiceNotes, job });
    job.set({ who: 'premiere', msg: 'Looking for clips from earlier syncs' });
    job.progress(0.9, 'Looking for clips from earlier syncs');
    const existing = await US.host.call('mbScan', { family: model.family.id }, { timeout: 120000 });
    const local = (it, voice) => { const p = net.local(model, source, voice ? it.voice : it.path); return net.haveFile(p, voice ? null : it.bytes) ? p : ''; };
    const plan = MB.plan(model, items, { local, existing, voiceNotes });
    const tot = { added: 0, already: 0, updated: 0, relinked: 0, failed: [] };
    const okKeys = new Set();
    const N = 60, adds = plan.add, upds = plan.update, steps = Math.ceil(adds.length / N) + Math.ceil(upds.length / N) || 1;
    let step = 0;
    for (let i = 0; i < Math.max(adds.length, upds.length); i += N) {
      job.check();
      job.progress(0.9 + 0.1 * (step / steps), `Putting clips in the bin · ${Math.min(i + N, adds.length + upds.length)} of ${adds.length + upds.length}`);
      const r = await US.host.call('mbApply', { binPath: MB.binPath(model), add: adds.slice(i, i + N), update: upds.slice(i, i + N) }, { timeout: 300000 });
      step += 2;
      for (const a of r.added) { okKeys.add(a.key); if (a.existing) tot.already++; else tot.added++; }
      tot.updated += r.updated; tot.relinked += r.relinked; tot.failed.push(...r.failed);
      for (const u of upds.slice(i, i + N)) if (!r.failed.some(f => f.key === u.key)) okKeys.add(u.key);
    }
    // remember what this project has now (only what made it in), for "new since you last synced"
    const done = items.filter(it => okKeys.has(MB.key(model, it)));
    const prev = famState(model.family.id);
    saveFam(model.family.id, { snapshot: MB.snapshot(model, done, prev && prev.snapshot), at: new Date().toISOString(), familyName: model.family.name });
    const skipped = plan.skip.concat(got.missing.filter(m => !plan.skip.some(s => s.item === m.item)));
    const parts = [];
    if (tot.added) parts.push(`${US.plural(tot.added, 'clip')} added`);
    if (tot.already) parts.push(`${tot.already} already in the project, now in the list`);
    if (tot.updated) parts.push(`${tot.updated} updated`);
    if (tot.relinked) parts.push(`${tot.relinked} relinked`);
    if (got.downloaded) parts.push(`${US.plural(got.downloaded, 'file')} downloaded (${(got.bytes / 1e6).toFixed(got.bytes > 1e8 ? 0 : 1)} MB)`);
    if (skipped.length) parts.push(`${skipped.length} skipped`);
    if (tot.failed.length) parts.push(`${tot.failed.length} failed`);
    US.log(tot.failed.length || skipped.length ? 'warn' : 'ok', `Memory Box: ${model.family.name}`, [parts.join(' · '),
      skipped.length ? 'Skipped: ' + skipped.slice(0, 30).map(s => `${s.name} (${s.why})`).join(', ') : '',
      tot.failed.length ? 'Failed: ' + tot.failed.slice(0, 30).map(f => `${f.key}: ${f.why}`).join(', ') : ''].filter(Boolean).join('\n'), 'memorybox');
    if (!okKeys.size && (tot.failed.length || skipped.length)) throw new US.UserError('HOST_SCRIPT', { title: 'Nothing came in from Memory Box.', action: 'Open the activity log (☰) to see why, then try again.', detail: [...skipped.map(s => s.name + ': ' + s.why), ...tot.failed.map(f => f.key + ': ' + f.why)].slice(0, 20).join('\n') });
    return { summary: `${model.family.name}: ${parts.join(' · ') || 'nothing to change'}`, added: tot.added, updated: tot.updated, relinked: tot.relinked, skipped, failed: tot.failed, downloaded: got.downloaded, bin: MB.binPath(model) };
  }

  US.tools.register({
    id: 'memorybox', name: 'Memory Box', short: 'Memory Box', icon: 'cloud', order: 46,
    blurb: 'A family’s photos and videos from Memory Box, in one bin, with their stories, people and dates.',
    hostFns: ['mbScan', 'mbApply', 'importFiles'],
    create() {
      const v = ui.toolView({ icon: 'cloud', title: 'Memory Box', blurb: 'Bring a family’s photos and videos in from Memory Box – in full resolution, in story order, each with its story, people, date and place.',
        help: 'Connect once with Memory Box’s address and an access key (made in Memory Box: Settings › Editing programs). Pick the family. The originals are saved in the folder you choose – a file that’s already there is never downloaded again – and go in one bin, named in story order. Everything the family wrote is in each clip’s details (Description, Comment, Log Note, Scene = chapter, Shot = date). Bring it in again whenever the family adds more: new clips are added and the ones you have are updated, never duplicated. Photos, videos, voice notes and faces never go to any AI.' });
      let o = opts(), families = [], model = null, diff = null, source = null, filt = { q: '', only: '', type: '', person: '', decade: '', chapter: '', tag: '' };
      const set = patch => { Object.assign(o, patch); saveOpts(o); };

      /* ---------- connection ---------- */
      const connBox = h('div'), famBox = h('div'), overview = h('div'), browse = h('div'), results = h('div');
      function drawConn(editing) {
        US.clear(connBox);
        const c = net.conn();
        if (net.connected() && !editing) {
          connBox.appendChild(h('div.row', h('div.grow.field-hint', 'Connected to ', US.keep(c.url.replace(/^https?:\/\//, ''))),
            ui.button('Change', { small: true, kind: 'ghost', onClick: () => drawConn(true) }),
            ui.button('Open a download instead…', { small: true, kind: 'ghost', icon: 'folder', onClick: openFolder })));
          return;
        }
        const url = ui.input({ value: c.url, placeholder: 'https://memorybox.example.com' });
        const key = ui.input({ value: '', placeholder: c.key ? 'Saved – paste a new key to change it' : 'Paste the access key', type: 'password' });
        connBox.append(
          ui.field('Memory Box address', url),
          ui.field('Access key', key, 'Made in Memory Box: Settings › Editing programs › New access key. It stays on this computer.'),
          h('div.row', ui.button('Connect', { kind: 'primary', icon: 'cloud', onClick: async () => {
            try {
              net.checkUrl(/^https?:/i.test(url.value.trim()) ? url.value.trim() : 'https://' + url.value.trim());
              net.setConn(url.value, key.value.trim() ? key.value.trim() : undefined);
              const m = await net.me();
              ui.toast({ type: 'ok', title: 'Connected to Memory Box', text: m && m.keyName ? `Key: ${m.keyName}` : '' });
              drawConn(false); loadFamilies();
            } catch (e) { ui.showError(e); }
          } }),
          net.connected() ? ui.button('Cancel', { kind: 'ghost', onClick: () => drawConn(false) }) : null,
          h('div.grow'),
          ui.button('Open a download instead…', { small: true, kind: 'ghost', icon: 'folder', onClick: openFolder })));
      }

      /* ---------- family ---------- */
      const famSel = ui.select({ options: [], placeholder: 'Choose the family…', onChange: x => { set({ familyId: x, source: 'online' }); loadFamily(); } });
      function drawFam() {
        US.clear(famBox);
        if (o.source === 'folder' && source && source.kind === 'folder') {
          famBox.append(ui.field('Family', h('div', US.keep(model ? model.family.name : ''), h('div.field-hint', 'From the download in ', US.keep(source.root)))),
            h('div.row', net.connected() ? ui.button('Back to Memory Box online', { small: true, kind: 'ghost', icon: 'cloud', onClick: () => { set({ source: 'online' }); source = null; model = null; drawAll(); loadFamilies(); } }) : null));
          return;
        }
        if (!net.connected()) return;
        const f = families.find(x => x.id === o.familyId);
        famBox.append(ui.field('Family', famSel),
          h('div.row',
            ui.button('Check for updates', { small: true, icon: 'refresh', onClick: () => loadFamily({ force: true }) }),
            f && f.portalUrl ? ui.button('Open in Memory Box', { small: true, kind: 'ghost', icon: 'cloud', onClick: () => US.app.openUrl(f.portalUrl) }) : null,
            ui.button('Refresh list', { small: true, kind: 'ghost', onClick: loadFamilies })));
      }
      async function loadFamilies() {
        if (!net.connected()) return drawAll();
        try {
          families = await net.families();
          famSel.setOptions(families.map(f => ({ value: f.id, label: `${f.name} · ${US.plural(f.items, 'item')}${f.lastUploadAt ? ' · last upload ' + when(f.lastUploadAt) : ''}` })), families.some(f => f.id === o.familyId) ? o.familyId : '');
          drawFam();
          if (o.source === 'online' && families.some(f => f.id === o.familyId)) loadFamily();
        } catch (e) { ui.showError(e); }
      }
      let loadN = 0;
      /** Fetch the family's memorybox.json (unchanged since last time: the copy kept with the project is used). */
      async function loadFamily({ force } = {}) {
        const n = ++loadN, id = o.familyId; if (!id) { model = null; return drawAll(); }
        US.clear(overview); overview.appendChild(h('div.field-hint', 'Reading the family from Memory Box…'));
        try {
          const prev = famState(id), cache = prev && prev.json && prev.etag ? prev : null;
          const r = await net.family(id, { etag: cache && !force ? cache.etag : undefined });
          if (n !== loadN) return;
          const json = r.notModified ? cache.json : r.json;
          model = MB.parse(json);
          if (!r.notModified) saveFam(id, { json, etag: r.etag || '' });
          source = { kind: 'online', folder: o.folder || defaultFolder() };
          diff = MB.diff(model, prev && prev.snapshot);
          if (force) ui.toast({ type: 'ok', title: 'Memory Box checked', text: diff.added.length || diff.changed.length ? `${diff.added.length} new · ${diff.changed.length} changed since you last brought it in` : 'Nothing new since you last brought it in.' });
          drawAll();
        } catch (e) { if (n === loadN) { US.clear(overview); ui.showError(e); } }
      }
      /** A team download on disk (folder or ZIP parts), for working without the online connection. */
      async function openFolder() {
        let picked = [];
        try { picked = US.app.pickFiles({ title: 'Choose the unzipped Memory Box download (or cancel to choose the ZIP parts)', folder: true }); } catch (e) { picked = []; }
        if (!picked.length) { try { picked = US.app.pickFiles({ title: 'Choose the ZIP parts of the Memory Box download', multi: true, ext: ['zip'] }); } catch (e) { picked = []; } }
        if (!picked.length) return;
        await US.jobs.run({ title: 'Opening the Memory Box download', tool: 'memorybox' }, async job => {
          job.set({ who: 'computer', msg: 'Reading the download' });
          const d = await net.openDownload(picked, { job });
          model = MB.parse(d.json); source = { kind: 'folder', root: d.root };
          const prev = famState(model.family.id);
          diff = MB.diff(model, prev && prev.snapshot);
          set({ source: 'folder', downloadRoot: d.root });
          drawAll();
          return { summary: `${model.family.name}: ${US.plural(model.items.length, 'item')}` };
        });
      }

      /* ---------- what's there ---------- */
      function drawOverview() {
        US.clear(overview);
        if (!model) return;
        const photos = model.items.filter(x => x.type === 'photo').length, videos = model.items.filter(x => x.type === 'video').length;
        const named = model.people.filter(p => p.named).length, prev = famState(model.family.id);
        overview.appendChild(ui.stats(ui.stat(String(photos), 'photos'), ui.stat(String(videos), 'videos'), ui.stat(String(named), 'people named'),
          ui.stat(String(diff.added.length + diff.changed.length), diff.first ? 'not brought in yet' : 'new or changed')));
        if (diff.first) overview.appendChild(ui.note(`Nothing from ${model.family.name} is in this project yet.`, 'info'));
        else if (diff.added.length || diff.changed.length) {
          const t = [diff.added.length ? `${diff.added.length} new` : '', diff.changed.length ? `${diff.changed.length} with new details` : ''].filter(Boolean).join(' and ');
          overview.appendChild(h('div.row', h('div.grow', ui.note(`${t} since you last brought it in${prev && prev.at ? ' (' + when(prev.at) + ')' : ''}.`, 'warn')),
            ui.button('Show them', { small: true, onClick: () => { filt.only = 'updates'; drawBrowse(); } })));
        } else overview.appendChild(ui.note(`Up to date: everything from Memory Box (as of ${when(model.asOf) || 'now'}) is in this project.`, 'info'));
        if (diff.removed.length) overview.appendChild(ui.note(`${US.plural(diff.removed.length, 'item')} you brought in earlier ${diff.removed.length === 1 ? 'is' : 'are'} no longer in Memory Box (deleted or hidden there). The clips stay in your bin.`, 'info'));
        for (const w of model.warnings.slice(0, 3)) overview.appendChild(ui.note(w, 'warn'));
      }

      /* ---------- browse: people, decades, chapters, tags, words ---------- */
      function drawBrowse() {
        US.clear(browse);
        if (!model) return;
        const fc = MB.facets(model);
        const pick = (label, key, list, all) => ui.field(label, ui.select({ options: list.map(x => ({ value: x.id, label: `${x.label} (${x.count})` })), value: filt[key], placeholder: all, onChange: x => { filt[key] = x; drawList(); } }));
        const search = ui.input({ value: filt.q, placeholder: 'Search stories, places, names, questions…' });
        search.addEventListener('input', US.debounce(() => { filt.q = search.value; drawList(); }, 250));
        const only = ui.segmented({ options: [{ value: '', label: 'Everything' }, { value: 'updates', label: 'New & changed' }, { value: 'photo', label: 'Photos' }, { value: 'video', label: 'Videos' }],
          value: filt.only === 'updates' ? 'updates' : filt.type, onChange: x => { filt.only = x === 'updates' ? 'updates' : ''; filt.type = x === 'photo' || x === 'video' ? x : ''; drawList(); } });
        browse.append(ui.field('Find', search), only,
          h('div.row.wrap', pick('Person', 'person', fc.people, 'Anyone'), pick('Decade', 'decade', fc.decades, 'Any time')),
          h('div.row.wrap', fc.chapters.length ? pick('Chapter', 'chapter', fc.chapters, 'Every chapter') : null, fc.tags.length ? pick('Tag', 'tag', fc.tags, 'Any tag') : null),
          results);
        drawList();
      }
      const shown = () => (model ? MB.filter(model, filt, diff && diff.status) : []);
      function drawList() {
        US.clear(results);
        const list = shown();
        results.appendChild(h('div.field-hint', `${US.plural(list.length, 'item')} shown${list.length > 200 ? ' (the first 200 listed)' : ''}`));
        results.appendChild(ui.list(list.slice(0, 200).map(it => {
          const s = diff && diff.status.get(it.id);
          return { title: US.keep(MB.clipName(it)), sub: US.keep(MB.subline(it) || it.story.slice(0, 90)), right: s === 'new' ? 'New' : s === 'changed' ? 'Changed' : '', onClick: () => details(it) };
        }), { empty: { icon: 'info', title: 'Nothing matches.', text: 'Try fewer filters.' } }));
        goLabel();
      }
      function details(it) {
        const f = MB.fields(model, it);
        ui.modal({ title: MB.clipName(it), body: h('div', h('pre.mono', { style: { whiteSpace: 'pre-wrap', userSelect: 'text' } }, US.keep(f.logNote)),
          it.faces.length ? h('div.field-hint', `${US.plural(it.faces.length, 'face')} marked${it.faces.some(x => x.maybe) ? ' (some not confirmed)' : ''}`) : null),
        buttons: [{ label: 'Close', value: 1 }] });
      }

      /* ---------- where the files go, and bringing it in ---------- */
      const folderLine = h('div');
      function drawFolder() {
        US.clear(folderLine);
        if (source && source.kind === 'folder') { folderLine.appendChild(h('div.field-hint', 'The files are used where they are in the download – nothing is copied.')); return; }
        folderLine.appendChild(ui.field('Save the originals in', h('div.row', h('div.grow.mono', US.keep(path.join(o.folder || defaultFolder(), model ? model.family.name : '<family>'))),
          ui.button('Choose folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = US.app.pickFiles({ folder: true, title: 'Where should Memory Box files be saved?', start: o.folder || defaultFolder() }); if (r[0]) { set({ folder: US.normPath(r[0]) }); if (source && source.kind === 'online') source.folder = o.folder; drawFolder(); } } catch (e) { ui.showError(e); } } })),
        'A file that’s already in this folder is never downloaded again.'));
      }
      const scope = ui.segmented({ options: [{ value: 'all', label: 'Everything' }, { value: 'shown', label: 'Just what’s shown' }], value: o.scope, onChange: x => { set({ scope: x }); goLabel(); } });
      const go = ui.actionButton('Bring into ' + editor(), async () => {
        if (!model) return ui.showError(new US.UserError('BAD_INPUT', { title: net.connected() ? 'Choose the family first.' : 'Connect to Memory Box first.' }));
        const items = o.scope === 'shown' ? shown() : model.items;
        if (!items.length) return ui.showError(new US.UserError('NOTHING_FOUND', { title: 'No items to bring in.', action: 'Clear the filters, or choose Everything.' }));
        const r = await US.jobs.run({ title: `Bringing in ${model.family.name}`, tool: 'memorybox' }, job => bringIn(model, items, source || { kind: 'online', folder: o.folder || defaultFolder() }, o, job));
        if (r) { diff = MB.diff(model, (famState(model.family.id) || {}).snapshot); drawOverview(); drawList(); }
      });
      function goLabel() {
        const n = model ? (o.scope === 'shown' ? shown().length : model.items.length) : 0;
        const lbl = go.querySelector && go.querySelector('span'); const txt = model ? `Bring ${US.plural(n, 'item')} into ${editor()}` : `Bring into ${editor()}`;
        if (lbl) lbl.textContent = US.say(txt);
      }
      const voice = ui.toggle({ label: 'Voice notes too', hint: 'Each voice note goes right after its photo in the bin.', value: !!o.voiceNotes, onChange: x => set({ voiceNotes: x }) });

      function drawAll() { drawConn(false); drawFam(); drawOverview(); drawBrowse(); drawFolder(); goLabel(); }
      v.body.append(ui.card(connBox, famBox), overview, ui.card(browse), ui.card(folderLine, voice, ui.field('Bring in', scope)), go);
      drawAll();
      return { el: v.el, onShow() { if (o.source === 'folder' && o.downloadRoot && !model) { net.openDownload([o.downloadRoot]).then(d => { model = MB.parse(d.json); source = { kind: 'folder', root: d.root }; diff = MB.diff(model, (famState(model.family.id) || {}).snapshot); drawAll(); }).catch(() => { set({ source: 'online' }); drawAll(); }); } else if (!families.length) loadFamilies(); } };
    }
  });

  MB.bringIn = bringIn;
})();
