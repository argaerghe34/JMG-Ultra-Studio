/* JMG Ultra Studio – Markers: every marker on the open sequence, or on the clips selected in the Project panel / Media
   Pool, in one list to search, filter by colour, rename, recolour, comment, move and delete – one at a time or ticked
   together. Add markers at the playhead, every so often, at every cut or clip, from pasted notes (a client's email,
   a review export as CSV), or show the clips' own markers on the timeline. Export them as text, a spreadsheet or
   YouTube chapters, and tidy up duplicates. Pure logic (unit-tested) first, then the tab. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const RES = US.app.is('resolve');
  /** The first sentence of a note (up to 60 characters) – its name. */
  const firstSentence = s => ((/^.*?[.!?](?=\s|$)/.exec(s) || [s])[0]).slice(0, 60);

  /* ---------- colours: Premiere's marker colours 0–7 (Resolve's nearest names) ---------- */
  const COLOURS = [
    { i: 0, name: 'Green', hex: '#3fbf4a' }, { i: 1, name: 'Red', hex: '#e2483f' }, { i: 2, name: 'Purple', hex: '#a35bd6' }, { i: 3, name: 'Orange', hex: '#f08a24' },
    { i: 4, name: 'Yellow', hex: '#e2d33a' }, { i: 5, name: 'White', hex: '#d8d8d8' }, { i: 6, name: 'Blue', hex: '#3d7ff0' }, { i: 7, name: 'Cyan', hex: '#29c4d8' }
  ];
  const COLOUR_WORDS = { green: 0, red: 1, purple: 2, magenta: 2, orange: 3, sand: 3, yellow: 4, white: 5, cream: 5, blue: 6, cyan: 7, teal: 7 };
  const colourOf = w => { const k = String(w || '').toLowerCase().trim(); return k in COLOUR_WORDS ? COLOUR_WORDS[k] : /^\d$/.test(k) && +k < 8 ? +k : null; };

  /* ---------- timecodes ---------- */
  /** "01:02:03:12", "01:02:03;12", "1:02:03", "02:03", "2:03.5", "75s", "75" -> seconds (null if it isn't one). */
  function parseTime(str, fps = 25) {
    const s = String(str || '').trim();
    let m = /^(\d{1,2}):(\d{2}):(\d{2})[:;.](\d{2})$/.exec(s);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / fps;
    if ((m = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(s))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = /^(\d{1,3}):(\d{2}(?:\.\d+)?)$/.exec(s))) return +m[1] * 60 + +m[2];
    if ((m = /^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/i.exec(s))) return +m[1];
    if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) return +m[1];
    return null;
  }
  const TC_RE = /(\d{1,2}:\d{2}:\d{2}[:;.]\d{2}|\d{1,2}:\d{2}:\d{2}(?:\.\d+)?|\d{1,3}:\d{2}(?:\.\d+)?)/;
  /** Seconds -> "00:01:23:12" at the sequence's rate, from its start timecode (zero). */
  const tc = (t, fps = 25, zero = 0) => (US.time && US.time.toTC ? US.time.toTC(t + zero, fps) : US.fmtDur(t + zero));

  /* ---------- markers from text ---------- */
  function splitCSV(line, sep) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out.map(x => x.trim());
  }
  /**
   * Markers from pasted notes or a review export. A spreadsheet (comma, semicolon or tab, with a header naming a time
   * column) is read by its columns – time/in, out/end, name/title, comment/note, colour, and who wrote it; otherwise
   * every line with a timecode becomes a marker: "01:23 Fix the colour here", "01:23–01:30 Too long", "[red] 2:10 …".
   * Times past the sequence's start timecode (01:00:00:00) are counted from it. -> [{start, end?, name, comment, color}]
   */
  function fromText(text, { fps = 25, zero = 0, color = 0 } = {}) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
    if (!lines.length) return [];
    const sep = [',', ';', '\t'].find(c => splitCSV(lines[0], c).length > 1 && splitCSV(lines[0], c).some(x => /^(time|timecode|tc|in|start|record in|frame)/i.test(x)));
    let out = [];
    if (sep) {
      const head = splitCSV(lines[0], sep).map(x => x.toLowerCase());
      const col = re => head.findIndex(x => re.test(x));
      const ti = col(/^(timecode|time|tc|in|start|record in)/), te = col(/^(out|end|record out)/), tn = col(/^(name|title|marker( name)?)$/), tm = col(/^(comments?|notes?|description|text|feedback)$/), tcl = col(/^colou?r/), tw = col(/^(author|commenter|user|by|from|name of)/);
      for (const l of lines.slice(1)) {
        const c = splitCSV(l, sep), start = parseTime(c[ti], fps);
        if (start == null) continue;
        const end = te >= 0 ? parseTime(c[te], fps) : null, comment = tm >= 0 ? c[tm] || '' : '';
        const name = tn >= 0 && c[tn] ? c[tn] : firstSentence(comment);
        out.push({ start, end: end != null && end > start ? end : null, name, comment: [comment !== name ? comment : '', tw >= 0 && c[tw] ? `– ${c[tw]}` : ''].filter(Boolean).join(' '), color: tcl >= 0 && colourOf(c[tcl]) != null ? colourOf(c[tcl]) : color });
      }
    } else {
      for (const raw of lines) {
        let l = raw.trim(), col = color;
        const cw = /\[(\w+)\]|\((\w+)\)/.exec(l); if (cw && colourOf(cw[1] || cw[2]) != null) { col = colourOf(cw[1] || cw[2]); l = l.replace(cw[0], ' ').trim(); }
        const m = TC_RE.exec(l); if (!m) continue;
        const start = parseTime(m[1], fps); if (start == null) continue;
        let rest = l.slice(m.index + m[1].length), end = null;
        const r = /^\s*(?:-|–|—|to)\s*/.exec(rest), m2 = r && TC_RE.exec(rest.slice(r[0].length));
        if (m2 && m2.index === 0) { end = parseTime(m2[1], fps); rest = rest.slice(r[0].length + m2[1].length); }
        const before = l.slice(0, m.index).replace(/^[\s\-–—•*\d.)]*$/, '').trim();
        const words = (before + ' ' + rest).replace(/^[\s\-–—:|,]+/, '').trim();
        const name = firstSentence(words.split(/\s[–—|]\s/)[0]);
        out.push({ start, end: end != null && end > start ? end : null, name: name || 'Note', comment: words.length > name.length ? words : '', color: col });
      }
    }
    // counted from the start timecode when the notes use it (all past 01:00:00:00 on a sequence starting there)
    if (zero > 0 && out.length && out.every(x => x.start >= zero - 0.001)) out = out.map(x => Object.assign(x, { start: x.start - zero, end: x.end != null ? x.end - zero : null }));
    return out.sort((a, b) => a.start - b.start);
  }

  /* ---------- markers out as text ---------- */
  const lineOf = (m, fps, zero) => `${tc(m.start, fps, zero)}${m.end > m.start + 1e-6 ? ` – ${tc(m.end, fps, zero)}` : ''}\t${COLOURS[m.color] ? COLOURS[m.color].name : ''}\t${m.name || ''}${m.comment ? '\t' + m.comment.replace(/\s+/g, ' ') : ''}`;
  function toText(markers, { fps = 25, zero = 0 } = {}) { return markers.map(m => lineOf(m, fps, zero)).join('\n') + '\n'; }
  function toCSV(markers, { fps = 25, zero = 0 } = {}) {
    const q = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return ['In,Out,Duration,Colour,Name,Comment'].concat(markers.map(m => [tc(m.start, fps, zero), m.end > m.start ? tc(m.end, fps, zero) : '', m.end > m.start ? (m.end - m.start).toFixed(2) : '', COLOURS[m.color] ? COLOURS[m.color].name : '', m.name || '', m.comment || ''].map(q).join(','))).join('\r\n') + '\r\n';
  }
  /** YouTube chapters: the first at 0:00, at least 10 s apart (closer ones are skipped). */
  function toChapters(markers) {
    const out = []; let last = -Infinity;
    const fmt = t => { const s = Math.floor(t), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60; return `${hh ? hh + ':' + String(mm).padStart(2, '0') : mm}:${String(ss).padStart(2, '0')}`; };
    const ms = markers.slice().sort((a, b) => a.start - b.start);
    if (!ms.length) return '';
    if (ms[0].start > 0.5) out.push(`0:00 Intro`), last = 0;
    for (const m of ms) { if (m.start - last < 10) continue; out.push(`${fmt(m.start)} ${m.name || 'Chapter'}`); last = m.start; }
    return out.join('\n') + '\n';
  }

  /* ---------- making markers ---------- */
  /** Every `every` seconds from..to: "Every 30 s · 1", "… 2". */
  function every(seconds, { from = 0, to = 0, name = '', color = 0 } = {}) {
    const out = [], step = Math.max(1, +seconds || 0);
    for (let t = from, n = 1; t < to - 0.01 && out.length < 1000; t += step, n++) out.push({ start: t, end: null, name: `${name || 'Marker'} ${n}`, comment: '', color });
    return out;
  }
  /**
   * At every cut on a track (where one piece meets the next) or at the start of every clip, named after the clip.
   * -> [{start, name, comment, color}]
   */
  function atClips(clips, { mode = 'cuts', color = 0, frame = 1 / 25 } = {}) {
    const cs = (clips || []).filter(c => !c.disabled).slice().sort((a, b) => a.start - b.start), out = [];
    cs.forEach((c, i) => {
      const p = cs[i - 1];
      if (mode === 'cuts' && !(p && Math.abs(c.start - p.end) <= frame * 1.5)) return;
      out.push({ start: c.start, end: null, name: mode === 'cuts' ? `Cut ${out.length + 1}` : c.name, comment: mode === 'cuts' ? `${p.name} → ${c.name}` : '', color });
    });
    return out;
  }
  /** The clips' own markers where they show on the timeline (only those inside the part of the clip used). */
  function clipMarkersOnTimeline(uses, { tag = true } = {}) {
    const out = [];
    for (const u of uses) {
      const sp = Math.abs(u.clip.speed || 1) || 1;
      for (const m of u.markers || []) {
        if (m.start < u.clip.in - 1e-6 || m.start > u.clip.out + 1e-6) continue;
        const start = u.clip.start + (m.start - u.clip.in) / sp, end = m.end > m.start ? Math.min(u.clip.end, start + (m.end - m.start) / sp) : null;
        out.push({ start, end, name: m.name || '', comment: [m.comment, tag ? `From the clip “${u.clip.name}”` : ''].filter(Boolean).join('\n'), color: m.color || 0 });
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }
  /** Duplicates: a marker at the same time (within a frame) with the same name as one before it -> guids. */
  function duplicates(markers, frame = 1 / 25) {
    const out = [], ms = markers.slice().sort((a, b) => a.start - b.start);
    ms.forEach((m, i) => { for (let j = i - 1; j >= 0 && m.start - ms[j].start <= frame; j--) if ((ms[j].name || '') === (m.name || '') && !out.includes(ms[j].guid)) { out.push(m.guid); break; } });
    return out;
  }
  /** The markers a search and colour chips leave. */
  function filter(markers, { text = '', colours = null } = {}) {
    const q = String(text).trim().toLowerCase();
    return markers.filter(m => (!colours || colours.has(m.color)) && (!q || `${m.name} ${m.comment}`.toLowerCase().includes(q)));
  }
  /** New names from a pattern: {n} number, {name} the old name, {tc} its timecode. */
  function rename(markers, pattern, { fps = 25, zero = 0, from = 1 } = {}) {
    return markers.map((m, i) => ({ guid: m.guid, name: String(pattern).replace(/\{n\}/g, String(from + i)).replace(/\{name\}/g, m.name || '').replace(/\{tc\}/g, tc(m.start, fps, zero)).trim() }));
  }

  /* ---------- reading what's there ---------- */
  /** The open sequence: its markers, tracks and timing. */
  async function readSequence(seqId) {
    const [info, timing] = await Promise.all([US.host.call('sequenceInfo', { seqId }), US.host.call('storySequenceTiming', { seqId }).catch(() => ({ zero: 0 }))]);
    const fps = info.fps || (info.frame ? 1 / info.frame : 25);
    return { kind: 'sequence', id: seqId, name: info.name, fps, zero: timing.zero || 0, frame: info.frame || 1 / fps, duration: info.duration, info, markers: (info.markers || []).map(m => Object.assign({ color: 0 }, m, { owner: seqId })) };
  }
  /** The clips selected in the Project panel / Media Pool, each with its markers. */
  async function readClips() {
    const items = (await US.host.call('selectionList', { kinds: ['video', 'audio', 'image'] })) || [];
    if (!items.length) throw new US.UserError('NOTHING_FOUND', { title: 'No clips are selected.', action: `Select clips in the ${RES ? 'Media Pool' : 'Project panel'}, then press Read again.` });
    const out = [];
    for (const it of items.slice(0, 200)) { let ms = []; try { ms = await US.host.call('clipMarkers', { id: it.id }); } catch (e) { /* no markers */ } out.push({ id: it.id, name: it.name, markers: ms.map(m => Object.assign({ color: 0 }, m, { owner: it.id, clip: it.name })) }); }
    return { kind: 'clips', items: out, fps: 25, zero: 0, markers: out.flatMap(x => x.markers) };
  }
  /** Markers changed on their owner (the sequence, or each clip). changes: [{marker, ...fields}] */
  async function update(src, changes) {
    const by = new Map();
    for (const c of changes) { const k = c.marker.owner; if (!by.has(k)) by.set(k, []); by.get(k).push(Object.assign({ guid: c.marker.guid }, c.fields)); }
    let done = 0;
    for (const [owner, list] of by) { const r = await US.host.call('updateMarkers', src.kind === 'sequence' ? { seqId: owner, markers: list } : { id: owner, markers: list }); done += r.done || 0; }
    return done;
  }
  async function remove(src, markers) {
    if (src.kind === 'sequence') return US.host.call('removeSequenceMarkers', { seqId: src.id, guids: markers.map(m => m.guid) });
    let n = 0; const by = new Map();
    for (const m of markers) { if (!by.has(m.owner)) by.set(m.owner, []); by.get(m.owner).push(m.guid); }
    for (const [id, guids] of by) n += await US.host.call('removeClipMarkers', { id, guids });
    return n;
  }

  /* ---------- the Assistant ---------- */
  const seqOrThrow = () => { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE'); return s; };
  US.actions.register({
    id: 'markers.add', tool: 'markers', title: 'Add markers to the sequence', changes: true,
    describe: 'Adds markers to the open sequence: one at the playhead (with a name and colour), one every so many seconds, at every cut, or at the start of every clip.',
    params: { where: { type: 'enum', options: ['playhead', 'every', 'cuts', 'clips'], default: 'playhead', desc: 'At the playhead, every N seconds, at every cut, or at every clip' }, name: { type: 'string', default: '', desc: 'The marker’s name' }, seconds: { type: 'number', default: 30, desc: 'For every: how often' }, color: { type: 'number', default: 0, desc: 'Colour 0–7: green, red, purple, orange, yellow, white, blue, cyan' } },
    examples: ['add a red marker here called fix the sound', 'add a marker every 30 seconds', 'put a marker at every cut'],
    match(t) {
      if (!/\bmarkers?\b/i.test(t) || !/\b(add|put|drop|place|make|mark)\b/i.test(t) || /\b(remove|delete|clear|export|list|copy|save)\b/i.test(t) || /\b(beats?|bars?|tempo|bpm|music|songs?|pauses?|silences?|moments?)\b/i.test(t)) return null;   // those are Beat Cut's, Song Splitter's, Silence Cut's and Story's
      const cw = Object.keys(COLOUR_WORDS).find(w => new RegExp(`\\b${w}\\b`, 'i').test(t)), color = cw ? COLOUR_WORDS[cw] : 0;
      const ev = /\bevery\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|mins?|minutes?)\b/i.exec(t);
      if (ev) return { where: 'every', seconds: +ev[1] * (/^m/i.test(ev[2]) ? 60 : 1), color, _score: 2.6 };
      if (/\b(every|each)\s+(cut|edit)/i.test(t)) return { where: 'cuts', color, _score: 2.6 };
      if (/\b(every|each)\s+(clip|shot)/i.test(t)) return { where: 'clips', color, _score: 2.6 };
      const nm = /\b(?:called|named|saying|that says)\s+["“']?(.+?)["”']?\s*$/i.exec(t);
      return { where: 'playhead', name: nm ? nm[1] : '', color, _score: 2.4 };
    },
    run: async p => {
      const s = seqOrThrow(), src = await readSequence(s.id);
      let ms;
      if (p.where === 'every') ms = every(p.seconds, { to: src.duration, name: p.name || `Every ${p.seconds} s`, color: p.color });
      else if (p.where === 'cuts' || p.where === 'clips') { const tr = (src.info.video || []).find(t => (t.clips || []).length) || (src.info.audio || [])[0]; ms = tr ? atClips(tr.clips, { mode: p.where, color: p.color, frame: src.frame }) : []; }
      else { await US.refreshContext(); const at = US.ctx.sequence && US.ctx.sequence.playhead; if (at == null) throw new US.UserError('NOTHING_FOUND', { title: 'Couldn’t read where the playhead is.' }); ms = [{ start: at, end: null, name: p.name || 'Marker', comment: '', color: p.color }]; }
      if (!ms.length) return { summary: 'No markers to add.' };
      await US.host.call('addSequenceMarkers', { seqId: s.id, markers: ms });
      return { summary: `${US.plural(ms.length, 'marker')} added to “${s.name}”${p.where === 'playhead' ? ` at ${tc(ms[0].start, src.fps, src.zero)}` : ''}.` };
    }
  });
  US.actions.register({
    id: 'markers.export', tool: 'markers', title: 'List the sequence’s markers', changes: false,
    describe: 'Copies the open sequence’s markers as a list (timecode, colour, name, comment) – or as YouTube chapters – ready to paste.',
    params: { as: { type: 'enum', options: ['text', 'chapters'], default: 'text', desc: 'A list, or YouTube chapters' } },
    examples: ['copy the markers as a list', 'export my markers', 'markers as youtube chapters'],
    match: t => (/\bmarkers?\b/i.test(t) && /\b(list|export|copy|save|chapters?)\b/i.test(t) && !/\b(add|remove|delete)\b/i.test(t) ? { as: /\bchapters?\b|youtube/i.test(t) ? 'chapters' : 'text', _score: 2.5 } : null),
    run: async p => {
      const s = seqOrThrow(), src = await readSequence(s.id);
      if (!src.markers.length) return { summary: `“${s.name}” has no markers.` };
      ui.copy(p.as === 'chapters' ? toChapters(src.markers) : toText(src.markers, src));
      return { summary: `${US.plural(src.markers.length, 'marker')} copied${p.as === 'chapters' ? ' as YouTube chapters' : ''} – paste them anywhere.` };
    }
  });
  US.actions.register({
    id: 'markers.clean', tool: 'markers', title: 'Remove duplicate markers', changes: true,
    describe: 'Removes markers on the open sequence that repeat one at the same time with the same name.',
    examples: ['remove duplicate markers', 'clean up the markers'],
    match: t => (/\bmarkers?\b/i.test(t) && /\b(duplicates?|doubled|clean ?up|tidy)\b/i.test(t) ? { _score: 2.6 } : null),
    run: async () => {
      const s = seqOrThrow(), src = await readSequence(s.id), d = duplicates(src.markers, src.frame);
      if (!d.length) return { summary: `No duplicate markers on “${s.name}”.` };
      const n = await US.host.call('removeSequenceMarkers', { seqId: s.id, guids: d });
      return { summary: `${US.plural(n, 'duplicate marker')} removed from “${s.name}”.` };
    }
  });

  /* ---------- the tab ---------- */
  US.tools.register({
    id: 'markers', name: 'Markers', short: 'Markers', icon: 'target', group: 'finish', order: 29,
    blurb: 'Every marker in one list – search, recolour, rename, move and delete them; add them from notes, at cuts or every so often; export them.',
    hostFns: ['sequenceInfo', 'storySequenceTiming', 'addSequenceMarkers', 'removeSequenceMarkers', 'updateMarkers', 'clipMarkers', 'addClipMarkers', 'removeClipMarkers', 'selectionList', 'setPlayhead', 'showInSource'],
    create() {
      const v = ui.toolView({ icon: 'target', title: 'Markers', blurb: 'Every marker on the open sequence – or on the clips selected in the ' + (RES ? 'Media Pool' : 'Project panel') + ' – in one list. Search and filter by colour; rename, recolour, comment, move or delete them one at a time or ticked together. Add markers at the playhead, every so often, at every cut, or from pasted notes and review exports. Export them as a list, a spreadsheet or YouTube chapters.' });
      let where = US.settings.get('markers.where', 'sequence'), src = null, text = '', colours = null, ticked = new Set(), err = null;
      const listBox = h('div'), head = h('div.field-hint');
      const run = (title, fn) => US.jobs.run({ title, tool: 'markers' }, fn);
      async function read(job) {
        err = null;
        try {
          if (where === 'sequence') { const s = US.ctx.sequence; if (!s) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence is open.', action: 'Open one in the Timeline, then press Read again.' }); src = await readSequence(s.id); }
          else src = await readClips();
        } catch (e) { src = null; err = e; }
        ticked = new Set(Array.from(ticked).filter(g => src && src.markers.some(m => m.guid === g)));
        draw();
        return { summary: src ? `${US.plural(src.markers.length, 'marker')}` : 'nothing read' };
      }
      const shown = () => (src ? filter(src.markers, { text, colours }) : []);
      const sel = () => (src ? src.markers.filter(m => ticked.has(m.guid)) : []);
      const after = async p => { await p; await read(); };
      function jump(m) {
        if (src.kind === 'sequence') US.host.call('setPlayhead', { seqId: src.id, seconds: m.start }).catch(e => ui.showError(e));
        else US.host.call('showInSource', { id: m.owner, seconds: m.start }).catch(e => ui.showError(e));
      }
      const swatch = (c, onPick) => {
        const s = ui.select({ options: COLOURS.map(x => ({ value: String(x.i), label: x.name })), value: String(c), onChange: x => onPick(+x) });
        s.classList.add('marker-colour'); s.style.borderLeft = `6px solid ${(COLOURS[c] || COLOURS[0]).hex}`;
        return s;
      };
      function row(m) {
        const ch = fields => run('Changing the marker', () => after(update(src, [{ marker: m, fields }]))).catch(() => {});
        const name = h('input.input.marker-name', { value: m.name || '', placeholder: 'Name', onchange: e => ch({ name: e.target.value }) });
        const comment = h('input.input.marker-comment', { value: m.comment || '', placeholder: 'Comment', onchange: e => ch({ comment: e.target.value }) });
        return h('div.marker-row' + (ticked.has(m.guid) ? '.on' : ''),
          h('input', { type: 'checkbox', checked: ticked.has(m.guid), onchange: e => { if (e.target.checked) ticked.add(m.guid); else ticked.delete(m.guid); drawBulk(); } }),
          swatch(m.color, c => ch({ color: c })),
          h('button.btn.small.ghost.marker-tc', { title: src.kind === 'sequence' ? 'Move the playhead here' : 'Show in the Source Monitor', onclick: () => jump(m) }, tc(m.start, src.fps, src.zero) + (m.end > m.start + 1e-6 ? ` · ${US.fmtDur(m.end - m.start, true)}` : '')),
          h('div.grow.marker-texts', m.clip ? h('div.field-hint', m.clip) : null, name, comment),
          h('button.icon-btn', { title: 'Delete this marker', onclick: () => run('Deleting the marker', () => after(remove(src, [m]))) }, US.icon('close', 14)));
      }
      const bulk = h('div.row.marker-bulk');
      function drawBulk() {
        US.clear(bulk);
        const n = ticked.size; if (!src || !n) return;
        bulk.append(h('b', `${n} ticked`),
          swatch(0, c => run('Recolouring', () => after(update(src, sel().map(m => ({ marker: m, fields: { color: c } })))))),
          ui.button('Rename…', { small: true, onClick: async () => { const pat = await ui.promptText({ title: 'Rename the ticked markers', label: '{n} a number · {name} the old name · {tc} its timecode', value: 'Shot {n}' }); if (pat) run('Renaming', () => after(update(src, rename(sel(), pat, src).map((x, i) => ({ marker: sel()[i], fields: { name: x.name } }))))); } }),
          ui.button('Move…', { small: true, title: 'Shift them earlier or later', onClick: async () => { const s = await ui.promptText({ title: 'Move the ticked markers', label: 'Seconds – negative for earlier (e.g. -2.5)', value: '1' }); const by = parseFloat(s); if (s != null && isFinite(by) && by) run('Moving', () => after(update(src, sel().map(m => ({ marker: m, fields: { start: Math.max(0, m.start + by), end: m.end > m.start ? Math.max(0, m.end + by) : null } }))))); } }),
          ui.button('Copy as text', { small: true, kind: 'ghost', onClick: () => { ui.copy(toText(sel(), src)); ui.toast({ type: 'ok', title: `${US.plural(n, 'marker')} copied` }); } }),
          src.kind === 'sequence' ? ui.button('Onto the clips', { small: true, kind: 'ghost', title: 'Copy them onto the clips under them, so they travel with the clips (Source Monitor and every use)', onClick: () => run('Copying onto the clips', async () => { await US.host.call('addSequenceMarkers', { seqId: src.id, markers: sel().map(m => ({ start: m.start, end: m.end > m.start ? m.end : null, name: m.name, comment: m.comment, color: m.color })), where: 'clips' }); await read(); return { summary: `${US.plural(n, 'marker')} copied onto the clips under them` }; }) }) : null,
          ui.button('Delete', { small: true, kind: 'danger', onClick: async () => { if (await ui.confirm({ title: `Delete ${US.plural(n, 'marker')}?`, text: 'Undo in ' + (RES ? 'Resolve' : 'Premiere') + ' brings them back.' })) run('Deleting markers', () => after(remove(src, sel()))); } }),
          ui.button('Untick', { small: true, kind: 'ghost', onClick: () => { ticked.clear(); draw(); } }));
      }
      function draw() {
        US.clear(listBox);
        if (err) { listBox.appendChild(ui.note(err.title || err.message, 'info')); if (err.action) listBox.appendChild(h('div.field-hint', err.action)); head.textContent = ''; drawBulk(); return; }
        if (!src) return;
        head.textContent = src.kind === 'sequence' ? `“${src.name}” · ${US.plural(src.markers.length, 'marker')}` : `${US.plural(src.items.length, 'clip')} · ${US.plural(src.markers.length, 'marker')}`;
        const list = shown();
        const counts = COLOURS.map(c => src.markers.filter(m => m.color === c.i).length);
        const chips = h('div.row.marker-chips', COLOURS.filter(c => counts[c.i]).map(c => h('button.marker-chip' + (!colours || colours.has(c.i) ? '.on' : ''), { style: { borderColor: c.hex }, title: c.name, onclick: () => { colours = colours || new Set(COLOURS.map(x => x.i)); if (colours.has(c.i)) colours.delete(c.i); else colours.add(c.i); if (colours.size === 8) colours = null; draw(); } }, h('i', { style: { background: c.hex } }), String(counts[c.i]))));
        const all = h('label.row', h('input', { type: 'checkbox', checked: list.length > 0 && list.every(m => ticked.has(m.guid)), onchange: e => { for (const m of list) { if (e.target.checked) ticked.add(m.guid); else ticked.delete(m.guid); } draw(); } }), h('span.field-hint', `Tick all ${list.length} shown`));
        listBox.append(chips, list.length ? all : null,
          list.length ? h('div.marker-list', list.slice(0, 500).map(row)) : ui.empty(src.markers.length ? 'No markers match.' : 'No markers yet – add some below.'),
          list.length > 500 ? h('div.field-hint', `Showing the first 500 of ${list.length}.`) : null);
        drawBulk();
        if (src.kind === 'sequence') trackSel.setOptions(tracks(), trackSel.value || 'v0');
      }
      const search = ui.input({ placeholder: 'Search names and comments…', onInput: x => { text = x; draw(); } });
      const whereSeg = ui.segmented({ value: where, onChange: x => { where = x; US.settings.set('markers.where', x); ticked.clear(); colours = null; read(); }, options: [{ value: 'sequence', label: 'The open sequence' }, { value: 'clips', label: RES ? 'Clips selected in the Media Pool' : 'Clips selected in the Project panel' }] });

      /* adding */
      const addColour = { c: US.settings.get('markers.colour', 0) };
      const colourPick = swatch(addColour.c, c => { addColour.c = c; US.settings.set('markers.colour', c); colourPick.style.borderLeft = `6px solid ${COLOURS[c].hex}`; });
      const nameIn = ui.input({ placeholder: 'Name (optional)' });
      const addTo = async (ms, what) => {
        if (!ms.length) return { summary: 'No markers to add.' };
        if (src.kind === 'sequence') await US.host.call('addSequenceMarkers', { seqId: src.id, markers: ms });
        else for (const it of src.items) await US.host.call('addClipMarkers', { id: it.id, markers: ms });
        await read(); return { summary: `${US.plural(ms.length, 'marker')} added${what ? ' ' + what : ''}` };
      };
      const needSeq = () => { if (!src || src.kind !== 'sequence') throw new US.UserError('BAD_INPUT', { title: 'This adds to the open sequence.', action: 'Choose “The open sequence” at the top.' }); };
      const hereBtn = ui.button('At the playhead', { small: true, icon: 'plus', onClick: () => run('Adding a marker', async () => { needSeq(); await US.refreshContext(); const at = US.ctx.sequence && US.ctx.sequence.playhead; if (at == null) throw new US.UserError('NOTHING_FOUND', { title: 'Couldn’t read where the playhead is.' }); return addTo([{ start: at, end: null, name: nameIn.value.trim() || 'Marker', comment: '', color: addColour.c }], `at ${tc(at, src.fps, src.zero)}`); }) });
      const everyIn = ui.input({ value: US.settings.get('markers.every', '30'), placeholder: 'Seconds' }); everyIn.classList.add('marker-every');
      const everyBtn = ui.button('Every … seconds', { small: true, onClick: () => run('Adding markers', async () => { needSeq(); US.settings.set('markers.every', everyIn.value); const s = parseTime(everyIn.value, src.fps); if (!s) throw new US.UserError('BAD_INPUT', { title: 'Say how often – e.g. 30 or 1:00.' }); return addTo(every(s, { to: src.duration, name: nameIn.value.trim() || 'Marker', color: addColour.c })); }) });
      const tracks = () => (src && src.kind === 'sequence' ? (src.info.video || []).map(t => ({ value: 'v' + t.index, label: `V${t.index + 1}${t.name ? ' ' + t.name : ''} (${(t.clips || []).length})` })).concat((src.info.audio || []).map(t => ({ value: 'a' + t.index, label: `A${t.index + 1} (${(t.clips || []).length})` }))) : []);
      const trackOf = v => { const t = String(v || 'v0'); return ((t[0] === 'a' ? src.info.audio : src.info.video) || [])[+t.slice(1)]; };
      const trackSel = ui.select({ options: [], placeholder: 'Track…' });
      const cutsBtn = ui.button('At every cut', { small: true, onClick: () => run('Marking the cuts', async () => { needSeq(); const tr = trackOf(trackSel.value); return addTo(atClips(tr ? tr.clips : [], { mode: 'cuts', color: addColour.c, frame: src.frame }), 'at the cuts'); }) });
      const clipsBtn = ui.button('At every clip', { small: true, title: 'At the start of every clip on the track, named after the clip', onClick: () => run('Marking the clips', async () => { needSeq(); const tr = trackOf(trackSel.value); return addTo(atClips(tr ? tr.clips : [], { mode: 'clips', color: addColour.c, frame: src.frame }), 'at the clips'); }) });
      const fromClipsBtn = ui.button('Show the clips’ own markers', { small: true, title: 'Markers on the source clips (made in the Source Monitor) added as sequence markers where those parts of the clips are used', onClick: () => run('Reading the clips’ markers', async () => {
        needSeq(); const uses = [], seen = new Map();
        for (const tr of (src.info.video || []).concat(src.info.audio || [])) for (const c of tr.clips || []) {
          if (!c.itemId || c.isSequence) continue;
          if (!seen.has(c.itemId)) { let ms = []; try { ms = await US.host.call('clipMarkers', { id: c.itemId }); } catch (e) { /* none */ } seen.set(c.itemId, ms); }
          uses.push({ clip: c, markers: seen.get(c.itemId) });
        }
        const have = new Set(src.markers.map(m => `${Math.round(m.start / src.frame)}|${m.name}`));
        const ms = clipMarkersOnTimeline(uses).filter(m => !have.has(`${Math.round(m.start / src.frame)}|${m.name}`) && (have.add(`${Math.round(m.start / src.frame)}|${m.name}`), true));
        return addTo(ms, 'from the clips');
      }) });
      const notes = h('textarea.input', { rows: 5, placeholder: '01:23 Fix the colour here\n02:10–02:25 Too long, trim\n[red] 03:05 Wrong name in the lower third\n…or paste a review export (CSV with a Timecode column)' });
      const notesHint = h('div.field-hint');
      notes.addEventListener('input', US.debounce(() => { const n = fromText(notes.value, src || {}).length; notesHint.textContent = notes.value.trim() ? `${US.plural(n, 'marker')} found in the notes` : ''; }, 200));
      const notesBtn = ui.button('Add the notes as markers', { small: true, kind: 'primary', onClick: () => run('Adding the notes', async () => { if (!src) throw new US.UserError('NOTHING_FOUND', { title: 'Read the sequence or clips first.' }); const ms = fromText(notes.value, Object.assign({}, src, { color: addColour.c })); if (!ms.length) throw new US.UserError('BAD_INPUT', { title: 'No timecodes found in the notes.', action: 'One note per line, starting with a time like 01:23 or 00:01:23:12.' }); const r = await addTo(ms, 'from the notes'); notes.value = ''; notesHint.textContent = ''; return r; }) });
      const notesFile = ui.button('Load a file…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { const f = US.app.pickFiles({ title: 'Choose notes or a review export', ext: ['txt', 'csv', 'tsv', 'md'] }); if (f && f.length) { try { notes.value = require('fs').readFileSync(US.normPath(f[0]), 'utf8'); notes.dispatchEvent(new Event('input')); } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); } } } });

      /* out */
      const outRow = h('div.row.marker-out',
        ui.button('Copy as a list', { small: true, onClick: () => { if (!src) return; ui.copy(toText(shown(), src)); ui.toast({ type: 'ok', title: `${US.plural(shown().length, 'marker')} copied` }); } }),
        ui.button('Copy as YouTube chapters', { small: true, onClick: () => { if (!src) return; ui.copy(toChapters(shown())); ui.toast({ type: 'ok', title: 'Chapters copied', text: 'The first at 0:00, at least 10 s apart.' }); } }),
        ui.button('Save as spreadsheet', { small: true, icon: 'folder', onClick: () => { if (!src) return; try { const f = US.audioKit.saveText(`Markers – ${US.audioKit.safeName(src.name || 'clips')}.csv`, '﻿' + toCSV(shown(), src)); ui.toast({ type: 'ok', title: 'Markers saved', text: `In Documents › JMG Ultra Studio (${US.basename(f)}).`, action: { label: 'Open', fn: () => US.audioKit.open(f) } }); } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); } } }));
      const tidyRow = h('div.row',
        ui.button('Remove duplicates', { small: true, title: 'Markers at the same time with the same name as another', onClick: () => run('Removing duplicates', async () => { if (!src) return null; const d = duplicates(src.markers, src.frame || 0.04); if (!d.length) return { summary: 'No duplicates.' }; const n = await remove(src, src.markers.filter(m => d.includes(m.guid))); await read(); return { summary: `${US.plural(n, 'duplicate')} removed` }; }) }),
        ui.button('Remove the ones shown…', { small: true, kind: 'ghost', title: 'Every marker the search and colours leave', onClick: async () => { const list = shown(); if (!list.length) return; if (await ui.confirm({ title: `Delete ${US.plural(list.length, 'marker')}?`, text: (text || colours ? 'Every marker the search and colours leave. ' : 'Every marker in the list. ') + 'Undo in ' + (RES ? 'Resolve' : 'Premiere') + ' brings them back.' })) run('Deleting markers', () => after(remove(src, list))); } }));

      v.body.append(
        ui.card(whereSeg, h('div.row', h('div.grow', search), ui.button('Read again', { small: true, icon: 'refresh', onClick: () => run('Reading the markers', read) })), head, bulk, listBox),
        ui.card(h('div.card-title', 'Add markers'), h('div.row.marker-add', colourPick, h('div.grow', nameIn)),
          h('div.row.marker-add', hereBtn, everyIn, everyBtn),
          h('div.row.marker-add', trackSel, cutsBtn, clipsBtn), h('div.row', fromClipsBtn),
          ui.field('From notes or a review export', notes, notesHint), h('div.row', notesBtn, notesFile)),
        ui.card(h('div.card-title', 'Export and tidy up'), h('div.field-hint', 'Exports the markers in the list (after the search and colours).'), outRow, tidyRow));
      return { el: v.el, onShow() { read(); } };
    }
  });

  US.markerKit = { COLOURS, colourOf, parseTime, fromText, toText, toCSV, toChapters, every, atClips, clipMarkersOnTimeline, duplicates, filter, rename, readSequence, update };
})();
