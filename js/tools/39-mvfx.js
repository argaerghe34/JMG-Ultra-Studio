/* JMG Ultra Studio – mVFX: the Documentary pack as a tab. Browse the presets (every tile plays, drawn by the pack's own
   painter), type the words (speaker names from Story offered), pick colours, fonts, size and position, then add it at
   the playhead – from the bar that stays at the bottom, the + on a tile, a double-click, or by dragging the tile out
   to the editor – or apply a movement or look to the selected clips (or the clip under the playhead).
   The animated titles, dates, credits and marks (39-mvfx-motion.js) are drawn here frame by frame and given to the
   editor as one clip with transparency (a PNG sequence at the sequence's size and frame rate) – the same in Premiere
   and Resolve; neither editor can animate its own text letter by letter from an add-on. The Plain text group still
   makes the editor's own text layers (Premiere: Basic Title plus PNG art and keyframes; Resolve: our Fusion templates),
   and in Premiere an animated title can be added with its words as such text layers too (editable in Properties).
   Film grain and Dust & scratches move: drawn frame by frame (a short loop, then the same frames linked again).
   Pure parts: 39-mvfx-motion.js, 39-mvfx-pack.js, 39-mvfx-fusion.js, 39-mvfx-looks.js. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, fs = require('fs'), path = require('path');
  const RES = US.app.is('resolve');
  const P = () => US.mvfxPack, F = () => US.mvfxFusion, LK = () => US.mvfxLooks, M = () => US.mvfxMotion;
  const BIN = 'JMG Ultra Studio/mVFX';

  /* ---------- files ---------- */
  /** Pictures and title clips live in the project's own "JMG Ultra Studio" folder (so they travel with it), in mVFX; else Documents › JMG Ultra Studio › mVFX. */
  function artDir() {
    const proj = US.ctx.project && US.ctx.project.path;
    if (proj && !RES) { const d = path.join(path.dirname(proj), 'JMG Ultra Studio', 'mVFX'); try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { /* read-only */ } }
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
  function fontsNow() { if (!fonts) { const av = P().available(fontCheck); fonts = Object.assign({ serif: av.serif[0], sans: av.sans[0], mono: av.mono[0], hand: av.hand[0] }, get('fonts', {})); } return fonts; }
  /** The values for a preset: its defaults, the user's pack-wide colours and fonts, and what they last typed for it. */
  function valuesFor(preset) {
    const v = P().defaults(preset, fontsNow());
    Object.assign(v.colours, get('colours', {}));
    const saved = get('values.' + preset.id, null);
    if (saved) { Object.assign(v.text, saved.text || {}); for (const k of ['scale', 'dx', 'dy', 'duration', 'alpha', 'cx', 'cy', 'seconds', 'shadow', 'rot', 'stretch', 'push', 'editable']) if (saved[k] != null) v[k] = saved[k]; if (saved.opt) v.opt = Object.assign(v.opt || {}, saved.opt); }
    return v;
  }
  function remember(preset, v) { set('values.' + preset.id, { text: v.text, scale: v.scale, dx: v.dx, dy: v.dy, duration: v.duration, alpha: v.alpha, cx: v.cx, cy: v.cy, seconds: v.seconds, shadow: v.shadow, rot: v.rot, stretch: v.stretch, opt: v.opt, push: v.push, editable: v.editable }); set('colours', v.colours); set('fonts', v.fonts); fonts = v.fonts; }
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
  /** The top video clip under `at` that isn't one of ours (an "mVFX n" track). info: editRead's. -> {kind, track, start, end} | null */
  function clipUnder(info, at) {
    const tracks = (info.video || []).slice().sort((a, b) => (b.index || 0) - (a.index || 0));
    for (const t of tracks) {
      if (/^mVFX \d+$/i.test(String(t.name || '').trim()) || t.locked) continue;
      const c = (t.clips || []).find(x => x.start <= at + 1e-6 && x.end > at + 1e-6);
      if (c) return { kind: 'video', track: t.index != null ? t.index : 0, start: c.start, end: c.end };
    }
    return null;
  }
  /**
   * The clips a movement or look goes on: the selected ones – or, when nothing is selected, the clip under the playhead
   * (Resolve: always the clip under the playhead) – or every clip. -> {info, targets, how (said in the result)}
   */
  async function targets(seqId, scope, playhead) {
    const info = await US.host.call('editRead', { seqId });
    let sel = null, how = '';
    if (scope !== 'all') {
      sel = await US.host.call('editSelection', { seqId });
      if (!sel.length && !RES && playhead != null) { const u = clipUnder(info, playhead); if (u) { sel = [u]; how = 'nothing was selected, so it went on the clip under the playhead'; } }
      if (!sel.length) throw new US.UserError('NOTHING_FOUND', { title: RES ? 'There’s no clip under the playhead.' : 'No clips are selected, and there’s no clip under the playhead.', action: RES ? 'Resolve doesn’t tell add-ons which clips are selected, so the clip under the playhead is used – move the playhead onto one, or choose Every clip.' : 'Select some clips in the Timeline or put the playhead on one, or choose Every clip.' });
      if (!sel.some(s => s.kind === 'video')) sel = sel.concat(sel.map(s => Object.assign({}, s, { kind: 'video' })));
    }
    const ts = US.quickfx.targetsFor(info, sel, 'video');
    if (!ts.length) throw new US.UserError('NOTHING_FOUND', { title: 'No video clips to change.', action: 'Select video clips on unlocked tracks.' });
    return { info, targets: ts, how };
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
  /** What decides how an animated title looks – the same values give the same frames (so they're drawn once). */
  const motionKey = (preset, v, W, H, fps, total, art) => P().hashOf(Object.assign({ id: preset.id, t: v.text, c: v.colours, f: v.fonts, s: [v.scale, v.dx, v.dy, v.shadow, v.rot, v.stretch], o: v.opt, W, H, fps, total, e: 1 }, art ? { art: 1 } : {}));
  /**
   * Draw an animated title's frames as PNGs with transparency (the still stretch in the middle is one picture, linked).
   * opts.text === false: the rules and strokes only (the words go on as the editor's own text layers).
   * -> {dir, first, frames, drawn, reused, scene}
   */
  async function renderMotion(preset, v, size, total, job, opts = {}) {
    const W = size.width, H = size.height, fps = Number(size.fps) || 25, artOnly = opts.text === false;
    const dir = path.join(artDir(), `${preset.id}-${motionKey(preset, v, W, H, fps, total, artOnly)}`), file = i => path.join(dir, `${preset.id}_${String(i + 1).padStart(4, '0')}.png`), done = path.join(dir, 'title.json');
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) throw new US.UserError('HOST_SCRIPT', { title: 'The title couldn’t be drawn.', action: 'Close and reopen the panel, then try again.', detail: 'no 2D canvas' });
    const scene = M().prepare(ctx, W, H, preset, v, total, artOnly ? { text: false } : null), list = M().frames(scene, fps);
    if (fs.existsSync(done) && fs.existsSync(file(list.length - 1))) return { dir, first: file(0), frames: list.length, drawn: 0, reused: true, scene };
    fs.mkdirSync(dir, { recursive: true });
    let drawn = 0;
    for (const fr of list) {
      job && job.check && job.check();
      if (fr.same != null) { try { fs.linkSync(file(fr.same), file(fr.i)); } catch (e) { fs.copyFileSync(file(fr.same), file(fr.i)); } continue; }
      ctx.clearRect(0, 0, W, H);
      M().draw(ctx, scene, fr.t);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      fs.writeFileSync(file(fr.i), Buffer.from(await blob.arrayBuffer()));
      drawn++;
      job && job.progress(0.05 + 0.75 * (fr.i + 1) / list.length, `Drawing the title · frame ${fr.i + 1} of ${list.length}`);
    }
    // what made it: lets the tab load a title's words back, and marks the folder complete
    fs.writeFileSync(done, JSON.stringify({ preset: preset.id, values: { text: v.text, colours: v.colours, fonts: v.fonts, scale: v.scale, dx: v.dx, dy: v.dy, shadow: v.shadow, rot: v.rot, stretch: v.stretch, opt: v.opt, duration: total }, width: W, height: H, fps, frames: list.length, artOnly: artOnly || undefined }, null, 1));
    return { dir, first: file(0), frames: list.length, drawn, reused: false, scene };
  }
  /** An animated title at `start`: drawn, imported as one clip, laid on a free mVFX track (Premiere: with a slow push in if asked). */
  async function addMotion(preset, v, seq, start, seconds, job, beforePlacing) {
    job && job.set({ who: 'computer', msg: 'Drawing the title' });
    const fps = seq.fps || 25, r = await renderMotion(preset, v, { width: seq.width, height: seq.height, fps }, seconds, job);
    if (beforePlacing) await beforePlacing();
    job && job.set({ who: 'premiere', msg: 'Placing it' }); job && job.progress(0.85);
    const name = `${preset.label} · ${String(Object.values(v.text || {})[0] || '').replace(/\s+/g, ' ').slice(0, 40)}`.replace(/ · $/, '');
    const out = await US.host.call('mvfxClip', { seqId: seq.id, first: r.first, frames: r.frames, fps, start, seconds: r.frames / fps, name, binPath: BIN });
    const notes = [out.note].filter(Boolean);
    if (v.push && !RES) {
      const len = out.end - out.start, mv = await US.host.call('mvfxMove', { seqId: seq.id, targets: [{ kind: 'video', track: out.track, start: out.start, end: out.end }], keys: [{ at: 0, scale: 100, x: 0, y: 0 }, { at: Math.max(0.1, len - 1 / fps), scale: 104, x: 0, y: 0 }], ease: false });
      if (!mv.done) notes.push('the slow push wasn’t added');
    }
    return Object.assign(out, { dir: r.dir, frames: r.frames, drawn: r.drawn, note: notes.join(' · ') });
  }
  /** A canvas context that only measures (for laying a title out without drawing it), or null. */
  const measureCtx = (() => { let ctx; return () => { if (ctx === undefined) { try { ctx = document.createElement('canvas').getContext('2d') || null; } catch (e) { ctx = null; } } return ctx; }; })();
  const MAX_TEXT_LAYERS = 8;
  /**
   * Can this animated title's words be the editor's own text layers (Premiere: editable in Properties)?
   * -> {ok, layers (how many text layers), why}
   */
  function editablePlan(preset, v, size) {
    if (preset.kind !== 'motion') return { ok: false, layers: 0, why: '' };
    if (RES) return { ok: false, layers: 0, why: 'In Resolve an animated title is one clip – the Plain text presets are Fusion titles you can change in the Inspector.' };
    const ctx = measureCtx();
    if (!ctx) return { ok: false, layers: 0, why: '' };
    const W = (size && size.width) || 1920, H = (size && size.height) || 1080, n = M().nativeText(M().prepare(ctx, W, H, preset, v, Number(v.duration || preset.duration || 5))).length;
    if (!n) return { ok: false, layers: 0, why: '' };
    if (n > MAX_TEXT_LAYERS) return { ok: false, layers: n, why: `This one is made of ${n} separate pieces of text – too many to be text layers, so it’s added as one clip.` };
    return { ok: true, layers: n, why: '' };
  }
  /**
   * Premiere: an animated title with its words as Premiere's own text layers (Basic Title: words, font, size and
   * colour change in the Properties panel). The rules, strokes and bars are still drawn frame by frame and laid as one
   * clip underneath; each piece of text sits where the design puts it and fades (or rises) in when its letters would.
   */
  async function addEditable(preset, v, seq, start, seconds, job) {
    const fps = seq.fps || 25, size = { width: seq.width, height: seq.height, fps }, ctx = measureCtx();
    if (!ctx) throw new US.UserError('HOST_SCRIPT', { title: 'The title couldn’t be laid out.', action: 'Close and reopen the panel, then try again.', detail: 'no 2D canvas' });
    const scene = M().prepare(ctx, seq.width, seq.height, preset, v, seconds), texts = M().nativeText(scene);
    if (!texts.length) throw new US.UserError('BAD_INPUT', { title: 'There are no words to add.', action: 'Type some words first.' });
    let art = null, len = Math.round(seconds * fps) / fps;
    if (M().hasArt(scene)) {
      job && job.set({ who: 'computer', msg: 'Drawing the rules and strokes' });
      const r = await renderMotion(preset, v, size, seconds, job, { text: false });
      job && job.set({ who: 'premiere', msg: 'Placing them' }); job && job.progress(0.8);
      art = await US.host.call('mvfxClip', { seqId: seq.id, first: r.first, frames: r.frames, fps, start, seconds: r.frames / fps, name: `${preset.label} · art`, binPath: BIN });
      len = art.end - art.start;
    }
    job && job.set({ who: 'premiere', msg: 'Adding the text layers' }); job && job.progress(0.9);
    const layers = texts.map(t => ({ kind: 'text', text: t.text, family: t.family, font: P().psName(t.family, t.bold), bold: t.bold, size: t.px, colour: t.colour, x: t.cx, y: t.cy, width: t.width, align: 'centre', tracking: t.tracking, anim: t.anim, name: t.text.split('\n')[0].slice(0, 40) }));
    const out = await US.host.call('mvfxApply', { seqId: seq.id, start, seconds: len, name: preset.label, layers });
    if (art) { out.art = art; out.tracks = [art.track].concat(out.tracks || []); }
    return Object.assign(out, { editable: true, textLayers: layers.length, note: [art && art.note, out.note].filter(Boolean).join(' · ') });
  }
  /**
   * A moving overlay's frames (film grain, dust and scratches) as PNGs: a short loop of different frames, drawn once
   * for this size and frame rate, then the same pictures linked again for as long as the clip runs (no extra disk).
   * -> {dir, first, frames, drawn, reused}
   */
  async function renderFilm(preset, size, seconds, job) {
    const W = size.width, H = size.height, fps = Number(size.fps) || 25, plan = P().filmPlan(preset, seconds, fps), pad = i => String(i + 1).padStart(4, '0');
    const dir = path.join(artDir(), `${preset.id}-film-${P().hashOf({ id: preset.id, paint: preset.paint, W, H, fps, n: plan.total, loop: plan.loop, e: 1 })}`);
    const loopFile = k => path.join(dir, 'loop', `${preset.id}-loop_${pad(k)}.png`), file = i => path.join(dir, `${preset.id}_${pad(i)}.png`), done = path.join(dir, 'film.json');
    if (fs.existsSync(done) && fs.existsSync(file(plan.total - 1))) return { dir, first: file(0), frames: plan.total, drawn: 0, reused: true };
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) throw new US.UserError('HOST_SCRIPT', { title: 'The overlay couldn’t be drawn.', action: 'Close and reopen the panel, then try again.', detail: 'no 2D canvas' });
    fs.mkdirSync(path.join(dir, 'loop'), { recursive: true });
    let drawn = 0;
    for (let k = 0; k < plan.loop; k++) {
      job && job.check && job.check();
      ctx.clearRect(0, 0, W, H);
      P().paint(ctx, W, H, preset, { alpha: 1 }, { text: false, t: 1, frame: k, loop: plan.loop });   // full strength: the clip's opacity is the Strength
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      fs.writeFileSync(loopFile(k), Buffer.from(await blob.arrayBuffer()));
      drawn++;
      job && job.progress(0.05 + 0.75 * (k + 1) / plan.loop, `Drawing ${preset.label.toLowerCase()} · frame ${k + 1} of ${plan.loop}`);
    }
    for (let i = 0; i < plan.total; i++) {
      const from = loopFile(plan.of(i)), to = file(i);
      try { fs.unlinkSync(to); } catch (e) { /* not there */ }
      try { fs.linkSync(from, to); } catch (e) { fs.copyFileSync(from, to); }
    }
    fs.writeFileSync(done, JSON.stringify({ film: preset.id, width: W, height: H, fps, frames: plan.total, loop: plan.loop }, null, 1));
    return { dir, first: file(0), frames: plan.total, drawn, reused: false };
  }
  /**
   * The animated title that's selected in the Timeline (Resolve: under the playhead): what it was made from, read from
   * the title.json beside its frames. -> {preset, values, target: {kind, track, start, end}}
   */
  async function selectedTitle() {
    const seq = await seqNow(), sel = (await US.host.call('editSelection', { seqId: seq.id })).filter(x => x.kind === 'video');
    const none = () => new US.UserError('NOTHING_FOUND', { title: RES ? 'There’s no animated title under the playhead.' : 'No animated title is selected.', action: RES ? 'Put the playhead on a title this tab added (on an mVFX track), then try again.' : 'Click a title this tab added (on an mVFX track) in the Timeline, then try again.' });
    if (!sel.length) throw none();
    const info = await US.host.call('sequenceInfo', { seqId: seq.id }), half = 0.5 / (info.fps || 25);
    for (const x of sel) {
      const tr = (info.video || []).find(t => t.index === x.track), clip = tr && (tr.clips || []).find(c => Math.abs(c.start - x.start) <= half);
      if (!clip || !clip.path) continue;
      let dir = String(clip.path); try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir); } catch (e) { dir = path.dirname(dir); }
      const file = path.join(dir, 'title.json');
      if (!fs.existsSync(file)) continue;
      const made = JSON.parse(fs.readFileSync(file, 'utf8')), preset = P().byId(made.preset);
      if (!preset) continue;
      if (made.artOnly) throw new US.UserError('BAD_INPUT', { title: 'This title’s words are text layers.', action: 'Click a text layer above it in the Timeline and change the words in Premiere’s Properties panel.' });
      const values = valuesFor(preset);
      Object.assign(values.text, made.values.text || {}); Object.assign(values.colours, made.values.colours || {}); Object.assign(values.fonts, made.values.fonts || {});
      for (const k of ['scale', 'dx', 'dy', 'shadow', 'rot', 'stretch', 'duration']) if (made.values[k] != null) values[k] = made.values[k];
      if (made.values.opt) values.opt = Object.assign({}, values.opt, made.values.opt);
      return { preset, values, target: { kind: 'video', track: x.track, start: clip.start, end: clip.end } };
    }
    throw none();
  }
  /** An overlay, background or freeze look at `start` for `seconds`. */
  async function addPlate(preset, v, seq, start, seconds, job, extra = {}) {
    if (RES) {
      const tpl = F().generator(Object.assign({}, preset, extra), v, seq);
      await ensureTemplate(tpl);
      return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, generator: { name: tpl.name, blend: tpl.blend, kind: 'generators' } });
    }
    const strength = v.alpha != null ? v.alpha : (preset.alpha != null ? preset.alpha : 1);
    if (preset.film) {   // moving film: frames drawn once (a loop), laid as one clip; its opacity is the Strength
      job && job.set({ who: 'computer', msg: `Drawing ${preset.label.toLowerCase()}` });
      const fps = seq.fps || 25, r = await renderFilm(preset, { width: seq.width, height: seq.height, fps }, seconds, job);
      job && job.set({ who: 'premiere', msg: 'Placing it' }); job && job.progress(0.85);
      const fade = extra.burst ? { type: 'burst', peak: strength } : { type: 'fade', inSec: 0.4, outSec: 0.4, peak: strength };
      const out = await US.host.call('mvfxClip', { seqId: seq.id, first: r.first, frames: r.frames, fps, start, seconds: r.frames / fps, name: preset.label, binPath: BIN, blend: preset.blend, alpha: strength, anim: fade });
      return Object.assign(out, { placed: 1, moving: true, dir: r.dir, frames: r.frames, drawn: r.drawn });
    }
    job && job.set({ who: 'computer', msg: 'Painting it' });
    const file = await paintPNG(Object.assign({}, preset, extra), v, seq.width, seq.height, { text: false, t: 1, frame: 0 });
    const itemId = await importPNG(file);
    job && job.set({ who: 'premiere', msg: 'Placing it' });
    // the Strength is painted into the picture, so the layer itself stays at full opacity
    return US.host.call('mvfxApply', { seqId: seq.id, start, seconds, name: preset.label, layers: [{ kind: 'still', itemId, path: file, anim: plateAnim(preset, seq, extra), name: preset.label, blend: preset.blend }] });
  }
  /** How a picture layer comes and goes in Premiere: a light leak drifts, flicker flickers, a wash over a cut swells, the rest fade. */
  function plateAnim(preset, seq, extra = {}) {
    return preset.anim === 'drift' ? { type: 'drift', dx: (seq.width || 1920) * 0.03, dy: (seq.height || 1080) * 0.02 } : preset.anim === 'flicker' ? { type: 'flicker' } : extra.burst ? { type: 'burst' } : { type: 'fade', inSec: 0.4, outSec: 0.4 };
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
    if (preset.kind === 'motion') {
      // replacing a title already on the timeline: the new one is drawn first, then the old clip goes and the new takes its place
      const old = opts.replace, at = old ? old.start : start;
      if (v.editable && !old && editablePlan(preset, v, seq).ok) {
        const r = await addEditable(preset, v, seq, start, seconds, job);
        return { summary: `${preset.label} added ${where} as ${US.plural(r.textLayers, 'text layer')} you can change in Properties${r.art ? ', with its lines drawn underneath' : ''} (${r.trackName || 'V' + (r.track + 1)} up)${r.note ? ' · ' + r.note : ''}`, result: r };
      }
      const r = await addMotion(preset, v, seq, at, seconds, job, old ? async () => { const x = await US.host.call('editApply', { seqId: seq.id, op: 'remove', params: { ripple: false }, targets: [old] }); if (!x.done) throw new US.UserError('HOST_SCRIPT', { title: 'The old title couldn’t be removed.', action: 'Delete it in the Timeline, then add the new one at the playhead.', detail: JSON.stringify(x.skipped || x.log || '') }); } : null);
      if (old) return { summary: `${preset.label} replaced at ${US.fmtDur(at)} on ${r.trackName || 'V' + (r.track + 1)}${r.note ? ' · ' + r.note : ''}`, result: r };
      return { summary: `${preset.label} added ${where} on ${r.trackName || 'V' + (r.track + 1)}${r.note ? ' · ' + r.note : ''}`, result: r };
    }
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
      const { info, targets: ts, how } = await targets(seq.id, opts.scope || 'selection', start);
      if (RES) {   // only the still punch-in: no keyframes by script
        const r = await US.host.call('editApply', { seqId: seq.id, op: 'motion', params: { scale: preset.move.scale[1] }, targets: ts });
        return { summary: `${preset.label}: ${US.plural(r.done || 0, 'clip')} set to ${preset.move.scale[1]}% (Resolve doesn’t let add-ons keyframe, so it’s a still punch-in)`, result: r };
      }
      let done = 0; const skipped = [];
      for (const t of ts) {
        const r = await US.host.call('mvfxMove', { seqId: seq.id, targets: [t], keys: P().moveKeys(preset, t.end - t.start, info.fps || 25), ease: true });
        done += r.done || 0; skipped.push(...(r.skipped || []));
      }
      return { summary: `${preset.label}: ${US.plural(done, 'clip')}${skipped.length ? ' · ' + skipped.length + ' skipped' : ''}${how ? ' – ' + how : ''}`, result: { done, skipped } };
    }
    if (preset.kind === 'look') {
      const { targets: ts, how } = await targets(seq.id, opts.scope || 'selection', start);
      const look = LK().LOOKS[preset.look];
      const r = await US.host.call('mvfxLook', { seqId: seq.id, targets: ts, look: { id: preset.look, lut: lutFile(preset.look), lumetri: look.lumetri, label: look.label } });
      if (r.unsupported) throw new US.UserError('BAD_INPUT', { title: r.why });
      return { summary: `${preset.label}: ${US.plural(r.done || 0, 'clip')}${r.skipped && r.skipped.length ? ' · ' + r.skipped.length + ' skipped' : ''}${RES ? ' (the LUT is on the first node)' : ' (Lumetri Color)'}${how ? ' – ' + how : ''}`, result: r };
    }
    if (preset.kind === 'transition') {
      const secs = Number(v.seconds || preset.seconds || 1), overlay = preset.overlay ? (P().byId(preset.overlay) || { id: preset.overlay, paint: preset.overlay, alpha: 0.9, label: preset.label }) : null;
      if (RES) {
        const r = await addPlate(Object.assign({}, overlay, { label: preset.label, kind: 'overlay' }), Object.assign({}, v, { alpha: v.alpha != null ? v.alpha : overlay.alpha, duration: secs }), seq, Math.max(0, start - secs / 2), secs, job, { burst: true });
        return { summary: `${preset.label} laid over the playhead (${secs} s) on ${r.trackName || 'V' + (r.track + 1)} – Resolve doesn’t let add-ons add transitions, so add the dissolve on the Edit page if you want one`, result: r };
      }
      const { info, targets: ts } = await targets(seq.id, opts.scope || 'selection', start);
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
    blurb: 'A documentary titles pack: animated names, titles, dates, timelines, quotes, credits and hand-drawn marks, plus moving film grain and dust, overlays, backgrounds, freeze frames, camera moves, transitions and looks.',
    hostFns: ['mvfxClip', 'mvfxApply', 'mvfxDropped', 'mvfxFreeze', 'mvfxMove', 'mvfxLook', 'mvfxTemplates', 'editRead', 'editSelection', 'editApply', 'importFiles', 'findGuideItem', 'sequenceInfo'],
    create() {
      const v = ui.toolView({ icon: 'mvfx', title: 'mVFX', blurb: 'Pick a preset, type the words, then add it: press the button in the bar at the bottom, the + on a tile, double-click a tile, or drag it out to the editor. Names, titles, dates, quotes, credits and marks arrive animated; film grain and dust move like real film; movements and looks go on the clips you select.', help: h('div', h('p', 'Twelve groups: names, titles, dates, quotes and credits, marks, overlays, backgrounds, freeze frames, movements, transitions, looks and plain text. Every tile plays what it does. Click one, fill in the words (names from Story are offered), set colours, fonts, size and position.'), h('p', 'Four ways to add it: the button in the bar at the bottom (always in view), the + on a tile, a double-click on a tile, or dragging a tile out to the editor. A dragged picture (vignette, letterbox, film gate, paper, scan lines, light leaks, backgrounds) lands where you drop it; everything else goes at the playhead, or on the selected clips (the clip under the playhead when nothing is selected) – an editor doesn’t tell a panel where a drop lands.'), h('p', RES ? 'Resolve lays titles and generators at the playhead, 5 seconds long – trim them in the Timeline. Plain text presets are Fusion titles you can change in the Inspector. Movements can’t be keyframed by add-ons (Punch is a still punch-in) and transitions can’t be added, so those say so. Install the pack once; new templates show after a restart.' : 'Text you can change in Premiere’s Properties panel: every Plain text preset, and any animated title with “Words as text layers” switched on (its letters then fade in together instead of one by one). Each line is Premiere’s own text on tracks named “mVFX 1, 2, 3…” above the edit.')) });
      const status = h('div.pad-status'), say = (t, kind = '') => { status.textContent = US.say(t); status.className = 'pad-status' + (kind ? ' ' + kind : ''); };
      let group = get('group', 'names'), preset = P().byId(get('preset', 'nm-rule')) || P().PRESETS[0], values = valuesFor(preset), scope = get('scope', 'selection');
      if (!P().GROUPS.some(g => g.id === group)) group = preset.group;   // a group from an older version
      const grid = h('div.mvfx-grid'), editor = h('div.mvfx-editor'), bar = h('div.mvfx-bar');
      let replacing = null;   // the title on the timeline being changed: {kind, track, start, end}
      const scopeSeg = ui.segmented({ value: scope, onChange: x => { scope = x; set('scope', x); }, options: [{ value: 'selection', label: RES ? 'Clip under the playhead' : 'Selected clips', title: RES ? '' : 'When nothing is selected: the clip under the playhead' }, { value: 'all', label: 'Every clip' }] });
      /** Children that are there (a bare element.append(null) writes the word “null” on the screen). */
      const put = (el, ...kids) => { for (const k of kids) if (k != null && k !== false) el.append(k); return el; };
      const seqSize = () => { const s = US.ctx.sequence || {}; return { width: Number(s.width) || 1920, height: Number(s.height) || 1080 }; };

      /* ---------- pictures: a stand-in for footage, and every preset drawn as it looks `sec` seconds into its loop ---------- */
      function plate(ctx, W, H, kind, sec = 0) {
        const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#3a3d42'); g.addColorStop(1, '#1b1c1f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (kind === 'footage') {   // someone lit warmly, swaying a little so the picture is alive
          const sx = Math.sin(sec * 0.9) * W * 0.02, sy = Math.sin(sec * 0.6 + 1) * H * 0.012;
          const r = ctx.createRadialGradient(W * 0.6 + sx, H * 0.45 + sy, 0, W * 0.6 + sx, H * 0.45 + sy, H * 0.5); r.addColorStop(0, 'rgba(190,160,120,0.9)'); r.addColorStop(1, 'rgba(60,55,50,0)'); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#2a2c30'; ctx.fillRect(W * 0.52 + sx, H * 0.55 + sy, W * 0.18, H * 0.45);
        } else if (kind === 'next') {   // the shot after a cut: cooler, lit from the other side
          const r = ctx.createRadialGradient(W * 0.32, H * 0.5, 0, W * 0.32, H * 0.5, H * 0.55); r.addColorStop(0, 'rgba(110,150,190,0.85)'); r.addColorStop(1, 'rgba(30,40,55,0)'); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#20242b'; ctx.fillRect(W * 0.2, H * 0.6, W * 0.24, H * 0.4);
        }
      }
      const OPS = { overlay: 'overlay', screen: 'screen', multiply: 'multiply', add: 'lighter' };
      const tri = x => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1);   // 0 → 1 → 0
      const SETTLED = { overlay: 1, background: 2, freeze: 2.6, move: 2.5, transition: 1.5, look: 0 };   // the moment of its loop that shows a preset whole
      /**
       * Draw preset p on canvas c as it looks `sec` seconds into its loop. st: what's kept between frames for this
       * canvas ({scene, rev}); big: the large preview (the type isn't enlarged).
       */
      function live(p, c, sec, st = {}, big = false) {
        const W = c.width, H = c.height, ctx = c.getContext('2d');
        if (!ctx) return;   // no canvas (the headless smoke test)
        ctx.clearRect(0, 0, W, H);
        if (st.vrev !== rev) { st.v = null; st.vrev = rev; }   // the pack's colours and fonts may have changed
        const vv = p === preset ? values : (st.v || (st.v = valuesFor(p)));
        if (p.kind === 'motion') {
          plate(ctx, W, H, 'footage', sec);
          const total = Number(vv.duration || p.duration || 5);
          if (!st.scene || st.rev !== rev) { st.scene = M().prepare(ctx, W, H, p, big ? vv : Object.assign({}, vv, { scale: (vv.scale || 1) * (M().TILE[p.id] || 1.5) }), total); st.rev = rev; }   // small tiles: the type enlarged so it reads
          M().draw(ctx, st.scene, sec < 0 ? M().holdTime(st.scene) : sec % (total + 0.6));
          return;
        }
        if (p.kind === 'title') {
          plate(ctx, W, H, 'footage', sec);
          const loop = 4.4, ph = sec < 0 ? 2 : sec % loop, inLen = (p.inSec || 0.6) + 0.08 * ((p.layers || []).length || 1) + 0.3;
          P().paint(ctx, W, H, p, vv, { t: Math.min(1, ph / inLen), frame: 0 });
          if (ph > loop - 0.5) { ctx.globalAlpha = (ph - (loop - 0.5)) / 0.5; plate(ctx, W, H, 'footage', sec); ctx.globalAlpha = 1; }   // and out again
          return;
        }
        if (p.kind === 'background') {
          P().paint(ctx, W, H, p, vv, { t: 1 });
          const ph = sec % 4, a = Math.min(1, ph / 0.9) * (ph > 3.4 ? (4 - ph) / 0.6 : 1);   // a line of type coming and going: what a plate is for
          ctx.globalAlpha = a; ctx.fillStyle = p.paint === 'bgpaper' ? '#2a2620' : '#f4f1ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `${Math.round(H * 0.1)}px "${(vv.fonts || {}).serif || 'Georgia'}", serif`; ctx.fillText('Your title', W / 2, H / 2 + (1 - Math.min(1, ph / 0.9)) * H * 0.03); ctx.globalAlpha = 1;
          return;
        }
        if (p.kind === 'overlay') {
          plate(ctx, W, H, 'footage', sec);
          ctx.globalCompositeOperation = OPS[p.blend] || 'source-over';
          if (p.film) P().paint(ctx, W, H, p, vv, { text: false, frame: Math.floor(Math.max(0, sec) * 12) % 48, loop: 48 });
          else P().paint(ctx, W, H, p, vv, { text: false, frame: 0, t: p.paint === 'leak' ? tri(sec / 3) : p.paint === 'flicker' ? (sec / 3) % 1 : 1 });
          ctx.globalCompositeOperation = 'source-over';
          return;
        }
        if (p.kind === 'look') {   // the grade wipes across the moving picture
          plate(ctx, W, H, 'footage', sec);
          const x = Math.round(W * (0.5 + 0.42 * Math.sin(sec * 0.8)));
          if (x > 0) { const id = ctx.getImageData(0, 0, x, H); LK().applyToImageData(p.look, id.data); ctx.putImageData(id, 0, 0); }
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - 1, 0, Math.max(1, W / 240), H);
          return;
        }
        if (p.kind === 'move') {   // the picture really makes the move
          const m = p.move, loop = 3.4, ph = sec % loop;
          let k = P().ease(Math.min(1, ph / 2.6));
          if (m.seconds) k = ph < 1 ? 0 : Math.min(1, (ph - 1) / m.seconds);
          const s = ((m.scale ? m.scale[0] + (m.scale[1] - m.scale[0]) * k : 100)) / 100;
          const x = m.drift ? Math.sin(sec * 1.3) * m.drift * 2 : m.x ? m.x[0] + (m.x[1] - m.x[0]) * k : 0, y = m.drift ? Math.cos(sec * 0.9) * m.drift * 2 : m.y ? m.y[0] + (m.y[1] - m.y[0]) * k : 0;
          ctx.save(); ctx.translate(W / 2 + x * W * 2, H / 2 + y * H * 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);   // pans drawn twice as far, so they read at tile size
          plate(ctx, W, H, 'footage', 0);
          ctx.strokeStyle = 'rgba(244,241,234,0.14)'; ctx.lineWidth = Math.max(1, W / 240); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(W * i / 4, 0); ctx.lineTo(W * i / 4, H); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke(); }
          ctx.restore();
          return;
        }
        if (p.kind === 'transition') {   // one shot, the cut with its wash, the next shot
          const loop = 3, ph = sec % loop, k = Math.max(0, Math.min(1, ph - 1)), dip = /^Dip to (Black|White)$/.exec(p.transition || '');
          if (dip) { plate(ctx, W, H, k < 0.5 ? 'footage' : 'next', sec); ctx.globalAlpha = 1 - Math.abs(k * 2 - 1); ctx.fillStyle = dip[1] === 'White' ? '#fff' : '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          else { plate(ctx, W, H, 'footage', sec); if (k > 0) { ctx.globalAlpha = k; plate(ctx, W, H, 'next', sec); ctx.globalAlpha = 1; } }
          if (p.overlay && k > 0 && k < 1) {
            const o = P().byId(p.overlay) || { paint: p.overlay, alpha: 0.9 };
            ctx.globalAlpha = 1 - Math.abs(k * 2 - 1); ctx.globalCompositeOperation = OPS[o.blend] || 'screen';
            P().paint(ctx, W, H, o, Object.assign({}, vv, { alpha: o.alpha }), o.film ? { text: false, frame: Math.floor(sec * 12) % 48, loop: 48 } : { text: false, t: k });
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          }
          return;
        }
        if (p.kind === 'freeze') {   // the picture moves, then holds: the look comes in over the held frame
          const loop = 4.2, ph = sec < 0 ? SETTLED.freeze : sec % loop, held = ph >= 1.4, k = held ? Math.min(1, (ph - 1.4) / 0.5) : 0;
          plate(ctx, W, H, 'footage', held ? sec - (ph - 1.4) : sec);
          if (!held) return;
          if (p.look === 'bw' && k > 0.5) { const id = ctx.getImageData(0, 0, W, H); LK().applyToImageData('bw', id.data); ctx.putImageData(id, 0, 0); }
          P().paint(ctx, W, H, p, vv, { t: k, frame: 0 });
          if (k < 1) { ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }   // the shutter's flash as it holds
        }
      }
      /** A preset whole and still: everything arrived (what's shown before a tile plays, and while its words are typed). */
      const settled = (p, c, st, big) => live(p, c, p.kind === 'motion' || p.kind === 'title' ? -1 : (SETTLED[p.kind] || 0), st, big);

      /* ---------- playing: one clock for every tile in view and the large preview; nothing runs when the tab is hidden ---------- */
      const preview = h('canvas.mvfx-preview', { width: 960, height: 540 }), pst = {};
      let rev = 0;                // goes up when the chosen preset's values change: its kept layout is made again
      let tiles = [];             // [{p, c, el, st, seen}]
      let shown = false, raf = null, last = 0, t0 = performance.now(), previewSeen = true, once = null;
      const loops = p => p.kind !== 'motion' && p.kind !== 'title' && p.kind !== 'freeze';   // these have no settled state worth holding: the large preview keeps playing
      const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { for (const e of es) { if (e.target === preview) previewSeen = e.isIntersecting; else { const t = tiles.find(x => x.el === e.target); if (t) t.seen = e.isIntersecting; } } wake(); }) : null;
      if (io && io.observe) io.observe(preview);
      function tick(now) {
        raf = null;
        if (!shown || document.hidden) return;   // costs nothing while the tab or the panel is hidden
        if (now - last >= 80) {                  // about 12 pictures a second is plenty at tile size
          last = now;
          const sec = (now - t0) / 1000;
          for (const t of tiles) if (t.seen) { try { live(t.p, t.c, sec, t.st); } catch (e) { t.seen = false; } }
          if (previewSeen && !once && loops(preset)) { try { live(preset, preview, sec, pst, true); } catch (e) { /* keeps the last picture */ } }
        }
        if (once && previewSeen) { const t = (now - once.t0) / 1000; if (t >= once.len) { once = null; settled(preset, preview, pst, true); } else live(preset, preview, t, pst, true); }
        if (tiles.some(t => t.seen) || once || (previewSeen && loops(preset))) raf = requestAnimationFrame(tick);
      }
      function wake() { if (shown && !raf && !document.hidden) raf = requestAnimationFrame(tick); }
      document.addEventListener('visibilitychange', wake);
      function drawPreview() { if (!once) settled(preset, preview, pst, true); }
      /** Play the chosen preset once through in the large preview (titles), or start its loop again. */
      function play() {
        if (loops(preset)) { t0 = performance.now(); once = null; wake(); return; }
        const total = preset.kind === 'motion' ? Number(values.duration || preset.duration || 5) : preset.kind === 'freeze' ? 4.2 : 4.4;
        once = { t0: performance.now(), len: total }; wake();
        if (!shown) { once = null; drawPreview(); }
      }

      /* ---------- adding it: the bar, a tile's +, a double-click, a drag ---------- */
      const btnLabel = p => p.kind === 'move' ? `Apply ${p.label}` : p.kind === 'look' ? `Apply the ${p.label} look` : p.kind === 'transition' ? (RES ? `Lay ${p.label} over the playhead` : `Add ${p.label} at the cuts`) : p.kind === 'freeze' ? 'Hold the frame at the playhead' : `Add ${p.label} at the playhead`;
      const onClipsKind = p => p.kind === 'move' || p.kind === 'look' || (p.kind === 'transition' && !RES);
      const valuesOf = p => (p === preset ? values : valuesFor(p));
      /** Apply preset p now. how: {dropped: it was dragged out of the panel} */
      function run(p, how = {}) {
        if (US.jobs.current) { say('Something else is still running – wait for it to finish, then try again.', 'warn'); return Promise.resolve(null); }
        const ready = P().readiness(p, RES);
        if (!ready.ok) { say(ready.why, 'warn'); return Promise.resolve(null); }
        const swap = p === preset && p.kind === 'motion' && replacing && !how.dropped ? replacing : null;
        return US.jobs.run({ title: `mVFX: ${p.label}`, tool: 'mvfx' }, async job => {
          const r = await apply(p, valuesOf(p), { scope, replace: swap }, job);
          if (swap) { replacing = null; drawEditor(); }
          const where = how.dropped ? (onClipsKind(p) ? ' – dropped: an editor doesn’t tell a panel which clip a drop lands on, so it went on the selected clips (or the one under the playhead)' : ' – dropped: an editor doesn’t tell a panel where a drop lands, so it went at the playhead') : '';
          say(r.summary + where, 'ok');
          if (how.dropped) ui.toast({ type: 'ok', title: r.summary, text: onClipsKind(p) ? 'It went on the selected clips, or the clip under the playhead.' : 'It went at the playhead.', timeout: 5000 });
          return r;
        }).catch(() => null);   // the job has already shown what went wrong
      }
      /** Presets that are one picture: the picture itself can be dragged to the editor, and lands where it's dropped. */
      const isPicture = p => (p.kind === 'overlay' && !p.film) || p.kind === 'background';
      /** Paint a picture preset to a new PNG, at once (a drag has to carry its file from the first moment). -> path | null */
      function pictureFile(p) {
        try {
          const { width: W, height: H } = seqSize(), c = document.createElement('canvas'); c.width = W; c.height = H;
          const ctx = c.getContext('2d'); if (!ctx) return null;
          P().paint(ctx, W, H, p, valuesOf(p), { text: false, t: 1, frame: 0 });
          const file = path.join(artDir(), `${p.id}-dropped-${Date.now().toString(36)}.png`);
          fs.writeFileSync(file, Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64'));
          return file;
        } catch (e) { return null; }
      }
      const outside = e => !(e.clientX > 0 && e.clientY > 0 && e.clientX < window.innerWidth && e.clientY < window.innerHeight);   // where the drag ended: not over the panel
      let dropWatch = null;
      /** After a picture was dragged out: look for it on the timeline every ¾ s; once it's there, give it its blend, fade and length. */
      function watchDrop(p, file, times) {
        if (dropWatch) clearTimeout(dropWatch.timer);
        const w = dropWatch = { tries: 0, timer: null }, vv = valuesOf(p), size = seqSize();
        const look = async () => {
          if (dropWatch !== w) return;
          w.tries++;
          try {
            const r = await US.host.call('mvfxDropped', { path: file, seconds: Number(vv.duration || p.duration || 5), blend: p.blend, anim: plateAnim(p, size), name: p.label, binPath: BIN });
            if (r && r.found) {
              dropWatch = null;
              const text = `${p.label} dropped at ${US.fmtDur(r.start)} on ${r.trackName || 'V' + (r.track + 1)}${r.log && r.log.length ? ' · ' + r.log.join(' · ') : ''}`;
              say(text, 'ok'); ui.toast({ type: 'ok', title: text, text: RES ? 'With its blend mode set. Trim it in the Timeline.' : 'With its blend mode and fade set.', timeout: 4000 });
              return;
            }
          } catch (err) { dropWatch = null; ui.showError(err); return; }
          if (w.tries < times) w.timer = setTimeout(look, 750); else if (dropWatch === w) dropWatch = null;
        };
        w.timer = setTimeout(look, 500);
      }
      function dragStart(e, p) {
        if (!P().readiness(p, RES).ok) { e.preventDefault(); return; }
        const file = isPicture(p) ? pictureFile(p) : null;
        if (file && RES) {   // a real file drag from Electron; the page gets no dragend, so watch for the drop straight away
          e.preventDefault();
          try { require('electron').ipcRenderer.send('ultra-studio:start-drag', file); } catch (er) { return; }
          watchDrop(p, file, 50);
          return;
        }
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'copy';
        if (file) e.dataTransfer.setData('com.adobe.cep.dnd.file.0', file); else e.dataTransfer.setData('text/plain', p.label);
        e.currentTarget.addEventListener('dragend', ev => {
          if (!outside(ev)) { if (file) { try { fs.unlinkSync(file); } catch (er) { /* gone */ } } return; }   // let go over the panel: nothing happens
          if (file) watchDrop(p, file, 15); else run(p, { dropped: true });
        }, { once: true });
      }

      /* ---------- the tiles ---------- */
      const textBadge = p => {
        if (p.kind === 'title') return { text: 'Editable text', title: RES ? 'A Fusion title: change the words in the Inspector.' : 'Premiere’s own text: change the words, font, size and colour in the Properties panel.' };
        if (p.kind === 'motion' && !RES && editablePlan(p, valuesOf(p)).ok) return { text: 'Editable text: optional', title: 'Switch on “Words as text layers” to change the words in Premiere’s Properties panel.' };
        return null;
      };
      function drawGrid() {
        US.clear(grid);
        if (io && io.disconnect) { io.disconnect(); io.observe(preview); }
        tiles = [];
        for (const p of P().PRESETS.filter(x => x.group === group)) {
          const c = h('canvas', { width: p.kind === 'motion' ? 480 : 240, height: p.kind === 'motion' ? 270 : 135 }), ready = P().readiness(p, RES), ok = ready.ok, badge = textBadge(p);
          const add = h('button.mvfx-tile-add', { title: US.say(btnLabel(p)), disabled: !ok, onclick: e => { e.stopPropagation(); choose(p); run(p); }, ondblclick: e => e.stopPropagation() }, US.icon('plus', 14));
          const el = h('div.mvfx-tile' + (p.id === preset.id ? '.on' : '') + (ok ? '' : '.off'), { role: 'button', tabIndex: 0, draggable: ok, title: ok ? `${p.sub} – double-click to add it, or drag it to the editor` : ready.why,
            onclick: () => choose(p), ondblclick: () => { choose(p); run(p); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(p); } }, ondragstart: e => dragStart(e, p) },
            h('div.mvfx-tile-pic', c, add, badge ? h('span.mvfx-badge', { title: badge.title }, badge.text) : null), h('span.mvfx-tile-label', p.label), h('span.mvfx-tile-sub', p.sub));
          el.dataset.preset = p.id;
          grid.appendChild(el);
          const t = { p, c, el, st: {}, seen: !io };
          tiles.push(t);
          requestAnimationFrame(() => { try { settled(p, c, t.st); } catch (e) { /* a tile that can't be drawn stays blank */ } });
          if (io && io.observe) io.observe(el);
        }
        wake();
      }
      const groupSeg = ui.segmented({ value: group, onChange: x => { group = x; set('group', x); drawGrid(); const first = P().PRESETS.find(p => p.group === x); if (first && preset.group !== x) choose(first); }, options: P().GROUPS.map(g => ({ value: g.id, label: g.name, title: g.hint })) });
      groupSeg.classList.add('mvfx-groups');

      /* ---------- the chosen preset: its bar (always in view) and its settings ---------- */
      function choose(p) {
        if (preset === p) return;
        preset = p; values = valuesFor(p); set('preset', p.id); replacing = null; rev++; once = null;
        for (const t of tiles) t.el.classList.toggle('on', t.p === p);   // the tiles stay as they are (a double-click needs the same tile twice)
        drawEditor(); play();
      }
      function drawBar() {
        US.clear(bar);
        const ready = P().readiness(preset, RES), swap = preset.kind === 'motion' && replacing;
        const go = ui.actionButton(swap ? 'Replace the title on the timeline' : btnLabel(preset), () => run(preset), { block: false });
        if (!ready.ok) go.setEnabled(false);
        put(bar, h('div.mvfx-bar-what', h('div.mvfx-bar-name', h('span.mvfx-bar-kicker', 'Chosen'), h('span', preset.label), h('span.mvfx-bar-sub', preset.sub)), status), go);
      }
      function drawEditor() {
        US.clear(editor);
        const ready = P().readiness(preset, RES), people = storyPeople();
        const change = () => { rev++; remember(preset, values); drawPreview(); };
        const nudge = () => { rev++; drawPreview(); };
        const fields = (preset.fields || []).map(f => {
          const input = f.multiline ? h('textarea.input', { rows: 4, value: values.text[f.id] || '', oninput: e => { values.text[f.id] = e.target.value; change(); } }) : ui.input({ value: values.text[f.id] || '', placeholder: f.value, onInput: x => { values.text[f.id] = x; change(); } });
          if (f.multiline) input.value = values.text[f.id] || '';
          const pick = people.length && /^(name|who|a|b|c)$/.test(f.id) ? ui.select({ placeholder: 'From Story…', options: people.map(n => ({ value: n, label: US.keep(n) })), onChange: n => { if (!n) return; values.text[f.id] = n; input.value = n; change(); } }) : null;
          return ui.field(f.label, pick ? h('div.row', input, pick) : input);
        });
        const motion = preset.kind === 'motion', use = motion ? M().uses(preset, values) : null;
        const roles = motion ? use.roles : Array.from(new Set((preset.layers || []).filter(l => l.type === 'text').map(l => l.role)));
        const av = P().available(fontCheck);
        const fontSel = roles.map(r => ui.field(P().ROLES[r], ui.select({ value: values.fonts[r], options: av[r].concat(Object.keys(P().FAMILIES).filter(f => P().FAMILIES[f].role === r && !av[r].includes(f))).map(f => ({ value: f, label: f + (av[r].includes(f) ? '' : ' (not on this computer)') })), onChange: x => { values.fonts[r] = x; change(); } })));
        const colourRoles = motion ? use.colours : Array.from(new Set((preset.layers || []).map(l => l.colour).concat(preset.kind === 'freeze' && preset.paint === 'box' ? ['accent'] : [])));
        const colours = colourRoles.map(r => h('label.mvfx-colour', h('input', { type: 'color', value: values.colours[r] || '#ffffff', oninput: e => { values.colours[r] = e.target.value; change(); } }), h('span', { text: motion && !roles.length ? 'Line' : 'Text', accent: motion ? 'Marker' : 'Accent', muted: 'Second line', ink: 'Bar' }[r] || r)));
        const options = (preset.options || []).map(o => ui.field(o.label, ui.segmented({ value: (values.opt || {})[o.id] || o.value, options: o.choices, onChange: x => { values.opt = Object.assign({}, values.opt, { [o.id]: x }); change(); } })));
        const sliders = [];
        if (motion) {
          if (preset.stretch) sliders.push(ui.slider({ label: 'Width', min: 0.3, max: 3, step: 0.05, value: values.stretch || 1, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.stretch = x; nudge(); }, onChange: () => change() }));
          if (preset.rotate) sliders.push(ui.slider({ label: 'Turn', min: -180, max: 180, step: 1, value: values.rot || 0, fmt: x => Math.round(x) + '°', onInput: x => { values.rot = x; nudge(); }, onChange: () => change() }));
          sliders.push(ui.slider({ label: 'Shadow behind (for bright pictures)', min: 0, max: 1, step: 0.05, value: values.shadow != null ? values.shadow : 0, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.shadow = x; nudge(); }, onChange: () => change() }));
        }
        if ((preset.layers && preset.layers.length) || motion) {
          sliders.push(ui.slider({ label: 'Size', min: 0.5, max: 1.8, step: 0.05, value: values.scale || 1, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.scale = x; nudge(); }, onChange: () => change() }));
          sliders.push(h('div.row', ui.slider({ label: 'Across', min: -0.4, max: 0.4, step: 0.01, value: values.dx || 0, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', onInput: x => { values.dx = x; nudge(); }, onChange: () => change() }), ui.slider({ label: 'Up / down', min: -0.4, max: 0.4, step: 0.01, value: values.dy || 0, fmt: x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%', onInput: x => { values.dy = x; nudge(); }, onChange: () => change() })));
        }
        if (preset.kind === 'overlay' || preset.paint === 'paper') sliders.push(ui.slider({ label: 'Strength', min: 0.05, max: 1, step: 0.05, value: values.alpha != null ? values.alpha : (preset.alpha || 1), fmt: x => Math.round(x * 100) + '%', onInput: x => { values.alpha = x; nudge(); }, onChange: () => change() }));
        if (preset.kind === 'freeze' && preset.paint) sliders.push(h('div.row', ui.slider({ label: 'Spot across', min: 0.1, max: 0.9, step: 0.01, value: values.cx != null ? values.cx : 0.5, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.cx = x; nudge(); }, onChange: () => change() }), ui.slider({ label: 'Spot down', min: 0.1, max: 0.9, step: 0.01, value: values.cy != null ? values.cy : 0.5, fmt: x => Math.round(x * 100) + '%', onInput: x => { values.cy = x; nudge(); }, onChange: () => change() })));
        if (preset.kind !== 'move' && preset.kind !== 'look') sliders.push(ui.slider({ label: preset.kind === 'transition' ? 'Length' : 'Length on the timeline', min: 0.3, max: 15, step: 0.1, value: preset.kind === 'transition' ? (values.seconds || preset.seconds || 1) : (values.duration || preset.duration || 5), fmt: x => x.toFixed(1) + ' s', onChange: x => { if (preset.kind === 'transition') values.seconds = x; else values.duration = x; change(); }, hint: RES && preset.kind !== 'transition' ? 'Resolve lays titles and generators 5 s long – trim them in the Timeline.' : '' }));
        const push = motion && !RES ? ui.toggle({ label: 'Slow push in while it’s on screen', value: !!values.push, onChange: x => { values.push = x; remember(preset, values); } }) : null;
        // Premiere: the words as its own text layers (the Properties panel), or the whole title as one drawn clip
        const plan = motion ? editablePlan(preset, values, seqSize()) : null;
        const editable = plan && plan.ok ? ui.toggle({ label: 'Words as text layers (change them in Premiere’s Properties panel)', value: !!values.editable, hint: `${US.plural(plan.layers, 'text layer')} of Premiere’s own, in the same place, face, size and colour – its lines and pen strokes stay animated underneath. The letters fade in together instead of one by one.`, onChange: x => { values.editable = x; remember(preset, values); drawEditor(); } }) : null;
        const how = preset.kind === 'title' ? ui.note(RES ? 'Added as a Fusion title: change the words in the Inspector.' : 'Added as Premiere’s own text, one layer a line: change the words, font, size and colour in the Properties panel. The rules and bars are a picture underneath.', 'info')
          : motion && plan && !plan.ok && plan.why ? h('div.field-hint', plan.why) : null;
        const swap = motion && replacing;
        const loadBtn = motion ? ui.button(RES ? 'Change the title under the playhead…' : 'Change the selected title…', { small: true, kind: 'ghost', onClick: async () => {
          try { const t = await selectedTitle(); preset = t.preset; values = t.values; replacing = t.target; group = preset.group; rev++; groupSeg.set && groupSeg.set(group); drawGrid(); drawEditor(); say(`Loaded “${preset.label}” from ${US.fmtDur(t.target.start)} – change it, then press Replace.`); }
          catch (e) { say((e.title || e.message || String(e)) + (e.action ? ' ' + e.action : ''), 'warn'); }
        } }) : null;
        const film = preset.film && !RES ? h('div.field-hint', 'It moves: every frame is different (drawn once for this sequence’s size and frame rate, a few seconds the first time), and it’s added as one clip with its blend mode and strength set. It’s kept in the project’s JMG Ultra Studio › mVFX folder.') : null;
        put(editor,
          h('div.mvfx-editor-head', h('div.mvfx-editor-title', preset.label), h('div.field-hint', preset.sub)),
          h('div.mvfx-preview-wrap', preview, h('button.btn.small.ghost.mvfx-play', { title: 'Play it again', onclick: play }, US.icon('play', 14), h('span', 'Play'))),
          !ready.ok ? ui.note(ready.why, 'warn') : null,
          how,
          fields.length || options.length ? ui.card(...fields, ...options) : null,
          editable ? ui.card(editable) : null,
          (colours.length || fontSel.length) ? ui.section('Colours and fonts', [colours.length ? h('div.mvfx-colours', colours) : null, ...fontSel].filter(Boolean), { open: false, hint: 'for the whole pack' }) : null,
          sliders.length ? ui.card(...sliders.concat(push ? [push] : [])) : null,
          film,
          motion && !(editable && values.editable) ? h('div.field-hint', 'Added as one clip with a see-through background, drawn at this sequence’s size and frame rate. To change the words later, change them here and add it again, then delete the old clip.' + (RES ? '' : ' It’s kept in the project’s JMG Ultra Studio › mVFX folder.')) : null,
          onClipsKind(preset) ? ui.card(h('div.field-label', 'Apply to'), scopeSeg) : null,
          swap ? ui.note(`Changing the title at ${US.fmtDur(replacing.start)} – it will be replaced where it is.`, 'info') : null,
          loadBtn);
        drawBar();
        drawPreview();
      }
      const install = RES ? ui.section('Resolve’s Effects Library', [h('div.field-hint', 'Every preset is also a Fusion title or generator you can drag from Effects Library › Titles / Generators › JMG Ultra Studio. The one you add from here is written (with your words in it) just before it’s inserted.'), h('div.row', { style: { marginTop: '6px' } }, ui.button('Install the whole pack', { small: true, icon: 'check', onClick: () => US.jobs.run({ title: 'mVFX: install the pack', tool: 'mvfx' }, async job => { const r = await installAll(job); say(r.summary, 'ok'); return r; }) }), h('span.field-hint', (() => { const i = get('installed', null); return i ? `${i.n} templates installed ${new Date(i.at).toLocaleDateString()}` : 'not installed yet'; })()))], { open: !get('installed', null), hint: 'Fusion templates' }) : null;
      put(v.body, groupSeg, grid, editor, install, bar);
      drawGrid(); drawEditor();
      return { el: v.el, onShow() { shown = true; t0 = performance.now(); drawPreview(); wake(); }, onHide() { shown = false; once = null; if (raf) cancelAnimationFrame(raf); raf = null; } };
    }
  });

  US.mvfx = { apply, installAll, valuesFor, storyPeople, artDir, lutFile, paintPNG, renderMotion, renderFilm, selectedTitle, clipUnder, editablePlan, plateAnim };
})();
