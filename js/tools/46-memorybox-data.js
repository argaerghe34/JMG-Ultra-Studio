/* JMG Ultra Studio – Memory Box: reading a family's memorybox.json (schemaVersion 1, from Memory Box's editor
   connection or a team download), and everything that needs no editor: people, dates, filters, what's new since the
   last sync, the text each clip carries, and the plan for the bin. The shape is described in Memory Box's
   docs/memorybox-json.md: fields may be added, none renamed or removed within schemaVersion 1.
   Only text lives here – photos, videos and voice notes stay on this computer and are never sent anywhere. */
(function () {
  'use strict';
  const US = window.US;
  const MB = (US.memoryBox = US.memoryBox || {});
  MB.SCHEMA = 1;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const str = v => (v == null ? '' : String(v).trim());
  const num = v => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));

  /** A path from the file, made safe: relative, '/' between folders, no '..', no drive or root. null when unsafe. */
  function safeRel(p) {
    const s = str(p).replace(/\\/g, '/');
    if (!s || s.startsWith('/') || /^[a-z]:/i.test(s)) return null;
    const parts = s.split('/').filter(x => x && x !== '.');
    if (!parts.length || parts.some(x => x === '..')) return null;
    return parts.join('/');
  }
  MB.safeRel = safeRel;

  /** "12 March 1984", "March 1984", "1984", "1980s" or '' for a Memory Box date. */
  function dateText(d) {
    if (!d || typeof d !== 'object') return '';
    const y = num(d.year), m = num(d.month), day = num(d.day), dec = num(d.decade);
    switch (d.mode) {
      case 'exact': return y ? `${day ? day + ' ' : ''}${m ? MONTHS[m - 1] + ' ' : ''}${y}` : '';
      case 'month': return y ? `${m ? MONTHS[m - 1] + ' ' : ''}${y}` : '';
      case 'year': return y ? String(y) : '';
      case 'decade': return dec != null ? `${dec}s` : y ? `${Math.floor(y / 10) * 10}s` : '';
      default: return '';
    }
  }
  MB.dateText = dateText;
  function decadeOf(d) {
    if (!d || typeof d !== 'object' || d.mode === 'unknown') return null;
    const dec = num(d.decade); if (dec != null) return dec;
    const y = num(d.year); return y ? Math.floor(y / 10) * 10 : null;
  }
  /** For sorting: year, month, day (unknown parts first within their year), or Infinity when there is no date. */
  function dateKey(d) {
    if (!d || typeof d !== 'object' || d.mode === 'unknown') return Infinity;
    const y = num(d.year) || num(d.decade); if (!y) return Infinity;
    return y * 10000 + (num(d.month) || 0) * 100 + (num(d.day) || 0);
  }

  /**
   * Read memorybox.json (an object or its text) into the model the tool works with.
   * -> {schemaVersion, newer, family, export, asOf, people: [..], person(id), chapters, tags, items, warnings}
   * People merged in Memory Box (mergedPeople) are followed to the person they became. Private team notes about people
   * are kept only when the download says so (export.privateNotes).
   */
  MB.parse = function (input) {
    let j = input;
    if (typeof j === 'string') { try { j = JSON.parse(j.replace(/^﻿/, '')); } catch (e) { throw new US.UserError('BAD_INPUT', { title: 'That memorybox.json can’t be read.', action: 'Download it again from Memory Box.', detail: e.message }); } }
    if (!j || typeof j !== 'object' || !Array.isArray(j.items)) throw new US.UserError('BAD_INPUT', { title: 'That isn’t a Memory Box download.', action: 'Choose the folder you unzipped (it has memorybox.json in it), or the ZIP parts.' });
    const version = num(j.schemaVersion) || 0;
    if (version < 1) throw new US.UserError('BAD_INPUT', { title: 'That memorybox.json is from an unknown version of Memory Box.', detail: 'schemaVersion ' + j.schemaVersion });
    if (version > MB.SCHEMA) throw new US.UserError('BAD_INPUT', { title: 'This Memory Box download is newer than Ultra Studio understands.', action: 'Update Ultra Studio (Home › Check for updates), then try again.', detail: 'schemaVersion ' + version });
    const warnings = [];
    const ex = j.export || {}, privateNotes = ex.privateNotes === true;
    const family = { id: str(j.family && j.family.id), name: str(j.family && j.family.name) || 'Memory Box family' };
    if (!family.id) warnings.push('The download doesn’t say which family it is: clips can’t be matched to a later download.');

    // people, with merged ids followed (chains, never round in circles)
    const merged = new Map();
    for (const m of j.mergedPeople || []) if (m && m.from && m.into && m.from !== m.into) merged.set(String(m.from), String(m.into));
    const resolveId = id => { let x = id == null ? null : String(id); for (let i = 0; x && merged.has(x) && i < 50; i++) x = merged.get(x); return x; };
    const people = new Map();
    let unnamed = 0;
    for (const p of j.people || []) {
      if (!p || !p.id) continue;
      const name = str(p.name);
      const label = name || str(p.label) || `Unnamed person ${++unnamed}`;
      people.set(String(p.id), { id: String(p.id), name: name || null, label, named: !!name, relation: str(p.relation), familyNotes: str(p.familyNotes), teamNotes: privateNotes ? str(p.teamNotes) : '', items: 0, faces: 0 });
    }
    const person = id => { const r = resolveId(id); return r ? people.get(r) || null : null; };

    const chapters = (j.chapters || []).filter(c => c && c.id).map(c => ({ id: String(c.id), label: str(c.label) || 'Chapter', order: num(c.order) || 0, items: 0 })).sort((a, b) => a.order - b.order);
    const chapterById = new Map(chapters.map(c => [c.id, c]));
    const tags = (j.tags || []).filter(t => t && t.id).map(t => ({ id: String(t.id), label: str(t.label) || 'Tag', kind: str(t.kind) || 'tag', items: 0 }));
    const tagById = new Map(tags.map(t => [t.id, t]));

    const seenIds = new Set(), items = [];
    for (const it of j.items) {
      if (!it || !it.id) continue;
      const id = String(it.id);
      if (seenIds.has(id)) { warnings.push(`Item ${id} is listed twice: the first is used.`); continue; }
      seenIds.add(id);
      const team = it.team && typeof it.team === 'object' ? it.team : null;
      // people on the item: the family's, the team's, then named pins and faces (a suggested face counts as "maybe")
      const ppl = new Map();
      const addP = (pid, maybe, how) => {
        const p = person(pid); if (!p) return;
        const had = ppl.get(p.id);
        if (!had) ppl.set(p.id, { id: p.id, label: p.label, named: p.named, maybe: !!maybe, how });
        else if (had.maybe && !maybe) had.maybe = false;
      };
      for (const x of it.people || []) if (x) addP(typeof x === 'string' ? x : x.personId, typeof x === 'object' && x.maybe, 'tagged');
      if (team) for (const x of team.people || []) if (x) addP(typeof x === 'string' ? x : x.personId, typeof x === 'object' && x.maybe, 'team');
      for (const x of it.pins || []) if (x && x.personId) addP(x.personId, false, 'pin');
      const faces = [];
      for (const f of it.faces || []) {
        if (!f) continue;
        const p = f.personId ? person(f.personId) : null, maybe = f.state === 'suggested' || f.state === 'unnamed';
        faces.push({ id: str(f.id), x: num(f.x) || 0, y: num(f.y) || 0, w: num(f.w) || 0, h: num(f.h) || 0, personId: p ? p.id : null, maybe, fromCover: !!f.fromCover });
        if (p) addP(p.id, maybe, 'face');
      }
      const date = team && team.date && team.date.mode && team.date.mode !== 'unknown' ? team.date : it.date;
      const hasDate = !!dateText(date);
      const sugg = !hasDate && it.suggestedDate ? it.suggestedDate : null;
      const chs = (it.chapters || []).map(c => chapterById.get(String(c))).filter(Boolean).sort((a, b) => a.order - b.order);
      const tg = (it.tags || []).map(t => tagById.get(String(t))).filter(Boolean);
      const file = it.file || {};
      const rel = safeRel(file.path);
      if (file.path && !rel) warnings.push(`${str(it.originalName) || id}: its file path isn’t safe to use, so it’s left out.`);
      const voice = it.voiceNote && safeRel(it.voiceNote.path);
      const o = {
        id, seq: num(it.seq), storyOrder: num(it.storyOrder), type: it.type === 'video' ? 'video' : it.type === 'photo' ? 'photo' : 'other',
        contentType: str(it.contentType), originalName: str(it.originalName) || (rel ? rel.split('/').pop() : id), bytes: num(it.bytes), sha256: str(it.sha256) || null,
        path: rel, part: num(file.part), voice: voice || null, voicePart: it.voiceNote ? num(it.voiceNote.part) : null,
        width: num(it.width), height: num(it.height), duration: num(it.durationSeconds), coverSeconds: num(it.coverSeconds),
        uploadedAt: str(it.uploadedAt), updatedAt: str(it.updatedAt), uploadedBy: str(it.uploadedBy), batch: num(it.batch), hidden: !!it.hidden,
        people: [...ppl.values()], faces, pins: (it.pins || []).filter(Boolean).map(p => ({ personId: p.personId ? (person(p.personId) || {}).id || null : null, x: num(p.x) || 0, y: num(p.y) || 0 })),
        date: hasDate ? date : sugg, dateText: hasDate ? dateText(date) : sugg && dateText(sugg) ? `about ${dateText(sugg)} (suggested)` : '',
        suggestedDate: !hasDate && !!sugg, decade: decadeOf(hasDate ? date : sugg), dateKey: dateKey(hasDate ? date : sugg),
        place: str(team && team.place) || str(it.place), occasion: str(team && team.occasion) || str(it.occasion), story: str(it.story), group: str(it.group),
        chapterIds: chs.map(c => c.id), chapters: chs.map(c => c.label), chapterOrder: chs.length ? chs[0].order : Infinity,
        tagIds: tg.map(t => t.id), tags: tg.map(t => t.label),
        questions: (it.questions || []).filter(q => q && str(q.question)).map(q => ({ q: str(q.question), a: str(q.answer) })),
        teamNote: str(team && team.note), nearCopyOf: it.nearCopyOf ? String(it.nearCopyOf) : null, facesMayBeStale: !!it.facesMayBeStale
      };
      items.push(o);
      for (const p of o.people) { const pp = people.get(p.id); if (pp) pp.items++; }
      for (const f of o.faces) { const pp = f.personId && people.get(f.personId); if (pp) pp.faces++; }
      for (const c of chs) c.items++;
      for (const t of tg) t.items++;
    }
    // story order: Memory Box's own, else chapter order then date then photo number
    items.sort((a, b) => (a.storyOrder != null && b.storyOrder != null ? a.storyOrder - b.storyOrder : 0)
      || (a.chapterOrder - b.chapterOrder) || (a.dateKey - b.dateKey) || ((a.seq || 0) - (b.seq || 0)));
    items.forEach((x, i) => { x.order = x.storyOrder != null ? x.storyOrder : i + 1; });
    const byId = new Map(items.map(x => [x.id, x]));
    return {
      schemaVersion: version, family, export: ex, asOf: str(ex.asOf), privateNotes, generator: j.generator || {},
      people: [...people.values()].sort((a, b) => (b.named - a.named) || (b.items - a.items) || a.label.localeCompare(b.label)),
      person, chapters, tags, items, byId, warnings
    };
  };

  /* ---------- the text each clip carries ---------- */
  const peopleText = it => it.people.map(p => p.label + (p.maybe ? ' (maybe)' : '')).join(', ');
  /** The clip's name: story order first, so a bin sorted by name is in the film's order. */
  MB.clipName = (it, width = 3) => `${String(it.order).padStart(width, '0')} – ${it.originalName}`;
  /** The id a clip keeps in the editor, so the next sync finds it: "<family id>/<item id>" (voice notes add "#voice"). */
  MB.key = (model, it, voice) => `${model.family.id || 'family'}/${it.id}${voice ? '#voice' : ''}`;
  MB.parseKey = k => { const m = /^(.*)\/([^/#]+)(#voice)?$/.exec(String(k || '')); return m ? { family: m[1], item: m[2], voice: !!m[3] } : null; };

  /**
   * The fields written on the clip, the same in both editors (Premiere: Description, Comment, Log Note, Scene, Shot,
   * Client; Resolve: Description, Comments, Keywords, People, Scene, Shot). Everything the family said is in the log
   * note, so it's all searchable in the bin.
   */
  MB.fields = function (model, it, { voice = false } = {}) {
    const lines = [];
    const add = (label, v) => { if (v) lines.push(`${label}: ${v}`); };
    if (voice) lines.push(`Voice note about ${it.originalName}`);
    add('Story', it.story);
    add('People', peopleText(it));
    add('Date', it.dateText);
    add('Place', it.place);
    add('Occasion', it.occasion);
    add('Chapters', it.chapters.join(', '));
    add('Tags', it.tags.join(', '));
    add('Group', it.group);
    for (const q of it.questions) lines.push(`Q: ${q.q}` + (q.a ? `\nA: ${q.a}` : ' (not answered yet)'));
    if (it.voice && !voice) add('Voice note', it.voice);
    add('Team note', it.teamNote);
    if (it.nearCopyOf && model.byId.get(it.nearCopyOf)) add('Looks like a copy of', MB.clipName(model.byId.get(it.nearCopyOf)));
    lines.push(`Memory Box: ${model.family.name} · photo ${it.seq != null ? it.seq : '?'}${it.uploadedBy ? ` · uploaded by ${it.uploadedBy}` : ''}`);
    const keywords = [...it.people.filter(p => !p.maybe && p.named).map(p => p.label), it.place, it.occasion, ...it.chapters, ...it.tags, it.decade != null ? `${it.decade}s` : ''].filter(Boolean);
    return {
      description: it.story || it.occasion || '',
      comment: peopleText(it),
      people: peopleText(it),
      logNote: lines.join('\n'),
      scene: it.chapters.join(', '),
      shot: it.dateText,
      client: model.family.name,
      keywords: [...new Set(keywords)].join(', ')
    };
  };

  /* ---------- browsing ---------- */
  /** Counts for the pickers: people (named first), decades (in order), chapters, tags, places, occasions. */
  MB.facets = function (model, items = model.items) {
    const count = (fn) => { const m = new Map(); for (const it of items) for (const k of [].concat(fn(it)).filter(x => x != null && x !== '')) m.set(k, (m.get(k) || 0) + 1); return m; };
    const dec = count(it => (it.decade != null ? it.decade : 'unknown'));
    return {
      people: model.people.map(p => ({ id: p.id, label: p.label, named: p.named, relation: p.relation, count: items.filter(it => it.people.some(x => x.id === p.id)).length, faces: p.faces })).filter(p => p.count),
      decades: [...dec.entries()].sort((a, b) => (a[0] === 'unknown') - (b[0] === 'unknown') || a[0] - b[0]).map(([k, n]) => ({ id: String(k), label: k === 'unknown' ? 'Date unknown' : `${k}s`, count: n })),
      chapters: model.chapters.map(c => ({ id: c.id, label: c.label, count: items.filter(it => it.chapterIds.includes(c.id)).length })).filter(c => c.count),
      tags: model.tags.map(t => ({ id: t.id, label: t.label, count: items.filter(it => it.tagIds.includes(t.id)).length })).filter(t => t.count).sort((a, b) => b.count - a.count),
      places: [...count(it => it.place).entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k, label: k, count: n })),
      occasions: [...count(it => it.occasion).entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k, label: k, count: n }))
    };
  };

  /** The text searched by the search box: everything the family and team wrote about it. */
  const searchText = it => [it.originalName, it.story, it.place, it.occasion, it.group, it.dateText, it.uploadedBy, it.teamNote, ...it.chapters, ...it.tags,
    ...it.people.map(p => p.label), ...it.questions.map(q => q.q + ' ' + q.a)].join(' \n ').toLowerCase();

  /**
   * Items matching a filter: {q (words, all must match), type: 'photo'|'video', person, decade ('1980' or 'unknown'),
   * chapter, tag, place, occasion, only: 'new'|'changed'|'notHere', status (from MB.diff / MB.status)}.
   */
  MB.filter = function (model, f = {}, status = null) {
    const words = str(f.q).toLowerCase().split(/\s+/).filter(Boolean);
    return model.items.filter(it => {
      if (f.type && it.type !== f.type) return false;
      if (f.person && !it.people.some(p => p.id === f.person)) return false;
      if (f.decade && String(it.decade != null ? it.decade : 'unknown') !== String(f.decade)) return false;
      if (f.chapter && !it.chapterIds.includes(f.chapter)) return false;
      if (f.tag && !it.tagIds.includes(f.tag)) return false;
      if (f.place && it.place !== f.place) return false;
      if (f.occasion && it.occasion !== f.occasion) return false;
      if (f.only && status) { const s = status.get(it.id); if (f.only === 'new' ? s !== 'new' : f.only === 'changed' ? s !== 'changed' : f.only === 'updates' ? s !== 'new' && s !== 'changed' : false) return false; }
      if (words.length) { const t = searchText(it); if (!words.every(w => t.includes(w))) return false; }
      return true;
    });
  };

  /* ---------- what's new since the last sync ---------- */
  /** A fingerprint of what an item says (not where its file is): it changes when the family or team change anything. */
  MB.fingerprint = function (it) {
    const o = [it.story, it.place, it.occasion, it.group, it.dateText, it.chapters, it.tags, it.people.map(p => [p.id, p.label, p.maybe]), it.questions, it.teamNote, it.faces.map(f => [f.personId, f.maybe]), it.order, it.originalName, it.sha256, it.bytes];
    return US.fsx.hash(JSON.stringify(o));
  };
  /** What the editor has from the last sync (kept in the project): {asOf, items: {id: fingerprint}}. */
  MB.snapshot = (model, items = model.items, prev = null) => {
    const out = { asOf: model.asOf || new Date().toISOString(), familyName: model.family.name, items: Object.assign({}, prev && prev.items) };
    for (const it of items) out.items[it.id] = MB.fingerprint(it);
    return out;
  };
  /**
   * Compare with the last sync -> {status: Map(id → 'new'|'changed'|'same'), added, changed, removed (ids no longer in
   * Memory Box), first (never synced)}.
   */
  MB.diff = function (model, prev) {
    const status = new Map(), added = [], changed = [];
    const had = (prev && prev.items) || {};
    for (const it of model.items) {
      const f = had[it.id];
      if (!f) { status.set(it.id, 'new'); added.push(it); }
      else if (f !== MB.fingerprint(it)) { status.set(it.id, 'changed'); changed.push(it); }
      else status.set(it.id, 'same');
    }
    const removed = Object.keys(had).filter(id => !model.byId.has(id));
    return { status, added, changed, removed, first: !prev };
  };

  /* ---------- the bin ---------- */
  MB.binPath = model => `JMG Ultra Studio/Memory Box – ${model.family.name.replace(/[\/\\:*?"<>|]/g, '-')}`;

  /**
   * What to do in the editor for these items. local(it, voice) gives the file on this computer (or '' when it isn't
   * there); existing = mbScan's clips [{key, id, name, path, offline}].
   * -> {add: [{key, path, name, fields}], update: [{key, clipId, name, fields, relink}], skip: [{item, name, why}]}
   * Every photo and video goes in the one bin, in story order; a voice note right after its photo. A clip already in
   * the project (by key) is updated where it is, and relinked when its file has gone but the new one is here.
   */
  MB.plan = function (model, items, { local, existing = [], voiceNotes = true }) {
    const have = new Map(existing.map(e => [e.key, e]));
    const width = Math.max(3, String(model.items.length).length);
    const add = [], update = [], skip = [];
    const one = (it, voice) => {
      const key = MB.key(model, it, voice), name = MB.clipName(it, width) + (voice ? ' – voice note' : '');
      const path = local(it, voice), fields = MB.fields(model, it, { voice }), ex = have.get(key);
      if (ex) {
        const relink = path && ex.offline && US.normPath(ex.path || '') !== US.normPath(path) ? path : '';
        update.push({ key, clipId: ex.id, name, fields, relink });
      } else if (!path) skip.push({ item: it.id, name, why: voice ? 'voice note not downloaded' : 'not downloaded' });
      else add.push({ key, path, name, fields });
    };
    for (const it of items) {
      if (it.type === 'other') { skip.push({ item: it.id, name: it.originalName, why: 'not a photo or video' }); continue; }
      if (!it.path) { skip.push({ item: it.id, name: it.originalName, why: 'no safe file path' }); continue; }
      one(it, false);
      if (voiceNotes && it.voice) one(it, true);
    }
    return { add, update, skip };
  };

  /** Where an item's file goes on this computer: <folder>/<family name>/<path in Memory Box>. */
  MB.localPath = function (folder, model, rel) {
    const path = require('path');
    const fam = model.family.name.replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').trim() || 'Memory Box family';
    return path.join(folder, fam, ...String(rel).split('/'));
  };

  /** One line for the list: date · place · people. */
  MB.subline = it => [it.type === 'video' ? `Video${it.duration ? ' ' + US.fmtDur(it.duration) : ''}` : '', it.dateText, it.place, it.occasion, it.people.slice(0, 4).map(p => p.label + (p.maybe ? '?' : '')).join(', ') + (it.people.length > 4 ? ` +${it.people.length - 4}` : '')].filter(Boolean).join(' · ');
})();
