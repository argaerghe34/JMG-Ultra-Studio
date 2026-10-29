/* JMG Ultra Studio – MC Selects: from a cut multicam edit, a new sequence of just the cameras you keep (say the two
   roaming cameras, not the static stage ones), each piece exactly as you cut it, back to back in edit order.
   Premiere doesn't tell scripts which camera a multicam cut shows, so it's read from the saved project file. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), zlib = require('zlib');

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

  /* ---------- cameras and the plan (pure) ---------- */
  /** A camera's name: its file, or the first file and how many more when the card was split. */
  const cameraName = ang => { const n = ang.clips.map(c => c.name); return !n.length ? `Camera ${ang.index + 1} (empty)` : n.length === 1 ? n[0] : `${n[0]} +${n.length - 1} more`; };
  /** Every camera used in the edit: [{name, cuts, seconds}] in the multicam's own order. */
  function cameras(read, angles) {
    const by = new Map();
    for (const mc of Object.values(read.multicams)) for (const a of mc.angles) { const n = cameraName(a); if (!by.has(n)) by.set(n, { name: n, cuts: 0, seconds: 0 }); }
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
    id: 'mcselects', name: 'MC Selects', short: 'MC Sel', icon: 'cameras', group: 'cut', order: 25,
    blurb: 'From your cut multicam edit, a sequence of just the cameras you keep, each clip as you cut it.',
    hostFns: ['mcRead', 'mcBuild', 'storyProjectFile', 'newSequence', 'placeClips'],
    create() {
      const v = ui.toolView({ icon: 'cameras', title: 'MC Selects', blurb: 'Keep the cameras you want from your cut multicam edit, say the roaming cameras and not the static stage ones. Each clip is exactly what you cut to, back to back in edit order, in a new sequence.' });
      const seqLine = h('div.field-hint'), list = h('div'), note = h('div');
      let o = opts(), cams = [];
      const set = (name, k, val) => { o.cameras[name] = Object.assign({ keep: true, label: '' }, o.cameras[name], { [k]: val }); saveOpts(o); };
      function render() {
        US.clear(list);
        if (!cams.length) { list.appendChild(ui.note('Open your cut multicam sequence, then press Read the cameras.', 'info')); return; }
        for (const c of cams) {
          const cur = Object.assign({ keep: true, label: '' }, o.cameras[c.name]);
          const keep = ui.toggle({ label: c.name, hint: c.cuts ? `${US.plural(c.cuts, 'cut')} · ${US.fmtDur(c.seconds)} in the edit` : 'Not used in this edit', value: cur.keep, onChange: x => set(c.name, 'keep', x) });
          const colour = ui.select({ options: [{ value: '', label: 'Its own colour' }].concat(ui.LABELS.map(l => ({ value: String(l.i), label: l.name }))), value: String(cur.label), onChange: x => set(c.name, 'label', x) });
          list.appendChild(h('div.row', h('div.grow', keep), h('div', { style: { width: '150px' } }, colour)));
        }
      }
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
      v.body.append(seqLine, ui.card(h('div.row', h('div.grow.card-title', 'Cameras – keep or reject'), readBtn), list), ui.card(audio), note, go);
      render();
      return { el: v.el, onShow() { renderCtx(); } };
    }
  });

  US.actions.register({
    id: 'mcselects.make', tool: 'mcselects', title: 'Make MC Selects from the multicam edit', changes: true,
    describe: 'From the open multicam edit, makes a new sequence of only the cameras kept in MC Selects, each clip as cut, back to back.',
    examples: ['make the multicam selects', 'pull the roaming camera shots out of the multicam'],
    match: t => /multi-?cam|mc selects/i.test(t) && /select|pull|keep|extract|roaming|b-?roll/i.test(t) ? { _score: 2 } : null,
    run: (p, job) => { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); return build(s.id, opts(), job); }
  });

  US.mcSelects = { activeAngles, cameras, plan, cameraName, readProjectFile };
})();
