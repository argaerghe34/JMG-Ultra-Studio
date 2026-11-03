/* JMG Ultra Studio – Producer: a second opinion on the story, from the transcripts. Two jobs:
   - Notes on the cut: a devil's-advocate producer reads the interview lines heard in a sequence (in order, with their
     times) next to every interview, and argues with it – the strongest line buried at 6:40, the same point made three
     times, a turn nobody explains, a slow middle, a better line left out – each note with the lines it's about (in the
     cut: jump there; not in it: play, drag or place it).
   - Pick-up interview: what the story needs that nobody has said yet (from a brief, the interviews and, if you like,
     the cut), and the questions to ask each person to get it – ready for a reshoot or a phone call.
   Both read Story's shared transcript (cached an hour, so they're cheap after Ask, Themes and so on). Text only: the
   transcripts and the brief are sent, never footage. Pure logic (unit-tested) first, then the tab. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const S = () => US.story, CTX = () => US.storyContext, SAI = () => US.storyAI;

  US.addIcon('producer', 'M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5zM10 7v2.5M10 11.3v.01');

  const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const clamp01 = x => Math.max(0, Math.min(1, isFinite(+x) ? +x : 0));
  const clean = (s, n = 600) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

  /* ---------- the cut, as the producer reads it ---------- */
  /**
   * The interview lines heard in a sequence, in order: one row per line (a line cut into pieces is one row, at its first
   * time), with the words actually heard. entries: timelineTranscript's entries; nameOf(entry) -> speaker name.
   * -> {text, rows: [{lineId, start, end, name, text}], seconds}
   */
  function cutListing(entries, nameOf = () => '') {
    const rows = [], at = new Map();
    for (const e of (entries || []).slice().sort((a, b) => a.start - b.start)) {
      const r = at.get(e.lineId);
      if (r && e.start - r.end < 2) { r.end = Math.max(r.end, e.end); r.text = `${r.text} ${e.text}`.replace(/…\s*…/g, ' '); continue; }
      const row = { lineId: e.lineId, start: e.start, end: e.end, name: nameOf(e) || '-', text: String(e.text || '').trim() };
      rows.push(row); at.set(e.lineId, row);
    }
    const seconds = rows.length ? rows[rows.length - 1].end - rows[0].start : 0;
    const text = 'The cut (time in the cut m:ss<TAB>line id<TAB>speaker<TAB>the words heard):\n' + rows.map(r => `${mmss(r.start)}\t${r.lineId}\t${r.name}\t${clean(r.text, 1200)}`).join('\n');
    return { text, rows, seconds };
  }

  /* ---------- notes on the cut ---------- */
  const KINDS = {
    buried: { label: 'Buried', marker: 3 }, repeat: { label: 'Said again', marker: 4 }, missing: { label: 'Missing', marker: 2 },
    slow: { label: 'Slow', marker: 1 }, unclear: { label: 'Unclear', marker: 7 }, order: { label: 'Order', marker: 6 },
    start: { label: 'The opening', marker: 1 }, ending: { label: 'The ending', marker: 1 }, cut: { label: 'Cut it', marker: 1 },
    unused: { label: 'Left out', marker: 3 }, strong: { label: 'Works', marker: 0 }
  };
  const kindOf = k => (KINDS[String(k || '').toLowerCase()] ? String(k).toLowerCase() : 'unclear');
  const TONES = {
    blunt: 'Be a blunt, demanding producer – the one who argues against the cut so it gets better. Don’t soften or praise for the sake of it; say plainly what isn’t working and why it matters to a viewer.',
    kind: 'Be a supportive but honest producer: say what works too, and put each problem as something to try.'
  };
  const FOCUS = {
    all: '', pace: 'Look hardest at pace: where it drags, runs long or rushes.', clarity: 'Look hardest at clarity: what a viewer who wasn’t there won’t follow – names, places, jumps in time, things never explained.',
    structure: 'Look hardest at structure: the opening, the order, the turning points and the ending.', emotion: 'Look hardest at emotion: where it moves people, where it should and doesn’t, and the strongest moments left out.',
    missing: 'Look hardest at what’s missing: what the story needs that the cut never says, and the lines in the interviews that would give it.'
  };
  const NOTE_RULES = [
    'You are the producer reviewing this cut. Argue with it: find what isn’t working and what would make it better.',
    '- “answer”: your overall verdict in 3–5 plain sentences, the biggest problem first.',
    '- “groups”: one per note, 4–12 notes, the most important first. “key” is the kind of note: buried (a strong line is too late or lost), repeat (the same point made again), missing (something the story needs and never says), slow, unclear, order, start (the opening), ending, cut (something to take out), unused (a better line in the interviews that isn’t in the cut), strong (something that really works – at most two). “name”: the note as a producer would say it, under 12 words, with the time in the cut (m:ss) when it’s about one place. “summary”: why it matters and what to do, in 1–3 sentences.',
    '- Items: the lines the note is about. A line in the cut: tag "cut". A line in the interviews that isn’t in the cut and would fix the note: tag "unused" (whole stretches, from where it makes sense on its own to where the thought ends). “note”: a few words on that line. “score”: how much the note matters, 0–1 (the same on every item of a note). “lead”: "". A note can have no items when nobody says it (for example a missing explanation).',
    '- Only use line ids from the transcripts. Never invent what people said. Name people, not line ids or interview numbers, in your words.'
  ].join('\n');
  /** The instruction after the shared transcript. o: {brief, client, tone, focus, cut: cutListing().text, seconds, name} */
  function notesTask(o, k = 0, n = 1) {
    return [`The editor wants notes on their cut “${clean(o.name, 80)}” (${mmss(o.seconds || 0)} long).`,
      o.brief ? `What it’s for: ${clean(o.brief, 1500)}` : '',
      o.client ? `The client’s notes:\n${String(o.client).trim().slice(0, 6000)}` : '',
      TONES[o.tone] || TONES.blunt, FOCUS[o.focus] || '', '', o.cut, '', NOTE_RULES, CTX() ? CTX().partNote(k, n) : ''].filter(x => x !== '').join('\n');
  }
  /** A follow-up from the editor (“the repetition is on purpose”). */
  function notesFollowUp(text) { return `The editor answers your notes: “${clean(text, 2000)}”\nTake it into account and give your notes again in full – the whole set, not only what changed. Same rules as before.`; }
  /**
   * The answers of every part -> {verdict, notes: [{kind, title, text, severity, items: [{from, to, tag, note}]}]}.
   * known: line ids; inCut: line ids heard in the cut (an item's tag follows where the line really is).
   * Notes with the same title (from different parts) are put together; most important first.
   */
  function organiseNotes(results, known, inCut = new Set()) {
    const verdicts = [], notes = [], byTitle = new Map();
    for (const r of results || []) {
      if (!r) continue;
      if (clean(r.answer)) verdicts.push(clean(r.answer, 1500));
      for (const g of r.groups || []) {
        const title = clean(g.name, 120) || 'Note', k = title.toLowerCase();
        let N = byTitle.get(k);
        if (!N) { N = { kind: kindOf(g.key), title, text: clean(g.summary, 700), severity: 0, items: [] }; byTitle.set(k, N); notes.push(N); }
        for (const it of g.items || []) {
          const from = String(it.from || ''), to = known.has(String(it.to || '')) ? String(it.to) : from;
          if (!known.has(from)) continue;
          N.severity = Math.max(N.severity, clamp01(it.score));
          if (N.items.some(x => x.from === from)) continue;
          N.items.push({ from, to, tag: inCut.has(from) ? 'cut' : 'unused', note: clean(it.note, 200) });
        }
      }
    }
    notes.forEach((n, i) => { n.order = i; if (!n.severity) n.severity = 0.5; });
    // the AI's order is its view of what matters; “works” notes go last
    notes.sort((a, b) => (a.kind === 'strong') - (b.kind === 'strong') || a.order - b.order);
    notes.forEach(n => { delete n.order; });
    return { verdict: verdicts.join('\n\n'), notes };
  }
  /** Range markers for the notes: one per run of a note's lines heard in the cut. rowsOf(lineId) -> cut rows. */
  function noteMarkers(notes, rowsOf) {
    const out = [];
    for (const n of notes) {
      const rs = n.items.filter(i => i.tag === 'cut').flatMap(i => rowsOf(i.from)).sort((a, b) => a.start - b.start);
      let run = null;
      const flush = () => { if (run) out.push({ start: run.start, end: run.end, name: `${KINDS[n.kind].label}: ${n.title}`.slice(0, 64), comment: n.text.slice(0, 500), color: KINDS[n.kind].marker }); };
      for (const r of rs) { if (run && r.start - run.end < 1.5) run.end = Math.max(run.end, r.end); else { flush(); run = { start: r.start, end: r.end }; } }
      flush();
    }
    return out.sort((a, b) => a.start - b.start);
  }
  /** The notes as text to paste or save. lineText(id) -> “Name: what they say”; timeOf(id) -> seconds in the cut or null. */
  function notesText(res, { name = '', lineText = () => '', timeOf = () => null } = {}) {
    const out = [`Notes on “${name}”`, '', res.verdict, ''];
    res.notes.forEach((n, i) => {
      out.push(`${i + 1}. [${KINDS[n.kind].label}] ${n.title}`, `   ${n.text}`);
      for (const it of n.items) { const t = timeOf(it.from); out.push(`   – ${it.tag === 'cut' ? (t != null ? `at ${mmss(t)}` : 'in the cut') : 'not in the cut'}: ${lineText(it.from)}${it.note ? ` (${it.note})` : ''}`); }
      out.push('');
    });
    return out.join('\n');
  }

  /* ---------- pick-up interview ---------- */
  const PICKUP_RULES = [
    'Plan a pick-up interview: what the story needs that nobody has said yet (or not well enough to use), and the questions that would get it.',
    '- “answer”: 2–4 plain sentences: the biggest gaps, and who is best placed to fill them.',
    '- “groups”: one per gap, 3–10 gaps, most important first. “key”: "gap". “name”: the gap in a few words (“Why the bakery closed”). “summary”: why the story needs it, in 1–2 sentences.',
    '- Items of a gap: tag "ask" – a question for one person: “from” and “to” are one line that person said (the closest to the gap), “note” is the question exactly as the interviewer would ask it – open, one thing at a time, in plain words, never leading (not “Wasn’t it awful when…”). Give 1–3 questions per gap, to the people best placed to answer. Tag "near" – what’s been said that comes closest so far (whole stretches), “note” says what’s missing from it. “score”: how much the story needs it, 0–1. “lead”: "".',
    '- Only use line ids from the transcripts. Never invent facts – a question can ask about something only hinted at, but say so in the summary.'
  ].join('\n');
  /** o: {brief, client, cut (cutListing().text or ''), people: [names] (only ask these, or everyone)} */
  function pickupTask(o, k = 0, n = 1) {
    return [o.brief ? `What the film is for: ${clean(o.brief, 1500)}` : 'There is no brief: find what the story told by these interviews still needs.',
      o.client ? `The client’s notes:\n${String(o.client).trim().slice(0, 6000)}` : '',
      o.cut ? `The editor has a cut so far – look for what it needs too:\n${o.cut}` : '',
      o.people && o.people.length ? `Only plan questions for: ${o.people.join(', ')}.` : '',
      '', PICKUP_RULES, CTX() ? CTX().partNote(k, n) : ''].filter(x => x !== '').join('\n');
  }
  /**
   * -> {summary, gaps: [{title, why, need, asks: [{lineId, speaker, question}], near: [{from, to, note}]}]}.
   * speakerOf(lineId) -> the speaker id of a line (who the question is for).
   */
  function organisePickups(results, known, speakerOf = () => '') {
    const sums = [], gaps = [], byTitle = new Map();
    for (const r of results || []) {
      if (!r) continue;
      if (clean(r.answer)) sums.push(clean(r.answer, 1200));
      for (const g of r.groups || []) {
        const title = clean(g.name, 120) || 'Gap', k = title.toLowerCase();
        let G = byTitle.get(k);
        if (!G) { G = { title, why: clean(g.summary, 600), need: 0, asks: [], near: [] }; byTitle.set(k, G); gaps.push(G); }
        for (const it of g.items || []) {
          const from = String(it.from || ''), tag = String(it.tag || '').toLowerCase(), note = clean(it.note, 300);
          G.need = Math.max(G.need, clamp01(it.score));
          if (tag === 'near') { if (known.has(from) && !G.near.some(x => x.from === from)) G.near.push({ from, to: known.has(String(it.to)) ? String(it.to) : from, note }); continue; }
          if (!note) continue;
          const speaker = known.has(from) ? speakerOf(from) : '';
          if (!G.asks.some(a => a.question.toLowerCase() === note.toLowerCase())) G.asks.push({ lineId: known.has(from) ? from : '', speaker, question: note });
        }
      }
    }
    return { summary: sums.join('\n\n'), gaps: gaps.filter(g => g.asks.length || g.near.length) };
  }
  /** The questions per person, in gap order: [{speaker, items: [{gap, question}]}], most questions first. */
  function byPerson(gaps) {
    const m = new Map();
    for (const g of gaps) for (const a of g.asks) { const k = a.speaker || ''; if (!m.has(k)) m.set(k, { speaker: k, items: [] }); m.get(k).items.push({ gap: g.title, question: a.question }); }
    return Array.from(m.values()).sort((a, b) => b.items.length - a.items.length || (a.speaker === '') - (b.speaker === ''));
  }
  /** The plan as text (a question sheet). nameOf(speaker) -> name; by: 'person' | 'gap'. */
  function pickupText(p, { nameOf = s => s || 'Anyone', by = 'person', title = 'Pick-up interview' } = {}) {
    const out = [title, '', p.summary, ''];
    if (by === 'person') for (const per of byPerson(p.gaps)) { out.push(nameOf(per.speaker)); per.items.forEach((x, i) => out.push(`  ${i + 1}. ${x.question}   (${x.gap})`)); out.push(''); }
    else p.gaps.forEach((g, i) => { out.push(`${i + 1}. ${g.title}`, `   ${g.why}`); for (const a of g.asks) out.push(`   – ${nameOf(a.speaker)}: ${a.question}`); out.push(''); });
    return out.join('\n');
  }
  /** The same as a Word document (Story's .docx writer). */
  function pickupDoc(p, o = {}) {
    const nameOf = o.nameOf || (s => s || 'Anyone'), blocks = [];
    if (p.summary) blocks.push({ paragraph: { runs: [{ text: p.summary }] } });
    for (const per of byPerson(p.gaps)) {
      blocks.push({ heading: nameOf(per.speaker) });
      per.items.forEach((x, i) => blocks.push({ paragraph: { spaceAfter: 60, runs: [{ text: `${i + 1}.  `, bold: true }, { text: x.question }, { text: `   ${x.gap}`, color: '808080', size: 18 }] } }));
    }
    blocks.push({ heading: 'Why – the gaps' });
    p.gaps.forEach(g => blocks.push({ paragraph: { spaceAfter: 80, runs: [{ text: g.title + '  ', bold: true }, { text: g.why }] } }));
    return { title: o.title || 'Pick-up interview', subtitle: o.subtitle || '', blocks };
  }

  /* ---------- running them ---------- */
  function need() {
    if (!S() || !S().askInterviews) throw new US.UserError('NOTHING_FOUND', { title: 'Producer reads Story’s transcripts.' });
    S().loadState();
    if (!(S().state().transcripts || []).length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts yet.', action: 'Read or import them in Story › 1 Interviews first.' });
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
  }
  const pstate = () => { const st = S().state(); st.producer = st.producer || { notes: [], pickups: [], markers: {} }; st.producer.markers = st.producer.markers || {}; return st.producer; };
  const nameOfSpeaker = s => (s ? S().speakerName(s) : 'Anyone');
  /** Send the requests (with earlier rounds as turns), one per part. -> answers (null for a part that failed twice) */
  async function sendParts(job, reqs, rounds, feature) {
    if (reqs.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(reqs.map(b => b.req)).usd, `${feature} (${reqs.length} parts)`);
    const out = [], missing = [], r = rounds.length - 1, follow = feature === 'Producer notes' ? notesFollowUp : x => `The editor follows up: “${clean(x, 2000)}”\nAnswer again in full with that change. Same rules as before.`;
    for (let k = 0; k < reqs.length; k++) {
      job.check();
      job.set({ who: 'ai', msg: reqs.length > 1 ? `${US.ai.label()} is reading part ${k + 1} of ${reqs.length}` : `${US.ai.label()} is reading ${US.plural(reqs[k].lines.length, 'line')}` });
      job.progress(0.1 + 0.85 * k / reqs.length);
      const turns = [];
      for (let j = 1; j <= r; j++) turns.push({ assistant: JSON.stringify((rounds[j - 1].parts || [])[k] || { answer: '', groups: [] }), user: follow(rounds[j].text) });
      const info = {}, ans = await SAI().ask(Object.assign({}, reqs[k].req, { turns }), info);
      if (!ans) missing.push({ part: k + 1, of: reqs.length, name: `Interviews ${reqs[k].part.map(p => p.n).join(', ')}`, error: info.error });
      out.push(ans || { answer: '', groups: [] });
    }
    if (missing.length === reqs.length) throw missing[0].error || new US.UserError('AI_FAILED');
    rounds[r].parts = out;
    return { out, missing: SAI().missingNote(missing) };
  }
  const knownIds = () => new Set(S().state().transcripts.flatMap(t => t.lines.map(l => l.id)));
  async function readCut(job, seqId) {
    if (!seqId) throw new US.UserError('NO_SEQUENCE', { action: 'Choose the cut to get notes on.' });
    const tl = await S().timelineTranscript(job, { seqId, tracks: 'auto' }), names = S().namesFor(tl);
    const cut = cutListing(tl.result.entries.filter(e => S().lineOf(e.lineId)), e => names.get(e.speakerKey) || S().speakerName((S().lineOf(e.lineId) || {}).speaker));
    if (!cut.rows.length) throw new US.UserError('NOTHING_FOUND', { title: `There are no interview lines in “${tl.info.name}”.`, action: tl.result.entries.length ? 'Choose a sequence with your interview clips in it.' : 'The clips in it have no transcripts yet – read them in Story › 1 Interviews.' });
    return { tl, cut };
  }

  /**
   * Notes on a cut (or follow up earlier notes: id + reply). -> {notes (the kept record), summary}
   * Kept with the project (the last 10).
   */
  async function getNotes(job, { seqId, brief = '', tone = 'blunt', focus = 'all', id = null, reply = '' }) {
    need();
    const P = pstate(), prev = id ? P.notes.find(x => x.id === id) : null;
    const ts = S().scopeTranscripts(await S().linesInScope(job));
    const sid = prev ? prev.seqId : seqId;
    const { tl, cut } = await readCut(job, sid);
    const o = prev ? prev.ask : { brief: clean(brief, 1500), client: String(S().state().narrativeContext || ''), tone, focus, name: tl.info.name };
    const reqs = CTX().requests(ts, { feature: 'Producer', maxTokens: 12000, effort: 'medium', task: (k, n) => notesTask(Object.assign({}, o, { cut: cut.text, seconds: cut.seconds }), k, n) });
    const rounds = prev ? prev.rounds.concat([{ text: reply }]) : [{ text: '' }];
    const sent = await sendParts(job, reqs, rounds, 'Producer notes');
    const res = organiseNotes(sent.out, knownIds(), new Set(cut.rows.map(r => r.lineId)));
    const rec = prev || { id: US.uid('pn'), at: Date.now(), seqId: sid, ask: o };
    Object.assign(rec, { name: tl.info.name, rounds, result: res, cut: cut.rows.map(r => ({ lineId: r.lineId, start: r.start, end: r.end })), by: US.ai.label(), updated: Date.now(), missing: sent.missing });
    P.notes = [rec].concat(P.notes.filter(x => x !== rec)).slice(0, 10);
    S().save();
    return { notes: rec, summary: `${US.plural(res.notes.length, 'note')} on “${tl.info.name}”` };
  }
  /** Range markers on the cut for the notes (replacing the earlier Producer markers there). */
  async function markNotes(job, rec) {
    const P = pstate(), rows = rec.cut || [];
    const marks = noteMarkers(rec.result.notes, id => rows.filter(r => r.lineId === id));
    if (!marks.length) throw new US.UserError('NOTHING_FOUND', { title: 'None of these notes point at a place in the cut.' });
    const old = P.markers[rec.seqId];
    if (old && old.length) { try { await US.host.call('removeSequenceMarkers', { seqId: rec.seqId, guids: old }); } catch (e) { /* already gone */ } }
    job.set({ who: 'premiere', msg: `Marking ${US.plural(marks.length, 'note')}` });
    P.markers[rec.seqId] = (await US.host.call('addSequenceMarkers', { seqId: rec.seqId, markers: marks })) || [];
    S().save();
    return { summary: `${US.plural(marks.length, 'range marker')} on “${rec.name}”${old ? ' (the earlier notes’ markers replaced)' : ''}` };
  }
  /** A pick-up interview plan. -> {plan, summary}; kept with the project (the last 10). */
  async function planPickups(job, { brief = '', seqId = '', people = [], id = null, reply = '' }) {
    need();
    const P = pstate(), prev = id ? P.pickups.find(x => x.id === id) : null;
    const ts = S().scopeTranscripts(await S().linesInScope(job));
    const o = prev ? prev.ask : { brief: clean(brief, 1500), client: String(S().state().narrativeContext || ''), seqId, people, cut: '' };
    if (!prev && seqId) o.cut = (await readCut(job, seqId)).cut.text;
    const reqs = CTX().requests(ts, { feature: 'Pick-ups', maxTokens: 10000, effort: 'medium', task: (k, n) => pickupTask(o, k, n) });
    const rounds = prev ? prev.rounds.concat([{ text: reply }]) : [{ text: '' }];
    const sent = await sendParts(job, reqs, rounds, 'Pick-up questions');
    const res = organisePickups(sent.out, knownIds(), lid => (S().lineOf(lid) || {}).speaker || '');
    const rec = prev || { id: US.uid('pu'), at: Date.now(), ask: o };
    Object.assign(rec, { rounds, result: res, by: US.ai.label(), updated: Date.now(), missing: sent.missing });
    P.pickups = [rec].concat(P.pickups.filter(x => x !== rec)).slice(0, 10);
    S().save();
    const q = res.gaps.reduce((k, g) => k + g.asks.length, 0);
    return { plan: rec, summary: `${US.plural(res.gaps.length, 'gap')} · ${US.plural(q, 'question')}` };
  }
  const docName = s => `${s} ${new Date().toISOString().slice(0, 10)}`;
  function saveDoc(name, docObj) {
    const E = US.storyExport, file = US.audioKit.saveText(`${docName(name)}.docx`, '');
    require('fs').writeFileSync(file, E.docx(docObj));
    return file;
  }

  US.actions.register({
    id: 'producer.notes', tool: 'producer', title: 'Notes on the cut', changes: false,
    describe: 'A devil’s-advocate producer reads the interview lines in a sequence (and every interview) and argues with the cut: what’s buried, repeated, missing, slow or unclear, and better lines left out. Text only.',
    params: { focus: { type: 'enum', options: Object.keys(FOCUS), default: 'all', desc: 'What to look at hardest' } },
    examples: ['give me notes on my cut', 'what’s wrong with this edit', 'play devil’s advocate on this sequence', 'producer notes'],
    match(t) {
      if (!/\b(notes? on (my|the|this) (cut|edit|sequence|timeline)|devil['’]?s advocate|producer['’]?s? notes|critique|tear (it|my cut) apart|what['’]?s (wrong|not working) (with|in) (my|the|this) (cut|edit|sequence))\b/i.test(t)) return null;
      const focus = /\bpace|drag|slow\b/i.test(t) ? 'pace' : /\bclear|follow|confus/i.test(t) ? 'clarity' : /\bstructure|order|opening|ending\b/i.test(t) ? 'structure' : /\bemotion|moving|feel/i.test(t) ? 'emotion' : /\bmissing|gaps?\b/i.test(t) ? 'missing' : 'all';
      return { focus, _score: 2.8 };
    },
    run: async (p, job) => {
      const seqId = US.ctx.sequence && US.ctx.sequence.id;
      const r = await getNotes(job, { seqId, brief: US.settings.get('producer.brief', ''), tone: US.settings.get('producer.tone', 'blunt'), focus: p.focus || 'all' });
      US.tools.open('producer', { page: 'notes', id: r.notes.id });
      return { summary: `${r.summary}. ${r.notes.result.notes[0] ? 'First: ' + r.notes.result.notes[0].title : ''}` };
    }
  });
  US.actions.register({
    id: 'producer.pickups', tool: 'producer', title: 'Plan a pick-up interview', changes: false,
    describe: 'What the story still needs that nobody has said, and the questions to ask each person to get it – for a reshoot or a phone call. Text only.',
    params: {},
    examples: ['what should I ask in the pick-up interview', 'questions for a reshoot', 'what is the story missing'],
    match: t => (/\b(pick-?ups?|reshoot|re-?interview|follow-?up interview|what (else )?should i ask|questions? (to|for) (ask|them|a reshoot)|story (is )?missing|gaps in the story)\b/i.test(t) ? { _score: 2.7 } : null),
    run: async (p, job) => {
      const r = await planPickups(job, { brief: US.settings.get('producer.brief', '') });
      US.tools.open('producer', { page: 'pickups', id: r.plan.id });
      return { summary: r.summary };
    }
  });

  /* ---------- the tab ---------- */
  US.tools.register({
    id: 'producer', name: 'Producer', short: 'Producer', icon: 'producer', group: 'find', order: 24,
    blurb: 'A second opinion from the transcripts: notes on your cut, and the questions for a pick-up interview.',
    hostFns: ['sequenceInfo', 'storySequenceTiming', 'listSequences', 'setPlayhead', 'addSequenceMarkers', 'removeSequenceMarkers'],
    create() {
      const v = ui.toolView({ icon: 'producer', title: 'Producer', blurb: 'A producer who has read every interview. Notes on the cut argues with your edit – what’s buried, said twice, missing or slow, and better lines you left out. Pick-up interview finds what the story still needs and writes the questions to get it. Reads Story’s transcripts as text – never the footage.' });
      let page = US.settings.get('producer.page', 'notes'), shownNotes = null, shownPlan = null, by = US.settings.get('producer.by', 'person');
      const top = h('div'), body = h('div');
      const pageSeg = ui.segmented({ value: page, onChange: x => { page = x; US.settings.set('producer.page', x); render(); }, options: [{ value: 'notes', label: 'Notes on the cut' }, { value: 'pickups', label: 'Pick-up interview' }] });
      top.appendChild(h('div.row', pageSeg));

      const lineOf = id => S().lineOf(id), ivName = id => US.keep((S().interviewOf(id) || {}).name || '');
      const say = id => { const l = lineOf(id); return l ? `${S().speakerName(l.speaker)}: ${l.text}` : ''; };
      /** One line: who, what, where – with ▶ (in the cut: jump there; otherwise play the source), drag and place. */
      function lineRow(from, to, { note = '', cutAt = null, seqId = '' } = {}) {
        const a = lineOf(from); if (!a) return null;
        const t = S().state().transcripts.find(x => x.lines.some(l => l.id === from)) || {}, ls = t.lines || [], i0 = ls.findIndex(l => l.id === from), i1 = Math.max(i0, ls.findIndex(l => l.id === to));
        const lines = ls.slice(i0, i1 + 1), iv = S().interviewOf(from) || {}, canPlace = cutAt == null && !!iv.path;
        const text = lines.map(l => l.text).join(' ');
        return h('div.list-row.producer-line' + (canPlace ? '.story-drag' : ''), { draggable: canPlace ? 'true' : 'false', title: canPlace ? 'Drag it onto the timeline' : '', ondragstart: e => S().dragLines(e, lines) },
          h('div.list-main', h('div', h('b', S().speakerName(a.speaker) + ': '), text.length > 400 ? text.slice(0, 400) + '…' : text),
            h('div.list-sub', cutAt != null ? `In the cut at ${mmss(cutAt)}` : `Not in the cut · `, cutAt != null ? '' : ivName(from), cutAt != null ? '' : ` · ${US.fmtDur(a.start)}`, note ? ` · ${note}` : '')),
          cutAt != null
            ? h('button.btn.small.ghost', { title: 'Go there in the cut', onclick: () => US.host.call('setPlayhead', { seqId, seconds: cutAt }).catch(e => ui.showError(e)) }, '▶')
            : h('button.btn.small.ghost', { title: 'Play it', onclick: () => S().cueLine(a) }, '▶'),
          canPlace ? h('button.btn.small.ghost', { title: 'Put it at the playhead', onclick: () => S().placeAtPlayhead(lines) }, US.icon('playhead', 14)) : null);
      }
      const replyBox = (placeholder, go) => {
        const inp = ui.input({ placeholder, onEnter: x => { if (x.trim()) go(x.trim()); } });
        return h('div.row.producer-reply', h('div.grow', inp), ui.button('Send', { small: true, onClick: () => { if (inp.value.trim()) go(inp.value.trim()); } }));
      };
      const seqPicker = () => ui.sourcePicker({ modes: ['sequence'], label: 'The cut' });
      const briefBox = () => h('textarea.input', { rows: 3, placeholder: 'Optional: what it’s for – e.g. a 3-minute film for the charity’s donors about how the bakery brought the street together', oninput: e => US.settings.set('producer.brief', e.target.value) }, US.settings.get('producer.brief', US.settings.get('story.brief', '')));
      const costLine = () => { try { return h('div.field-hint', S().contextLine()); } catch (e) { return null; } };
      const clientHint = () => (String(S().state().narrativeContext || '').trim() ? h('div.field-hint', 'The client’s notes from Story › 4 Build are read too.') : null);
      const blocked = () => { try { need(); return null; } catch (e) { return ui.card(ui.note(e.title || e.message, 'info'), e.action ? h('div.field-hint', e.action) : null, e.code === 'AI_KEY' ? null : ui.button('Open Story', { small: true, onClick: () => S().open('transcripts') })); } };

      /* notes on the cut */
      function renderNotes() {
        const P = pstate();
        if (!shownNotes) shownNotes = P.notes[0] || null;
        const pick = seqPicker(), brief = briefBox();
        const tone = ui.segmented({ value: US.settings.get('producer.tone', 'blunt'), onChange: x => US.settings.set('producer.tone', x), options: [{ value: 'blunt', label: 'Blunt', title: 'Argues against the cut – no softening' }, { value: 'kind', label: 'Supportive', title: 'Says what works too, problems as things to try' }] });
        const focus = ui.select({ value: US.settings.get('producer.focus', 'all'), onChange: x => US.settings.set('producer.focus', x), options: [{ value: 'all', label: 'Everything' }, { value: 'pace', label: 'Pace' }, { value: 'clarity', label: 'Clarity' }, { value: 'structure', label: 'Structure' }, { value: 'emotion', label: 'Emotion' }, { value: 'missing', label: 'What’s missing' }] });
        const go = ui.actionButton('Get notes on the cut', () => US.jobs.run({ title: 'Producer notes', tool: 'producer' }, async job => {
          const r = await getNotes(job, { seqId: pick.get().seqId, brief: brief.value, tone: US.settings.get('producer.tone', 'blunt'), focus: US.settings.get('producer.focus', 'all') });
          shownNotes = r.notes; render(); return { summary: r.summary };
        }), { icon: 'producer' });
        body.append(ui.card(h('div.card-title', 'Notes on the cut'), pick.el, ui.field('What it’s for', brief), clientHint(), h('div.row', ui.field('Tone', tone), ui.field('Look hardest at', focus)), go, costLine()));
        if (P.notes.length > 1) body.appendChild(h('div.row.producer-history', h('span.field-hint', 'Earlier:'), P.notes.map(n => h('button.chip' + (n === shownNotes ? '.on' : ''), { onclick: () => { shownNotes = n; render(); } }, US.keep(`${n.name} · ${new Date(n.updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`)))));
        if (shownNotes) body.appendChild(notesCard(shownNotes));
      }
      function notesCard(rec) {
        const res = rec.result, firstAt = new Map();
        for (const r of rec.cut || []) if (!firstAt.has(r.lineId)) firstAt.set(r.lineId, r.start);
        const copy = () => notesText(res, { name: rec.name, lineText: say, timeOf: id => (firstAt.has(id) ? firstAt.get(id) : null) });
        const tools = h('div.row',
          ui.button('Mark them on the sequence', { small: true, icon: 'target', title: 'A range marker where each note points, in the note’s colour (replaces earlier Producer markers there)', onClick: () => US.jobs.run({ title: 'Marking the notes', tool: 'producer' }, job => markNotes(job, rec)) }),
          ui.button('Copy', { small: true, kind: 'ghost', onClick: () => { ui.copy(copy()); ui.toast({ type: 'ok', title: 'Notes copied' }); } }),
          ui.button('Save as text', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { const f = US.audioKit.saveText(`Notes on ${rec.name} ${new Date().toISOString().slice(0, 10)}.txt`, copy()); ui.toast({ type: 'ok', title: 'Notes saved', text: US.basename(f), action: { label: 'Open', fn: () => US.audioKit.open(f) } }); } }));
        const notes = res.notes.map((n, i) => h('div.producer-note.kind-' + n.kind,
          h('div.producer-note-head', h('span.pill', KINDS[n.kind].label), h('b', `${i + 1}. ${n.title}`)),
          h('div.producer-note-text', n.text),
          n.items.length ? h('div.list', n.items.map(it => lineRow(it.from, it.to, { note: it.note, cutAt: it.tag === 'cut' && firstAt.has(it.from) ? firstAt.get(it.from) : null, seqId: rec.seqId }))) : null));
        return ui.card(h('div.card-title', US.keep(`Notes on “${rec.name}”`), h('span.right.field-hint', rec.by || '')),
          res.verdict ? h('div.producer-verdict', res.verdict) : null, rec.missing ? ui.note(rec.missing, 'warn') : null, tools,
          notes.length ? notes : ui.empty({ title: 'No notes came back', text: 'Try again, or choose another focus.' }),
          h('div.field-label', 'Answer back'), replyBox('e.g. “the repetition is on purpose – it’s a refrain”, or “what would you open with?”', x => US.jobs.run({ title: 'Producer notes', tool: 'producer' }, async job => { const r = await getNotes(job, { id: rec.id, reply: x }); shownNotes = r.notes; render(); return { summary: r.summary }; })),
          h('div.field-hint', 'It reads the cut again, so changes you’ve made since count.'));
      }

      /* pick-up interview */
      function renderPickups() {
        const P = pstate();
        if (!shownPlan) shownPlan = P.pickups[0] || null;
        const brief = briefBox();
        let useCut = US.settings.get('producer.pickCut', false);
        const pick = seqPicker();
        const cutBox = h('div', useCut ? pick.el : null);
        const cutTog = ui.toggle({ label: 'Also check against my cut', hint: 'what the cut so far still needs', value: useCut, onChange: x => { useCut = x; US.settings.set('producer.pickCut', x); US.clear(cutBox); if (x) cutBox.appendChild(pick.el); } });
        const people = Array.from(new Set(S().state().transcripts.flatMap(t => t.lines.map(l => l.speaker)).filter(Boolean))).filter(sp => !US.transcript.isInterviewerLabel(sp) && !US.transcript.isInterviewerLabel(S().speakerName(sp)));
        const chosen = new Set(US.settings.get('producer.people', []).filter(x => people.includes(x)));
        const who = people.length > 1 ? ui.section('Only ask some people', people.map(sp => ui.toggle({ label: S().speakerName(sp), value: chosen.has(sp), onChange: x => { if (x) chosen.add(sp); else chosen.delete(sp); US.settings.set('producer.people', Array.from(chosen)); } })), { open: chosen.size > 0, hint: 'everyone when none are on' }) : null;
        const go = ui.actionButton('Plan the pick-up interview', () => US.jobs.run({ title: 'Planning the pick-up interview', tool: 'producer' }, async job => {
          const r = await planPickups(job, { brief: brief.value, seqId: useCut ? pick.get().seqId : '', people: Array.from(chosen).map(sp => S().speakerName(sp)) });
          shownPlan = r.plan; render(); return { summary: r.summary };
        }), { icon: 'producer' });
        body.append(ui.card(h('div.card-title', 'Pick-up interview'), ui.field('What the film needs to say', brief), clientHint(), cutTog, cutBox, who, go, costLine()));
        if (P.pickups.length > 1) body.appendChild(h('div.row.producer-history', h('span.field-hint', 'Earlier:'), P.pickups.map(n => h('button.chip' + (n === shownPlan ? '.on' : ''), { onclick: () => { shownPlan = n; render(); } }, new Date(n.updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))));
        if (shownPlan) body.appendChild(planCard(shownPlan));
      }
      function planCard(rec) {
        const res = rec.result, q = res.gaps.reduce((k, g) => k + g.asks.length, 0);
        const bySeg = ui.segmented({ value: by, onChange: x => { by = x; US.settings.set('producer.by', x); render(); }, options: [{ value: 'person', label: 'By person', title: 'A question sheet for each person' }, { value: 'gap', label: 'By gap', title: 'What the story needs, with the questions for it' }] });
        const text = () => pickupText(res, { nameOf: nameOfSpeaker, by });
        const tools = h('div.row', bySeg, h('div.grow'),
          ui.button('Copy', { small: true, kind: 'ghost', onClick: () => { ui.copy(text()); ui.toast({ type: 'ok', title: `${US.plural(q, 'question')} copied` }); } }),
          ui.button('Save as Word', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const f = saveDoc('Pick-up interview', pickupDoc(res, { nameOf: nameOfSpeaker, subtitle: US.ctx.project ? US.ctx.project.name : '' })); ui.toast({ type: 'ok', title: 'Question sheet saved', text: US.basename(f), action: { label: 'Open', fn: () => US.audioKit.open(f) } }); } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); } } }));
        let list;
        if (by === 'person') list = byPerson(res.gaps).map(per => h('div.producer-person', h('div.field-label', nameOfSpeaker(per.speaker)),
          h('ol.producer-questions', per.items.map(x => h('li', x.question, h('span.field-hint', `  ${x.gap}`))))));
        else list = res.gaps.map((g, i) => h('div.producer-note', h('div.producer-note-head', h('b', `${i + 1}. ${g.title}`)), h('div.producer-note-text', g.why),
          h('ul.producer-questions', g.asks.map(a => h('li', h('b', nameOfSpeaker(a.speaker) + ': '), a.question))),
          g.near.length ? h('div', h('div.field-hint', 'Closest so far:'), h('div.list', g.near.map(n => lineRow(n.from, n.to, { note: n.note })))) : null));
        return ui.card(h('div.card-title', `${US.plural(res.gaps.length, 'gap')} · ${US.plural(q, 'question')}`, h('span.right.field-hint', rec.by || '')),
          res.summary ? h('div.producer-verdict', res.summary) : null, rec.missing ? ui.note(rec.missing, 'warn') : null, tools,
          list.length ? list : ui.empty({ title: 'No gaps came back', text: 'Try again with a brief.' }),
          h('div.field-label', 'Change it'), replyBox('e.g. “Ruth can’t be reached – give her questions to David”, or “more about the 1990s”', x => US.jobs.run({ title: 'Planning the pick-up interview', tool: 'producer' }, async job => { const r = await planPickups(job, { id: rec.id, reply: x }); shownPlan = r.plan; render(); return { summary: r.summary }; })));
      }

      function render() {
        US.clear(body);
        if (!S()) return;
        S().loadState();
        const b = blocked();
        if (b) { body.appendChild(b); return; }
        if (page === 'pickups') renderPickups(); else renderNotes();
      }
      v.body.append(top, body);
      return {
        el: v.el,
        onShow(o) {
          if (o && o.page) { page = o.page; pageSeg.set && pageSeg.set(page); }
          if (S()) { S().loadState(); const P = pstate(); if (o && o.id) { shownNotes = P.notes.find(x => x.id === o.id) || shownNotes; shownPlan = P.pickups.find(x => x.id === o.id) || shownPlan; } }
          render();
        }
      };
    }
  });

  US.producer = { cutListing, KINDS, notesTask, notesFollowUp, organiseNotes, noteMarkers, notesText, pickupTask, organisePickups, byPerson, pickupText, pickupDoc, getNotes, markNotes, planPickups };
})();
