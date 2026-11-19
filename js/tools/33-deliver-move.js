/* JMG Ultra Studio – Deliver › Other editors: send the open sequence to Premiere Pro, DaVinci Resolve or Final Cut Pro,
   and bring in a timeline another editor made, as a new sequence. The formats are read and written by
   33-deliver-nlexml.js (FCPXML, FCP 7 XML, EDL, OTIO); the editors' own exports are used where they exist (Premiere's
   FCP 7 XML, Resolve's timeline import). Nothing here changes or saves the user's sequence or project.
   The pane is shown by 33-deliver.js; the actions are deliver.toEditor and deliver.fromEditor. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path');
  const N = () => US.nleXml;
  const inResolve = () => US.app.is('resolve');
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Timeline';
  const EDITORS = { premiere: 'Premiere Pro', resolve: 'DaVinci Resolve', fcp: 'Final Cut Pro' };
  const OPEN_HOW = {
    premiere: 'In Premiere: File › Import, and pick the .xml file.',
    resolve: 'In Resolve: File › Import › Timeline, and pick the file.',
    fcp: 'In Final Cut Pro: File › Import › XML, and pick the .fcpxml file.',
    edl: 'An EDL holds one picture track – handy for colourists and older systems.',
    otio: 'OpenTimelineIO: for Resolve 18.5 or later, and pipeline tools.'
  };
  /** Text naming an editor is shown as written (in Resolve, the panel would otherwise turn “Premiere” into “Resolve”). */
  const lit = t => (typeof t === 'string' && /Premiere|Final Cut|Resolve/.test(t) ? US.keep(t) : t);
  const opts = () => Object.assign({ targets: inResolve() ? ['premiere', 'fcp'] : ['resolve', 'fcp'], edl: false, otio: false }, US.settings.get('deliver.move', {}));

  /**
   * The files to write for each editor asked for. native: the editor's own FCP 7 XML text, when there is one (Premiere
   * always; Resolve if its API offers it) – used as it is for Premiere and Resolve, as it carries more than ours.
   * -> [{key, label, ext, text, notes}]
   */
  function plan(tl, { targets = [], edl = false, otio = false, native = '' } = {}) {
    const out = [], base = safeName(tl.name);
    for (const t of targets) {
      if (!EDITORS[t]) continue;
      if ((t === 'premiere' || t === 'resolve') && native) { out.push({ key: t, label: EDITORS[t], file: `${base} – for ${EDITORS[t]}.xml`, text: native, notes: [] }); continue; }
      const w = N().write(tl, t === 'premiere' ? 'xmeml' : 'fcpxml');
      out.push({ key: t, label: EDITORS[t], file: `${base} – for ${EDITORS[t]}${w.ext}`, text: w.text, notes: w.notes });
    }
    if (edl) { const w = N().write(tl, 'edl'); out.push({ key: 'edl', label: 'EDL', file: `${base}.edl`, text: w.text, notes: w.notes }); }
    if (otio) { const w = N().write(tl, 'otio'); out.push({ key: 'otio', label: 'OpenTimelineIO', file: `${base}.otio`, text: w.text, notes: w.notes }); }
    return out;
  }

  /** Premiere's "FCP Translation Results" as short lines (what it left out of its own XML). */
  function translationLines(report) {
    return String(report || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(translation|fcp translation|sequence|project|date|time)\b/i.test(l) && !/^[-=]+$/.test(l)).slice(0, 20);
  }

  /** Send the sequence to other editors. o: {seqId, targets, edl, otio, folder} -> {dir, files, lost, notes, stats, summary} */
  async function sendTo(o, job) {
    const seqId = o.seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!seqId) throw new US.UserError('NO_SEQUENCE');
    if (!(o.targets || []).length && !o.edl && !o.otio) throw new US.UserError('BAD_INPUT', { title: 'Nothing to make.', action: 'Tick at least one editor or format.' });
    job.set({ who: 'premiere', msg: 'Reading the sequence' }).progress(0.1, 'Reading the sequence');
    const tmp = path.join(US.fsx.tempDir(), `nle-${Date.now()}`, 'sequence.xml');
    const r = await US.host.call('nleExport', { seqId, path: tmp });
    let native = '', tl;
    if (r.path && US.fsx.exists(r.path)) native = fs.readFileSync(r.path, 'utf8');
    job.check();
    job.set({ who: 'computer' }).progress(0.5, 'Converting');
    try { tl = native ? N().readXmeml(native) : N().finish(Object.assign(N().blank(), r.model)); }
    catch (e) { throw new US.UserError('HOST_SCRIPT', { title: 'The sequence couldn’t be read for the other editors.', action: 'Try again; if it keeps happening, send the log from Settings › Help.', detail: e.message }); }
    if (r.model && native) tl.lost = Object.assign({}, r.model.lost, tl.lost);
    const files = plan(tl, { targets: o.targets || [], edl: !!o.edl, otio: !!o.otio, native });
    const dir = US.fsx.ensureDir(o.folder || path.join(US.fsx.exportsDir(), 'Exports', `${safeName(tl.name)} – other editors ${new Date().toISOString().slice(0, 10)}`));
    for (const f of files) { f.path = path.join(dir, f.file); fs.writeFileSync(f.path, f.text); delete f.text; }
    try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch (e) { /* temp */ }
    const lost = N().lostLines(tl), notes = [...new Set(files.flatMap(f => f.notes))].concat(translationLines(r.report).map(l => 'Premiere: ' + l));
    const st = N().stats(tl);
    return { dir, files: files.map(({ key, label, file, path: p }) => ({ key, label, file, path: p })), lost, notes, stats: st, name: tl.name,
      // (no editor names here: the status bar would put “Premiere” in Resolve's words)
      summary: `${US.plural(files.length, 'file')} saved (${files.map(f => path.extname(f.file)).join(', ')}) – ${US.plural(st.clips, 'clip')}, ${US.plural(st.markers, 'marker')}${lost.length ? `; ${US.plural(lost.length, 'thing')} didn’t come across` : ''}` };
  }

  /** Every file in a folder (and its folders, a few levels down), for relinking. */
  function listFiles(dir, depth = 5, out = [], max = 20000) {
    let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const d of list) {
      if (out.length >= max || d.name[0] === '.') continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { if (depth > 0 && !/\.(fcpbundle|fcpxmld|app)$/i.test(d.name)) listFiles(p, depth - 1, out, max); } else out.push(p);
    }
    return out;
  }
  /** A picked timeline file: an .fcpxmld bundle is a folder with Info.fcpxml inside. -> {path, text, kind} */
  function readTimelineFile(file) {
    let p = US.normPath ? US.normPath(file) : file;
    try { if (fs.statSync(p).isDirectory()) { const inner = path.join(p, 'Info.fcpxml'); if (!fs.existsSync(inner)) throw new Error('no Info.fcpxml'); p = inner; } }
    catch (e) { throw new US.UserError('NOTHING_FOUND', { title: 'That timeline file can’t be opened.', action: 'Choose it again.', detail: `${file}: ${e.message}` }); }
    const kind = N().sniff(file, /\.aaf$/i.test(p) ? '' : fs.readFileSync(p, 'utf8').slice(0, 4000));
    if (!kind) throw new US.UserError('BAD_INPUT', { title: 'That isn’t a timeline file this can read.', action: 'Choose an FCPXML (.fcpxml / .fcpxmld), FCP 7 XML (.xml), EDL (.edl) or OpenTimelineIO (.otio) file.', detail: file });
    return { path: p, kind, text: kind === 'aaf' ? '' : fs.readFileSync(p, 'utf8') };
  }
  // marker colours as the editors' marker indexes (0 green, 1 red, 2 purple, 3 orange/sand, 4 yellow, 5 white/cream, 6 blue, 7 cyan)
  const MARKER_INDEX = { Green: 0, Mint: 0, Red: 1, Rose: 1, Pink: 1, Purple: 2, Lavender: 2, Fuchsia: 2, Sand: 3, Cocoa: 3, Orange: 3, Yellow: 4, Lemon: 4, Cream: 5, White: 5, Blue: 6, Sky: 7, Cyan: 7 };
  const FROM = { fcpxml: 'Final Cut Pro', xmeml: 'FCP 7 XML', edl: 'EDL', otio: 'OTIO', aaf: 'AAF' };

  /**
   * Bring in a timeline file as a new sequence. o: {file, mediaFolder, name, fps}
   * Premiere: converted to FCP 7 XML here (media found first), then imported. Resolve: its own import of the file (it reads
   * every format and keeps more), the converted FCP 7 XML if that fails. -> {seqId, name, clips, expected, lost, missing, summary}
   */
  async function bringIn(o, job) {
    if (!o.file) throw new US.UserError('BAD_INPUT', { title: 'Choose a timeline file first.' });
    job.set({ who: 'computer', msg: 'Reading the file' }).progress(0.05, 'Reading ' + path.basename(o.file));
    const src = readTimelineFile(o.file);
    if (src.kind === 'aaf' && !inResolve()) throw new US.UserError('BAD_INPUT', { title: 'Premiere opens AAF files itself.', action: 'Use File › Import in Premiere, or export FCP 7 XML from the other editor instead.' });
    let tl = null;
    if (src.kind !== 'aaf') {
      try { tl = N().read(src.text, src.kind, { fps: o.fps || (US.ctx.sequence && US.ctx.sequence.fps) || 25 }); }
      catch (e) { throw new US.UserError('BAD_INPUT', { title: 'That timeline file couldn’t be read.', action: 'Export it again from the editor that made it, or try another format (FCPXML or FCP 7 XML).', detail: e.message }); }
    }
    // media that isn't where the file says: looked for by name in the folder picked, or next to the file
    let found = 0, missing = [];
    if (tl) {
      job.progress(0.2, 'Finding the media');
      const where = [o.mediaFolder, path.dirname(src.path)].filter(Boolean);
      let listing = null;
      const need = Object.values(tl.media).some(m => !m.path || !US.fsx.exists(m.path));
      if (need) listing = where.flatMap(d => listFiles(d));
      const r = N().relink(tl, p => US.fsx.exists(p), listing || []);
      found = r.found; missing = r.missing;
    }
    job.check();
    const name = (o.name || (tl ? tl.name : path.basename(src.path).replace(/\.[^.]+$/, ''))) + ` (from ${FROM[src.kind]})`;
    const conv = () => { const p = path.join(US.fsx.ensureDir(path.join(US.fsx.tempDir(), `nle-in-${Date.now()}`)), safeName(name) + '.xml'); fs.writeFileSync(p, N().write(N().renamed(tl, name), 'xmeml').text); return p; };
    job.set({ who: 'premiere' }).progress(0.5, 'Making the new sequence');
    let r, how = '';
    if (inResolve()) {
      // Resolve reads all of these itself; ours only when a file was relinked here or Resolve refuses its own
      const own = !found || src.kind === 'aaf';
      try { if (!own) throw new Error('relinked'); r = await US.host.call('nleImport', { path: src.path, name, mediaFolder: o.mediaFolder || '' }); how = 'Resolve’s own import'; }
      catch (e) { if (!tl) throw e; r = await US.host.call('nleImport', { path: conv(), name, mediaFolder: o.mediaFolder || '' }); how = 'converted to FCP 7 XML'; }
    } else { r = await US.host.call('nleImport', { path: conv(), name }); how = src.kind === 'xmeml' ? 'FCP 7 XML' : 'converted to FCP 7 XML'; }
    job.check();
    // markers the editor's own import didn't bring (Resolve 21.2 drops FCPXML's – measured 19 Nov 2026): added from the file
    let markersAdded = 0;
    if (tl && tl.markers.length) {
      try {
        const have = ((await US.host.call('sequenceInfo', { seqId: r.seqId, clips: false })) || {}).markers || [];
        const fps = tl.rate.num / tl.rate.den, near = (a, b) => Math.abs(a - b) <= 1.5 / fps;
        const add = tl.markers.filter(m => !have.some(x => near(Number(x.start), m.at / fps) && String(x.name || '') === String(m.name || '')))
          .map(m => Object.assign({ start: m.at / fps, name: m.name || '', comment: m.note || '', color: MARKER_INDEX[m.colour] != null ? MARKER_INDEX[m.colour] : 0 }, m.dur ? { end: (m.at + m.dur) / fps } : {}));
        if (add.length) { await US.host.call('addSequenceMarkers', { seqId: r.seqId, markers: add, where: 'sequence' }); markersAdded = add.length; }
      } catch (e) { US.log && US.log('warn', 'Markers not added to the new sequence', String(e && e.message || e), 'deliver'); }
    }
    try { await US.host.call('openSequence', { seqId: r.seqId }); } catch (e) { /* made; just not shown */ }
    const st = tl ? N().stats(tl) : null, lost = tl ? N().lostLines(tl) : [];
    return { seqId: r.seqId, name: r.name, clips: r.clips, markersAdded, expected: st ? st.clips : null, markers: st ? st.markers : null, lost, missing, found, how, kind: src.kind,
      summary: `New sequence “${r.name}” – ${US.plural(r.clips, 'clip')}${missing.length ? `, ${US.plural(missing.length, 'file')} not found` : ''}${lost.length ? `; ${US.plural(lost.length, 'thing')} didn’t come across` : ''}` };
  }

  /* ---------- actions ---------- */
  const editorIn = t => (/final ?cut|fcp ?x?\b|fcpx/i.test(t) ? 'fcp' : /resolve|davinci/i.test(t) ? 'resolve' : /premiere/i.test(t) ? 'premiere' : '');
  US.actions.register({
    id: 'deliver.toEditor', tool: 'deliver', title: 'Send the sequence to another editor',
    describe: 'Saves the active sequence as files Final Cut Pro (FCPXML), DaVinci Resolve or Premiere Pro (FCP 7 XML) can open, plus an EDL or OpenTimelineIO file if asked, and says what didn’t come across (effects, titles, speed…). The sequence isn’t changed.',
    params: { editors: { type: 'string', default: '', desc: 'Comma list of fcp, resolve, premiere (empty = the usual ones)' }, edl: { type: 'boolean', default: false, desc: 'Also an EDL' }, otio: { type: 'boolean', default: false, desc: 'Also an OpenTimelineIO file' } },
    examples: ['send this to Final Cut Pro', 'export an FCPXML', 'make an XML for Resolve', 'export an EDL'],
    match(t) {
      if (!/(send|export|move|save|make|give).*(final ?cut|fcpx?|fcpxml|resolve|davinci|premiere|other editor|another editor|xml|edl|otio)/i.test(t) || /render|subtitle|srt|caption/i.test(t)) return null;
      if (/resolve|davinci/i.test(t) && inResolve() || /premiere/i.test(t) && !inResolve()) return null;
      const e = editorIn(t) || (/fcpxml/i.test(t) ? 'fcp' : '');
      return { editors: e, edl: /\bedl\b/i.test(t), otio: /otio|opentimeline/i.test(t), _score: 2 };
    },
    run: (p, job) => { const d = opts(); const eds = String(p.editors || '').split(',').map(s => s.trim()).filter(s => EDITORS[s]); return sendTo({ targets: eds.length ? eds : p.edl || p.otio ? [] : d.targets, edl: p.edl, otio: p.otio }, job); }
  });
  US.actions.register({
    id: 'deliver.fromEditor', tool: 'deliver', title: 'Bring in a timeline from another editor', changes: true,
    describe: 'Opens an FCPXML, FCP 7 XML, EDL or OpenTimelineIO file from another editor as a new sequence (media found by name in a folder if it moved), and says what didn’t come across.',
    params: { file: { type: 'string', default: '', desc: 'The timeline file (asked for if empty)' }, mediaFolder: { type: 'string', default: '', desc: 'Where to look for media that moved' } },
    examples: ['import an FCPXML', 'open a Final Cut Pro project here', 'bring in the EDL from the colourist'],
    match: t => (/(import|bring in|open|load).*(fcpxml|final ?cut|xml|edl|otio|timeline file|other editor|another editor)/i.test(t) ? { _score: 2 } : null),
    async run(p, job) {
      let file = p.file;
      if (!file) { file = US.app.pickFiles({ title: 'Choose a timeline from another editor', ext: ['fcpxml', 'fcpxmld', 'xml', 'edl', 'otio'].concat(inResolve() ? ['aaf'] : []) })[0]; if (!file) throw new US.UserError('BAD_INPUT', { title: 'No file chosen.' }); }
      return bringIn({ file, mediaFolder: p.mediaFolder }, job);
    }
  });

  /* ---------- the pane (shown by Deliver) ---------- */
  function pane() {
    const el = h('div.tool-body');
    let o = opts();
    const save = () => US.settings.set('deliver.move', o);
    const here = inResolve() ? 'resolve' : 'premiere';
    const editorToggle = k => ui.toggle({ label: lit(EDITORS[k] + (k === here ? ' (another computer)' : '')), hint: lit(k === 'fcp' ? 'FCPXML 1.10 – Final Cut Pro 10.6 and later.' : k === 'premiere' ? 'FCP 7 XML (.xml).' : inResolve() ? 'FCPXML 1.10.' : 'Premiere’s own FCP 7 XML – Resolve reads it well.'), value: o.targets.includes(k), onChange: on => { o.targets = on ? o.targets.concat(k) : o.targets.filter(x => x !== k); save(); } });
    const out = h('div');
    let lastDir = '';
    const openFolder = () => lastDir && require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + lastDir + '"');
    const lostBlock = (lost, notes) => [
      lost.length ? ui.section('Didn’t come across', [ui.list(lost.map(l => ({ title: lit(l) })))], { open: true, hint: 'Rebuild these in the other editor, or render them in place first.' }) : ui.note('Everything in the sequence came across as clips, cuts and markers.', 'info'),
      notes && notes.length ? ui.section('Good to know', [ui.list(notes.map(n => ({ title: lit(n) })))], { open: false }) : null
    ];
    const sendBtn = ui.actionButton('Make the files', async () => {
      const r = await US.actions.run('deliver.toEditor', { editors: o.targets.join(','), edl: o.edl, otio: o.otio });
      if (!r) return;
      lastDir = r.dir; US.clear(out);
      out.append(ui.card(h('div.card-title', 'Saved'),
        h('div.stats', ui.stat(String(r.stats.clips), 'clips'), ui.stat(String(r.stats.markers), 'markers'), ui.stat(String(r.stats.videoTracks + r.stats.audioTracks), 'tracks')),
        ui.list(r.files.map(f => ({ title: US.keep(f.file), sub: lit(OPEN_HOW[f.key] || '') }))),
        h('div.row', ui.button('Open the folder', { small: true, icon: 'folder', onClick: openFolder })),
        ...lostBlock(r.lost, r.notes)));
    });
    // bring in
    let file = '', media = '';
    const fileLine = h('div.field-hint', 'No file chosen.'), mediaLine = h('div.field-hint', 'Only needed when the media has moved – the folder it’s in now (searched a few folders deep).');
    const pick = () => { try { const r = US.app.pickFiles({ title: 'Choose a timeline from another editor', ext: ['fcpxml', 'fcpxmld', 'xml', 'edl', 'otio'].concat(inResolve() ? ['aaf'] : []) }); if (r[0]) { file = US.normPath ? US.normPath(r[0]) : r[0]; US.clear(fileLine); fileLine.append(US.keep(path.basename(file))); } } catch (e) { ui.showError(e); } };
    const pickMedia = () => { try { const r = US.app.pickFiles({ folder: true, title: 'Where is the media now?' }); if (r[0]) { media = r[0]; US.clear(mediaLine); mediaLine.append(US.keep(media)); } } catch (e) { ui.showError(e); } };
    const inOut = h('div');
    const inBtn = ui.actionButton('Make a new sequence from it', async () => {
      if (!file) pick();
      if (!file) return;
      const r = await US.actions.run('deliver.fromEditor', { file, mediaFolder: media });
      if (!r) return;
      US.clear(inOut);
      inOut.append(ui.card(h('div.card-title', 'New sequence'), h('div', US.keep(r.name)),
        h('div.stats', ui.stat(String(r.clips), 'clips placed'), r.expected != null ? ui.stat(String(r.expected), 'in the file') : null, r.markers != null ? ui.stat(String(r.markers), 'markers') : null),
        h('div.field-hint', lit(`Read as ${FROM[r.kind]} · ${r.how}${r.found ? ` · ${US.plural(r.found, 'file')} found in the media folder` : ''}`)),
        r.missing.length ? ui.note(`Not found: ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? ` and ${r.missing.length - 8} more` : ''}. Choose the folder the media is in now and try again, or relink in the ${US.app.is('resolve') ? 'Media Pool' : 'Project panel'}.`, 'warn') : null,
        ...lostBlock(r.lost, [])));
    });
    el.append(
      ui.card(h('div.card-title', 'Send this sequence to another editor'),
        h('div.muted', 'Saves files the other editor opens as a timeline – cuts, clips, in and out points, markers, clip colours where it has them, and links to the same media files. Your sequence isn’t changed.'),
        ...Object.keys(EDITORS).map(editorToggle),
        ui.section('Other formats', [
          ui.toggle({ label: 'EDL (CMX 3600)', hint: OPEN_HOW.edl, value: o.edl, onChange: x => { o.edl = x; save(); } }),
          ui.toggle({ label: 'OpenTimelineIO (.otio)', hint: OPEN_HOW.otio, value: o.otio, onChange: x => { o.otio = x; save(); } })
        ], { open: o.edl || o.otio }),
        sendBtn),
      out,
      ui.card(h('div.card-title', 'Bring in a timeline from another editor'),
        h('div.muted', lit('An FCPXML from Final Cut Pro (.fcpxml or .fcpxmld), an FCP 7 XML from ' + (inResolve() ? 'Premiere, an EDL, an OpenTimelineIO file or an AAF becomes a new timeline in JMG Ultra Studio › From other editors.' : 'Resolve or another Premiere, an EDL or an OpenTimelineIO file becomes a new sequence in JMG Ultra Studio › From other editors.'))),
        h('div.row', h('div.grow', fileLine), ui.button('Choose file…', { small: true, kind: 'ghost', icon: 'folder', onClick: pick })),
        h('div.row', h('div.grow', mediaLine), ui.button('Media folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: pickMedia })),
        inBtn),
      inOut);
    return el;
  }

  US.deliverMove = { pane, plan, sendTo, bringIn, readTimelineFile, translationLines, listFiles, EDITORS };
})();
