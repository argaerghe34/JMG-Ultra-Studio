/* JMG Ultra Studio – Safe Zones: social crop + app-interface guides on top of the sequence, hidden for export in one click. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path');

  /* Where each app's interface sits on a 9:16 screen, as fractions of the frame (approximate, measured from
     2026 app layouts). top/bottom: bars across the full width; right: the button column, which runs from
     buttonsFrom down to the caption area; left: a small margin. */
  const APPS = {
    tiktok: { name: 'TikTok', top: 0.075, bottom: 0.235, right: 0.135, left: 0.055, buttonsFrom: 0.42 },
    reels: { name: 'Instagram Reels', top: 0.11, bottom: 0.215, right: 0.13, left: 0.055, buttonsFrom: 0.45 },
    shorts: { name: 'YouTube Shorts', top: 0.09, bottom: 0.25, right: 0.15, left: 0.055, buttonsFrom: 0.40 },
    facebook: { name: 'Facebook Reels', top: 0.10, bottom: 0.255, right: 0.13, left: 0.055, buttonsFrom: 0.43 }
  };
  const CROPS = { '9x16': { w: 9, h: 16, label: '9:16', color: '#9284ff' }, '4x5': { w: 4, h: 5, label: '4:5', color: '#2fc6d6' }, '1x1': { w: 1, h: 1, label: '1:1', color: '#f2b84b' } };

  /** Centred rectangle of aspect cw:ch that fits inside W×H. */
  function fitCrop(W, H, cw, ch) {
    let w = W, hh = (W * ch) / cw;
    if (hh > H) { hh = H; w = (H * cw) / ch; }
    return { x: (W - w) / 2, y: (H - hh) / 2, w, h: hh };
  }

  /** Draw the guide at W×H onto a canvas. opts: {crops:[...], apps:[...], titleSafe, dim, style:'detailed'|'simple'}
      "simple" is plain grey: no colours and no text. */
  function render(W, H, opts) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const s = Math.min(W, H) / 1080; // scale for line widths and text
    const simple = opts.style === 'simple';
    const crops = Object.keys(CROPS).filter(k => opts.crops.includes(k)).map(k => Object.assign({ key: k }, CROPS[k], fitCrop(W, H, CROPS[k].w, CROPS[k].h)));
    // dim outside the narrowest crop (only if it's actually smaller than the frame)
    const narrow = crops.slice().sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (narrow && (narrow.w < W - 1 || narrow.h < H - 1)) {
      g.fillStyle = simple ? `rgba(118,118,118,${opts.dim})` : `rgba(0,0,0,${opts.dim})`;
      g.fillRect(0, 0, W, H);
      g.clearRect(narrow.x, narrow.y, narrow.w, narrow.h);
    }
    // app interface zones inside the 9:16 area
    const apps = Object.keys(APPS).filter(k => opts.apps.includes(k)).map(k => APPS[k]);
    const nine = fitCrop(W, H, 9, 16);
    const useNine = opts.crops.includes('9x16') || W < H;
    if (apps.length && useNine) {
      const A = nine, X = f => A.x + f * A.w, Y = f => A.y + f * A.h;
      const u = { top: Math.max(...apps.map(a => a.top)), bottom: Math.max(...apps.map(a => a.bottom)), right: Math.max(...apps.map(a => a.right)), left: Math.max(...apps.map(a => a.left)), buttonsFrom: Math.min(...apps.map(a => a.buttonsFrom)) };
      g.fillStyle = simple ? 'rgba(128, 128, 128, 0.42)' : 'rgba(255, 70, 70, 0.30)';
      g.fillRect(A.x, A.y, A.w, u.top * A.h);                                   // top bar
      g.fillRect(A.x, Y(1 - u.bottom), A.w, u.bottom * A.h);                   // caption + username
      g.fillRect(X(1 - u.right), Y(u.buttonsFrom), u.right * A.w, (1 - u.bottom - u.buttonsFrom) * A.h); // buttons
      const sx = X(u.left), sy = Y(u.top), sw = X(1 - u.right) - sx, sh = Y(1 - u.bottom) - sy;
      if (simple) {
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1, 2 * s); g.strokeRect(sx, sy, sw, sh);
      } else {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = `${Math.round(22 * s)}px -apple-system, system-ui, sans-serif`;
      g.textBaseline = 'middle';
      const label = (t, x, y, align = 'left') => { g.textAlign = align; g.fillText(t, x, y); };
      label('App top bar', A.x + 14 * s, A.y + (u.top * A.h) / 2);
      label('Caption, username, music', A.x + 14 * s, Y(1 - u.bottom / 2));
      g.save(); g.translate(X(1 - u.right / 2), Y((u.buttonsFrom + 1 - u.bottom) / 2)); g.rotate(-Math.PI / 2); label('Buttons', 0, 0, 'center'); g.restore();
      // safe box for text
      g.strokeStyle = '#3ecf8e'; g.lineWidth = Math.max(2, 3 * s); g.setLineDash([12 * s, 8 * s]);
      g.strokeRect(sx, sy, sw, sh); g.setLineDash([]);
      g.fillStyle = '#3ecf8e'; label('Safe for text: ' + apps.map(a => a.name.replace('Instagram ', '').replace('YouTube ', '').replace('Facebook Reels', 'Facebook')).join(', '), sx + 10 * s, sy + 18 * s);
      }
    }
    // crop outlines + labels
    g.lineWidth = Math.max(2, 3 * s);
    for (const cr of crops) {
      if (cr.w >= W - 1 && cr.h >= H - 1) continue;
      if (simple) { g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, 2 * s); g.strokeRect(cr.x, cr.y, cr.w, cr.h); continue; }
      g.strokeStyle = cr.color; g.strokeRect(cr.x, cr.y, cr.w, cr.h);
      g.fillStyle = cr.color; g.font = `600 ${Math.round(24 * s)}px -apple-system, system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(cr.label, cr.x + 8 * s, cr.y + 8 * s + (cr.key === '4x5' ? 30 * s : cr.key === '1x1' ? 60 * s : 0));
    }
    if (opts.titleSafe) {
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, 2 * s); g.setLineDash([6 * s, 6 * s]);
      g.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
      g.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8); g.setLineDash([]);
    }
    return c;
  }

  /* Letterbox / pillarbox: bars to a picture shape. "bars" are solid black and meant to export with the film;
     "guide" is a see-through grey preview that gets hidden for export like the other guides. */
  const RATIOS = [
    { key: '2.39', value: 2.39, label: '2.39:1', title: 'Cinema scope' }, { key: '2.00', value: 2, label: '2:1', title: 'Univisium' },
    { key: '1.85', value: 1.85, label: '1.85:1', title: 'Cinema flat' }, { key: '1.33', value: 4 / 3, label: '4:3', title: 'Classic TV (pillarbox on 16:9)' },
    { key: '1.00', value: 1, label: '1:1', title: 'Square' }, { key: '0.80', value: 0.8, label: '4:5', title: 'Portrait feed' }, { key: '0.56', value: 9 / 16, label: '9:16', title: 'Vertical' }
  ];
  function letterboxRect(W, H, ratio) {
    if (ratio >= W / H) { const hh = Math.round(W / ratio); return { x: 0, y: Math.round((H - hh) / 2), w: W, h: hh }; }
    const w = Math.round(H * ratio); return { x: Math.round((W - w) / 2), y: 0, w, h: H };
  }
  function renderLetterbox(W, H, o) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = letterboxRect(W, H, o.ratio);
    g.fillStyle = o.mode === 'bars' ? '#000' : `rgba(118,118,118,${o.dim == null ? 0.6 : o.dim})`;
    g.fillRect(0, 0, W, H);
    g.clearRect(r.x, r.y, r.w, r.h);
    if (o.mode !== 'bars') { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, Math.min(W, H) / 540); g.strokeRect(r.x, r.y, r.w, r.h); }
    return c;
  }
  const ratioLabel = v => (RATIOS.find(r => Math.abs(r.value - v) < 0.005) || { label: (+v).toFixed(2) + ':1' }).label;
  /** Bars are part of the film ("Ultra Letterbox"); the grey version is a guide ("Ultra Guide …"), hidden for export. */
  // the name says everything the picture shows (shade included), so a changed guide never overwrites one Premiere has imported
  const shadeTag = d => ` shade${Math.round((d == null ? 0.6 : d) * 100)}`;
  function letterboxName(W, H, o) { return `${o.mode === 'bars' ? 'Ultra Letterbox' : 'Ultra Guide letterbox'} ${ratioLabel(o.ratio).replace(':', 'x')}${o.mode === 'bars' ? '' : shadeTag(o.dim)} ${W}x${H}`; }

  function guideName(W, H, o) {
    const parts = [o.crops.map(k => CROPS[k].label.replace(':', 'x')).join('+') || 'frame', o.apps.length ? o.apps.map(k => APPS[k].name.split(' ').pop()).join('+') : '', o.titleSafe ? 'title-safe' : ''].filter(Boolean);
    return `Ultra Guide ${parts.join(' ')}${o.style === 'simple' ? ' plain' : ''}${shadeTag(o.dim)} ${W}x${H}`;
  }
  async function writePNG(canvas, file) {
    // same name = same picture; on Windows Premiere holds imported stills open, so don't rewrite one
    if (fs.existsSync(file)) return file;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const buf = Buffer.from(await blob.arrayBuffer());
    US.fsx.ensureDir(path.dirname(file));
    fs.writeFileSync(file, buf);
    return file;
  }

  /** Guide images live next to the project ("JMG Ultra Studio Guides"), so they move with it and are never cleaned up
      with Ultra Studio's own data. Falls back to Documents › JMG Ultra Studio › Guides if that folder can't be written. */
  function guidesDir() {
    const proj = US.ctx.project && US.ctx.project.path;
    if (proj) {
      const d = path.join(path.dirname(proj), 'JMG Ultra Studio Guides');
      try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { /* read-only or a Team Project */ }
    }
    return US.fsx.ensureDir(path.join(US.fsx.exportsDir(), 'Guides'));
  }

  const DEFAULTS = { crops: ['9x16'], apps: ['tiktok', 'reels', 'shorts'], titleSafe: false, dim: 0.45, style: 'detailed', lbRatio: 2.39, lbMode: 'bars' };
  function opts() { return Object.assign({}, DEFAULTS, US.settings.get('safezones', {})); }

  /** Put letterbox bars (or a grey letterbox guide) on a sequence. */
  async function addLetterbox(o, job, seqId) {
    const id = seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!id) throw new US.UserError('NO_SEQUENCE');
    const seq = await US.host.call('sequenceInfo', { seqId: id, clips: false });
    job.progress(0.15, 'Drawing the letterbox');
    const W = seq.width, H = seq.height, name = letterboxName(W, H, o);
    const file = path.join(guidesDir(), name + '.png');
    await writePNG(renderLetterbox(W, H, o), file);
    job.set({ who: 'premiere' }).progress(0.45, 'Importing it into the project');
    const existing = await US.host.call('findGuideItem', { path: file });
    const itemId = existing || (await US.host.call('importFiles', { paths: [file], binPath: 'JMG Ultra Studio/Guides' }))[0].id;
    job.progress(0.7, 'Putting it on its own top track');
    const bars = o.mode === 'bars';
    const r = await US.host.call('placeGuide', { seqId: seq.id, itemId, trackName: bars ? 'Letterbox' : 'Guides', prefix: bars ? 'Ultra Letterbox' : 'Ultra Guide' });
    return { summary: bars ? `${ratioLabel(o.ratio)} letterbox bars added to ${seq.name} on V${r.track + 1}. They export with the film.` : `${ratioLabel(o.ratio)} letterbox guide added on V${r.track + 1}. Hide it before exporting.` };
  }

  /** Put the guide on a sequence. Shared by the button and the Assistant. */
  async function addGuide(o, job, seqId) {
    const seq = seqId ? await US.host.call('sequenceInfo', { seqId, clips: false }) : (US.ctx.sequence ? await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id, clips: false }) : null);
    if (!seq) throw new US.UserError('NO_SEQUENCE');
    job.progress(0.15, 'Drawing the guide');
    const W = seq.width, H = seq.height;
    const name = guideName(W, H, o);
    const file = path.join(guidesDir(), name + '.png');
    await writePNG(render(W, H, o), file);
    job.set({ who: 'premiere' }).progress(0.45, 'Importing it into the project');
    const existing = await US.host.call('findGuideItem', { path: file });
    const itemId = existing || (await US.host.call('importFiles', { paths: [file], binPath: 'JMG Ultra Studio/Guides' }))[0].id;
    job.progress(0.7, 'Putting it on a new top track');
    const r = await US.host.call('placeGuide', { seqId: seq.id, itemId });
    US.log('info', `Guide “${name}” on V${r.track + 1} of ${seq.name}`, '', 'safezones');
    return { summary: `Guide added to ${seq.name} on track V${r.track + 1}. Hide it before exporting.` };
  }

  US.actions.register({
    id: 'safezones.add', tool: 'safezones', title: 'Put social safe-zone guides on the sequence', changes: true,
    describe: 'Adds a guide image on a new top track of the active sequence showing social crops (9:16, 4:5, 1:1) and where each app puts its buttons and captions.',
    params: { crops: { type: 'string', default: '9x16', desc: 'Comma list of 9x16, 4x5, 1x1' }, apps: { type: 'string', default: 'tiktok,reels,shorts', desc: 'Comma list of tiktok, reels, shorts, facebook' }, style: { type: 'enum', options: ['detailed', 'simple'], default: 'detailed', desc: 'simple = plain grey, no text' } },
    examples: ['safe zones for Reels', 'show the TikTok safe zone', 'add 9:16 and 1:1 guides'],
    match(t) {
      if (!/safe ?zone|guide|crop guide|reels guide|tiktok guide/i.test(t) || /hide|off|remove/i.test(t)) return null;
      const apps = Object.keys(APPS).filter(k => new RegExp(k === 'reels' ? 'reels|instagram|insta' : k === 'shorts' ? 'shorts|youtube' : k, 'i').test(t));
      const crops = ['9x16', '4x5', '1x1'].filter(k => new RegExp(k.replace('x', '[:x/ ]'), 'i').test(t) || (k === '1x1' && /square/i.test(t)));
      return { crops: (crops.length ? crops : ['9x16']).join(','), apps: (apps.length ? apps : DEFAULTS.apps).join(','), style: /plain|grey|gray|simple|no text|clean/i.test(t) ? 'simple' : 'detailed' };
    },
    run: (p, job) => addGuide(Object.assign({}, opts(), { style: p.style || opts().style, crops: String(p.crops).split(',').map(s => s.trim()).filter(k => CROPS[k]), apps: String(p.apps).split(',').map(s => s.trim()).filter(k => APPS[k]) }), job)
  });
  US.actions.register({
    id: 'safezones.letterbox', tool: 'safezones', title: 'Add letterbox bars to the sequence', changes: true,
    describe: 'Adds black letterbox (or pillarbox) bars to a picture shape such as 2.39:1 on their own top track; they export with the film. mode "guide" makes a grey framing guide instead.',
    params: { ratio: { type: 'number', default: 2.39, desc: 'Picture shape as width/height, e.g. 2.39, 1.85, 1.33, 1' }, mode: { type: 'enum', options: ['bars', 'guide'], default: 'bars', desc: 'bars = black, exported; guide = grey, hidden for export' } },
    examples: ['letterbox it to 2.39', 'add cinematic bars', 'pillarbox to 4:3'],
    match(t) {
      if (!/letterbox|pillarbox|cinematic bars|black bars|scope bars|cinemascope/i.test(t)) return null;
      const m = /(\d(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(t) || /(\d\.\d+)/.exec(t);
      const ratio = m ? (m[2] ? +m[1] / +m[2] : +m[1]) : /pillarbox|4:3/i.test(t) ? 4 / 3 : 2.39;
      return { ratio, mode: /guide|grey|gray|preview/i.test(t) ? 'guide' : 'bars' };
    },
    run: (p, job) => addLetterbox({ ratio: +p.ratio || 2.39, mode: p.mode, dim: opts().dim + 0.15 }, job)
  });

  US.actions.register({
    id: 'safezones.hide', tool: 'safezones', title: 'Hide safe-zone guides for export', changes: true,
    describe: 'Switches off the guide tracks in the active sequence so they don’t export.',
    examples: ['hide the guides', 'turn guides off for export'],
    match: t => (/guide|safe ?zone/i.test(t) && /hide|off|export/i.test(t) && !/remove|delete/i.test(t)) ? {} : null,
    run: async () => { if (!US.ctx.sequence) throw new US.UserError('NO_SEQUENCE'); const n = await US.host.call('showGuides', { seqId: US.ctx.sequence.id, show: false }); return { summary: n ? 'Guides hidden – they won’t export.' : 'There were no guides on this sequence.' }; }
  });

  US.tools.register({
    id: 'safezones', name: 'Safe Zones', short: 'Safe', icon: 'safe', group: 'finish', order: 30,
    blurb: 'Social crop and app-button guides (or plain grey), and letterbox bars to any shape.',
    hostFns: ['placeGuide', 'guideStatus', 'showGuides', 'removeGuides', 'findGuideItem'],
    create() {
      const v = ui.toolView({ icon: 'safe', title: 'Safe Zones', blurb: 'Social crops and where each app puts its buttons, so text stays clear – or letterbox bars to any shape.',
        help: h('div', h('p', 'The guide goes on a new top track of the active sequence, for its whole length. Nothing underneath moves.'), h('ul', h('li', 'Red areas are covered by the app’s interface. Keep titles and subtitles inside the green box.'), h('li', 'Premiere can’t show a clip but leave it out of an export, so press “Hide for export” before you export (Final Check and Deliver remind you).'), h('li', '“Plain grey” shows the same areas in grey with no colours or text.'), h('li', 'Letterbox: black bars export with the film (their own “Letterbox” track); the grey letterbox is a guide and is hidden for export like the others.'), h('li', 'App layouts are approximate and change from time to time.'))) });
      let o = opts();
      const save = () => { US.settings.set('safezones', o); draw(); };
      const cropToggles = Object.keys(CROPS).map(k => ui.toggle({ label: CROPS[k].label, value: o.crops.includes(k), onChange: on => { o.crops = on ? o.crops.concat(k) : o.crops.filter(x => x !== k); save(); } }));
      const appToggles = Object.keys(APPS).map(k => ui.toggle({ label: APPS[k].name, value: o.apps.includes(k), onChange: on => { o.apps = on ? o.apps.concat(k) : o.apps.filter(x => x !== k); save(); } }));
      const titleSafe = ui.toggle({ label: 'Title-safe boxes (90% / 80%)', value: o.titleSafe, onChange: x => { o.titleSafe = x; save(); } });
      const dim = ui.slider({ label: 'Shade outside the crop', min: 0, max: 0.8, step: 0.05, value: o.dim, fmt: x => Math.round(x * 100) + '%', onInput: x => { o.dim = x; draw(); }, onChange: () => save() });
      const style = ui.segmented({ options: [{ value: 'detailed', label: 'Colours & labels' }, { value: 'simple', label: 'Plain grey' }], value: o.style, onChange: x => { o.style = x; save(); } });
      // letterbox
      let mode = US.settings.get('safezones.mode', 'social');
      const lbRatio = ui.segmented({ options: RATIOS.map(r => ({ value: r.value, label: r.label, title: r.title })), value: RATIOS.find(r => Math.abs(r.value - o.lbRatio) < 0.005) ? RATIOS.find(r => Math.abs(r.value - o.lbRatio) < 0.005).value : 2.39, onChange: x => { o.lbRatio = x; save(); } });
      const lbMode = ui.segmented({ options: [{ value: 'bars', label: 'Black bars (export with the film)' }, { value: 'guide', label: 'Grey guide (hidden for export)' }], value: o.lbMode, onChange: x => { o.lbMode = x; save(); } });

      // preview: the guide over the current frame of the sequence (or a neutral background)
      const prevCanvas = h('canvas', { style: { maxWidth: '100%', maxHeight: '340px', display: 'block', margin: '0 auto', borderRadius: '6px', background: '#111' } });
      let bg = null, bgFor = '';
      const seqLine = h('div.field-hint');
      function draw() {
        const s = US.ctx.sequence; const W = s ? s.width : 1920, H = s ? s.height : 1080;
        const PW = 640, PH = Math.round(PW * H / W);
        prevCanvas.width = PW; prevCanvas.height = PH;
        const g = prevCanvas.getContext('2d');
        if (bg) g.drawImage(bg, 0, 0, PW, PH);
        else { const gr = g.createLinearGradient(0, 0, PW, PH); gr.addColorStop(0, '#3a3550'); gr.addColorStop(1, '#1d2a33'); g.fillStyle = gr; g.fillRect(0, 0, PW, PH); }
        g.drawImage(mode === 'letterbox' ? renderLetterbox(W, H, { ratio: o.lbRatio, mode: o.lbMode, dim: o.dim + 0.15 }) : render(W, H, o), 0, 0, PW, PH);
        seqLine.textContent = s ? `${s.name} · ${W}×${H}${W < H ? ' (vertical: app zones cover the whole frame)' : ''}` : 'No active sequence – showing a 1920×1080 example.';
      }
      async function grabFrame() {
        const s = US.ctx.sequence; if (!s) { bg = null; draw(); return; }
        try {
          const base = path.join(US.fsx.tempDir(), 'sz-preview-' + Date.now());
          const p = await US.host.call('exportFrame', { seqId: s.id, seconds: s.playhead || 0, outBase: base });
          const img = new Image(); img.src = US.vision.fileUrl(p) + '?' + Date.now();   // drive letters and backslashes on Windows
          await img.decode(); bg = img; bgFor = s.id + '@' + (s.playhead || 0); draw();
          setTimeout(() => { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } }, 5000);
        } catch (e) { US.log('info', 'Preview frame unavailable', US.errors.explain(e).detail, 'safezones'); }
      }

      const statusLine = h('div.field-hint');
      const btnAdd = ui.actionButton('Put guide on the sequence', () => US.actions.run('safezones.add', { crops: o.crops.join(','), apps: o.apps.join(','), style: o.style }).then(refreshStatus));
      const btnLetterbox = ui.actionButton('Put letterbox on the sequence', () => US.jobs.run({ title: 'Adding a letterbox', tool: 'safezones' }, job => addLetterbox({ ratio: o.lbRatio, mode: o.lbMode, dim: o.dim + 0.15 }, job)).then(refreshStatus));
      const btnRemoveBars = ui.button('Remove letterbox bars', { kind: 'ghost', onClick: async () => { if (!US.ctx.sequence) return ui.showError(new US.UserError('NO_SEQUENCE')); const n = await US.host.call('removeGuides', { seqId: US.ctx.sequence.id, prefix: 'Ultra Letterbox' }).catch(e => ui.showError(e)); if (n != null) ui.toast({ type: 'ok', title: n ? 'Letterbox bars removed' : 'No letterbox bars on this sequence' }); } });
      const btnHide = ui.button('Hide for export', { icon: 'stop', onClick: () => toggle(false) });
      const btnShow = ui.button('Show guides', { icon: 'play', onClick: () => toggle(true) });
      const btnRemove = ui.button('Remove guides', { kind: 'ghost', onClick: async () => { if (!US.ctx.sequence) return ui.showError(new US.UserError('NO_SEQUENCE')); const n = await US.host.call('removeGuides', { seqId: US.ctx.sequence.id }).catch(e => ui.showError(e)); if (n != null) ui.toast({ type: 'ok', title: n ? `Removed ${US.plural(n, 'guide')}` : 'No guides to remove' }); refreshStatus(); } });
      const btnPack = ui.button('Save PNG pack…', { kind: 'ghost', icon: 'folder', onClick: savePack });
      async function toggle(show) {
        if (!US.ctx.sequence) return ui.showError(new US.UserError('NO_SEQUENCE'));
        try { const n = await US.host.call('showGuides', { seqId: US.ctx.sequence.id, show }); ui.toast({ type: 'ok', title: n ? (show ? 'Guides showing' : 'Guides hidden – they won’t export') : 'No guides on this sequence', timeout: 2500 }); }
        catch (e) { ui.showError(e); }
        refreshStatus();
      }
      async function refreshStatus() {
        if (!US.ctx.sequence) { statusLine.textContent = 'Open a sequence to add a guide.'; return; }
        try {
          const st = await US.host.call('guideStatus', { seqId: US.ctx.sequence.id });
          const vis = st.filter(x => !x.hidden).length;
          statusLine.textContent = !st.length ? 'No guides on this sequence yet.' : vis ? `Guide showing on ${st.filter(x => !x.hidden).map(x => 'V' + (x.track + 1)).join(', ')} – hide it before you export.` : 'Guides are hidden, so they won’t export.';
          statusLine.style.color = vis ? 'var(--warn)' : '';
        } catch (e) { statusLine.textContent = ''; }
      }
      async function savePack() {
        let dir = path.join(US.fsx.exportsDir(), 'Safe zone guides');
        await US.jobs.run({ title: 'Saving the guide PNG pack', tool: 'safezones' }, async job => {
          const sizes = [[1920, 1080], [3840, 2160], [1080, 1920], [2160, 3840]];
          const combos = [{ crops: ['9x16'], apps: Object.keys(APPS) }, { crops: ['9x16', '4x5', '1x1'], apps: [] }].concat(Object.keys(APPS).map(k => ({ crops: ['9x16'], apps: [k] })));
          let n = 0; const total = sizes.length * combos.length;
          for (const [W, H] of sizes) for (const c of combos) {
            job.check();
            const oo = Object.assign({}, o, c, { titleSafe: false });
            await writePNG(render(W, H, oo), path.join(dir, guideName(W, H, oo) + '.png'));
            job.progress(++n / total, `${n} of ${total}`);
          }
          return { summary: `${total} PNGs saved in Documents › JMG Ultra Studio › Safe zone guides` };
        });
        require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + dir + '"');
      }

      const socialPane = h('div.tool-body',
        ui.card(h('div.card-title', 'Crops'), h('div.row', cropToggles), h('div.card-title', { style: { marginTop: '4px' } }, 'Apps'), h('div.grid2', appToggles),
          ui.field('Look', style), ui.section('More options', [titleSafe, dim], { open: false })),
        btnAdd);
      const letterboxPane = h('div.tool-body',
        ui.card(ui.field('Shape', lbRatio), ui.field('Bars', lbMode), h('div.field-hint', 'Bars go on their own top track called “Letterbox”. Black bars are part of your film; the grey guide is only for framing.')),
        btnLetterbox, h('div.row', btnRemoveBars));
      const modeSel = ui.segmented({ options: [{ value: 'social', label: 'Social guides' }, { value: 'letterbox', label: 'Letterbox' }], value: mode, onChange: m => setMode(m) });
      function setMode(m) { mode = m; US.settings.set('safezones.mode', m); modeSel.set(m); socialPane.classList.toggle('hidden', m !== 'social'); letterboxPane.classList.toggle('hidden', m !== 'letterbox'); draw(); }
      v.body.append(
        modeSel,
        ui.card(h('div.card-title', 'Preview', h('span.right', ui.button('Use current frame', { small: true, kind: 'ghost', icon: 'refresh', onClick: grabFrame }))), prevCanvas, seqLine),
        socialPane, letterboxPane,
        ui.card(statusLine, h('div.row', btnHide, btnShow, btnRemove, btnPack))
      );
      setMode(mode);
      US.bus.on('context', () => { draw(); refreshStatus(); });
      return { el: v.el, onShow() { draw(); refreshStatus(); const s = US.ctx.sequence; if (s && bgFor !== s.id + '@' + (s.playhead || 0)) grabFrame(); } };
    }
  });

  US.safezones = { render, renderLetterbox, letterboxRect, guideName, letterboxName, APPS, CROPS, RATIOS };
})();
