/* JMG Ultra Studio – Agent: give it a goal (“a 2-minute film for the donors about the bakery, hopeful ending”) and it
   works towards it on its own, a step at a time – searching the interviews, picking lines, building a sequence, then
   tidying it with the panel's own tools – and checks each result before the next step. Like Eddie's prompt-to-rough-cut
   and Descript's Underlord, but inside Premiere/Resolve and with the footage never leaving the computer: the AI only
   reads text (transcript lines, the timeline as a list, what each tool reports).

   How it stays safe: it shows its plan first and waits for Go; it never touches the editor's own sequences (it builds
   new ones or works on a copy); it stops at a number of steps and a spending limit; Stop works as everywhere else; and
   every sequence it makes is listed at the end, so “keep v2” is the editor's choice. Follow-ups (“make it 30 seconds
   shorter”, “open on Ruth instead”) carry on the same conversation, so the AI remembers what it did.

   Switched off in Settings › Agent, the tab and its Assistant command are not there (rollback without reinstalling).
   Pure logic first (unit-tested), then the runner, then the screen. */
(function () {
  'use strict';
  const US = window.US;
  if (US.settings && US.settings.get('agent.enabled', true) === false) { US.agent = { off: true }; return; }
  const RES = () => US.app && US.app.is && US.app.is('resolve');
  const E = () => US.editAsk;

  /* ---------- what it can do ---------- */
  // the Assistant actions the agent may run on its working sequence: ones that tidy, mark or check a cut. Nothing that
  // renders, exports, moves project items or costs a lot of AI on its own (those stay the editor's call).
  const ACTIONS = ['silence.cut', 'silence.punch', 'takes.cut', 'beats.markers', 'story.captions', 'podcast.switch', 'safezones.add', 'check.run', 'deliver.chapters', 'deliver.text', 'producer.notes', 'markers.clean'];
  const TOOLS = {
    plan: 'Your plan, before anything else: args {} – put the steps in "plan". The editor approves it (or adds a note) before you go on.',
    search: 'Search the interview transcripts: args {"query":"words or a topic","speaker":"optional name","limit":25}. Returns lines: id, interview, speaker, time, text. Free and instant – search as often as you need, with different words.',
    lines: 'Read lines in full with what was said around them: args {"ids":["L12"],"around":2}. Use it to check a soundbite starts and ends cleanly.',
    themes: 'The themes found in Story so far, each with its best lines: args {"limit":6}.',
    build: 'Build a NEW sequence from lines, in order: args {"name":"short name","sections":[{"name":"Opening","lineIds":["L12","L40"]}],"targetSeconds":120}. It becomes your working sequence. Interviewer questions are left out automatically; lines run on to finish a thought.',
    timeline: 'Read your working sequence (or the open one) as a list of clips, tracks, times and what is said: args {}.',
    edit: 'Edit the working sequence: args {"steps":[{"op":"transition","targets":{...},"params":{...},"why":"…"}]} with the edits and target queries listed below. If the working sequence is the editor’s own, a copy is made first.',
    action: 'Run one of the panel’s tools on the working sequence: args {"id":"silence.cut","params":{...}} – ids and settings below. Tools that cut make their own copy, which becomes your working sequence.',
    version: 'Keep a copy of the working sequence as it is now, so the editor can compare versions: args {"name":"v1 – 2:10"}.',
    finish: 'Stop and report: args {"summary":"what you made and the choices you took","check":["things the editor should look at"]}. Call it when the goal is met, or when you can’t get further.'
  };
  const STEP_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['say', 'plan', 'tool', 'argsJson'],
    properties: {
      say: { type: 'string' },
      plan: { type: 'array', items: { type: 'string' } },
      tool: { type: 'string', enum: Object.keys(TOOLS) },
      argsJson: { type: 'string' }
    }
  };
  // goals for the work Ultra Studio is mostly used for: documentaries and charity films built from interviews,
  // events, podcasts and social cut-downs
  const GOALS = [
    { id: 'charity', label: 'Charity film', text: 'A 2-minute film for donors from the interviews: open on a strong human moment, the problem, what the charity does, the change it made, and end on hope. Tidy the pauses and check the cut.' },
    { id: 'stringout', label: 'Best answers string-out', text: 'A string-out of the best answer to each main interview question, in the order of the interviews, about 6 minutes, with a marker naming each question.' },
    { id: 'topic', label: 'Everything on a topic', text: 'Everything the interviewees say about [topic], strongest first, as a sequence with a section per person.' },
    { id: 'tighten', label: 'Tighten this cut', text: 'Tighten the open sequence: cut the pauses and the ums, punch in on the jump cuts, and keep it under [length]. Then check the cut.' },
    { id: 'social', label: 'Social clip', text: 'A 45-second vertical clip for Instagram from the most moving moment in the interviews: one speaker, a clear start and a strong last line, with captions.' },
    { id: 'polish', label: 'Polish for review', text: 'Polish the open sequence for a client review: a cross dissolve where the speaker changes, fades at the start and end, safe-zone guides, chapters from the markers, and a final check.' }
  ];

  /* ---------- pure pieces ---------- */
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.round(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
  /** The rows the AI reads for lines: id, interview, speaker, time, text. */
  function lineRows(lines, { text = 220 } = {}) {
    return lines.map(l => [l.id, clip(l.interview, 40), l.speaker || '', `${fmtT(l.start)}–${fmtT(l.end)}`, clip(String(l.text || '').replace(/\s+/g, ' '), text)].join('\t')).join('\n');
  }
  /** An action, as the AI reads it: id(settings): what it does. */
  function actionCard(a) {
    const ps = Object.entries(a.params || {}).map(([k, p]) => `${k}${p.options ? ` (${p.options.join('|')})` : ` (${p.type})`}${p.default !== undefined && p.default !== '' ? ` = ${JSON.stringify(p.default)}` : ''}: ${p.desc || ''}`);
    return `- ${a.id} – ${a.title}. ${a.describe || ''}${ps.length ? `\n    settings: ${ps.join('; ')}` : ''}`;
  }
  function rules({ resolve = RES(), actions = [], ops = [] } = {}) {
    return [
      `You are the editing agent inside JMG Ultra Studio, a panel in ${resolve ? 'DaVinci Resolve' : 'Adobe Premiere Pro'}. A documentary and charity-film editor gives you a goal. You reach it by calling tools, one per turn, and reading what each returns. You never see footage – only text: transcript lines, the timeline as a list, tool reports.`,
      'Answer every turn as JSON: "say" – one short sentence to the editor about what you are doing and why (plain British English); "plan" – your list of steps on the first turn (and when you change the plan), else []; "tool" – the tool to call; "argsJson" – its arguments as a JSON object string.',
      'How to work:',
      '- First turn: tool "plan" with 3–8 short steps. Then follow it, adapting to what you find.',
      '- Story work: search widely (several searches, different words, the people’s names), read the strongest lines with "lines" to make sure they make sense on their own, then build. Pick lines that a viewer understands without the question. Prefer emotion, specifics and short complete thoughts. Mix the voices. Respect a length if one is given: about 2.5 words a second.',
      '- Only use line ids the tools gave you. Never invent clip ids, effect names or tool ids.',
      '- After building or editing, read the timeline and check the result against the goal (length, order, what is said). Fix what is off, then finish.',
      '- You work on new sequences or copies only; the editor’s own cut is never changed. Keep a "version" before a big change when the editor may want to compare.',
      '- Be economical: no step that doesn’t move the goal on. If something can’t be done here, say so and carry on with the rest.',
      `- Finish with "finish": what you made, the main choices, and in "check" anything the editor should look at (a line that may be cut short, a name you weren’t sure of).${resolve ? ' In Resolve add-ons can’t add transitions, effects, speed changes or text.' : ''}`,
      '', 'TOOLS:', ...Object.entries(TOOLS).map(([k, d]) => `- ${k}: ${d}`),
      '', 'EDITS for the "edit" tool (op: what it does – params):', ...ops.map(k => `- ${k}: ${E().OPS[k].desc} – ${E().OPS[k].params}`),
      'Targets for an edit: {"ids":["c3"]} from the timeline, or a query {"tracks":["V1"],"kind":"video|audio","nameContains":"","speakers":["Ruth"],"says":"words","speakerChange":true,"from":seconds,"to":seconds,"every":"all|first|last|everyOther|cuts"}; transcript lines on the timeline: {"lines":true or ["l4"],"speakers":[],"says":""}.',
      '', 'PANEL TOOLS for the "action" tool:', ...(actions.length ? actions.map(actionCard) : ['(none here)'])
    ].join('\n');
  }
  /** The AI's turn → {say, plan, tool, args, bad}; anything unusable becomes a note it is told about. */
  function parseStep(r) {
    const tool = r && TOOLS[r.tool] ? r.tool : '';
    let args = {}, bad = '';
    if (!tool) bad = `There is no tool “${r && r.tool}”.`;
    try { args = r && r.argsJson ? JSON.parse(r.argsJson) : {}; if (!args || typeof args !== 'object' || Array.isArray(args)) { args = {}; bad = bad || 'argsJson must be a JSON object.'; } }
    catch (e) { bad = bad || `argsJson isn’t valid JSON (${e.message}).`; }
    return { say: String((r && r.say) || '').trim(), plan: Array.isArray(r && r.plan) ? r.plan.map(String).filter(Boolean).slice(0, 12) : [], tool, args, bad };
  }
  /** Older tool results shortened, so a long run doesn't send its whole history every turn (the last `keep` stay whole). */
  function compact(turns, { keep = 4, room = 500 } = {}) {
    return turns.map((t, i) => (i < turns.length - keep && t.user.length > room ? Object.assign({}, t, { user: t.user.slice(0, room) + `\n…(shortened – ${t.user.length} characters; call the tool again if you need it)` }) : t));
  }
  /** "a 2-minute film", "45 seconds", "under 3:00", "90s" → seconds (0 when none). */
  function lengthIn(text) {
    const t = String(text || '').toLowerCase();
    let m = /(\d+):(\d{2})\b/.exec(t); if (m) return +m[1] * 60 + +m[2];
    m = /(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*(minutes?|mins?|m\b)/.exec(t); if (m) return Math.round(+m[1] * 60);
    m = /(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*(seconds?|secs?|s\b)/.exec(t); if (m) return Math.round(+m[1]);
    return 0;
  }
  /** What a goal needs: interviews (search/build) and/or an open sequence (tighten/polish). */
  function needs(goal) {
    const t = String(goal || '').toLowerCase();
    return { sequence: /\b(this|the open|my|current)\s+(cut|sequence|edit|timeline)\b|\btighten\b|\bpolish\b/.test(t), interviews: /\binterview|\bsoundbite|\bstring.?out|\bsays?\b|\btalk|\bstory\b|\bfilm\b|\bclip\b|\btopic\b|\banswer/.test(t) };
  }
  /** The first message: the project as text (cached for the run and its follow-ups). */
  function brief({ editor, sequence, story }) {
    const out = [`EDITOR: ${editor}`];
    out.push(sequence ? `OPEN SEQUENCE: “${sequence.name}”${sequence.duration ? ` – ${fmtT(sequence.duration)}` : ''}${sequence.clips != null ? `, ${sequence.clips} clips` : ''}` : 'OPEN SEQUENCE: none');
    if (!story || !story.interviews.length) out.push('INTERVIEWS: none transcribed in Story yet (search and build won’t find anything).');
    else {
      out.push(`INTERVIEWS (${story.interviews.length}, ${story.lines} lines in scope):`, ...story.interviews.slice(0, 80).map(i => `- ${i.name}: ${i.lines} lines${i.speakers.length ? ` – ${i.speakers.join(', ')}` : ''}`));
      if (story.interviews.length > 80) out.push(`…and ${story.interviews.length - 80} more`);
      if (story.themes.length) out.push(`THEMES FOUND: ${story.themes.map(t => `${t.name} (${t.n})`).join(', ')}`);
      if (story.brief) out.push(`THE EDITOR’S BRIEF FOR THIS PROJECT: ${story.brief}`);
    }
    return out.join('\n');
  }

  /* ---------- what the tools read (Story) ---------- */
  function storyLine(l) {
    const S = US.story, t = S.interviewOf ? S.interviewOf(l.id) : null;
    return { id: l.id, interview: t ? t.name : '', speaker: S.speakerName ? S.speakerName(l.speaker) : l.speaker, start: l.start, end: l.end, text: l.text, asked: S.isInterviewer ? !!S.isInterviewer(l) : false };
  }
  async function scopeLines(job) {
    if (!US.story) throw new US.UserError('NOTHING_FOUND', { title: 'Story isn’t available.' });
    US.story.loadState && US.story.loadState();
    return US.story.linesInScope(job);
  }
  function storySummary() {
    try {
      const S = US.story; S.loadState && S.loadState();
      const st = S.state(), lines = S.scopeLines ? S.scopeLines() : [];
      const interviews = (st.transcripts || []).map(t => ({ name: t.name, lines: (t.lines || []).length, speakers: [...new Set((t.lines || []).map(l => S.speakerName(l.speaker)).filter(Boolean))].slice(0, 6) }));
      return { interviews, lines: lines.length || US.sum(interviews.map(i => i.lines)), themes: (st.themes || []).filter(t => t.name !== 'Other' && t.lineIds && t.lineIds.length).map(t => ({ name: t.name, n: t.lineIds.length })).slice(0, 40), brief: String(US.settings.get('story.brief', '') || '').trim() };
    } catch (e) { return null; }
  }

  /* ---------- the run ---------- */
  /**
   * A session: one goal and its follow-ups. -> {id, goal, turns, first, context, work:{seqId,name,ours}, versions:[{seqId,name,why}], steps, spent, done}
   */
  function newSession(goal) { return { id: US.uid('ag'), goal: String(goal || '').trim(), turns: [], first: '', context: '', work: null, versions: [], steps: 0, done: false, at: Date.now() }; }

  /**
   * Run (or carry on) a session inside a job. opts: {maxSteps, followUp, confirmPlan: async ({say, plan}) -> {ok, note},
   * onEvent: e => {}}. Events: {type:'say'|'plan'|'tool'|'result'|'warn'|'done', …}. -> the session
   */
  async function run(job, s, { maxSteps = 12, followUp = '', confirmPlan = null, onEvent = () => {} } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('NO_AI', { title: 'The agent needs AI.', action: 'Add a Claude or Gemini key in Settings.' });
    const ed = E();
    const acts = ACTIONS.map(id => US.actions.get(id)).filter(Boolean);
    const ops = ed.opsFor('timeline');
    const system = [{ text: rules({ actions: acts, ops }), cache: '1h' }];
    if (!s.context) {
      const sq = US.ctx && US.ctx.sequence;
      let seqInfo = null;
      if (sq) { seqInfo = { name: sq.name }; try { const info = await US.host.call('editRead', { seqId: sq.id }); seqInfo.duration = info.duration; seqInfo.clips = US.sum(['video', 'audio'].map(k => US.sum((info[k] || []).map(t => (t.clips || []).length)))); } catch (e) { /* the name will do */ } }
      s.context = brief({ editor: RES() ? 'DaVinci Resolve' : 'Premiere Pro', sequence: seqInfo, story: storySummary() });
      s.work = sq ? { seqId: sq.id, name: sq.name, ours: false } : null;
      const len = lengthIn(s.goal);
      s.first = `GOAL: ${s.goal}${len ? `\n(Target length: about ${fmtT(len)}.)` : ''}\nYou have up to ${maxSteps} tool calls. Start with your plan.`;
    } else if (followUp) {
      s.turns.push({ assistant: s.last || '{}', user: `${s.pendingResult || ''}\n\nThe editor follows up: “${followUp.trim()}”${lengthIn(followUp) ? ` (target length about ${fmtT(lengthIn(followUp))})` : ''}. Carry on from where you are (your working sequence is “${s.work ? s.work.name : 'none'}”). Make a short plan first if it changes much.`.trim() });
      s.pendingResult = ''; s.done = false;
    }
    const startSteps = s.steps;
    let planned = s.turns.length > 0;   // a follow-up carries on under the plan already approved
    while (!s.done) {
      job.check();
      if (s.steps - startSteps >= maxSteps) { onEvent({ type: 'warn', text: `Stopped after ${maxSteps} steps – the most for one go. Ask it to carry on if you want more.` }); break; }
      job.set({ who: 'ai', msg: `${US.ai.label()} is deciding the next step` });
      let r;
      try { r = await US.ai.json({ system, user: [{ text: s.context, cache: '1h' }, s.first], turns: compact(s.turns), schema: STEP_SCHEMA, maxTokens: 5000, effort: 'medium', feature: 'Agent' }); }
      catch (e) {
        // the AI couldn't be asked (the spending limit, the monthly cap, no connection): stop here, keeping what was made
        if (e instanceof US.UserError && (e.code === 'CANCELLED' || e.code === 'STOPPED')) throw e;
        const x = US.errors && US.errors.explain ? US.errors.explain(e) : { title: String(e && e.message || e), action: '' };
        onEvent({ type: 'warn', text: /limit/i.test(x.title) ? `Stopped at the spending limit after ${US.plural(s.steps - startSteps, 'step')} – what it made so far is kept. Raise the limit and press Carry on to let it finish.` : `Stopped: ${x.title} ${x.action || ''}`.trim() });
        s.pendingResult = 'You were stopped before your next step (' + x.title + '). Carry on from where you were.';
        break;
      }
      s.last = JSON.stringify(r || {});
      const st = parseStep(r);
      s.steps++;
      if (st.say) onEvent({ type: 'say', text: st.say });
      let result;
      try {
        if (st.bad) result = `ERROR: ${st.bad} Try again.`;
        else if (st.tool === 'plan' || (!planned && st.plan.length)) {
          planned = true;
          onEvent({ type: 'plan', plan: st.plan, say: st.say });
          const ok = confirmPlan ? await confirmPlan({ say: st.say, plan: st.plan }) : { ok: true };
          if (!ok || ok.ok === false) { onEvent({ type: 'warn', text: 'Stopped – the plan wasn’t approved.' }); s.done = true; s.pendingResult = 'The editor stopped before the plan ran.'; break; }
          result = ok.note ? `The editor approved the plan with a note: “${ok.note}”. Follow it.` : 'The editor approved the plan. Go ahead.';
          if (st.tool !== 'plan') result = (await callTool(job, s, st, onEvent)) + '\n' + result;
        } else if (!planned && /^(build|edit|action|version)$/.test(st.tool)) result = 'ERROR: show your plan first (tool "plan") – the editor approves it before anything is made.';
        else result = await callTool(job, s, st, onEvent);
      } catch (e) {
        if (e instanceof US.UserError && (e.code === 'CANCELLED' || e.code === 'STOPPED')) throw e;
        const x = US.errors && US.errors.explain ? US.errors.explain(e) : { title: String(e && e.message || e), action: '' };
        result = `ERROR: ${x.title} ${x.action || ''}`.trim();
        onEvent({ type: 'warn', text: x.title });
        if (/AI limit|monthly AI limit/.test(x.title)) { s.done = true; s.pendingResult = result; break; }
      }
      if (s.done) { s.pendingResult = ''; break; }
      s.turns.push({ assistant: s.last, user: clip(`RESULT of ${st.tool || 'that'}:\n${result}`, 7000) });
    }
    return s;
  }

  /** One tool call → the text the AI reads back. */
  async function callTool(job, s, st, onEvent) {
    const a = st.args || {}, ed = E();
    onEvent({ type: 'tool', tool: st.tool, args: a });
    const note = text => { onEvent({ type: 'result', tool: st.tool, text }); return text; };
    switch (st.tool) {
      case 'search': {
        job.set({ who: 'studio', msg: `Searching the interviews for “${clip(a.query, 40)}”` });
        const lines = await scopeLines(job), lim = Math.max(5, Math.min(60, +a.limit || 25));
        let pool = lines;
        if (a.speaker) { const sp = String(a.speaker).toLowerCase(); pool = lines.filter(l => String(US.story.speakerName(l.speaker)).toLowerCase().includes(sp) || String((US.story.interviewOf(l.id) || {}).name || '').toLowerCase().includes(sp)); }
        const hits = a.query ? US.transcript.search(String(a.query), pool, { limit: lim * 2 }).map(h => h.line) : pool.slice(0, lim);
        const rows = hits.map(storyLine).filter(l => !l.asked).slice(0, lim);
        note(`${US.plural(rows.length, 'line')} for “${clip(a.query || a.speaker, 40)}”`);
        return rows.length ? `${rows.length} lines (id, interview, speaker, time, text):\n${lineRows(rows)}` : 'Nothing found. Try other words, a person’s name, or a broader topic.';
      }
      case 'lines': {
        const S = US.story, ids = (Array.isArray(a.ids) ? a.ids : []).slice(0, 30), around = Math.max(0, Math.min(4, +a.around || 0)), out = [];
        for (const id of ids) {
          const l = S.lineOf(id), t = l && S.interviewOf(id);
          if (!l || !t) { out.push(`${id}: no such line`); continue; }
          const i = t.lines.findIndex(x => x.id === id), from = Math.max(0, i - around), to = Math.min(t.lines.length, i + around + 1);
          out.push(`— ${id} in ${t.name}:`, lineRows(t.lines.slice(from, to).map(storyLine).map(x => Object.assign(x, { id: x.id === id ? `>${x.id}` : x.id })), { text: 600 }));
        }
        note(`Read ${US.plural(ids.length, 'line')}`);
        return out.join('\n') || 'Give line ids.';
      }
      case 'themes': {
        const S = US.story; S.loadState && S.loadState();
        const lim = Math.max(1, Math.min(12, +a.limit || 6));
        const th = (S.state().themes || []).filter(t => t.name !== 'Other' && t.lineIds && t.lineIds.length);
        note(`${US.plural(th.length, 'theme')}`);
        if (!th.length) return 'No themes yet (Story › Find themes). Use search instead.';
        return th.slice(0, 30).map(t => `THEME “${t.name}” (${t.lineIds.length} lines):\n${lineRows(t.lineIds.slice(0, lim).map(id => S.lineOf(id)).filter(Boolean).map(storyLine))}`).join('\n');
      }
      case 'build': {
        const S = US.story, sections = (Array.isArray(a.sections) ? a.sections : []).map((x, i) => ({ name: String(x.name || '').slice(0, 60), label: [9, 5, 7, 4, 6, 10, 15, 2][i % 8], lineIds: (x.lineIds || []).map(String).filter(id => S.lineOf(id)) })).filter(x => x.lineIds.length);
        const unknown = US.sum((a.sections || []).map(x => (x.lineIds || []).filter(id => !S.lineOf(String(id))).length));
        if (!sections.length) return 'ERROR: none of those line ids exist. Use ids from search, lines or themes.';
        const name = `Agent – ${clip(String(a.name || s.goal).replace(/[\\/:*?"<>|]/g, ''), 50)}`;
        const out = await S.buildSequence(job, { name, groups: sections, target: Math.max(0, +a.targetSeconds || 0) });
        s.work = { seqId: out.seq.id, name: out.seq.name, ours: true };
        s.versions.push({ seqId: out.seq.id, name: out.seq.name, why: 'built' });
        note(out.summary);
        return `${out.summary}.${unknown ? ` ${unknown} unknown line ids were left out.` : ''} It is now your working sequence – read it with "timeline" to check it.`;
      }
      case 'timeline': {
        if (!s.work) return 'There is no working sequence yet – build one, or the editor must open one.';
        const m = await ed.read(job, { where: 'sequence', seqId: s.work.seqId });
        note(`Read “${s.work.name}” – ${fmtT(m.seq.duration)}, ${US.plural(m.clips.length, 'clip')}`);
        const t = ed.outline(m).split('\n');
        return `Working sequence “${s.work.name}” – ${fmtT(m.seq.duration)} long.\n` + (t.length > 260 ? t.slice(0, 260).join('\n') + `\n…and ${t.length - 260} more rows` : t.join('\n'));
      }
      case 'edit': {
        if (!s.work) return 'There is no working sequence yet – build one first.';
        await own(job, s);
        const m = await ed.read(job, { where: 'sequence', seqId: s.work.seqId });
        const plan = ed.checkPlan({ reply: '', done: false, steps: (Array.isArray(a.steps) ? a.steps : []).slice(0, 12).map(x => ({ op: String(x.op || ''), targetsJson: JSON.stringify(x.targets || {}), paramsJson: JSON.stringify(x.params || {}), why: String(x.why || '') })) }, m);
        if (!plan.steps.length) return `Nothing to do: ${plan.dropped.join('; ') || 'no steps'}.`;
        const out = await ed.run(job, { model: m }, plan.steps, { copy: false });
        const lines = out.results.map(r => `- ${ed.describe(r.step)}: ${r.unsupported ? 'NOT DONE – ' + r.why : `${r.done} done${r.skipped && r.skipped.length ? `, ${r.skipped.length} skipped (${[...new Set(r.skipped.map(x => x.why))].slice(0, 3).join('; ')})` : ''}`}`);
        note(`${US.plural(US.sum(out.results.map(r => r.done || 0)), 'change')} in “${s.work.name}”`);
        return lines.concat(plan.dropped.length ? [`Left out: ${plan.dropped.join('; ')}`] : []).join('\n');
      }
      case 'action': {
        const id = String(a.id || ''), act = ACTIONS.includes(id) && US.actions.get(id);
        if (!act) return `ERROR: “${id}” isn’t one of the panel tools you can use here.`;
        if (!s.work && /^(silence|takes|podcast|safezones|check|deliver|markers|story\.captions|beats|producer)/.test(id)) return 'There is no working sequence yet – build one first.';
        if (act.changes) await own(job, s);
        if (s.work) { await US.host.call('openSequence', { seqId: s.work.seqId }).catch(() => {}); if (US.refreshContext) await US.refreshContext(); }
        job.set({ who: 'studio', msg: act.title });
        const before = s.work && s.work.seqId;
        const out = await act.run(US.actions.normalize(act, a.params || {}), job);
        if (US.refreshContext) await US.refreshContext();
        const now = US.ctx && US.ctx.sequence;
        let moved = '';
        if (now && before && now.id !== before) { s.work = { seqId: now.id, name: now.name, ours: true }; s.versions.push({ seqId: now.id, name: now.name, why: act.title }); moved = ` Its result is the sequence “${now.name}”, now your working sequence.`; }
        const sum = (out && out.summary) || 'Done.';
        note(sum);
        return `${sum}${/[.!?]$/.test(sum) ? '' : '.'}${moved}`;
      }
      case 'version': {
        if (!s.work) return 'There is no working sequence yet.';
        const nm = `${s.work.name} – ${clip(String(a.name || `v${s.versions.length + 1}`).replace(/[\\/:*?"<>|]/g, ''), 30)}`;
        const c = await US.host.call('cloneSequence', { seqId: s.work.seqId, name: nm, binPath: 'JMG Ultra Studio/Agent/Versions' });
        s.versions.push({ seqId: c.id, name: c.name, why: 'kept as a version' });
        await US.host.call('openSequence', { seqId: s.work.seqId }).catch(() => {});
        note(`Kept “${c.name}”`);
        return `Kept a copy “${c.name}”. You carry on working in “${s.work.name}”.`;
      }
      case 'finish': {
        s.done = true;
        s.summary = String(a.summary || st.say || '').trim();
        s.check = (Array.isArray(a.check) ? a.check : []).map(String).filter(Boolean).slice(0, 10);
        onEvent({ type: 'done', summary: s.summary, check: s.check, versions: s.versions.slice(), work: s.work });
        return 'Finished.';
      }
      default: return 'ERROR: unknown tool.';
    }
  }
  /** Work on a copy of the editor's own sequence (once); the agent's own sequences are edited in place. */
  async function own(job, s) {
    if (!s.work || s.work.ours) return;
    job.set({ who: 'premiere', msg: 'Making a copy of your sequence to work on' });
    const c = await US.host.call('cloneSequence', { seqId: s.work.seqId, name: `${s.work.name} – Agent`, binPath: 'JMG Ultra Studio/Agent' });
    s.work = { seqId: c.id, name: c.name, ours: true };
    s.versions.push({ seqId: c.id, name: c.name, why: 'copy of your sequence' });
  }

  /* ---------- the Assistant can hand a goal over ---------- */
  US.actions.register({
    id: 'agent.run', tool: 'agent', title: 'Let the agent make a cut from a goal', changes: true,
    describe: 'Works towards an editing goal on its own – searching the interviews, building and tidying a sequence – after you approve its plan. Never changes your own sequences.',
    params: { goal: { type: 'string', default: '', desc: 'The goal, in the editor’s words' } },
    examples: ['agent: a 2-minute charity film about the bakery', 'make me a rough cut about leaving home'],
    match: t => (/^\s*agent\b|\brough cut\b|\bmake (me )?a (\d+[- ]?(minute|second)|short|rough)\b.*\b(film|cut|edit|video)\b/i.test(t) ? { goal: t.replace(/^\s*agent\s*[:,-]?\s*/i, ''), _score: 2.4 } : null),
    run: async p => { US.tools.open('agent', { goal: p.goal }); return { summary: 'Opened the Agent with that goal – check its plan and press Go.' }; }
  });

  /* ---------- the screen ---------- */
  US.addIcon && US.addIcon('agent', 'M10 2.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7L10 11l-3.3 1.7.7-3.7-2.7-2.6 3.7-.5zM4 17.5h12M6.5 15h7');
  const ui = US.ui, h = US.h;
  US.tools.register({
    id: 'agent', name: 'Agent', short: 'Agent', icon: 'agent', group: 'cut', order: 18,
    blurb: 'Give it a goal – it plans, searches your interviews, builds and tidies a cut on its own, on a new sequence.',
    hostFns: ['editRead', 'editApply', 'cloneSequence', 'openSequence', 'newSequence', 'storyPlace', 'itemsInfo'],
    create(opts = {}) {
      const v = ui.toolView({ icon: 'agent', title: 'Agent', blurb: 'Say what you want made. It shows its plan, then works step by step – searching your interviews, building a sequence, tidying it and checking it – and tells you what it did. Only text goes to the AI, never footage; your own sequences are never changed.', help: 'Pick a starting goal or write your own, with a length if you have one. Press Make plan: read the plan, add a note if you like, and press Go. Watch each step below; Stop works at any time. When it finishes, the sequences it made are listed – open one, or ask for changes (“30 seconds shorter”, “open on Ruth”) and it carries on from where it was. Steps and spending have limits you set here.' });
      const get = (k, d) => US.settings.get('agent.' + k, d), set = (k, x) => US.settings.set('agent.' + k, x);
      const goalIn = h('textarea.input', { id: 'agent-goal', rows: 3, placeholder: 'e.g. A 2-minute film for donors about the bakery: open on Ruth’s first day, end on hope' }, opts.goal || get('goal', ''));
      goalIn.addEventListener('input', () => set('goal', goalIn.value));
      const presets = h('div.chat-chips', GOALS.map(g => h('button.chip', { title: g.text, onclick: () => { goalIn.value = g.text; set('goal', g.text); goalIn.focus(); } }, g.label)));
      const stepsSel = ui.select({ value: String(get('maxSteps', 12)), onChange: x => set('maxSteps', +x), options: [6, 12, 20, 30].map(n => ({ value: String(n), label: `${n} steps` })) });
      const budgetSel = ui.select({ value: String(get('budget', 1)), onChange: x => set('budget', +x), options: [0.5, 1, 2, 5].map(n => ({ value: String(n), label: `$${n.toFixed(2)}` })) });
      const aiNote = h('div.field-hint');
      const go = ui.button('Make plan', { kind: 'primary', icon: 'agent', onClick: () => start() });
      const log = h('div.chat.agent-log'), endBox = h('div');
      const followIn = h('textarea.input', { id: 'agent-follow', rows: 2, placeholder: 'Ask for changes: 30 seconds shorter · open on Ruth · fewer interviewer questions' });
      const followBtn = ui.button('Carry on', { icon: 'chevron', onClick: () => start(followIn.value) });
      const followBar = h('div.chat-bar.hidden', followIn, followBtn);
      let session = null, busy = false;
      function drawAI() {
        const on = US.ai && US.ai.available();
        aiNote.textContent = on ? `Uses ${US.ai.label()} – only text is sent, never footage. ${US.ai.provider() === 'claude' ? 'It stops before going over the spending limit.' : ''}` : 'This needs AI: add a Claude or Gemini key in Settings.';
        go.disabled = !on;
      }
      const row = (cls, ...kids) => { const b = h('div.bubble.' + cls, kids); log.appendChild(b); b.scrollIntoView({ block: 'end', behavior: 'smooth' }); return b; };
      const TOOL_SAYS = { search: a => `Search: “${clip(a.query || a.speaker, 50)}”`, lines: a => `Read ${US.plural((a.ids || []).length, 'line')}`, themes: () => 'Look at the themes', build: a => `Build “${clip(a.name, 40)}” from ${US.plural(US.sum((a.sections || []).map(x => (x.lineIds || []).length)), 'line')}${a.targetSeconds ? `, aiming for ${fmtT(a.targetSeconds)}` : ''}`, timeline: () => 'Read the sequence', edit: a => `Edit: ${(a.steps || []).map(x => x.op).join(', ')}`, action: a => `Run ${((US.actions.get(a.id) || {}).title) || a.id}`, version: a => `Keep a version “${a.name || ''}”`, finish: () => 'Finish' };
      function event(e) {
        if (e.type === 'say') row('bot.agent-say', e.text);
        else if (e.type === 'tool' && e.tool !== 'plan' && e.tool !== 'finish') row('bot.agent-tool', h('span.agent-step', (TOOL_SAYS[e.tool] || (() => e.tool))(e.args || {})));
        else if (e.type === 'result') { const last = log.lastChild; if (last && last.classList.contains('agent-tool')) last.appendChild(h('span.agent-res', ' → ' + e.text)); }
        else if (e.type === 'warn') row('bot.agent-warn', e.text);
        else if (e.type === 'done') drawEnd(e);
      }
      function confirmPlan({ say, plan }) {
        return new Promise(res => {
          const note = h('textarea.input', { rows: 2, placeholder: 'Optional note: “keep Ruth’s line about the oven”, “no music”…' });
          const box = row('bot.agent-plan', h('div.field-label', 'The plan'), say ? h('div', say) : null, h('ol.agent-plan-list', plan.map(p => h('li', p))), note,
            h('div.row', ui.button('Go', { kind: 'primary', small: true, onClick: () => { box.classList.add('agent-plan-done'); res({ ok: true, note: note.value.trim() }); } }), ui.button('Stop', { kind: 'ghost', small: true, onClick: () => { box.classList.add('agent-plan-done'); res({ ok: false }); } })));
        });
      }
      function drawEnd(e) {
        US.clear(endBox);
        const seqs = (e.versions || []).filter((x, i, a) => a.findIndex(y => y.seqId === x.seqId) === i);
        endBox.appendChild(ui.card(h('div.card-title', 'What it made'),
          e.summary ? h('div', e.summary) : null,
          (e.check || []).length ? h('div', h('div.field-label', 'Worth checking'), h('ul', e.check.map(c => h('li', c)))) : null,
          seqs.length ? h('div', h('div.field-label', 'Sequences (your own are untouched)'), h('div.agent-seqs', seqs.map(x => h('div.row', h('span.grow', x.name, h('span.field-hint', ` – ${x.why}`)), ui.button('Open', { small: true, kind: 'ghost', onClick: () => US.host.call('openSequence', { seqId: x.seqId }).catch(err => ui.showError(err)) }))))) : h('div.field-hint', 'It didn’t make a sequence.'),
          h('div.field-hint', `${US.plural(session.steps, 'step')}. Ask for changes below, or start a new goal.`)));
      }
      async function start(follow = '') {
        if (busy) return;
        const goal = goalIn.value.trim();
        if (!follow && !goal) { ui.toast({ type: 'warn', title: 'Write a goal first, or pick one above.' }); return; }
        if (follow && !session) { ui.toast({ type: 'warn', title: 'Start with a goal first.' }); return; }
        const about = US.storyContext && US.storyContext.about ? US.storyContext.about(follow || goal) : '';
        if (!follow) { session = newSession(goal); US.clear(log); US.clear(endBox); row('me', goal); }
        else { row('me', follow); followIn.value = ''; US.clear(endBox); }
        if (about) row('bot.agent-about', about);
        busy = true; go.disabled = true; followBtn.disabled = true;
        const limit = +get('budget', 1), maxSteps = +get('maxSteps', 12);
        const spentBefore = US.ai.spending ? US.ai.spending().cost : 0;
        try {
          await US.jobs.run({ title: 'Agent', tool: 'agent', about }, async job => {
            if (US.ai.provider() === 'claude') US.ai.setBudget(limit);
            try { await run(job, session, { maxSteps, followUp: follow, confirmPlan, onEvent: event }); }
            finally { if (US.ai.endBudget) US.ai.endBudget(); }
            if (!session.done) drawEnd({ summary: 'It stopped before finishing.', versions: session.versions, check: [] });
            return { summary: session.summary ? clip(session.summary, 120) : `Agent: ${US.plural(session.steps, 'step')}` };
          });
        } catch (e) { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) ui.showError(e); drawEnd({ summary: 'Stopped.', versions: session.versions, check: [] }); }
        finally {
          busy = false; go.disabled = false; followBtn.disabled = false; followBar.classList.remove('hidden');
          const spent = US.ai.spending ? US.ai.spending().cost - spentBefore : 0;
          if (spent > 0.005) row('bot.agent-cost', `AI cost of this go: about ${US.ai.fmtUSD ? US.ai.fmtUSD(spent) : '$' + spent.toFixed(2)}.`);
        }
      }
      v.body.append(
        ui.card(h('div.field-label', 'Goal'), presets, goalIn,
          h('div.row.agent-limits', h('span.field-hint', 'At most'), stepsSel, h('span.field-hint', 'and'), budgetSel, h('div.grow'), go),
          aiNote),
        log, endBox, followBar);
      drawAI();
      US.bus.on('settings', US.debounce(drawAI, 300));
      return { el: v.el, onShow(o) { drawAI(); if (o && o.goal) { goalIn.value = o.goal; set('goal', o.goal); } } };
    }
  });

  US.agent = { ACTIONS, TOOLS, GOALS, STEP_SCHEMA, rules, parseStep, compact, lengthIn, needs, brief, lineRows, actionCard, newSession, run, callTool, own };
})();
