/* JMG Ultra Studio – MC Selects: from a cut multicam edit, a new sequence of just the cameras you keep (say the two
   roaming cameras, not the static stage ones), each piece exactly as you cut it, back to back in edit order.
   Premiere doesn't tell scripts which camera a multicam cut shows, so it's read from the saved project file. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path'), zlib = require('zlib');

  /* ---------- which camera each cut shows, from the .prproj (gzipped XML) ---------- */
  /** Objects by id: one pass over the file, then each body is sliced on demand. */
  function indexObjects(xml) {
    const at = new Map(), re = /<([A-Za-z]+) Object(U?)ID="([^"]+)"/g;
    let m; while ((m = re.exec(xml))) at.set(m[3], { tag: m[1], s: m.index });
    return id => { const o = at.get(id); return o ? xml.slice(o.s, xml.indexOf('</' + o.tag + '>', o.s)) : ''; };
  }
  /**
   * The active camera of every multicam cut on V1 of a sequence: Map "startTicks|endTicks" -> track index in the
   * multicam source sequence (Premiere's SelectedTrackIndex). Sequence found by its sequenceID.
   */
  function activeAngles(xml, seqUid) {
    const body = indexObjects(xml), out = new Map();
    const seq = body(seqUid); if (!seq) return out;
    const groups = [...seq.matchAll(/<Second ObjectRef="(\d+)"/g)].map(m => m[1]);
    const vg = groups.map(body).find(b => /^<VideoTrackGroup/.test(b)); if (!vg) return out;
    const t0 = /<Track Index="0" ObjectURef="([^"]+)"/.exec(vg); if (!t0) return out;
    for (const [, ref] of body(t0[1]).matchAll(/<TrackItem Index="\d+" ObjectRef="(\d+)"/g)) {
      const ti = body(ref); if (!/^<VideoClipTrackItem/.test(ti)) continue;
      const start = (/<Start>(-?\d+)<\/Start>/.exec(ti) || [, '0'])[1], end = (/<End>(-?\d+)<\/End>/.exec(ti) || [])[1];
      const sub = /<SubClip ObjectRef="(\d+)"/.exec(ti); if (!sub || end == null) continue;
      const clipRef = /<Clip ObjectRef="(\d+)"/.exec(body(sub[1])); if (!clipRef) continue;
      const vc = body(clipRef[1]);
      if (!/<IsMulticam>true<\/IsMulticam>/.test(vc)) continue;
      out.set(start + '|' + end, +((/<SelectedTrackIndex>(\d+)<\/SelectedTrackIndex>/.exec(vc) || [, '0'])[1]));
    }
    return out;
  }
  function readProjectFile(file) {
    const raw = fs.readFileSync(file);
    return (raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString('utf8');
  }

  /* ---------- which camera made a file, read from the file itself (nothing rendered, nothing sent) ---------- */
  const GOPRO = { HD3: 'HERO3', HD4: 'HERO4', HD5: 'HERO5', HD6: 'HERO6', HD7: 'HERO7', HD8: 'HERO8', HD9: 'HERO9', H21: 'HERO10', H22: 'HERO11', H23: 'HERO12', H24: 'HERO13' };
  const clean = x => String(x || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  /** Make and model from bytes of an MP4/MOV header (moov and the small boxes around it). -> {make, model} or null */
  function modelFromBytes(buf) {
    const txt = buf.toString('latin1'), out = { make: '', model: '' };
    // Sony XAVC / Canon / Panasonic: the camera's own XML inside the file
    const xm = /modelName="([^"]+)"/i.exec(txt); if (xm) { out.model = xm[1]; out.make = (/manufacturer="([^"]+)"/i.exec(txt) || [])[1] || ''; return out; }
    const xe = /<(?:\w+:)?ModelName>\s*([^<]+?)\s*</i.exec(txt); if (xe) { out.model = xe[1]; out.make = (/<(?:\w+:)?Manufacturer>\s*([^<]+?)\s*</i.exec(txt) || [])[1] || ''; return out; }
    // Apple-style metadata: keys "com.apple.quicktime.make/model" with their values in ilst
    const k = txt.indexOf('keys'), il = txt.indexOf('ilst', k);
    if (k > 4 && il > k) {
      const n = buf.readUInt32BE(k + 8), names = []; let at = k + 12;
      for (let i = 0; i < n && at + 8 <= buf.length; i++) { const sz = buf.readUInt32BE(at); if (sz < 8) break; names.push(buf.toString('utf8', at + 8, at + sz)); at += sz; }
      const end = il - 4 + buf.readUInt32BE(il - 4); at = il + 4;
      while (at + 8 <= Math.min(end, buf.length)) {
        const sz = buf.readUInt32BE(at), idx = buf.readUInt32BE(at + 4), d = txt.indexOf('data', at);
        if (sz < 8) break;
        if (d > 0 && d < at + sz) { const v = clean(buf.toString('utf8', d + 12, at + sz)), key = names[idx - 1] || ''; if (/\.model$/.test(key)) out.model = v; if (/\.make$/.test(key)) out.make = v; }
        at += sz;
      }
      if (out.model) return out;
    }
    // QuickTime user data: ©mak / ©mod (length-prefixed text, or an iTunes-style data box)
    const ud = tag => { const i = txt.indexOf('\xa9' + tag); if (i < 4) return ''; const sz = buf.readUInt32BE(i - 4); if (sz < 12 || sz > 512) return ''; const body = buf.slice(i + 4, i - 4 + sz); return clean(body.indexOf('data') === 4 ? body.toString('utf8', 16) : body.toString('utf8', 4, 4 + body.readUInt16BE(0))); };
    out.model = ud('mod'); out.make = ud('mak');
    if (out.model) return out;
    // GoPro: the firmware box says which HERO
    // EXIF as in photos (Lumix, Fujifilm, Nikon…): the make, then the model, each ending in a zero byte
    const ex = /(Panasonic|Canon|NIKON(?: CORPORATION)?|SONY|FUJIFILM|OLYMPUS[ A-Z]*|OM Digital Solutions|Blackmagic Design|LEICA[ A-Z]*|SIGMA|RICOH[ A-Z]*|Hasselblad|Insta360)\0+([A-Za-z0-9][\x20-\x7e]{1,30})\0/.exec(txt);
    if (ex) return { make: clean(ex[1]), model: clean(ex[2]) };
    const fw = /FIRM.{0,8}?(HD\d|H\d\d)\.[0-9.]+/.exec(txt); if (fw) return { make: 'GoPro', model: GOPRO[fw[1]] || fw[1] };
    const dji = /DJI ?([A-Za-z0-9][A-Za-z0-9 \-]{1,24})/.exec(txt); if (dji) return { make: 'DJI', model: clean(dji[1]) };
    return null;
  }
  /** The top-level boxes of an MP4/MOV except the media itself, at most 32 MB in all. */
  function headerBytes(file) {
    const fd = fs.openSync(file, 'r'), parts = [], head = Buffer.alloc(16);
    try {
      const size = fs.fstatSync(fd).size; let at = 0, total = 0;
      while (at + 8 <= size && total < 32e6) {
        fs.readSync(fd, head, 0, 16, at);
        let len = head.readUInt32BE(0); const type = head.toString('latin1', 4, 8);
        if (len === 1) len = Number(head.readBigUInt64BE(8)); else if (len === 0) len = size - at;
        if (len < 8 || !/^[\w ©]{4}$/.test(type)) break;
        if (type !== 'mdat' && type !== 'free' && type !== 'skip' && len < 32e6 - total) { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, at); parts.push(b); total += len; }
        at += len;
      }
    } finally { fs.closeSync(fd); }
    return Buffer.concat(parts);
  }
  const modelMemo = new Map();
  /** "Sony ILCE-7SM3", "GoPro HERO11", "Apple iPhone 15 Pro"… or '' when the file doesn't say. */
  function cameraModel(file) {
    if (!file) return '';
    if (modelMemo.has(file)) return modelMemo.get(file);
    let r = null;
    try {
      // Sony and Canon write the camera's XML next to the clip (C0001.MP4 + C0001M01.XML)
      const dir = path.dirname(file), stem = path.basename(file).replace(/\.[^.]+$/, '');
      const side = fs.readdirSync(dir).find(f => f.toLowerCase().startsWith(stem.toLowerCase()) && /\.xml$/i.test(f) && f.length <= stem.length + 8);
      if (side) r = modelFromBytes(fs.readFileSync(path.join(dir, side)));
      if (!r && /\.(mp4|mov|m4v|mts|3gp|insv|lrv)$/i.test(file)) r = modelFromBytes(headerBytes(file));
    } catch (e) { /* not readable: no model */ }
    if (!r && process.platform === 'darwin') {
      try { const o = require('child_process').execFileSync('mdls', ['-raw', '-name', 'kMDItemAcquisitionMake', '-name', 'kMDItemAcquisitionModel', file], { timeout: 3000 }).toString().split('\0'); if (o[1] && o[1] !== '(null)') r = { make: o[0] === '(null)' ? '' : o[0], model: o[1] }; } catch (e) { /* Spotlight doesn't know it */ }
    }
    const name = r && r.model ? clean((r.make && !r.model.toLowerCase().startsWith(r.make.toLowerCase()) ? r.make + ' ' : '') + r.model) : '';
    modelMemo.set(file, name);
    return name;
  }

  /* ---------- a still of each camera: the computer's own file preview (Finder / Explorer), no rendering ---------- */
  const thumbDir = () => US.fsx.ensureDir(path.join(US.fsx.cacheDir(), 'thumbs'));
  const thumbFile = file => path.join(thumbDir(), US.fsx.mediaKey(file) + '.png');
  /** The preview picture of a media file (made once, then kept). -> png path, or '' when the system has none */
  async function thumbnail(file, size = 320) {
    if (!file || !fs.existsSync(file)) return '';
    const out = thumbFile(file);
    if (fs.existsSync(out)) return out;
    const cp = require('child_process'), tmp = fs.mkdtempSync(path.join(US.fsx.tempDir(), 'thumb-'));
    try {
      if (process.platform === 'darwin') {
        await new Promise(res => cp.execFile('qlmanage', ['-t', '-s', String(size), '-o', tmp, file], { timeout: 20000 }, () => res()));
        const got = fs.readdirSync(tmp).find(f => /\.png$/i.test(f));
        if (got) fs.renameSync(path.join(tmp, got), out);
      } else if (US.fsx.isWin) {
        const ps = `Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Drawing; using System.Drawing.Imaging;
public static class UsThumb {
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(Size size, int flags, out IntPtr bmp); }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  public static void Save(string file, string png, int size) {
    IShellItemImageFactory f; SHCreateItemFromParsingName(file, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out f);
    IntPtr h; if (f.GetImage(new Size(size, size), 0x8, out h) != 0) return;
    try { using (Bitmap b = Image.FromHbitmap(h)) b.Save(png, ImageFormat.Png); } finally { DeleteObject(h); }
  }
}
'@; [UsThumb]::Save($env:US_THUMB_IN, $env:US_THUMB_OUT, ${size})`;
        await new Promise(res => cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30000, windowsHide: true, env: Object.assign({}, process.env, { US_THUMB_IN: file, US_THUMB_OUT: out }) }, () => res()));
      }
    } catch (e) { /* no preview */ } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* later */ } }
    return fs.existsSync(out) ? out : '';
  }

  /* ---------- cameras and the plan (pure) ---------- */
  /** A camera's name: its file, or the first file and how many more when the card was split. */
  const cameraName = ang => { const n = ang.clips.map(c => c.name); return !n.length ? `Camera ${ang.index + 1} (empty)` : n.length === 1 ? n[0] : `${n[0]} +${n.length - 1} more`; };
  /** Every camera used in the edit: [{name, cuts, seconds, file}] in the multicam's own order (file: its first clip's media). */
  function cameras(read, angles) {
    const by = new Map();
    for (const mc of Object.values(read.multicams)) for (const a of mc.angles) { const n = cameraName(a); if (!by.has(n)) by.set(n, { name: n, cuts: 0, seconds: 0, file: (a.clips.find(c => c.path) || {}).path || '' }); }
    for (const c of read.cuts) {
      const a = angles.get(c.startTicks + '|' + c.endTicks), ang = a != null && read.multicams[c.mcId].angles[a];
      if (ang && !c.disabled) { const r = by.get(cameraName(ang)); r.cuts++; r.seconds += c.end - c.start; }
    }
    return [...by.values()];
  }
  /**
   * The pieces for the new sequence, in edit order: each cut of a kept camera, trimmed to exactly what was on screen
   * (a cut that crosses two files of the same camera gives two pieces). keep: name -> bool, label: name -> index or null.
   */
  function plan(read, angles, keep, label = () => null) {
    const pieces = []; let unknown = 0;
    for (const c of read.cuts.slice().sort((x, y) => x.start - y.start)) {
      if (c.disabled) continue;
      const a = angles.get(c.startTicks + '|' + c.endTicks), mc = read.multicams[c.mcId];
      if (a == null || !mc || !mc.angles[a]) { unknown++; continue; }
      const ang = mc.angles[a], name = cameraName(ang);
      if (!keep(name)) continue;
      for (const clip of ang.clips) {
        const s = Math.max(c.in, clip.start), e = Math.min(c.out, clip.end);
        if (e - s > 0.001) pieces.push({ itemId: clip.itemId, in: clip.in + (s - clip.start), out: clip.in + (e - clip.start), camera: name, label: label(name), at: c.start });
      }
    }
    return { pieces, unknown };
  }

  /* ---------- running it ---------- */
  const opts = () => Object.assign({ cameras: {}, audio: false }, US.settings.get('mcSelects', {}));
  const saveOpts = o => US.settings.set('mcSelects', o);
  const keepOf = o => name => (o.cameras[name] || {}).keep !== false;
  const labelOf = o => name => { const v = (o.cameras[name] || {}).label; return v === '' || v == null ? null : Number(v); };

  /** Read the edit and its cameras (saves the project first, so the file holds your latest camera choices). */
  async function readEdit(seqId, job) {
    job.set({ who: 'premiere', msg: 'Reading the multicam cuts' });
    const read = await US.host.call('mcRead', { seqId });
    if (!read.cuts.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no multicam clips on V1 of this sequence.', action: 'Open your cut multicam sequence (the multicam clip on V1), then try again.' });
    job.set({ msg: 'Saving the project, then reading which camera each cut shows' });
    const pr = await US.host.call('storyProjectFile', { save: true });
    const angles = activeAngles(readProjectFile(pr.path), seqId);
    return { read, angles, cams: cameras(read, angles) };
  }

  async function build(seqId, o, job) {
    const { read, angles } = await readEdit(seqId, job);
    const p = plan(read, angles, keepOf(o), labelOf(o));
    if (!p.pieces.length) throw new US.UserError('NOTHING_FOUND', { title: 'None of the cameras you keep are used in this edit.', action: 'Switch on Keep for at least one camera that appears in the cut.' });
    job.set({ who: 'premiere' }).progress(0.4, `Placing ${US.plural(p.pieces.length, 'clip')}`);
    const made = await US.host.call('mcBuild', { name: `${read.name} – MC Selects`, likeId: read.itemId, audio: !!o.audio, pieces: p.pieces });
    const kept = [...new Set(p.pieces.map(x => x.camera))];
    const secs = US.sum(p.pieces.map(x => x.out - x.in));
    US.log('ok', `MC Selects: “${made.name}”`, `${made.placed} of ${p.pieces.length} clips · ${US.fmtDur(secs)} · ${kept.join(', ')}${p.unknown ? ` · ${p.unknown} cuts whose camera couldn’t be read` : ''}`, 'mcselects');
    return { summary: `“${made.name}”: ${US.plural(made.placed, 'clip')}, ${US.fmtDur(secs)} from ${kept.join(', ')}${p.unknown ? ` (${p.unknown} cuts skipped – camera unknown)` : ''}`, seqId: made.id, placed: made.placed, pieces: p.pieces };
  }

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'mcselects', name: 'MC Selects', short: 'MC Sel', icon: 'cameras', group: 'selects', order: 12,
    // Premiere only: Resolve's scripting can't say which camera a multicam cut shows (dev/RESOLVE.md)
    apps: ['premiere'],
    blurb: 'From your cut multicam edit, a sequence of just the cameras you keep, each clip as you cut it.',
    hostFns: ['mcRead', 'mcBuild', 'storyProjectFile', 'newSequence', 'placeClips'],
    create() {
      const v = ui.toolView({ icon: 'cameras', title: 'MC Selects', blurb: 'Keep the cameras you want from your cut multicam edit, say the roaming cameras and not the static stage ones. Each clip is exactly what you cut to, back to back in edit order, in a new sequence.' });
      const seqLine = h('div.field-hint'), list = h('div'), note = h('div');
      let o = opts(), cams = [];
      const set = (name, k, val) => { o.cameras[name] = Object.assign({ keep: true, label: '' }, o.cameras[name], { [k]: val }); saveOpts(o); };
      const totals = h('div.field-hint.mc-total');
      /** Total running time of the cameras kept (what the new sequence will run), and of the whole edit. */
      function showTotal() {
        const used = cams.filter(c => c.cuts), kept = used.filter(c => keepOf(o)(c.name));
        const all = US.sum(used.map(c => c.seconds)), mine = US.sum(kept.map(c => c.seconds));
        totals.textContent = used.length ? `MC Selects will run ${US.fmtDur(mine)} – ${US.plural(US.sum(kept.map(c => c.cuts)), 'cut')} from ${US.plural(kept.length, 'camera')} (the edit is ${US.fmtDur(all)})` : '';
      }
      let showThumbs = US.settings.get('mcSelects.thumbs', true);
      function render() {
        US.clear(list);
        if (!cams.length) { list.appendChild(ui.note('Open your cut multicam sequence, then press Read the cameras.', 'info')); showTotal(); return; }
        for (const c of cams) {
          const cur = Object.assign({ keep: true, label: '' }, o.cameras[c.name]);
          const model = cameraModel(c.file);
          const keep = ui.toggle({ label: c.name, hint: [model ? `📷 ${model}` : '', c.cuts ? `${US.plural(c.cuts, 'cut')} · ${US.fmtDur(c.seconds)} in the edit` : 'Not used in this edit'].filter(Boolean).join(' · '), value: cur.keep, onChange: x => { set(c.name, 'keep', x); showTotal(); } });
          const colour = ui.select({ options: [{ value: '', label: 'Its own colour' }].concat(ui.LABELS.map(l => ({ value: String(l.i), label: l.name }))), value: String(cur.label), onChange: x => set(c.name, 'label', x) });
          const pic = h('div.mc-thumb', { title: c.file ? 'The file’s own preview (as Finder or Explorer shows it)' : '' });
          if (showThumbs && c.file) thumbnail(c.file).then(f => { if (f) pic.appendChild(h('img', { src: require('url').pathToFileURL(f).href + '?' + fs.statSync(f).mtimeMs, alt: c.name })); else pic.classList.add('none'); });
          list.appendChild(h('div.row.mc-cam', showThumbs ? pic : null, h('div.grow', keep), h('div', { style: { width: '150px' } }, colour)));
        }
        showTotal();
      }
      const thumbsToggle = ui.toggle({ label: 'Show a still of each camera', hint: 'The file’s own preview picture, as Finder or Explorer shows it – nothing is rendered.', value: showThumbs, onChange: x => { showThumbs = x; US.settings.set('mcSelects.thumbs', x); render(); } });
      const readBtn = ui.button('Read the cameras', { small: true, icon: 'refresh', onClick: async () => {
        const s = US.ctx.sequence; if (!s) return ui.showError(new US.UserError('NO_SEQUENCE'));
        const r = await US.jobs.run({ title: 'Reading the multicam cameras', tool: 'mcselects' }, job => readEdit(s.id, job));
        if (r) { cams = r.cams; render(); }
      } });
      const audio = ui.toggle({ label: 'Include the camera’s scratch audio', hint: 'Off: picture only.', value: !!o.audio, onChange: x => { o.audio = x; saveOpts(o); } });
      const go = ui.actionButton('Make the MC Selects sequence', async () => {
        const s = US.ctx.sequence; if (!s) return ui.showError(new US.UserError('NO_SEQUENCE'));
        await US.jobs.run({ title: 'Making the MC Selects sequence', tool: 'mcselects' }, job => build(s.id, opts(), job));
      });
      note.appendChild(ui.note('Ultra Studio saves the project first: Premiere only writes down which camera each cut shows when it saves. Your edit isn’t changed. The new sequence goes in “JMG Ultra Studio › MC Selects”.'));
      function renderCtx() { seqLine.textContent = US.ctx.sequence ? `Sequence: ${US.ctx.sequence.name}` : 'Open your cut multicam sequence in the Timeline first.'; }
      US.bus.on('context', renderCtx);
      v.body.append(seqLine, ui.card(h('div.row', h('div.grow.card-title', 'Cameras – keep or reject'), readBtn), thumbsToggle, list, totals), ui.card(audio), note, go);
      render();
      return { el: v.el, onShow() { renderCtx(); } };
    }
  });

  US.actions.register({
    id: 'mcselects.make', tool: 'mcselects', title: 'Make MC Selects from the multicam edit', changes: true, apps: ['premiere'],
    describe: 'From the open multicam edit, makes a new sequence of only the cameras kept in MC Selects, each clip as cut, back to back.',
    examples: ['make the multicam selects', 'pull the roaming camera shots out of the multicam'],
    match: t => /multi-?cam|mc selects/i.test(t) && /select|pull|keep|extract|roaming|b-?roll/i.test(t) ? { _score: 2 } : null,
    run: (p, job) => { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); return build(s.id, opts(), job); }
  });

  US.mcSelects = { activeAngles, cameras, plan, cameraName, readProjectFile, modelFromBytes, cameraModel, thumbnail };
})();
