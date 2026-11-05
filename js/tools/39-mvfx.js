/* JMG Ultra Studio – mVFX: the Documentary pack as a tab. Browse the presets (thumbnails painted by the pack's own
   painter), type the words (speaker names from Story offered), pick colours, fonts, size and position, watch the
   preview, then add it at the playhead – or apply a movement or look to the selected clips. Premiere gets native text
   layers (Basic Title) plus PNG art and keyframes; Resolve gets our Fusion templates (installed into its Effects
   Library) inserted at the playhead. Pure parts: 39-mvfx-pack.js, 39-mvfx-fusion.js, 39-mvfx-looks.js. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, fs = require('fs'), path = require('path');
  const RES = US.app.is('resolve');
  const P = () => US.mvfxPack, F = () => US.mvfxFusion, LK = () => US.mvfxLooks;
  const BIN = 'JMG Ultra Studio/mVFX';

  /* ---------- files ---------- */
  /** PNG art lives next to the project ("JMG Ultra Studio mVFX"), like Safe Zones' guides; else Documents › JMG Ultra Studio › mVFX. */
  function artDir() {
    const proj = US.ctx.project && US.ctx.project.path;
    if (proj && !RES) { const d = path.join(path.dirname(proj), 'JMG Ultra Studio mVFX'); try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { /* read-only */ } }
    return US.fsx.ensureDir(path.join(US.fsx.exportsDir(), 'mVFX'));
  }
  async function writePNG(canvas, file) {
    if (fs.existsSync(file)) return file;   // same name = same picture (Windows Premiere holds imported stills open)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    return file;
  }
  /** Paint a preset's picture at W×H to a PNG (art only for titles, the whole look for overlays). -> file */
  async function paintPNG(preset, values, W, H, opts = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    P().paint(c.getContext('2d'), W, H, preset, values, Object.assign({ text: false }, opts));
    const tag = P().hashOf({ id: preset.id, v: values, o: opts, W, H });
    return writePNG(c, path.join(artDir(), `${preset.id}-${tag}.png`));
  }
  async function importPNG(file) {
    const have = await US.host.call('findGuideItem', { path: file });
    if (have) return have;
    const got = await US.host.call('importFiles', { paths: [file], binPath: BIN });
    if (!got.length) throw new US.UserError('HOST_SCRIPT', { title: 'The picture wasn’t imported.', action: 'Try again – or import the PNG by hand from ' + artDir() + '.' });
    return got[0].id;
  }
  /** The .cube of a look, written once to Documents › JMG Ultra Studio › Looks. */
  function lutFile(id) {
    const f = path.join(US.fsx.ensureDir(path.join(US.fsx.exportsDir(), 'Looks')), LK().fileName(id));
    if (!fs.existsSync(f)) fs.writeFileSync(f, LK().cube(id));
    return f;
  }
  const measure = (() => { let ctx = null; return (font, text) => { if (!ctx) ctx = document.createElement('canvas').getContext('2d'); if (!ctx) return text.length * (parseFloat(font.replace(/^bold /, '')) || 20) * 0.55; ctx.font = font; return ctx.measureText(text).width; }; })();
  const fontCheck = f => { try { return document.fonts && document.fonts.check(`12px "${f}"`); } catch (e) { return false; } };

  /* ---------- values and settings ---------- */
  const get = (k, d) => US.settings.get('mvfx.' + k, d), set = (k, x) => US.settings.set('mvfx.' + k, x);
  let fonts = null;
  function fontsNow() { if (!fonts) { const av = P().available(fontCheck); fonts = Object.assign({ serif: av.serif[0], sans: av.sans[0], mono: av.mono[0] }, get('fonts', {})); } return fonts; }
  /** The values for a preset: its defaults, the user's pack-wide colours and fonts, and what they last typed for it. */
  function valuesFor(preset) {
    const v = P().defaults(preset, fontsNow());
    Object.assign(v.colours, get('colours', {}));
    const saved = get('values.' + preset.id, null);
    if (saved) { Object.assign(v.text, saved.text || {}); for (const k of ['scale', 'dx', 'dy', 'duration', 'alpha', 'cx', 'cy', 'seconds']) if (saved[k] != null) v[k] = saved[k]; }
    return v;
  }
  function remember(preset, v) { set('values.' + preset.id, { text: v.text, scale: v.scale, dx: v.dx, dy: v.dy, duration: v.duration, alpha: v.alpha, cx: v.cx, cy: v.cy, seconds: v.seconds }); set('colours', v.colours); set('fonts', v.fonts); fonts = v.fonts; }
  /** Names Story knows (the people in the transcripts), for the name fields. */
  function storyPeople() {
    try {
      const S = US.story; if (!S || !S.loadState) return [];
      const st = S.loadState(), out = new Set();
      for (const tl of st.transcripts || []) { if (!tl.result || !tl.result.speakers) continue; const d = S.namesFor(tl); for (const p of US.storyTimeline.people(tl.result.speakers, d)) if (p.name && !/^Speaker [A-Z]+$/.test(p.name) && !S.isInterviewer({ speakerKey: p.keys[0] })) out.add(p.name); }
      return Array.from(out);
    } catch (e) { return []; }
  }

  /* ---------- doing it ---------- */
  async function seqNow() {
    await US.refreshContext();
    const s = US.ctx.sequence;
    if (!s) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence is open.', action: 'Open one in the Timeline, put the playhead where the title should start.' });
    const info = await US.host.call('sequenceInfo', { seqId: s.id, clips: false });
    return Object.assign({ playhead: s.playhead || 0 }, info, { playhead: s.playhead != null ? s.playhead : 0 });
  }
  /** The clips a movement or look goes on: the selected ones (Resolve: under the playhead), or every clip. */
  async function targets(seqId, scope) {
    const info = await US.host.call('editRead', { seqId });
    let sel = null;
    if (scope !== 'all') {
      sel = await US.host.call('editSelection', { seqId });
      if (!sel.length) throw new US.UserError('NOTHING_FOUND', { title: RES ? 'There’s no clip under the playhead.' : 'No clips are selected in the Timeline.', action: RES ? 'Resolve doesn’t tell add-ons which clips are selected, so the clip under the playhead is used – move the playhead onto one, or choose Every clip.' : 'Select some clips in the Timeline, or choose Every clip.' });
      if (!sel.some(s => s.kind === 'video')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'video' })));
    }
    const ts = US.quickfx.targetsFor(info, sel, 'video');
    if (!ts.length) throw new US.UserError('NOTHING_FOUND', { title: 'No video clips to change.', action: 'Select video clips on unlocked tracks.' });
    return { info, targets: ts };
  }
  /** Resolve: make sure a template file is in the Effects Library (written now, with these values baked in). */
  async function ensureTemplate(tpl) {
    const r = await US.host.call('mvfxTemplates', { write: [tpl] });
    return r;
  }
  /** A title (or a freeze frame's name tag) at `start`. -> the host's result */
  async function addTitle(preset, v, seq, start, seconds, job) {
    if (RES) {
      const tpl = F().title(preset, v, seq);
      job && job.set({ who: 'premiere', msg: 'Writing the template' });
      await ensureTemplate(tpl);
      job && job.set({ msg: 'Inserting it at the playhead' });
      return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, title: { name: tpl.name, inputs: tpl.inputs, kind: 'titles' } });
    }
    const paths = {};
    if ((preset.layers || []).some(l => l.type === 'rect')) { job && job.set({ who: 'computer', msg: 'Painting the rules and bars' }); paths.art = await paintPNG(preset, v, seq.width, seq.height, { text: false, t: 1 }); }
    const layers = P().premiereLayers(preset, v, seq, paths, measure);
    for (const L of layers) if (L.kind === 'still') L.itemId = await importPNG(L.path);
    job && job.set({ who: 'premiere', msg: 'Adding the text layers' });
    return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, layers });
  }
  /** An overlay, background or freeze look at `start` for `seconds`. */
  async function addPlate(preset, v, seq, start, seconds, job, extra = {}) {
    if (RES) {
      const tpl = F().generator(Object.assign({}, preset, extra), v, seq);
      await ensureTemplate(tpl);
      return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, generator: { name: tpl.name, blend: tpl.blend, kind: 'generators' } });
    }
    job && job.set({ who: 'computer', msg: 'Painting it' });
    const file = await paintPNG(Object.assign({}, preset, extra), v, seq.width, seq.height, { text: false, t: 1, frame: 0 });
    const itemId = await importPNG(file);
    const anim = preset.anim === 'drift' ? { type: 'drift', dx: seq.width * 0.03, dy: seq.height * 0.02 } : preset.anim === 'flicker' ? { type: 'flicker' } : extra.burst ? { type: 'burst' } : { type: 'fade', inSec: 0.4, outSec: 0.4 };
    job && job.set({ who: 'premiere', msg: 'Placing it' });
    return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, layers: [{ kind: 'still', itemId, path: file, anim, name: preset.label, blend: preset.blend, alpha: v.alpha != null ? v.alpha : preset.alpha }] });
  }
  /**
   * Apply a preset. opts: {scope: 'selection'|'all' (moves, looks, transitions), at: seconds (default the playhead)}.
   * -> {summary, result}
   */
  async function apply(preset, values, opts = {}, job) {
    const v = values || valuesFor(preset), ready = P().readiness(preset, RES);
    if (!ready.ok) throw new US.UserError('BAD_INPUT', { title: ready.why, action: 'Choose another preset, or do this one in the editor.' });
    const seq = await seqNow(), start = opts.at != null ? opts.at : seq.playhead, seconds = Math.max(0.5, Number(v.duration || preset.duration || 5));
    const where = `at ${US.fmtDur(start)}`;
    if (preset.kind === 'title') {
      const r = await addTitle(preset, v, seq, start, seconds, job);
      return { summary: `${preset.label} added ${where} on ${r.trackName || 'V' + (r.track + 1)}${r.note ? ' · ' + r.note : ''}`, result: r };
    }
    if (preset.kind === 'overlay' || preset.kind === 'background') {
      const r = await addPlate(preset, v, seq, start, seconds, job);
      return { summary: `${preset.label} added ${where} on ${r.trackName || 'V' + (r.track + 1)}${r.note ? ' · ' + r.note : ''}`, result: r };
    }
    if (preset.kind === 'freeze') {
      job && job.set({ who: 'premiere', msg: 'Holding the frame' });
      const out = path.join(artDir(), `freeze-${Math.round(start * 1000)}`);
      const fr = await US.host.call('mvfxFreeze', { seqId: seq.id, at: start, seconds, outBase: out, binPath: BIN });
      const notes = [fr.note].filter(Boolean);
      if (preset.paint) { const r = await addPlate(Object.assign({}, preset, { kind: 'overlay', label: preset.label + ' look', alpha: 1 }), Object.assign({}, v, { alpha: 1 }), seq, start, seconds, job); if (r.note) notes.push(r.note); }
      if (preset.look) { const r = await US.host.call('mvfxLook', { seqId: seq.id, targets: [{ kind: 'video', track: fr.track, start: fr.start }], look: { id: preset.look, lut: lutFile(preset.look), lumetri: LK().LOOKS[preset.look].lumetri, label: LK().LOOKS[preset.look].label } }); if (r.unsupported) notes.push(r.why); }
      if (preset.layers && (v.text.name || '').trim()) await addTitle(Object.assign({}, preset, { kind: 'title', label: preset.label + ' name' }), v, seq, start, seconds, job);
      return { summary: `Frame held for ${seconds} s ${where} on V${fr.track + 1}${notes.length ? ' · ' + notes.join(' · ') : ''}`, result: fr };
    }
    if (preset.kind === 'move') {
      const { info, targets: ts } = await targets(seq.id, opts.scope || 'selection');
      if (RES) {   // only the still punch-in: no keyframes by script
        const r = await US.host.call('editApply', { seqId: seq.id, op: 'motion', params: { scale: preset.move.scale[1] }, targets: ts });
        return { summary: `${preset.label}: ${US.plural(r.done || 0, 'clip')} set to ${preset.move.scale[1]}% (Resolve doesn’t let add-ons keyframe, so it’s a still punch-in)`, result: r };
      }
      let done = 0; const skipped = [];
      for (const t of ts) {
        const r = await US.host.call('mvfxMove', { seqId: seq.id, targets: [t], keys: P().moveKeys(preset, t.end - t.start, info.fps || 25), ease: true });
        done += r.done || 0; skipped.push(...(r.skipped || []));
      }
      return { summary: `${preset.label}: ${US.plural(done, 'clip')}${skipped.length ? ' · ' + skipped.length + ' skipped' : ''}`, result: { done, skipped } };
    }
    if (preset.kind === 'look') {
      const { targets: ts } = await targets(seq.id, opts.scope || 'selection');
      const look = LK().LOOKS[preset.look];
      const r = await US.host.call('mvfxLook', { seqId: seq.id, targets: ts, look: { id: preset.look, lut: lutFile(preset.look), lumetri: look.lumetri, label: look.label } });
      if (r.unsupported) throw new US.UserError('BAD_INPUT', { title: r.why });
      return { summary: `${preset.label}: ${US.plural(r.done || 0, 'clip')}${r.skipped && r.skipped.length ? ' · ' + r.skipped.length + ' skipped' : ''}${RES ? ' (the LUT is on the first node)' : ' (Lumetri Color)'}`, result: r };
    }
    if (preset.kind === 'transition') {
      const secs = Number(v.seconds || preset.seconds || 1), overlay = preset.overlay ? (P().byId(preset.overlay) || { id: preset.overlay, paint: preset.overlay, alpha: 0.9, label: preset.label }) : null;
      if (RES) {
        const r = await addPlate(Object.assign({}, overlay, { label: preset.label, kind: 'overlay' }), Object.assign({}, v, { alpha: v.alpha != null ? v.alpha : overlay.alpha, duration: secs }), seq, Math.max(0, start - secs / 2), secs, job, { burst: true });
        return { summary: `${preset.label} laid over the playhead (${secs} s) on ${r.trackName || 'V' + (r.track + 1)} – Resolve doesn’t let add-ons add transitions, so add the dissolve on the Edit page if you want one`, result: r };
      }
      const { info, targets: ts } = await targets(seq.id, opts.scope || 'selection');
      const places = US.quickfx.transitionPlaces(ts, 'cuts', { frame: 1 / (info.fps || 25) }).filter(p => p.at === 'start');
      if (!places.length) throw new US.UserError('NOTHING_FOUND', { title: 'No cuts between the selected clips.', action: 'Select two clips that meet, or every clip.' });
      let n = 0;
      if (preset.transition) {
        const frames = Math.max(2, Math.round(secs * (info.fps || 25)));
        const r = await US.host.call('editApply', { seqId: seq.id, op: 'transition', params: { name: preset.transition, at: 'start', frames }, targets: places.map(p => p.target) });
        n += r.done || 0;
      }
      if (overlay) for (const p of places) { job && job.check(); await addPlate(Object.assign({}, overlay, { label: preset.label, kind: 'overlay' }), Object.assign({}, v, { alpha: v.alpha != null ? v.alpha : overlay.alpha, duration: secs }), seq, Math.max(0, p.target.start - secs / 2), secs, job, { burst: true }); }
      return { summary: `${preset.label} on ${US.plural(places.length, 'cut')}${preset.transition ? ` (${n} ${preset.transition})` : ''}`, result: { cuts: places.length, done: n } };
    }
    throw new US.UserError('BAD_INPUT', { title: 'Unknown preset kind.' });
  }
  /** Resolve: write every template of the pack into the Effects Library. -> {dir, written, restart} */
  async function installAll(job) {
    const seq = US.ctx.sequence ? await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id, clips: false }) : { width: 1920, height: 1080 };
    const files = F().all({ width: seq.width, height: seq.height });
    job && job.progress(0.3, `Writing ${files.length} templates`);
    const r = await US.host.call('mvfxTemplates', { write: files });
    set('installed', { at: Date.now(), n: r.written.length, dir: r.dir });
    return { summary: `${r.written.length} templates in ${r.dir}${r.restart ? ' – restart Resolve to see them in the Effects Library' : ''}`, result: r };
  }

  /* ---------- the tab ---------- */
  US.addIcon && US.addIcon('mvfx', 'M2.5 4.5h15v11h-15zM2.5 8h15M6 4.5v11M14 4.5v11M8.5 12.5l2-2.5 1.5 1.5 1.5-2');
  US.tools.register({
    id: 'mvfx', name: 'mVFX', short: 'mVFX', icon: 'mvfx', group: 'finish', order: 28.6,
    blurb: 'A documentary titles pack: lower thirds, chapters, dates, overlays, backgrounds, freeze frames, camera moves, transitions and looks – native and editable in the editor.',
    hostFns: ['mvfxApply', 'mvfxFreeze', 'mvfxMove', 'mvfxLook', 'mvfxTemplates', 'editRead', 'editSelection', 'editApply', 'importFiles', 'findGuideItem', 'sequenceInfo'],
    create() {
      const v = ui.toolView({ icon: 'mvfx', title: 'mVFX', blurb: RES ? 'Pick a preset, type the words, add it at the playhead. The pack goes into Resolve’s Effects Library as Fusion titles and generators, so everything stays editable in the Inspector.' : 'Pick a preset, type the words, add it at the playhead. Premiere gets real text layers (edit them in Essential Graphics) with the rules and bars as pictures underneath, and keyframes for the moves.', help: h('div', h('p', 'Nine groups: lower thirds, titles and cards, timelines and dates, overlays, backgrounds, freeze frames, movements, transitions and looks. Click a thumbnail, fill in the words (names from Story are offered), set colours, fonts, size and position, and press the big button.'), h('p', RES ? 'Resolve lays titles and generators at the playhead, 5 seconds long – trim them in the Timeline. Movements can’t be keyframed by add-ons (Punch is a still punch-in) and transitions can’t be added, so those say so. Install the pack once; new templates show after a restart.' : 'Titles go on tracks named “mVFX 1, 2, 3…” above the edit: each line is its own text layer, so you can change the words, font or colour in Essential Graphics. Movements and looks go on the selected clips.')) });
      const status = h('div.pad-status'), say = (t, kind = '') => { status.textContent = t; status.className = 'pad-status' + (kind ? ' ' + kind : ''); };
      let group = get('group', 'lower'), preset = P().byId(get('preset', 'hairline')) || P().PRESETS[0], values = valuesFor(preset), scope = get('scope', 'selection');
      const grid = h('div.mvfx-grid'), editor = h('div.mvfx-editor');
      const scopeSeg = ui.segmented({ value: scope, onChange: x => { scope = x; set('scope', x); }, options: [{ value: 'selection', label: RES ? 'Clip under the playhead' : 'Selected clips' }, { value: 'all', label: 'Every clip' }] });

      /* thumbnails */
      function plate(ctx, W, H, kind) {
        const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#3a3d42'); g.addColorStop(1, '#1b1c1f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (kind === 'footage') { const r = ctx.createRadialGradient(W * 0.6, H * 0.45, 0, W * 0.6, H * 0.45, H * 0.5); r.addColorStop(0, 'rgba(190,160,120,0.9)'); r.addColorStop(1, 'rgba(60,55,50,0)'); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#2a2c30'; ctx.fillRect(W * 0.52, H * 0.55, W * 0.18, H * 0.45); }
      }
      function thumb(p, c, t = 1) {
        const W = c.width, H = c.height, ctx = c.getContext('2d');
        if (!ctx) return;   // no canvas (the headless smoke test)
        ctx.clearRect(0, 0, W, H);
        const vv = p === preset ? values : valuesFor(p);
        if (p.kind === 'background') { P().paint(ctx, W, H, p, vv, { t }); return; }
        plate(ctx, W, H, p.kind === 'title' || p.kind === 'overlay' || p.kind === 'freeze' || p.kind === 'transition' || p.kind === 'look' ? 'footage' : 'plain');
        if (p.kind === 'look') { const id = ctx.getImageData(0, 0, W, H); LK().applyToImageData(p.look, id.data); ctx.putImageData(id, 0, 0); return; }
        if (p.kind === 'move') {
          ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = Math.max(1.5, W / 120); ctx.strokeRect(W * 0.2, H * 0.2, W * 0.6, H * 0.6);
          const m = p.move, s0 = (m.scale ? m.scale[0] : 100) / 100, s1 = (m.scale ? m.scale[1] : 100) / 100;
          ctx.strokeStyle = '#c9a96a'; ctx.setLineDash([4, 3]); ctx.strokeRect(W * (0.5 - 0.3 * s1) - (m.x ? m.x[1] * W : 0), H * (0.5 - 0.3 * s1) - (m.y ? m.y[1] * H : 0), W * 0.6 * s1, H * 0.6 * s1); ctx.setLineDash([]);
          ctx.fillStyle = '#c9a96a'; ctx.font = `bold ${Math.round(H * 0.11)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.fillText(m.drift ? '~' : m.x ? (m.x[1] > 0 ? '→' : '←') : m.y ? (m.y[1] > 0 ? '↓' : '↑') : s1 > s0 ? '+' : '−', W / 2, H * 0.54);
          return;
        }
        if (p.kind === 'transition') { ctx.fillStyle = '#111'; ctx.fillRect(W / 2, 0, W / 2, H); if (p.overlay) { const o = P().byId(p.overlay) || { paint: p.overlay, alpha: 0.9 }; P().paint(ctx, W, H, Object.assign({}, o, { alpha: o.alpha }), vv, { t: 0.5, text: false }); } return; }
        if (p.kind === 'freeze') { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, W, H); if (p.look === 'bw') { const id = ctx.getImageData(0, 0, W, H); LK().applyToImageData('bw', id.data); ctx.putImageData(id, 0, 0); } }
        P().paint(ctx, W, H, p, vv, { t, frame: 0 });
      }
      function drawGrid() {
        US.clear(grid);
        for (const p of P().PRESETS.filter(x => x.group === group)) {
          const c = h('canvas', { width: 240, height: 135 }), ok = P().readiness(p, RES).ok;
          const tile = h('button.mvfx-tile' + (p.id === preset.id ? '.on' : '') + (ok ? '' : '.off'), { title: ok ? p.sub : P().readiness(p, RES).why, onclick: () => choose(p) }, c, h('span.mvfx-tile-label', p.label), h('span.mvfx-tile-sub', p.sub));
          grid.appendChild(tile);
          requestAnimationFrame(() => thumb(p, c));
        }
      }
      const groupSeg = ui.segmented({ value: group, onChange: x => { group = x; set('group', x); drawGrid(); const first = P().PRESETS.find(p => p.group === x); if (first && preset.group !== x) choose(first); }, options: P().GROUPS.map(g => ({ value: g.id, label: g.name, title: g.hint })) });
      groupSeg.classList.add('mvfx-groups');

      /* the editor for the chosen preset */
      const preview = h('canvas.mvfx-preview', { width: 960, height: 540 });
      let playing = null;
      function drawPreview(t = 1) { thumb(preset, preview, t); }
      function play() {
        if (playing) cancelAnimationFrame(playing);
        const t0 = performance.now(), len = Math.max(400, ((preset.inSec || 0.6) + 0.08 * ((preset.layers || []).length || 1)) * 1000 + 300);
        const step = () => { const t = (performance.now() - t0) / len; drawPreview(Math.min(1, t)); if (t < 1) playing = requestAnimationFrame(step); else playing = null; };
        playing = requestAnimationFrame(step);
      }
      function choose(p) {
        if (preset !== p) { preset = p; values = valuesFor(p); set('preset', p.id); }
        drawGrid(); drawEditor(); play();
      }
      function drawEditor() {
        US.clear(editor);
        const ready = P().readiness(preset, RES), people = storyPeople();
        const change = () => { remember(preset, values); drawPreview(1); };
        const fields = (preset.fields || []).map(f => {
          const input = f.multiline ? h('textarea.input', { rows: 4, value: values.text[f.id] || '', oninput: e => { values.text[f.id] = e.target.value; change(); } }) : ui.input({ value: values.text[f.id] || '', placeholder: f.value, onInput: x => { values.text[f.id] = x; change(); } });
          if (f.multiline) input.value = values.text[f.id] || '';
          const pick = people.length && /^(name|who|a|b|c)$/.test(f.id) ? ui.select({ placeholder: 'From Story…', options: people.map(n => ({ value: n, label: US.keep(n) })), onChange: n => { if (!n) return; values.text[f.id] = n; input.value = n; change(); } }) : null;
          return ui.field(f.label, pick ? h('div.row', input, pick) : input);
        });
        const roles = Array.from(new Set((preset.layers || []).filter(l => l.type === 'text').map(l => l.role)));
        const av = P().available(fontCheck);
        const fontSel = roles.map(r => ui.field(P().ROLES[r], ui.select({ value: values.fonts[r], options: av[r].concat(Object.keys(P().FAMILIES).filter(f => P().FAMILIES[f].role === r && !av[r].includes(f))).map(f => ({ value: f, label: f + (av[r].includes(f) ? '' : ' (not on this computer)') })), onChange: x => { values.fonts[r] = x; change(); } })));
        const colourRoles = Array.from(new Set((preset.layers || []).map(l => l.colour).concat(preset.kind === 'freeze' && preset.paint === 'box' ? ['accent'] : [])));
        const colours = colourRoles.map(r => h('label.mvfx-colour', h('input', { type: 'color', value: values.colours[r] || '#ffffff', oninput: e => { values.colours[r] = e.target.value; change(); } }), h('span', { text: 'Text', accent: 'Accent', muted: 'Second line', ink: 'Bar' }[r] || r)));
        const sliders = [];
        if (preset.layers && preset.layers.length) {
          sliders.push(ui.slider({ label: 'Size', min: 0.5, max: 1.8, step: 0.05, value: values.scale || 1, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.scale = x; drawPreview(1); }, onChange: () => change() }));
          sliders.push(h('div.row', ui.slider({ label: 'Across', min: -0.4, max: 0.4, step: 0.01, value: values.dx || 0, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', onInput: x => { values.dx = x; drawPreview(1); }, onChange: () => change() }), ui.slider({ label: 'Up / down', min: -0.4, max: 0.4, step: 0.01, value: values.dy || 0, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', onInput: x => { values.dy = x; drawPreview(1); }, onChange: () => change() })));
        }
        if (preset.kind === 'overlay' || preset.paint === 'paper') sliders.push(ui.slider({ label: 'Strength', min: 0.05, max: 1, step: 0.05, value: values.alpha != null ? values.alpha : (preset.alpha || 1), fmt: x => Math.round(x * 100) + '%', onInput: x => { values.alpha = x; drawPreview(1); }, onChange: () => change() }));
        if (preset.kind === 'freeze' && preset.paint) sliders.push(h('div.row', ui.slider({ label: 'Spot across', min: 0.1, max: 0.9, step: 0.01, value: values.cx != null ? values.cx : 0.5, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.cx = x; drawPreview(1); }, onChange: () => change() }), ui.slider({ label: 'Spot down', min: 0.1, max: 0.9, step: 0.01, value: values.cy != null ? values.cy : 0.5, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.cy = x; drawPreview(1); }, onChange: () => change() })));
        if (preset.kind !== 'move' && preset.kind !== 'look') sliders.push(ui.slider({ label: preset.kind === 'transition' ? 'Length' : 'Length on the timeline', min: 0.3, max: 15, step: 0.1, value: preset.kind === 'transition' ? (values.seconds || preset.seconds || 1) : (values.duration || preset.duration || 5), fmt: x => x.toFixed(1) + ' s', onChange: x => { if (preset.kind === 'transition') values.seconds = x; else values.duration = x; change(); }, hint: RES && preset.kind !== 'transition' ? 'Resolve lays titles and generators 5 s long – trim them in the Timeline.' : '' }));
        const onClips = preset.kind === 'move' || preset.kind === 'look' || (preset.kind === 'transition' && !RES);
        const btnLabel = preset.kind === 'move' ? `Apply ${preset.label}` : preset.kind === 'look' ? `Apply the ${preset.label} look` : preset.kind === 'transition' ? (RES ? `Lay ${preset.label} over the playhead` : `Add ${preset.label} at the cuts`) : preset.kind === 'freeze' ? 'Hold the frame at the playhead' : `Add ${preset.label} at the playhead`;
        const go = ui.actionButton(btnLabel, () => US.jobs.run({ title: `mVFX: ${preset.label}`, tool: 'mvfx' }, async job => { const r = await apply(preset, values, { scope }, job); say(r.summary, 'ok'); return r; }));
        if (!ready.ok) go.setEnabled(false);
        editor.append(
          h('div.mvfx-editor-head', h('div.mvfx-editor-title', preset.label), h('div.field-hint', preset.sub)),
          h('div.mvfx-preview-wrap', preview, h('button.btn.small.ghost.mvfx-play', { title: 'Play the animation', onclick: play }, US.icon('play', 14), h('span', 'Play'))),
          !ready.ok ? ui.note(ready.why, 'warn') : null,
          fields.length ? ui.card(...fields) : null,
          (colours.length || fontSel.length) ? ui.section('Colours and fonts', [colours.length ? h('div.mvfx-colours', colours) : null, ...fontSel], { open: false, hint: 'for the whole pack' }) : null,
          sliders.length ? ui.card(...sliders) : null,
          onClips ? ui.card(h('div.field-label', 'Apply to'), scopeSeg) : null,
          go, status);
        drawPreview(1);
      }
      const install = RES ? ui.section('Resolve’s Effects Library', [h('div.field-hint', 'Every preset is also a Fusion title or generator you can drag from Effects Library › Titles / Generators › JMG Ultra Studio. The one you add from here is written (with your words in it) just before it’s inserted.'), h('div.row', { style: { marginTop: '6px' } }, ui.button('Install the whole pack', { small: true, icon: 'check', onClick: () => US.jobs.run({ title: 'mVFX: install the pack', tool: 'mvfx' }, async job => { const r = await installAll(job); say(r.summary, 'ok'); return r; }) }), h('span.field-hint', (() => { const i = get('installed', null); return i ? `${i.n} templates installed ${new Date(i.at).toLocaleDateString()}` : 'not installed yet'; })()))], { open: !get('installed', null), hint: 'Fusion templates' }) : null;
      v.body.append(groupSeg, grid, editor, install);
      drawGrid(); drawEditor();
      return { el: v.el, onShow() { drawPreview(1); } };
    }
  });

  US.mvfx = { apply, installAll, valuesFor, storyPeople, artDir, lutFile, paintPNG };
})();
