/* JMG Ultra Studio – Deliver: every export in one go (with live Media Encoder progress), render ranges (one file
   per adjustment layer on a chosen track), and YouTube chapters from markers. Client notes were taken out (29 Oct 2026);
   parseNotes stays for now. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path');

  // Resolve's reframing is called Smart Reframe; failed renders stay in its Render Queue (Deliver page) to show why
  const inResolve = () => US.app.is('resolve');
  const REFRAME = US.app.is('resolve') ? 'Smart Reframe' : 'Auto Reframe';
  const seeWhy = () => (inResolve() ? 'Open the Render Queue on Resolve’s Deliver page to see why, then try those again.' : 'Open Media Encoder to see why, then try those again.');
  const OUTPUTS = {
    master: { label: 'Master (same shape as the sequence)', short: 'Master', kind: 'video' },
    v916: { label: `Vertical 9:16 (${REFRAME})`, short: '9x16', kind: 'video', num: 9, den: 16 },
    s11: { label: `Square 1:1 (${REFRAME})`, short: '1x1', kind: 'video', num: 1, den: 1 },
    p45: { label: `Portrait 4:5 (${REFRAME})`, short: '4x5', kind: 'video', num: 4, den: 5 },
    wav: { label: 'Sound only (WAV 48 kHz)', short: 'Sound', kind: 'audio' },
    thumb: { label: 'Thumbnail (frame at the playhead)', short: 'Thumbnail', kind: 'image' }
  };
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Export';
  const labelName = i => (US.ui.LABELS[Number(i)] || {}).name || 'that colour';
  const defaultDir = seqName => path.join(US.fsx.exportsDir(), 'Exports', `${safeName(seqName)} ${new Date().toISOString().slice(0, 10)}`);

  // guides would be burned in
  async function hideGuides(seqId, job) {
    const guides = await US.host.call('guideStatus', { seqId });
    if (guides.some(g => !g.hidden)) {
      job.set({ msg: 'Hiding the Safe Zones guides so they don’t export' });
      await US.host.call('showGuides', { seqId, show: false });
      US.log('info', 'Hid Safe Zones guides before exporting', '', 'deliver');
    }
  }

  async function exportPack(o, job) {
    const seqId = o.seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!seqId) throw new US.UserError('NO_SEQUENCE');
    const keys = o.outputs.filter(k => OUTPUTS[k]);
    if (!keys.length) throw new US.UserError('BAD_INPUT', { title: 'Nothing to export.', action: 'Tick at least one output.' });
    const seq = await US.host.call('sequenceInfo', { seqId, clips: false });
    const presets = await US.host.call('encoderPresets');
    if (!presets.h264 || (keys.includes('wav') && !presets.wav)) throw new US.UserError('PRESET_MISSING', { detail: JSON.stringify(presets) });
    const dir = o.folder || defaultDir(seq.name), sfx = cleanSuffix(o.suffix);
    US.fsx.ensureDir(dir);

    await hideGuides(seqId, job);

    // 1. reframed versions (new sequences in JMG Ultra Studio/Deliver)
    const plan = [];
    const reframes = keys.filter(k => OUTPUTS[k].num);
    let step = 0; const steps = reframes.length + 1;
    try {
    for (const k of reframes) {
      job.check();
      job.set({ who: 'premiere' }).progress(0.02 + 0.18 * (step++ / steps), `${REFRAME}: making the ${OUTPUTS[k].short} version (this can take a while on long sequences)`);
      let r = await US.host.call('autoReframe', { seqId, num: OUTPUTS[k].num, den: OUTPUTS[k].den, motion: 'default', name: `${seq.name} – ${OUTPUTS[k].short.replace('x', ':')}`, binPath: 'JMG Ultra Studio/Deliver' });
      // Resolve: clips Smart Reframe couldn't do (titles, generators, or Resolve without Studio) are centre-cropped
      if (r && r.failed) US.log('warn', `${REFRAME} skipped ${US.plural(r.failed, 'clip')} in the ${OUTPUTS[k].short} version`, 'They are centre-cropped instead. Select them and press Smart Reframe in the Inspector to try again.', 'deliver');
      if (o.fullSize !== false) {
        // Auto Reframe keeps the sequence height (607×1080 from a 1080p edit); platforms want 1080×1920 etc.
        const big = Math.max(seq.width, seq.height) >= 3000, base = big ? 2160 : 1080;
        const W = base, H = Math.round(base * OUTPUTS[k].den / OUTPUTS[k].num);
        job.progress(0.02 + 0.18 * (step - 0.5) / steps, `Making the ${OUTPUTS[k].short} version full size (${W}×${H})`);
        r = await US.host.call('fitToSize', { seqId: r.id, width: W, height: H, name: `${seq.name} – ${OUTPUTS[k].short.replace('x', ':')} ${W}×${H}`, binPath: 'JMG Ultra Studio/Deliver' });
      }
      plan.push({ key: k, seqId: r.id, out: path.join(dir, `${safeName(seq.name)} - ${OUTPUTS[k].short}${sfx}.mp4`), preset: presets.h264 });
    }
    } finally {
      // making new sequences opens them; put the editor back where they were
      if (reframes.length) { try { await US.host.call('openSequence', { seqId }); } catch (e) { /* ignore */ } }
    }
    if (keys.includes('master')) plan.unshift({ key: 'master', seqId, out: path.join(dir, `${safeName(seq.name)} - Master${sfx}.mp4`), preset: presets.h264 });
    if (keys.includes('wav')) plan.push({ key: 'wav', seqId, out: path.join(dir, `${safeName(seq.name)} - Sound${sfx}.wav`), preset: presets.wav });

    // 2. thumbnail straight away (no encoder needed)
    let thumb = null;
    if (keys.includes('thumb')) {
      job.set({ who: 'premiere', msg: 'Saving the thumbnail' });
      const ctx = US.ctx.sequence && US.ctx.sequence.id === seqId ? US.ctx.sequence : null;
      thumb = await US.host.call('exportFrame', { seqId, seconds: ctx ? ctx.playhead || 0 : 0, outBase: US.encoder.unique(path.join(dir, `${safeName(seq.name)} - Thumbnail${sfx}.png`)).replace(/\.png$/, '') });
    }
    if (!plan.length) return { summary: 'Thumbnail saved', dir };

    // 3. render through Media Encoder, following its real progress
    const tasks = plan.map(p => ({ seqId: p.seqId, out: p.out, preset: p.preset, name: OUTPUTS[p.key].short, key: p.key }));
    await US.encoder.run(tasks, job, { label: 'Exporting', from: 0.2, to: 1 });
    const failed = tasks.filter(t => !t.ok), ok = tasks.filter(t => t.ok);
    US.log(failed.length ? 'error' : 'ok', `Exports in ${dir}`, tasks.map(t => `${t.ok ? '✓' : '✗'} ${path.basename(t.out)}${t.ok ? '' : ' – ' + t.error}`).concat(thumb ? ['✓ ' + path.basename(thumb)] : []).join('\n'), 'deliver');
    if (failed.length) throw new US.UserError('RENDER_FAILED', { title: `${failed.length} of ${tasks.length} exports failed.`, action: seeWhy(), detail: failed.map(t => `${path.basename(t.out)}: ${t.error}`).join('\n') });
    return { summary: `${ok.length + (thumb ? 1 : 0)} files saved`, dir };
  }

  /* ---------- render ranges: adjustment layers on a “Renders” track above the edit, one file each ---------- */
  // names Premiere (or we) give a layer before you name it yourself, in Premiere's main languages
  const PLAIN_NAMES = /^(graphic|grafik|graphique|gráfico|basic title|adjustment layer|einstellungsebene|calque d'effets|capa de ajuste|livello di regolazione|camada de ajuste|調整レイヤー|ultra studio render range|transparent video)?( \d+)?$/i;
  /**
   * The colours of layers Ultra Studio laid. Premiere 26 doesn't tell add-ons a timeline clip's colour (TrackItem has
   * no colour, measured in 26.5.2), so the colour each layer got – from Song Splitter, “Add a render range” or a
   * change in Deliver – is remembered with the project, per sequence and track, and found again by its times, else
   * by its name. A colour changed by hand in the Timeline isn't seen. Resolve reads its colours directly.
   */
  const layerColours = {
    store: () => US.projectStore(US.ctx.project && US.ctx.project.path),
    key: (seqId, track) => seqId + '|' + String(track || 'Renders').trim().toLowerCase(),
    all(seqId, track) { return (this.store().get('layerColours', {})[this.key(seqId, track)] || []).slice(); },
    put(seqId, track, list) { const all = this.store().get('layerColours', {}); all[this.key(seqId, track)] = list.slice(-2000); this.store().set('layerColours', all); },
    /** list: [{name, start, end, label}] just laid; replace: the track's layers were all replaced */
    remember(seqId, track, list, { replace = false } = {}) {
      const near = (a, b) => Math.abs(a - b) < 0.02;
      const keep = replace ? [] : this.all(seqId, track).filter(o => !list.some(n => near(n.start, o.start) && near(n.end, o.end)));
      this.put(seqId, track, keep.concat(list.filter(n => n.label != null).map(n => ({ name: String(n.name || ''), start: n.start, end: n.end, label: Number(n.label) }))));
    },
    forget(seqId, track, r) { const near = (a, b) => Math.abs(a - b) < 0.02; this.put(seqId, track, this.all(seqId, track).filter(o => !(near(o.start, r.start) && near(o.end, r.end)))); },
    /** ranges whose colour the editor didn't give get the remembered one (by times, else by a name used once) */
    apply(seqId, track, ranges) {
      const known = this.all(seqId, track), near = (a, b) => Math.abs(a - b) < 0.02;
      return ranges.map(r => {
        if (r.label != null) return r;
        let hit = known.find(o => near(o.start, r.start) && near(o.end, r.end));
        if (!hit) { const byName = known.filter(o => o.name === r.name); if (byName.length === 1 && ranges.filter(x => x.name === r.name).length === 1) hit = byName[0]; }
        return hit ? Object.assign({}, r, { label: hit.label, remembered: true }) : r;
      });
    }
  };
  /** A file-name ending the person typed (“_1”, “ v2”): only characters every file system takes, at most 30. */
  const cleanSuffix = x => String(x || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').slice(0, 30).replace(/[. ]+$/, '');
  /**
   * Ranges from the editor → the renders, in timeline order, named after their layer (plus the suffix); switched-off
   * and empty ones left out, and with o.colour only the ranges of that colour (label 0–15).
   */
  function rangePlan(ranges, seqName, ext, dir, o = {}) {
    const taken = new Set();   // lower case: Windows file names ignore case
    const suffix = cleanSuffix(o.suffix), colour = o.colour === '' || o.colour == null ? null : Number(o.colour);
    return ranges.filter(r => !r.disabled && r.end - r.start > 0.01 && (colour == null || r.label === colour)).sort((a, b) => a.start - b.start).map((r, i) => {
      const base = safeName((PLAIN_NAMES.test(String(r.name || '').trim()) ? `${seqName} - Render ${i + 1}` : r.name) + suffix);
      let name = base;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
      taken.add(name.toLowerCase());
      return { name, start: r.start, end: r.end, out: path.join(dir, `${name}.${ext}`), kind: r.kind || 'adjustment' };
    });
  }
  /** Export presets saved in Media Encoder or Premiere (Documents › Adobe › …), newest version first. -> [{name, path, from}] */
  function userPresets(docs) {
    const out = [], seen = new Set();
    const walk = (dir, depth, from) => {
      let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const d of list.sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) { if (depth > 0 && !/ingest|proxy/i.test(d.name)) walk(p, depth - 1, from); continue; }
        const key = d.name.toLowerCase();
        if (/\.epr$/i.test(d.name) && !seen.has(key) && out.length < 300) { seen.add(key); out.push({ name: d.name.replace(/\.epr$/i, ''), path: p, from }); }
      }
    };
    const versions = root => { try { return fs.readdirSync(root).filter(v => /^\d/.test(v)).sort((a, b) => parseFloat(b) - parseFloat(a)).map(v => path.join(root, v)); } catch (e) { return []; } };
    for (const v of versions(path.join(docs, 'Adobe', 'Adobe Media Encoder'))) walk(path.join(v, 'Presets'), 2, 'Media Encoder');
    for (const v of versions(path.join(docs, 'Adobe', 'Premiere Pro'))) walk(v, 4, 'Premiere Pro');
    return out;
  }
  /** Where a new range goes: the sequence's In/Out if you set them, else 10 seconds from the playhead. */
  function newRangeSpan(info, playhead) {
    const d = info.duration;
    // a point that isn't set reads as -400000 s: no In means the start, no Out the end
    const i = info.inPoint >= 0 ? info.inPoint : 0, o = info.outPoint >= 0 ? Math.min(info.outPoint, d) : d;
    if (o > i + 0.04 && !(i < 0.04 && o >= d - 0.04)) return { start: i, end: o };
    const start = Math.max(0, Math.min(playhead || 0, d - 1));
    return { start, end: Math.min(d, start + 10) };
  }

  async function exportRanges(o, job) {
    const seqId = o.seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!seqId) throw new US.UserError('NO_SEQUENCE');
    const seq = await US.host.call('sequenceInfo', { seqId, clips: false });
    const found = await US.host.call('renderRanges', { seqId, track: o.track || undefined, kinds: o.kinds || 'adjustment' });
    found.ranges = layerColours.apply(seqId, o.track, found.ranges);
    const preset = o.preset || (await US.host.call('encoderPresets')).h264;
    const isFile = !inResolve() || /\.(xml|epr)$/i.test(String(preset || ''));
    if (!preset || (isFile && !fs.existsSync(preset))) throw new US.UserError('PRESET_MISSING', { title: 'The export preset isn’t there any more.', action: 'Choose the preset again in Deliver › Render ranges.', detail: String(preset) });
    const ext = (await US.host.call('presetExtension', { seqId, preset })) || 'mp4';
    const dir = o.folder || defaultDir(seq.name);
    const plan = rangePlan(found.ranges, seq.name, ext, dir, o);
    if (!plan.length && o.colour !== '' && o.colour != null && rangePlan(found.ranges, seq.name, ext, dir).length) throw new US.UserError('NOTHING_FOUND', { title: `No render ranges in ${labelName(o.colour)}.`, action: 'Choose another colour (or All colours) in Deliver › Render ranges.' });
    if (!plan.length) throw new US.UserError('NOTHING_FOUND', { title: US.say('No render ranges on this sequence.'), action: inResolve() ? 'Add one with “Add a render range” in Deliver › Render ranges.' : `Add one with “Add a render range”, or put ${kindWords(o.kinds)} on a video track named “${o.track || 'Renders'}” (or choose the track they're on).` });
    US.fsx.ensureDir(dir);
    await hideGuides(seqId, job);
    // text layers used as ranges would show in the picture: their track is switched off while the renders are sent
    let shown = null;
    if (o.hideText !== false && plan.some(p => p.kind === 'text')) {
      job.set({ msg: 'Switching the text layers off so they don’t show in the renders' });
      shown = await US.host.call('rangeTrackOutput', { seqId, track: o.track || 'Renders', on: false });
    }
    // Resolve renders from the timeline when Render All is pressed, so with queue-only the titles stay off until then
    const putBack = () => (shown && shown.was === 1 && !(inResolve() && o.queueOnly) ? US.host.call('rangeTrackOutput', { seqId, track: o.track || 'Renders', on: true }).catch(e => US.log('warn', 'The text track couldn’t be switched back on', String(e && e.message || e), 'deliver')) : null);
    const tasks = plan.map(p => ({ seqId, out: p.out, preset, name: p.name, range: { start: p.start, end: p.end }, overwrite: !!o.replace }));
    try { await US.encoder.run(tasks, job, { label: 'Rendering', from: 0.05, to: 1, queueOnly: !!o.queueOnly }); } finally { await putBack(); }
    if (shown && shown.was === 1 && inResolve() && o.queueOnly) ui.toast({ type: 'info', title: `The “${o.track || 'Renders'}” titles are switched off`, text: 'So they don’t show in the renders waiting in the Render Queue. Switch the track on again after Render All.', timeout: 15000 });
    const io = tasks.map(t => t.inOutNotRestored).filter(Boolean).pop();
    if (io) {
      const at = s => s < 0 ? 'none' : US.fmtDur(s);
      US.log('warn', 'Your In and Out points couldn’t be put back', `They were In ${at(io.in)}, Out ${at(io.out)}. Set them again in the Timeline.`, 'deliver');
      ui.toast({ type: 'warn', title: 'Set your In and Out points again', text: `Premiere didn’t take them back after queuing the renders (they were In ${at(io.in)}, Out ${at(io.out)}).`, timeout: 15000 });
    }
    const list = tasks.map(t => `${t.queued ? '→' : t.ok ? '✓' : '✗'} ${path.basename(t.out)} (${US.fmtDur(t.range.start)}–${US.fmtDur(t.range.end)})${t.ok || t.queued ? '' : ' – ' + t.error}`).join('\n');
    if (o.queueOnly) {
      US.log('ok', `${US.plural(tasks.length, 'render')} queued in Media Encoder for ${dir}`, list, 'deliver');
      return { summary: inResolve() ? `${US.plural(tasks.length, 'render')} added to Resolve’s Render Queue – press Render All on the Deliver page` : `${US.plural(tasks.length, 'render')} queued in Media Encoder – press its green Start button`, dir, files: tasks.map(t => t.out) };
    }
    const failed = tasks.filter(t => !t.ok);
    US.log(failed.length ? 'error' : 'ok', `Render ranges in ${dir}`, list, 'deliver');
    if (failed.length) throw new US.UserError('RENDER_FAILED', { title: `${failed.length} of ${tasks.length} renders failed.`, action: seeWhy(), detail: failed.map(t => `${path.basename(t.out)}: ${t.error}`).join('\n') });
    return { summary: `${US.plural(tasks.length, 'render')} saved`, dir, files: tasks.map(t => t.out) };
  }

  /* ---------- client notes ---------- */
  const TC = '(\\d{1,2}(?::\\d{1,2}){1,3}(?:[.;]\\d+)?)';
  const LINE = new RegExp(`^\\s*(?:[-*•]\\s*)?[\\[(@]?\\s*${TC}(?:\\s*(?:-|–|—|to)\\s*${TC})?\\s*[\\])]?\\s*(?:[-–—:|]\\s*)?(.*)$`, 'i');
  /** Parse pasted notes or a Frame.io-style CSV. Returns [{t, end, text}] (end may be null). */
  function parseNotes(text, fps) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    // CSV with a header row containing a timecode column and a comment column
    const head = lines[0] || '';
    if (/,|\t/.test(head) && /time|timecode|tc/i.test(head) && /comment|note|text|feedback/i.test(head)) {
      const sep = head.includes('\t') ? '\t' : ',';
      const split = l => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map(x => x.trim()); };
      const cols = split(head).map(c => c.toLowerCase());
      const ti = cols.findIndex(c => /timecode|time ?stamp|^time$|^tc$|^in$/.test(c)), ci = (() => { const exact = cols.findIndex(c => /^(comments?|notes?|text|feedback|message)$/.test(c)); return exact >= 0 ? exact : cols.findIndex(c => /comment|note|text|feedback/.test(c) && !/number|#|\bid\b|count/.test(c)); })(), ai = cols.findIndex(c => /author|name|user|commenter/.test(c));
      if (ti >= 0 && ci >= 0) {
        for (const l of lines.slice(1)) { if (!l.trim()) continue; const r = split(l); const t = US.time.parseTC(r[ti], fps); if (isFinite(t)) out.push({ t, end: null, text: (ai >= 0 && r[ai] ? r[ai] + ': ' : '') + r[ci] }); }
        return out;
      }
    }
    for (const l of lines) {
      if (!l.trim()) continue;
      const m = LINE.exec(l);
      if (m && isFinite(US.time.parseTC(m[1], fps))) out.push({ t: US.time.parseTC(m[1], fps), end: m[2] ? US.time.parseTC(m[2], fps) : null, text: (m[3] || '').trim() || '(no comment)' });
      else if (out.length) out[out.length - 1].text += ' ' + l.trim();
    }
    return out;
  }
  /** Notes written against a 01:00:00:00 start: shift them back an hour if that's clearly the case. */
  function autoOffset(notes, duration) {
    if (notes.length && notes.every(n => n.t >= 3600) && duration < 3600) return -3600;
    return 0;
  }

  /* ---------- chapters ---------- */
  function chapters(markers, duration, which) {
    let ms = markers.slice().sort((a, b) => a.start - b.start);
    if (which === 'named') ms = ms.filter(m => (m.name || '').trim());
    else if (which !== 'all') ms = ms.filter(m => String(m.color) === String(which));
    const list = ms.map((m, i) => ({ t: m.start, title: ((m.name || m.comment || '').trim() || `Chapter ${i + 1}`).replace(/\s+/g, ' ') }));
    if (!list.length || list[0].t > 0.5) list.unshift({ t: 0, title: 'Intro' }); else list[0].t = 0;
    const problems = [];
    if (list.length < 3) problems.push('YouTube needs at least 3 chapters.');
    list.forEach((c, i) => { const next = i + 1 < list.length ? list[i + 1].t : duration; if (next - c.t < 10) problems.push(`“${c.title}” is shorter than 10 seconds (YouTube’s minimum).`); });
    return { text: list.map(c => `${US.time.toYouTube(c.t)} ${c.title}`).join('\n'), list, problems };
  }

  /* ---------- actions ---------- */
  const outOpts = () => Object.assign({ outputs: ['master', 'v916', 'thumb'], fullSize: true }, US.settings.get('deliver', {}));
  US.actions.register({
    id: 'deliver.pack', tool: 'deliver', title: 'Export the delivery pack', changes: true,
    describe: `Exports the active sequence through ${US.app.is('resolve') ? 'Resolve’s Render Queue' : 'Media Encoder'}: master, vertical 9:16 / square 1:1 / portrait 4:5 versions via ${REFRAME}, a WAV and a thumbnail.`,
    params: { outputs: { type: 'string', default: 'master,v916,thumb', desc: 'Comma list of master, v916, s11, p45, wav, thumb' } },
    examples: ['export the master and a vertical version', 'make the social versions', 'export everything'],
    match(t) {
      if (!/export|deliver|render out|social versions|vertical version|square version/i.test(t)) return null;
      const k = [];
      if (/master|main|16:9|everything|all/i.test(t) || !/vertical|9:16|square|1:1|4:5|portrait|wav|audio|thumbnail/i.test(t)) k.push('master');
      if (/vertical|9:16|reels|tiktok|shorts|social|everything|all/i.test(t)) k.push('v916');
      if (/square|1:1|everything|all/i.test(t)) k.push('s11');
      if (/4:5|portrait|everything|all/i.test(t)) k.push('p45');
      if (/wav|audio|sound|everything|all/i.test(t)) k.push('wav');
      if (/thumbnail|everything|all/i.test(t)) k.push('thumb');
      return { outputs: k.join(',') };
    },
    run: (p, job) => exportPack({ outputs: String(p.outputs).split(',').map(s => s.trim()), fullSize: outOpts().fullSize, suffix: rangeOpts().suffix }, job)
  });
  // track: the video track whose adjustment layers are the ranges; colour: '' all, or one label 0–15; suffix: added to every file name
  // kinds: what counts as a range on the track – 'adjustment' (adjustment layers; in Resolve the range markers), 'text' (text
  // layers / titles) or 'both'; hideText: text layers' track switched off while the renders are sent
  const rangeOpts = () => Object.assign({ preset: '', queueOnly: false, replace: false, track: 'Renders', colour: '', suffix: '', kinds: 'adjustment', hideText: true }, US.settings.get('deliver.ranges', {}));
  /** “adjustment layers”, “text layers” or “adjustment or text layers” (Resolve: range markers / titles) */
  const kindWords = k => (inResolve() ? (k === 'text' ? 'Text titles' : k === 'both' ? 'range markers or Text titles' : 'range markers') : (k === 'text' ? 'text layers' : k === 'both' ? 'adjustment or text layers' : 'adjustment layers'));
  US.actions.register({
    id: 'deliver.ranges', tool: 'deliver', title: 'Render the adjustment-layer ranges', changes: true,
    describe: US.app.is('resolve') ? 'Renders each render range of the active timeline (a duration marker added by Ultra Studio), one after another, each file named after its marker, with the chosen render preset.' : 'Sends each render range of the active sequence (an adjustment layer on the “Renders” track above the edit) to Media Encoder, one after another, each file named after its layer, with the chosen preset.',
    examples: ['render the ranges', 'export each adjustment layer', 'render all the render layers'],
    match: t => /render|export/i.test(t) && /\branges?\b|adjustment layers?|render layers?/i.test(t) ? { _score: 2 } : null,
    run: (p, job) => exportRanges(rangeOpts(), job)
  });
  US.actions.register({
    id: 'deliver.chapters', tool: 'deliver', title: 'Make YouTube chapters from markers',
    describe: 'Builds a YouTube chapter list (0:00 Intro, 1:23 …) from the active sequence’s named markers.',
    examples: ['youtube chapters', 'make chapters from my markers'],
    match: t => /chapter/i.test(t) ? {} : null,
    run: async (p, job) => {
      const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE');
      const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
      const c = chapters(info.markers, info.duration, 'named');
      ui.copy(c.text);
      US.tools.open('deliver', { tab: 'chapters' });
      return { summary: `${c.list.length} chapters copied${c.problems.length ? ' – ' + c.problems[0] : ''}` };
    }
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'deliver', name: 'Deliver', short: 'Deliver', icon: 'deliver', group: 'finish', order: 33,
    blurb: 'Every export in one go, render ranges, YouTube chapters.',
    hostFns: ['encoderPresets', 'encoderListen', 'queueExport', 'queueItemExport', 'startEncoderBatch', 'autoReframe', 'exportFrame', 'guideStatus', 'showGuides', 'addSequenceMarkers', 'removeSequenceMarkers', 'deliverPresets', 'renderRanges', 'rangeTracks', 'rangeTrackOutput', 'addRangeTrack', 'addRenderRange', 'editRenderRange', 'removeRenderRange', 'queueRangeExport', 'presetExtension', 'setPlayhead'],
    create() {
      const v = ui.toolView({ icon: 'deliver', title: 'Deliver', blurb: 'Export everything in one go, render the parts you mark, and make YouTube chapters.' });
      const tabs = ui.segmented({ options: [{ value: 'pack', label: 'Export pack' }, { value: 'ranges', label: 'Render ranges' }, { value: 'chapters', label: 'Chapters' }], value: 'pack', onChange: t => showTab(t) });
      const panes = { pack: h('div.tool-body'), ranges: h('div.tool-body'), chapters: h('div.tool-body') };
      const seqLine = h('div.field-hint');

      /* export pack */
      let o = outOpts(), folder = '';
      const toggles = Object.keys(OUTPUTS).map(k => ui.toggle({ label: OUTPUTS[k].label, value: o.outputs.includes(k), onChange: on => { o.outputs = on ? o.outputs.concat(k) : o.outputs.filter(x => x !== k); US.settings.set('deliver', o); } }));
      // the export folder is shared by the pack and the render ranges
      const folderLines = [];
      const showFolder = () => folderLines.forEach(l => { l.textContent = folder ? `Saving to ${folder}` : 'Saving to Documents › JMG Ultra Studio › Exports › <sequence name and date>'; });
      const folderRow = () => {
        const line = h('div.field-hint'); folderLines.push(line); showFolder();
        return h('div.row', h('div.grow', line), ui.button('Choose folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = US.app.pickFiles({ folder: true, title: 'Where should the exports go?', start: folder || US.fsx.exportsDir() }); if (r[0]) { folder = US.normPath(r[0]); showFolder(); } } catch (e) { ui.showError(e); } } }));
      };
      let lastDir = '';
      const openFolder = () => lastDir && require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + lastDir + '"');
      const openBtn = ui.button('Open export folder', { small: true, icon: 'folder', onClick: openFolder });
      openBtn.classList.add('hidden');
      const packBtn = ui.actionButton('Export', async () => {
        const r = await US.jobs.run({ title: 'Exporting the delivery pack', tool: 'deliver' }, job => exportPack({ outputs: o.outputs, folder, fullSize: o.fullSize, suffix: rangeOpts().suffix }, job));
        if (r && r.dir) { lastDir = r.dir; openBtn.classList.remove('hidden'); }
      });
      panes.pack.append(
        ui.card(h('div.card-title', 'Outputs'), toggles,
          ui.section('More options', [ui.toggle({ label: 'Social versions at full platform size', hint: `1080×1920, 1080×1080, 1080×1350 (or 2160 wide from a 4K edit) instead of ${REFRAME}’s own size.`, value: o.fullSize !== false, onChange: x => { o.fullSize = x; US.settings.set('deliver', o); } })], { open: false }),
          folderRow()),
        ui.note(inResolve() ? 'Vertical, square and portrait versions are made with Resolve’s Smart Reframe as new timelines in “JMG Ultra Studio › Deliver”, so you can tweak them before rendering again. Safe Zones guides are hidden automatically.' : 'Vertical, square and portrait versions are made with Premiere’s Auto Reframe as new sequences in “JMG Ultra Studio › Deliver”, so you can tweak them before re-exporting. Safe Zones guides are hidden automatically.'),
        packBtn, openBtn);

      /* render ranges */
      let ro = rangeOpts(), builtIn = [], resolvePresets = [];
      // a Premiere .epr chosen before can't be used in Resolve (and a Resolve preset not in Premiere): fall back to the first
      if (ro.preset && (inResolve() ? /\.epr$/i.test(ro.preset) : /^(preset|resolve):/.test(ro.preset))) ro.preset = '';
      const saveRo = () => US.settings.set('deliver.ranges', ro);
      const rangeList = h('div'), rangeTrackLine = h('div.field-hint');
      const presetSel = ui.select({ options: [], onChange: v => {
        if (v === '__pick') {
          try { const r = US.app.pickFiles({ title: US.app.is('resolve') ? 'Choose a render preset (.xml)' : 'Choose an export preset (.epr)', start: ro.preset ? path.dirname(ro.preset) : path.dirname(US.fsx.exportsDir()), ext: [US.app.is('resolve') ? 'xml' : 'epr'] }); if (r[0]) ro.preset = US.normPath(r[0]); } catch (e) { ui.showError(e); }
          saveRo(); fillPresets(); return;
        }
        ro.preset = v; saveRo();
      } });
      async function fillPresets() {
        try {
          const p = await US.host.call('deliverPresets');
          builtIn = [{ path: p.h264, name: inResolve() ? 'H.264 – timeline size, high quality' : 'H.264 – Match Source, high bitrate' }, { path: p.youtube1080, name: 'H.264 – YouTube 1080p' }, { path: p.youtube2160, name: 'H.264 – YouTube 4K' }, { path: p.prores, name: 'ProRes 422 HQ – timeline size' }].filter(x => x.path);
          // Resolve: its own render presets (Deliver page) are listed too
          if (inResolve()) resolvePresets = (p.renderPresets || []).filter(x => x && x.path);
        } catch (e) { US.log('warn', 'Built-in export presets not found', String(e && e.message || e), 'deliver'); }
        const mine = inResolve() ? resolvePresets.map(x => ({ path: x.path, name: x.name, from: 'Resolve' })) : userPresets(path.dirname(US.fsx.exportsDir()));
        const opts = builtIn.map(x => ({ value: x.path, label: x.name }))
          .concat(mine.map(x => ({ value: x.path, label: inResolve() ? `${x.name} (Resolve render preset)` : `${x.name} (your ${x.from} preset)` })));
        if (ro.preset && !opts.some(x => x.value === ro.preset)) opts.push({ value: ro.preset, label: `${String(ro.preset).replace(/^preset:/, '').split(/[\\/]/).pop().replace(/\.(epr|xml)$/i, '')} (chosen ${/^preset:/.test(ro.preset) ? 'preset' : 'file'})` });
        opts.push({ value: '__pick', label: 'Choose a preset file…' });
        if (!ro.preset || !opts.some(x => x.value === ro.preset)) ro.preset = opts[0].value === '__pick' ? '' : opts[0].value;
        presetSel.setOptions(opts, ro.preset);
      }
      // the sequence's start timecode, so times read as they do in the Timeline (Resolve starts at 01:00:00:00)
      const zeroOf = {};
      async function seqZero(seq) { if (zeroOf[seq.id] == null) { try { zeroOf[seq.id] = (await US.host.call('storySequenceTiming', { seqId: seq.id })).zero || 0; } catch (e) { zeroOf[seq.id] = 0; } } return zeroOf[seq.id]; }
      const tcOf = (seq, sec, zero) => US.time.toTC(sec + zero, seq.fps || 25);
      /** A time typed as the Timeline shows it (01:00:12:00) or from the sequence start (0:12) → seconds from the start */
      const parseTime = (seq, text, zero) => { const t = US.time.parseTC(String(text || '').trim(), seq.fps || 25); return !isFinite(t) ? NaN : t >= zero ? t - zero : t; };

      const trackSel = ui.select({ options: [{ value: ro.track || 'Renders', label: ro.track || 'Renders' }], value: ro.track || 'Renders', onChange: v => { if (v === NEW_TRACK) { newTrack(); return; } ro.track = v; ro.colour = ''; saveRo(); showRanges(); } });
      const colourSel = ui.select({ options: [{ value: '', label: 'All colours' }], value: '', onChange: v => { ro.colour = v; saveRo(); showRanges(); } });
      const newColour = ui.select({ options: [{ value: '', label: 'Its usual colour' }].concat(ui.LABELS.map(c => ({ value: String(c.i), label: c.name }))), value: '' });
      const suffixIn = ui.input({ placeholder: 'e.g. _1 or _v2', value: ro.suffix || '' });
      suffixIn.addEventListener('input', US.debounce(() => { ro.suffix = cleanSuffix(suffixIn.value); saveRo(); showRanges(); }, 300));
      let shownSig = '';
      const probed = new Set();
      const NEW_TRACK = '\u0000new';
      async function fillTracks(seq) {
        let tracks = [];
        try { tracks = (await US.host.call('rangeTracks', { seqId: seq.id, all: !inResolve(), kinds: ro.kinds })).tracks || []; } catch (e) { /* older host */ }
        // Premiere: every video track, top first – “V3 · Renders · 4 layers”; Resolve: the groups of range markers
        const name = t => (inResolve() ? t.name : `V${t.index + 1}${/^video \d+$/i.test(t.name) || !t.name ? '' : ' · ' + t.name}`);
        const opts = tracks.map(t => ({ value: t.name, label: `${name(t)} · ${t.count ? US.plural(t.count, inResolve() ? 'range' : 'layer') : 'no layers'}` }));
        if (!opts.some(o => o.value.toLowerCase() === String(ro.track || 'Renders').toLowerCase())) opts.unshift({ value: ro.track || 'Renders', label: `${ro.track || 'Renders'} (made on top when you add a range)` });
        if (!inResolve()) opts.push({ value: NEW_TRACK, label: '＋ New track on top for render ranges' });
        trackSel.setOptions(opts, ro.track || 'Renders');
      }
      async function newTrack() {
        const s = US.ctx.sequence; if (!s) { ui.showError(new US.UserError('NO_SEQUENCE')); return; }
        try {
          const r = await US.host.call('addRangeTrack', { seqId: s.id, name: 'Renders' });
          ro.track = r.name; ro.colour = ''; saveRo();
          ui.toast({ type: 'ok', title: `New track “${r.name}” on top (V${r.index + 1})`, text: r.named ? 'Render ranges you add now go on it.' : 'Premiere didn’t let Ultra Studio name it, so it keeps its own name – that’s fine.', timeout: 6000 });
        } catch (e) { ui.showError(e); }
        shownSig = ''; await showRanges();
      }
      /** The ranges on screen; quiet: a refresh by the clock, only redrawn when something changed. */
      async function showRanges(quiet) {
        const s = US.ctx.sequence;
        if (!s) { shownSig = ''; US.clear(rangeList); rangeTrackLine.textContent = ''; rangeList.appendChild(ui.note('Open a sequence in the Timeline first.', 'warn')); return; }
        try {
          const found = await US.host.call('renderRanges', { seqId: s.id, track: ro.track || undefined, kinds: ro.kinds });
          found.ranges = layerColours.apply(s.id, ro.track, found.ranges);
          // a text layer whose words couldn't be read: say once what it's made of (activity log), then drop the detail
          for (const r of found.ranges) if (r.probe) { if (!probed.has(r.nodeId)) { probed.add(r.nodeId); US.log('warn', `Couldn’t read the words of the text layer “${r.name}”`, r.probe, 'deliver'); } delete r.probe; }
          const sig = JSON.stringify([s.id, ro, found]);
          if (quiet && sig === shownSig) return;
          shownSig = sig;
          if (!quiet || !trackSel.options.length) await fillTracks(s);
          const zero = await seqZero(s);
          US.clear(rangeList); rangeTrackLine.textContent = '';
          // colours on this track (Premiere versions that can't say a clip's colour: no filter)
          const labels = [...new Set(found.ranges.map(r => r.label).filter(l => l != null))].sort((x, y) => x - y);
          colourSel.setOptions([{ value: '', label: 'All colours' }].concat(labels.map(l => ({ value: String(l), label: labelName(l) }))), labels.includes(Number(ro.colour)) ? String(ro.colour) : '');
          colourSel.disabled = !labels.length;
          if (!labels.includes(Number(ro.colour))) ro.colour = '';
          const plan = rangePlan(found.ranges, s.name, 'mp4', '', ro);
          if (!found.ranges.length) { rangeList.appendChild(ui.note(inResolve() ? (ro.kinds === 'text' ? `No Text titles on a video track called “${ro.track || 'Renders'}” yet. Name the track with your titles ${ro.track || 'Renders'} (right-click its name), or choose it above.` : 'No render ranges yet. Add one below – each is a marker with a length on the timeline, named after the file it makes.') : `No ${kindWords(ro.kinds)} on “${ro.track || 'Renders'}” yet. Add one below, or choose the track your ${kindWords(ro.kinds)} are on (Song Splitter puts its songs on “Songs”).`, 'info')); return; }
          const left = found.ranges.length - plan.length;
          rangeTrackLine.textContent = `${found.hidden ? 'This track is switched off in the Timeline – ' : ''}${US.plural(plan.length, 'render')}${ro.colour !== '' ? ` in ${labelName(ro.colour)}` : ''}${left ? ` · ${left} left out (${ro.colour !== '' ? 'other colours, ' : ''}switched off or empty)` : ''}${found.colours === false && found.ranges.some(r => r.label == null) ? ' · some colours unknown (set in the Timeline – Premiere doesn’t tell add-ons; use Colour here)' : ''}`;
          const inPlan = new Map(plan.map(p => [p.start + '|' + p.end, p]));
          rangeList.appendChild(h('div.list.ranges-list', found.ranges.slice().sort((x, y) => x.start - y.start).map(r => rangeRow(s, r, inPlan.get(r.start + '|' + r.end), zero))));
        } catch (e) { if (!quiet) ui.showError(e); }
      }
      /** The colour of one range, as a drop-down (the swatch beside the name shows it). */
      function colourMenu(r, edit) {
        const sel = ui.select({ options: ui.LABELS.map(c => ({ value: String(c.i), label: c.name })), value: r.label != null ? String(r.label) : '', placeholder: 'Colour…',
          onChange: v => { const c = ui.LABELS[Number(v)]; if (c && c.i !== r.label) edit({ label: c.i }, `“${r.name}” is now ${c.name}`); } });
        sel.title = 'Change its colour';
        sel.classList.add('range-colour');
        sel.addEventListener('click', e => e.stopPropagation());
        return sel;
      }
      function rangeRow(s, r, p, zero) {
        const btn = (label, title, fn) => h('button.btn.small.ghost', { title, onclick: e => { e.stopPropagation(); fn(); } }, label);
        const colour = r.label != null && ui.LABELS[r.label] ? ui.LABELS[r.label].hex : 'var(--text-3)';
        const act = (title, fn) => US.jobs.run({ title, tool: 'deliver' }, async () => { const x = await fn(); shownSig = ''; await showRanges(); return x; });
        const edit = (args, title) => act(title, async () => {
          const x = await US.host.call('editRenderRange', Object.assign({ seqId: s.id, track: ro.track, nodeId: r.nodeId }, args));
          const now = x && x.range ? x.range : Object.assign({}, r, args);
          layerColours.forget(s.id, ro.track, r);
          const label = args.label != null ? args.label : now.label != null ? now.label : r.label;
          if (label != null) layerColours.remember(s.id, ro.track, [{ name: now.name, start: now.start, end: now.end, label }]);
          return { summary: title };
        });
        return h('div.list-row.clickable' + (p ? '' : '.muted'), { title: 'Go to this range', onclick: () => US.host.call('setPlayhead', { seqId: s.id, seconds: r.start }).catch(e => ui.showError(e)) },
          h('span.swatch', { style: { background: colour } }),
          h('div.list-main', h('div.list-title', p ? p.name : r.name), h('div.list-sub', `${tcOf(s, r.start, zero)} – ${tcOf(s, r.end, zero)} · ${US.fmtDur(r.end - r.start)}${p ? '' : r.disabled ? ' · switched off' : ' · not rendered'}`)),
          h('div.songs-actions', r.kind === 'text' ? h('span.pill', { title: inResolve() ? 'A Text title: rename or move it in the Timeline' : 'A text layer: its name is the words it shows' }, 'Text') : null,
            inResolve() && r.kind === 'text' ? null : btn('Rename', 'Give this range (and its file) a name', async () => { const nm = await ui.promptText({ title: 'Render range name', value: r.name, ok: 'Rename' }); if (nm && nm.trim() && nm.trim() !== r.name) edit({ name: nm.trim() }, `Renamed to “${nm.trim()}”`); }),
            inResolve() && r.kind === 'text' ? null : btn('Times…', 'Change where it starts and ends', async () => {
              const t = await ui.promptText({ title: 'Start and end', label: 'As the Timeline shows them, e.g. ' + tcOf(s, r.start, zero) + ' – ' + tcOf(s, r.end, zero) + '. “In/Out” uses your In and Out points.', value: tcOf(s, r.start, zero) + ' – ' + tcOf(s, r.end, zero), ok: 'Change' });
              if (t == null) return;
              let a, b;
              if (/^\s*in\s*\/?\s*out\s*$/i.test(t)) { const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false }); const sp = newRangeSpan(info, r.start); a = sp.start; b = sp.end; }
              else { const parts = String(t).split(/\s+(?:-|–|—|to)\s+|\s*[–—]\s*/); a = parseTime(s, parts[0], zero); b = parseTime(s, parts[1], zero); }
              if (!(b > a) || a < 0) return ui.toast({ type: 'warn', title: 'Those times don’t make a range.', text: 'Type a start and a later end, like ' + tcOf(s, r.start, zero) + ' – ' + tcOf(s, r.end, zero) + '.' });
              edit({ start: a, end: b }, `“${r.name}” now ${US.fmtDur(a)} – ${US.fmtDur(b)}`);
            }),
            colourMenu(r, edit),
            btn('Delete', 'Take this range off the timeline', () => act(`Deleted “${r.name}”`, async () => { await US.host.call('removeRenderRange', { seqId: s.id, track: ro.track, nodeId: r.nodeId }); layerColours.forget(s.id, ro.track, r); return { summary: `Deleted “${r.name}”` }; }))));
      }
      const rangeName = ui.input({ placeholder: 'Name, e.g. Teaser 30s' });
      const hideTextRow = h('div', ui.toggle({ label: 'Keep the text out of the renders', hint: inResolve() ? 'The titles’ track is switched off while rendering, then on again (with “Start rendering straight away” off it stays off until you’ve rendered).' : 'The track is switched off while the renders go to Media Encoder, then on again – so its text (and any effects on its layers) don’t show in the files.', value: ro.hideText !== false, onChange: x => { ro.hideText = x; saveRo(); } }));
      hideTextRow.classList.toggle('hidden', (ro.kinds || 'adjustment') === 'adjustment');
      const addRange = ui.button('Add a render range', { small: true, icon: 'plus', onClick: async () => {
        const s = US.ctx.sequence; if (!s) return ui.showError(new US.UserError('NO_SEQUENCE'));
        try {
          const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
          const have = (await US.host.call('renderRanges', { seqId: s.id, track: ro.track || undefined, kinds: ro.kinds })).ranges.length;
          const span = newRangeSpan(info, s.playhead);
          const name = rangeName.value.trim() || `Render ${have + 1}`;
          const label = newColour.get() === '' ? undefined : Number(newColour.get());
          const asText = !inResolve() && ro.kinds === 'text';
          const r = await US.host.call('addRenderRange', Object.assign({ seqId: s.id, name, track: ro.track || undefined, label }, asText ? { as: 'text' } : {}, span));
          if (!r.placed) throw new US.UserError('HOST_SCRIPT', { title: 'Premiere didn’t place the render range.', action: 'Check the sequence isn’t locked, then try again.', detail: r.log.join('\n') });
          if (!r.named) ui.toast({ type: 'info', title: `Name the new top track “${ro.track || 'Renders'}”`, text: `Premiere didn’t let Ultra Studio name it. Double-click the track name in the Timeline and type ${ro.track || 'Renders'} – only that track’s layers are rendered.`, timeout: 15000 });
          if (inResolve() && ro.kinds === 'text') ui.toast({ type: 'info', title: 'Added as a range marker', text: 'Resolve doesn’t let add-ons place titles, so the range is a marker with a length. To use a title, add a Text+ to the track yourself.', timeout: 10000 });
          if (r.kind !== 'adjustment' && r.kind !== 'marker' && r.kind !== 'text') ui.toast({ type: 'info', title: 'Added as an invisible clip', text: 'There’s no adjustment layer in this project, so the range is an invisible clip instead. It renders just the same. Add one with File › New › Adjustment Layer if you’d rather.', timeout: 12000 });
          if (label != null) layerColours.remember(s.id, ro.track, [Object.assign({ name, label }, span)]);
          rangeName.value = '';
          US.log('ok', `Render range “${name}” added`, `${US.fmtDur(span.start)} – ${US.fmtDur(span.end)}`, 'deliver');
          shownSig = ''; await showRanges();
        } catch (e) { ui.showError(e); }
      } });
      const rangeBtn = ui.actionButton('Send the renders to Media Encoder', async () => {
        const r = await US.jobs.run({ title: 'Rendering the render ranges', tool: 'deliver' }, job => exportRanges(Object.assign({}, ro, { folder }), job));
        if (r && r.dir) { lastDir = r.dir; rangeOpen.classList.remove('hidden'); }
      });
      const rangeOpen = ui.button('Open export folder', { small: true, icon: 'folder', onClick: openFolder });
      rangeOpen.classList.add('hidden');
      panes.ranges.append(
        ui.card(h('div.row', h('div.grow.card-title', 'Render ranges'), ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: () => { shownSig = ''; showRanges(); } })),
          ui.field('Ranges are', ui.segmented({ options: inResolve() ? [{ value: 'adjustment', label: 'Range markers' }, { value: 'text', label: 'Text titles' }, { value: 'both', label: 'Both' }] : [{ value: 'adjustment', label: 'Adjustment layers' }, { value: 'text', label: 'Text layers' }, { value: 'both', label: 'Both' }],
            value: ro.kinds || 'adjustment', onChange: x => { ro.kinds = x; ro.colour = ''; saveRo(); hideTextRow.classList.toggle('hidden', x === 'adjustment'); shownSig = ''; showRanges(); } }),
            inResolve() ? 'Text titles count when they’re on a video track named like the ranges (e.g. “Renders”); the file is named after the title.' : 'Text layers show their name in the Timeline: each one’s length is a render, named after the words it shows. “Add a render range” then adds a text layer.'),
          hideTextRow,
          h('div.grid2', ui.field(inResolve() ? 'Ranges' : 'Track', trackSel, inResolve() ? '' : 'The video track whose layers are the ranges – or a new one on top.'), ui.field('Colour', colourSel, 'Render only the layers of one colour.')),
          rangeTrackLine, rangeList,
          h('div.row', h('div.grow', rangeName), newColour, addRange),
          ui.note('The list follows the Timeline by itself: add, trim, rename or recolour a layer there and it shows here within a few seconds.', 'info')),
        ui.card(ui.field('Export settings', presetSel, inResolve() ? 'Your own render presets from Resolve’s Deliver page are listed here too.' : 'Presets you save in Media Encoder or Premiere’s Export screen are listed here too.'),
          ui.field('Add to every file name', suffixIn, 'For example _1 or _v2: “Song 1_v2.mp4”. The export pack uses it too.'),
          ui.toggle({ label: 'Start rendering straight away', hint: inResolve() ? 'Off: the renders wait in the Render Queue on the Deliver page until you press Render All.' : 'Off: the renders wait in Media Encoder’s queue until you press its green Start button.', value: !ro.queueOnly, onChange: x => { ro.queueOnly = !x; saveRo(); } }),
          ui.toggle({ label: 'Replace earlier renders with the same name', hint: 'Off: a new copy is saved as “Name (2)”.', value: !!ro.replace, onChange: x => { ro.replace = x; saveRo(); } }),
          folderRow()),
        ui.note(inResolve() ? 'Each render range is a marker with a length on the timeline: its length is the part that renders, its name becomes the file name, and they render one after another in timeline order. Change or delete them here or in the Timeline.' : 'Each adjustment layer on the chosen track marks one render: its length is the part that exports, its name becomes the file name, and they all go to Media Encoder in timeline order. Switch a layer off (Enable in the Timeline) to skip it. Effects you add to a layer show in that render only.'),
        rangeBtn, rangeOpen);
      // refresh by the clock while Render ranges is on screen (layers added or changed in the Timeline show up)
      setInterval(() => { if (!panes.ranges.classList.contains('hidden') && !v.el.closest('.hidden') && !document.hidden && !US.jobs.current) showRanges(true); }, 3000);

      /* chapters */
      const which = ui.select({ options: [{ value: 'named', label: 'Markers that have a name' }, { value: 'all', label: 'All markers' }].concat(ui.MARKER_COLORS.map(c => ({ value: String(c.i), label: c.name + ' markers' }))), value: 'named', onChange: () => buildChapters() });
      const chapterText = h('textarea.input.mono', { rows: 10, readOnly: true });
      const chapterNotes = h('div');
      async function buildChapters() {
        const s = US.ctx.sequence; US.clear(chapterNotes);
        if (!s) { chapterText.value = ''; chapterNotes.appendChild(ui.note('Open a sequence with markers first.', 'warn')); return; }
        try {
          const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
          const c = chapters(info.markers, info.duration, which.get());
          chapterText.value = c.text;
          if (!info.markers.length) chapterNotes.appendChild(ui.note('This sequence has no markers yet. Add a marker (M) at the start of each chapter and type its title in the marker’s name.', 'warn'));
          c.problems.forEach(p => chapterNotes.appendChild(ui.note(p, 'warn')));
        } catch (e) { ui.showError(e); }
      }
      panes.chapters.append(ui.card(ui.field('Use', which), chapterText, h('div.row',
        ui.button('Copy', { kind: 'primary', small: true, onClick: () => { ui.copy(chapterText.value); ui.toast({ type: 'ok', title: 'Chapters copied – paste them into the YouTube description', timeout: 2500 }); } }),
        ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: buildChapters }))), chapterNotes);

      function showTab(t) { Object.entries(panes).forEach(([k, el]) => el.classList.toggle('hidden', k !== t)); tabs.set(t); if (t === 'chapters') buildChapters(); if (t === 'ranges') { fillPresets(); showRanges(); } }
      // another sequence opened while Render ranges is showing: list its ranges
      let shownSeq = null;
      const refreshRanges = US.debounce(() => { if (!panes.ranges.classList.contains('hidden')) showRanges(); }, 400);
      US.bus.on('context', () => { const id = US.ctx.sequence && US.ctx.sequence.id; if (id !== shownSeq) { shownSeq = id; refreshRanges(); } });
      function renderCtx() { seqLine.textContent = US.ctx.sequence ? `Sequence: ${US.ctx.sequence.name} (${US.ctx.sequence.width}×${US.ctx.sequence.height}, ${US.fmtDur(US.ctx.sequence.duration)})` : 'Open a sequence in the Timeline first.'; }
      US.bus.on('context', renderCtx);
      v.body.append(seqLine, tabs, panes.pack, panes.ranges, panes.chapters);
      showTab('pack');
      return { el: v.el, onShow(opt) { renderCtx(); if (opt && opt.tab) showTab(opt.tab); } };
    }
  });

  US.deliver = { parseNotes, autoOffset, chapters, OUTPUTS, rangePlan, userPresets, newRangeSpan, cleanSuffix, layerColours };
})();
