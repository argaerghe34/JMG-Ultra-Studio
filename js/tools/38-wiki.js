/* JMG Ultra Studio – Story wiki: a quick reference to the story for the editor, made from every interview's
   transcript. The overview of the story, a summary of each interview, and pages for the people, places, dates and
   other things in it (organisations, events, objects, words) – each fact with the line it comes from, to play, drag or
   place. Typing searches the wiki at once (on this computer); a question it can't answer (“where did Ruth grow up?”)
   goes to the AI, which answers in a sentence or two with the lines that say so. Built once and kept with the project;
   it reads Story's shared transcript, so questions are cheap. Text only. Pure logic (unit-tested) first, then the tab. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const S = () => US.story, CTX = () => US.storyContext, SAI = () => US.storyAI;

  US.addIcon('wiki', 'M10 5.5C8.5 4.3 6.2 3.8 3 4v11c3.2-.2 5.5.3 7 1.5 1.5-1.2 3.8-1.7 7-1.5V4c-3.2-.2-5.5.3-7 1.5zM10 5.5v11');

  const clean = (s, n = 800) => String(s || '').replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*\n\s*/g, '\u0000').replace(/\s*\n\s*/g, ' ').replace(/\u0000/g, '\n\n').trim().slice(0, n);
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const SECTIONS = ['person', 'place', 'date', 'thing'];
  const SECTION_NAMES = { overview: 'Overview', interviews: 'Interviews', person: 'People', place: 'Places', date: 'Dates', thing: 'Things' };

  /* ---------- building ---------- */
  const RULES = [
    'Make a wiki of the story told in these interviews: a quick reference the editor checks while cutting (“where did Ruth grow up?”, “who is Uncle Max?”, “when did the bakery open?”).',
    '- “answer”: the overview – what the story is, who is in it and how it unfolds, in 2–4 short paragraphs separated by a blank line.',
    '- “groups”, each with a “key” saying what it is:',
    '  · key "interview": one for every interview, named “Interview N – <who is interviewed>”; “summary”: what they talk about, in 3–5 sentences; items: their 2–5 key moments (“note”: what it is).',
    '  · key "person": everyone who matters to the story – interviewed or only talked about (family, friends, officials). “name”: their name as they’re known (“Ruth Cohen”, “Uncle Max”, “the mayor”); “summary”: who they are and how they connect to the others, in 1–2 sentences.',
    '  · key "place": towns, countries, streets, buildings, rooms that matter. key "date": things that happened at a time – “name” is the time as it’s said (“1987”, “the winter of 2003”, “after the war”), “summary” is what happened. key "thing": organisations, events, objects, projects and words that need explaining.',
    '  · For person, place, date and thing: items are the facts, each from the line that says it – “note” is the fact in a few words (“grew up in Leeds”, “opened in 1987”), “from”/“to” the line(s) that say it, “tag”: for a date its sortable form (YYYY, YYYY-MM or YYYY-MM-DD, or "" when it can’t be placed), otherwise "". Give the most useful facts – up to 8 each.',
    '- Order each kind most important first. Be thorough: the editor will look things up. “score”: how central it is to the story, 0–1. “lead”: "".',
    '- Never invent anything – only what the interviews say. When people disagree, give both and say who said what. Use names, never line ids or interview numbers, in the text (except the interview groups’ names).'
  ].join('\n');
  function task(k = 0, n = 1) { return RULES + (CTX() ? CTX().partNote(k, n) : ''); }

  /**
   * The answers of every part -> {overview, interviews: [{key, n, title, summary, moments}], person|place|date|thing:
   * [{name, summary, facts: [{from, to, note, tag}], score}]}. where(lineId) -> {key, n} (which interview) or null.
   * Entries with the same name (or one name inside the other's, “Ruth” and “Ruth Cohen”) are put together; dates are
   * in time order, undated last.
   */
  function organise(results, where) {
    const out = { overview: '', interviews: [], person: [], place: [], date: [], thing: [] }, ov = [], ivs = new Map();
    const fact = it => ({ from: String(it.from || ''), to: where(String(it.to || '')) ? String(it.to) : String(it.from || ''), note: clean(it.note, 200), tag: String(it.tag || '').trim() });
    for (const r of results || []) {
      if (!r) continue;
      if (clean(r.answer, 4000)) ov.push(clean(r.answer, 4000));
      for (const g of r.groups || []) {
        const key = String(g.key || '').toLowerCase().trim(), items = (g.items || []).map(fact).filter(f => where(f.from));
        if (key === 'interview') {
          const w = items.length ? where(items[0].from) : null, m = /interview\s+(\d+)/i.exec(g.name || '');
          const ik = w ? w.key : m ? `#${m[1]}` : '';
          if (!ik) continue;
          let I = ivs.get(ik);
          if (!I) { I = { key: ik, n: w ? w.n : +m[1], title: clean(g.name, 120), summary: clean(g.summary, 1500), moments: [] }; ivs.set(ik, I); }
          else if (!I.summary.includes(clean(g.summary, 1500))) I.summary = clean(`${I.summary} ${clean(g.summary, 1500)}`, 2500);
          for (const f of items) if (!I.moments.some(x => x.from === f.from)) I.moments.push(f);
          continue;
        }
        const sec = SECTIONS.includes(key) ? key : key === 'people' ? 'person' : key === 'places' ? 'place' : key === 'dates' || key === 'event' ? 'date' : 'thing';
        const name = clean(g.name, 100);
        if (!name) continue;
        const list = out[sec], nk = norm(name);
        let E = list.find(e => norm(e.name) === nk) || (sec === 'person' || sec === 'place' ? list.find(e => { const a = norm(e.name); return nk.length > 2 && a.length > 2 && (` ${a} `.includes(` ${nk} `) || ` ${nk} `.includes(` ${a} `)); }) : null);
        if (!E) { E = { name, summary: clean(g.summary, 800), facts: [], score: 0 }; list.push(E); }
        else { if (name.length > E.name.length) E.name = name; const sm = clean(g.summary, 800); if (sm && !E.summary.includes(sm)) E.summary = clean(`${E.summary} ${sm}`, 1200); }
        for (const f of items) { E.score = Math.max(E.score, +(g.items.find(x => String(x.from) === f.from) || {}).score || 0); if (!E.facts.some(x => x.from === f.from && x.note === f.note)) E.facts.push(f); }
      }
    }
    out.overview = ov.join('\n\n');
    out.interviews = Array.from(ivs.values()).sort((a, b) => a.n - b.n);
    out.date.forEach(d => { d.when = (d.facts.find(f => /^\d{3,4}/.test(f.tag)) || {}).tag || yearIn(d.name); });
    out.date.sort((a, b) => (!a.when) - (!b.when) || String(a.when).localeCompare(String(b.when)));
    return out;
  }
  /** “the winter of 1987” -> '1987'; none -> '' */
  function yearIn(s) { const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(s || '')); if (m) return m[1]; const d = /\b(1[5-9]\d|20\d)0s\b/.exec(String(s || '')); return d ? d[1] + '0' : ''; }

  /** What the wiki was made from: interviews and lines, so a changed project shows “Update”. */
  const signature = transcripts => `${transcripts.length}:${transcripts.reduce((n, t) => n + (t.lines || []).length, 0)}:${transcripts.map(t => t.key).join(',').length}`;

  /* ---------- looking things up, on this computer ---------- */
  /**
   * Entries matching what's typed (every word, in the name, the summary or a fact; the name counts most).
   * -> [{section, entry, score, hits: [facts that match]}] best first
   */
  function search(wiki, query, { max = 20 } = {}) {
    const words = norm(query).split(' ').filter(w => w.length > 1 && !QSTOP.has(w));
    if (!wiki || !words.length) return [];
    const out = [];
    const consider = (section, entry, name, summary, facts) => {
      const n = norm(name), s = norm(summary), fs = facts.map(f => ({ f, t: norm(f.note) }));
      let score = 0, all = true;
      for (const w of words) {
        const inName = has(n, w), inSum = has(s, w), inFact = fs.some(x => has(x.t, w));
        if (!inName && !inSum && !inFact) { all = false; break; }
        score += inName ? 3 : inFact ? 1.5 : 1;
      }
      if (all) out.push({ section, entry, score: score + (entry.score || 0), hits: fs.filter(x => words.some(w => has(x.t, w))).map(x => x.f).slice(0, 4) });
    };
    for (const sec of SECTIONS) for (const e of wiki[sec] || []) consider(sec, e, e.name, e.summary, e.facts);
    for (const iv of wiki.interviews || []) consider('interviews', iv, iv.title, iv.summary, iv.moments);
    return out.sort((a, b) => b.score - a.score).slice(0, max);
  }
  /** Does a text have the word – as the start of one of its words, or one letter off for longer words (grow/grew)? */
  function has(text, w) {
    for (const t of String(text).split(' ')) {
      if (t.startsWith(w)) return true;
      if (w.length >= 4 && t.length >= 4 && Math.abs(t.length - w.length) <= 1 && near(t, w)) return true;
    }
    return false;
  }
  function near(a, b) { // edit distance at most 1
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  // question words left out of a lookup (“where did ruth grow up” looks for “ruth grow”)
  const QSTOP = new Set('who whos what whats where when which why how did does do is was were are the a an of in on at to for about tell me she he they her his their it its and or up grew grow from with'.split(' ').filter(w => !['grew', 'grow', 'up'].includes(w)));

  /** A question for the AI: the answer, and the lines that say it. Same answer format as everything else (cache). */
  function askTask(question, k = 0, n = 1) {
    return [`The editor looks something up in the story: “${clean(question, 500)}”`,
      'Answer like a good reference book: in “answer”, 1–4 plain sentences that answer it directly and say who said it. If the interviews don’t say, say so plainly and give what comes closest. If people disagree, say who said what.',
      'Put the lines that back the answer up in one group with key "sources" (name "Sources", summary ""): each item a stretch of one interview, “note” what it says in a few words, “score” how directly it answers, “lead” and “tag” "". At most 6, the most direct first.',
      'Never invent anything. Name people, not line ids or interview numbers.', CTX() ? CTX().partNote(k, n) : ''].join('\n');
  }
  function organiseAnswer(results, known) {
    const ans = [], src = [];
    for (const r of results || []) {
      if (!r) continue;
      if (clean(r.answer)) ans.push(clean(r.answer, 1500));
      for (const g of r.groups || []) for (const it of g.items || []) { const from = String(it.from || ''); if (known(from) && !src.some(x => x.from === from)) src.push({ from, to: known(String(it.to)) ? String(it.to) : from, note: clean(it.note, 200), score: +it.score || 0 }); }
    }
    return { answer: ans.join(' '), sources: src.sort((a, b) => b.score - a.score).slice(0, 8) };
  }

  /** The wiki as a Word document (Story's .docx writer): overview, interviews, then each section. */
  function toDoc(w, { title = 'Story wiki', subtitle = '', lineText = () => '' } = {}) {
    const blocks = [{ heading: 'Overview' }];
    for (const p of String(w.overview || '').split(/\n\n+/)) if (p.trim()) blocks.push({ paragraph: { runs: [{ text: p.trim() }] } });
    blocks.push({ heading: 'Interviews' });
    for (const iv of w.interviews) blocks.push({ paragraph: { spaceAfter: 120, runs: [{ text: iv.title + '\n', bold: true }, { text: iv.summary }] } });
    for (const sec of SECTIONS) {
      if (!(w[sec] || []).length) continue;
      blocks.push({ heading: SECTION_NAMES[sec] });
      for (const e of w[sec]) {
        const facts = e.facts.map(f => `– ${f.note}${lineText(f.from) ? ` (${lineText(f.from)})` : ''}`).join('\n');
        blocks.push({ paragraph: { spaceAfter: 120, runs: [{ text: e.name + '  ', bold: true }, { text: e.summary + (facts ? '\n' + facts : '') }] } });
      }
    }
    return { title, subtitle, blocks };
  }
  const counts = w => (w ? { interviews: w.interviews.length, person: w.person.length, place: w.place.length, date: w.date.length, thing: w.thing.length } : null);

  /* ---------- running it ---------- */
  function need() {
    if (!S() || !S().askInterviews) throw new US.UserError('NOTHING_FOUND', { title: 'The wiki reads Story’s transcripts.' });
    S().loadState();
    if (!(S().state().transcripts || []).length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts yet.', action: 'Read or import them in Story › 1 Interviews first.' });
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
  }
  /** Every interview, whole (the wiki is about the whole story, whatever What to work on says). */
  const allTranscripts = () => S().state().transcripts.map((t, i) => ({ key: t.key, name: t.name, n: i + 1, lines: t.lines || [] })).filter(t => t.lines.length);
  function whereIndex() { const m = new Map(); S().state().transcripts.forEach((t, i) => (t.lines || []).forEach(l => m.set(l.id, { key: t.key, n: i + 1 }))); return id => m.get(id) || null; }
  const wstate = () => { const st = S().state(); return st.wiki || null; };
  async function sendAll(job, reqs, feature, msg) {
    if (reqs.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(reqs.map(b => b.req)).usd, `${feature} (${reqs.length} parts)`);
    const out = [], missing = [];
    for (let k = 0; k < reqs.length; k++) {
      job.check();
      job.set({ who: 'ai', msg: reqs.length > 1 ? `${msg} – part ${k + 1} of ${reqs.length}` : msg });
      job.progress(0.05 + 0.9 * k / reqs.length);
      const info = {}, ans = await SAI().ask(reqs[k].req, info);
      if (!ans) missing.push({ part: k + 1, of: reqs.length, name: `Interviews ${reqs[k].part.map(p => p.n).join(', ')}`, error: info.error });
      out.push(ans);
    }
    if (missing.length === reqs.length) throw missing[0].error || new US.UserError('AI_FAILED');
    return { out, missing: SAI().missingNote(missing) };
  }
  /** Build (or rebuild) the wiki from every interview. -> {wiki, summary}; kept with the project. */
  async function build(job) {
    need();
    const ts = allTranscripts(), lines = ts.reduce((n, t) => n + t.lines.length, 0);
    const reqs = CTX().requests(ts, { feature: 'Wiki', maxTokens: 24000, effort: 'medium', task });
    if (reqs.length === 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(reqs.map(b => b.req)).usd, 'Story wiki');
    const sent = await sendAll(job, reqs, 'Story wiki', `${US.ai.label()} is reading ${US.plural(lines, 'line')} and writing the wiki`);
    const data = organise(sent.out, whereIndex());
    const st = S().state(), old = st.wiki || {};
    st.wiki = { at: Date.now(), by: US.ai.label(), sig: signature(ts), lines, data, missing: sent.missing, asks: old.asks || [] };
    S().save();
    const c = counts(data);
    return { wiki: st.wiki, summary: `${US.plural(c.interviews, 'interview')} · ${US.plural(c.person, 'person', 'people')} · ${US.plural(c.place, 'place')} · ${US.plural(c.date, 'date')}` };
  }
  /** Ask the story a question. -> {ask: {q, answer, sources, at}, summary}; the last 30 are kept. */
  async function ask(job, question) {
    need();
    if (!String(question || '').trim()) throw new US.UserError('BAD_INPUT', { title: 'Type a question first.' });
    const ts = allTranscripts(), where = whereIndex();
    const reqs = CTX().requests(ts, { feature: 'Wiki', maxTokens: 3000, effort: 'low', task: (k, n) => askTask(question, k, n) });
    const sent = await sendAll(job, reqs, 'Story wiki', `${US.ai.label()} is looking it up`);
    const res = organiseAnswer(sent.out, id => !!where(id));
    const st = S().state();
    st.wiki = st.wiki || { asks: [] };
    const a = { q: clean(question, 300), answer: res.answer, sources: res.sources, at: Date.now(), by: US.ai.label() };
    st.wiki.asks = [a].concat((st.wiki.asks || []).filter(x => norm(x.q) !== norm(a.q))).slice(0, 30);
    S().save();
    return { ask: a, summary: res.answer.slice(0, 160) || 'No answer' };
  }

  US.actions.register({
    id: 'wiki.ask', tool: 'wiki', title: 'Look something up in the story', changes: false,
    describe: 'Answers a quick question about the story from the interviews (“where did Ruth grow up?”, “who is Max?”) in a sentence or two, with the lines that say so. Opens the Story wiki.',
    params: { question: { type: 'string', default: '', desc: 'The question' } },
    examples: ['where did Ruth grow up', 'who is uncle Max', 'when did the bakery open', 'look up the mayor in the wiki'],
    match(t) {
      const q = String(t).trim();
      if (/\b(make|build|update|refresh|save)\b/i.test(q)) return null;
      if (/\bwiki\b/i.test(q)) return { question: q.replace(/\b(in|on|from) the (story )?wiki\b|\b(look up|search)\b/gi, '').trim(), _score: 2.9 };
      // a short factual question about people, places or time – not a request for clips, a cut or an edit
      if (/^(who|where|when|what year|how old|how long ago|whose)\b/i.test(q) && q.split(/\s+/).length <= 14 && !/\b(clips?|sequence|timeline|cut|build|marker|lines? (about|where)|every (time|story)|say|says|said|talk|mention)\b/i.test(q)) return { question: q, _score: 2.2 };
      return null;
    },
    run: async (p, job) => {
      const r = await ask(job, p.question);
      US.tools.open('wiki', { ask: r.ask });
      return { summary: r.ask.answer || 'The interviews don’t say.' };
    }
  });
  US.actions.register({
    id: 'wiki.build', tool: 'wiki', title: 'Make the story wiki', changes: false,
    describe: 'A quick reference to the story from every interview: an overview, a summary of each interview, and the people, places, dates and things in it. Text only.',
    params: {},
    examples: ['make a story wiki', 'who’s who in the interviews', 'summarise each interview and list the people and places'],
    match: t => (/\b(make|build|update|refresh) (a |the )?(story )?wiki\b|\bwho'?s who\b|\blist (of )?(the )?(people|places|dates)\b/i.test(t) ? { _score: 2.8 } : null),
    run: async (p, job) => { const r = await build(job); US.tools.open('wiki'); return { summary: r.summary }; }
  });

  /* ---------- the tab ---------- */
  US.tools.register({
    id: 'wiki', name: 'Story wiki', short: 'Wiki', icon: 'wiki', group: 'find', order: 22.5,
    blurb: 'Look anything up in the story: an overview, each interview in brief, and the people, places and dates – each fact with the line that says it.',
    hostFns: ['storyCue'],
    create() {
      const v = ui.toolView({ icon: 'wiki', title: 'Story wiki', blurb: 'A quick reference to your story, made from every interview: the overview, each interview in brief, and pages for the people, places, dates and things in it. Type to look something up – a question the wiki can’t answer goes to the AI, which answers with the lines that say so. Only the transcripts’ text is read.' });
      let section = US.settings.get('wiki.section', 'overview'), query = '', answer = null, open = new Set();
      const status = h('div'), askBox = h('div'), found = h('div'), nav = h('div'), page = h('div');

      const lineOf = id => S().lineOf(id);
      const say = id => { const l = lineOf(id); return l ? `${S().speakerName(l.speaker)}: “${l.text}”` : ''; };
      /** A fact or a source: the note, who said it, and ▶ / drag / place. */
      function factRow(f) {
        const t = S().state().transcripts.find(x => x.lines.some(l => l.id === f.from));
        if (!t) return null;
        const i0 = t.lines.findIndex(l => l.id === f.from), i1 = Math.max(i0, t.lines.findIndex(l => l.id === f.to)), lines = t.lines.slice(i0, i0 + Math.min(12, i1 - i0 + 1)), a = lines[0];
        const iv = S().interviewOf(a.id) || {}, canPlace = !!iv.path, text = lines.map(l => l.text).join(' ');
        return h('div.list-row.wiki-fact' + (canPlace ? '.story-drag' : ''), { draggable: canPlace ? 'true' : 'false', title: canPlace ? 'Drag it onto the timeline' : '', ondragstart: e => S().dragLines(e, lines) },
          h('div.list-main', f.note ? h('div.wiki-note', f.note) : null, h('div.list-sub', h('b', S().speakerName(a.speaker) + ': '), `“${text.length > 300 ? text.slice(0, 300) + '…' : text}”`, ' · ', US.keep(iv.name || t.name || ''), ` · ${US.fmtDur(a.start)}`)),
          h('button.btn.small.ghost', { title: 'Play it', onclick: () => S().cueLine(a) }, '▶'),
          canPlace ? h('button.btn.small.ghost', { title: 'Put it at the playhead', onclick: () => S().placeAtPlayhead(lines) }, US.icon('playhead', 14)) : null);
      }
      function entryEl(sec, e, { hits = null, expanded = false } = {}) {
        const id = `${sec}:${e.name || e.title}`, isOpen = expanded || open.has(id);
        const facts = hits && !isOpen ? hits : (e.facts || e.moments || []);
        return h('div.wiki-entry' + (isOpen ? '.open' : ''),
          h('button.wiki-entry-head', { onclick: () => { if (open.has(id)) open.delete(id); else open.add(id); draw(); } }, US.icon('chevron', 12), h('b', US.keep(e.name || e.title)), sec === 'date' && e.when ? h('span.pill', e.when) : null, h('span.wiki-sub', e.summary.length > 140 && !isOpen ? e.summary.slice(0, 140) + '…' : isOpen ? '' : e.summary)),
          isOpen ? h('div.wiki-entry-body', h('div', e.summary), facts.length ? h('div.list', facts.map(factRow)) : null,
            sec === 'interviews' ? ui.button('Open in Story', { small: true, kind: 'ghost', onClick: () => S().open('transcripts') }) : null) : null);
      }

      function drawStatus() {
        US.clear(status);
        const st = S().state(), w = st.wiki && st.wiki.data, sig = signature(allTranscripts());
        const aiOn = US.ai && US.ai.available();
        const btn = ui.actionButton(w ? 'Update the wiki' : 'Make the wiki', () => US.jobs.run({ title: 'Making the story wiki', tool: 'wiki' }, async job => { const r = await build(job); draw(); return { summary: r.summary }; }), { icon: 'wiki' });
        if (!aiOn) btn.setEnabled(false);
        const stale = w && st.wiki.sig !== sig;
        status.appendChild(ui.card(
          w ? h('div.field-hint', `Made from ${US.plural(w.interviews.length, 'interview')} (${(st.wiki.lines || 0).toLocaleString('en-GB')} lines) on ${new Date(st.wiki.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} by ${st.wiki.by}.`) : h('div.field-hint', 'Not made yet: the AI reads every interview once and writes the wiki. It’s kept with the project.'),
          stale ? ui.note('Interviews have been added or changed since – update it to include them.', 'warn') : null,
          st.wiki && st.wiki.missing ? ui.note(st.wiki.missing, 'warn') : null,
          aiOn ? null : ui.note('The wiki needs AI – add a key in Settings › AI.', 'info'),
          h('div.row', w && !stale ? null : btn, w ? ui.button('Save as Word', { small: true, kind: 'ghost', icon: 'folder', onClick: saveDoc }) : null, w && !stale ? h('span.right', ui.button('Update', { small: true, kind: 'ghost', icon: 'refresh', onClick: () => btn.click() })) : null),
          (() => { try { return h('div.field-hint', S().contextLine()); } catch (e) { return null; } })()));
      }
      function saveDoc() {
        try {
          const st = S().state(), f = US.audioKit.saveText(`Story wiki ${new Date().toISOString().slice(0, 10)}.docx`, '');
          require('fs').writeFileSync(f, US.storyExport.docx(toDoc(st.wiki.data, { subtitle: US.ctx.project ? US.ctx.project.name : '', lineText: say })));
          ui.toast({ type: 'ok', title: 'Wiki saved', text: US.basename(f), action: { label: 'Open', fn: () => US.audioKit.open(f) } });
        } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); }
      }
      function drawAsk() {
        US.clear(askBox);
        const st = S().state(), asks = (st.wiki && st.wiki.asks) || [];
        const inp = ui.input({ value: query, placeholder: 'Look something up – e.g. where did Ruth grow up?', onInput: x => { query = x; drawFound(); }, onEnter: x => runAsk(x) });
        inp.classList.add('wiki-search');
        askBox.appendChild(ui.card(h('div.row', h('div.grow', inp), ui.button('Ask', { kind: 'primary', small: true, icon: 'ask', onClick: () => runAsk(inp.value) })),
          asks.length ? h('div.chat-chips', asks.slice(0, 8).map(a => h('button.chip', { onclick: () => { answer = a; query = ''; inp.value = ''; drawFound(); } }, a.q))) : null));
        setTimeout(() => { try { inp.focus(); } catch (e) { /* not shown */ } }, 0);
      }
      function runAsk(x) {
        if (!String(x || '').trim()) return;
        US.jobs.run({ title: 'Looking it up', tool: 'wiki' }, async job => { const r = await ask(job, x); answer = r.ask; drawAsk(); drawFound(); return { summary: r.summary }; });
      }
      function drawFound() {
        US.clear(found);
        const st = S().state(), w = st.wiki && st.wiki.data;
        if (answer) found.appendChild(ui.card(h('div.card-title', `“${answer.q}”`, h('span.right', h('button.btn.small.ghost', { title: 'Close', onclick: () => { answer = null; drawFound(); } }, US.icon('close', 14)))),
          h('div.wiki-answer', answer.answer || 'No answer came back.'), answer.sources.length ? h('div.list', answer.sources.map(factRow)) : null, h('div.field-hint', `Answered by ${answer.by || 'the AI'} from the interviews.`)));
        if (!query.trim() || !w) return;
        const hits = search(w, query);
        found.appendChild(ui.card(h('div.card-title', hits.length ? `In the wiki · ${US.plural(hits.length, 'match', 'matches')}` : 'Nothing in the wiki'),
          hits.length ? hits.map(x => entryEl(x.section, x.entry, { hits: x.hits })) : h('div.field-hint', 'Press Return to ask the AI – it reads the interviews themselves.')));
      }
      function drawNav() {
        US.clear(nav);
        const w = S().state().wiki && S().state().wiki.data, c = counts(w);
        if (!w) return;
        const opts = ['overview', 'interviews', ...SECTIONS].map(k => ({ value: k, label: k === 'overview' ? 'Overview' : `${SECTION_NAMES[k]} ${c[k] || 0}` }));
        nav.appendChild(h('div.wiki-nav', ui.segmented({ value: section, options: opts, onChange: x => { section = x; US.settings.set('wiki.section', x); drawPage(); } })));
      }
      function drawPage() {
        US.clear(page);
        const w = S().state().wiki && S().state().wiki.data;
        if (!w) return;
        if (section === 'overview') {
          const c = counts(w);
          page.appendChild(ui.card(h('div.card-title', 'The story'), ...String(w.overview || '').split(/\n\n+/).filter(Boolean).map(p => h('p.wiki-para', p)),
            ui.stats(ui.stat(String(c.interviews), 'interviews'), ui.stat(String(c.person), 'people'), ui.stat(String(c.place), 'places'), ui.stat(String(c.date), 'dates'))));
          if (w.date.length) page.appendChild(ui.card(h('div.card-title', 'Timeline'), h('div.wiki-timeline', w.date.filter(d => d.when).slice(0, 20).map(d => h('div.wiki-tl-row', h('span.wiki-when', d.when), h('span', h('b', d.name + ' – '), d.summary))))));
          return;
        }
        const list = section === 'interviews' ? w.interviews : w[section] || [];
        page.appendChild(ui.card(list.length ? list.map(e => entryEl(section, e)) : ui.empty({ title: `No ${SECTION_NAMES[section].toLowerCase()} in the wiki` })));
      }
      function draw() {
        if (!S()) return;
        S().loadState();
        try { need(); } catch (e) {
          if (e.code !== 'AI_KEY') { [status, askBox, found, nav, page].forEach(US.clear); status.appendChild(ui.card(ui.note(e.title || e.message, 'info'), e.action ? h('div.field-hint', e.action) : null, ui.button('Open Story', { small: true, onClick: () => S().open('transcripts') }))); return; }
        }
        drawStatus(); drawAsk(); drawFound(); drawNav(); drawPage();
      }
      v.body.append(status, askBox, found, nav, page);
      return { el: v.el, onShow(o) { if (o && o.ask) { answer = o.ask; query = ''; } draw(); } };
    }
  });

  US.storyWiki = { RULES, task, organise, yearIn, signature, search, askTask, organiseAnswer, toDoc, counts, build, ask, SECTIONS };
})();
