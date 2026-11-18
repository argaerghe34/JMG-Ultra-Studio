/* JMG Ultra Studio – Ask: one chat that does everything. The editor says what they want; the AI works towards it a
   step at a time by calling tools and reading what each returns – it reads the project, a sequence or a bin as text,
   searches and questions the interviews, edits clips (Ask › Edit's edits), runs any of the panel's tools, builds
   sequences – asks when it isn't sure (with answers to pick from), and reports what it did and what it couldn't.

   What the editor always sees: what it understood, its plan, each step as it happens, a card to approve before anything
   changes (how often is their choice: always, only for their own sequences and exports, or never), and at the end what
   was done, what wasn't and what to check – with the reasoning behind it one click away.

   Several chats run at once: each has its own conversation with the AI (thinking happens side by side); the steps that
   touch Premiere take turns, one at a time, through the same job runner as everything else (so Stop and the status bar
   work as usual). Text goes to the AI – and a few small stills only through US.footage, when the editor has switched
   that on for the project. Never video or audio.

   Pure logic first (unit-tested), then the runner. The screen is in 40-assistant.js. */
(function () {
  'use strict';
  const US = window.US;
  const RES = () => !!(US.app && US.app.is && US.app.is('resolve'));
  const E = () => US.editAsk;
  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.round(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const cancelled = e => e instanceof US.UserError && (e.code === 'CANCELLED' || e.code === 'STOPPED');
  const explain = e => (US.errors && US.errors.explain ? US.errors.explain(e) : { title: String((e && e.message) || e), action: '' });

  /* ---------- what it can do ---------- */
  const TOOLS = {
    project: 'Read the project: its bins, every sequence (s1, s2…) and clip (p1, p2…) with the bin it is in: args {}. Free.',
    timeline: 'Read a sequence as a list – every clip with its id (c1…), track, times, label, effects and, when transcribed, who speaks and what they say; markers; transcript lines heard (l1…): args {"sequence":"an s… id or the sequence’s name – leave out for your working sequence or the open one"}. Free. Read it before editing it and again afterwards to check.',
    selection: 'The clips the editor has selected in the open sequence: args {}. Free.',
    bin: 'Read the clips in a bin and the bins inside it – id (i1…), name, kind, length, size, label: args {"bin":"its name or path – leave out for the whole project"}. Free.',
    footage: 'Find clips by what is IN the picture, from the written descriptions Ultra Studio keeps of each clip (kind of shot, setting, people, action, writing in the picture, tags): args {"query":"what to look for – leave out to list every described clip","bin":"a bin’s name or path – leave out for the whole project","limit":40}. Returns clip ids (i1… – the same ids as a "bin" reading of that bin), name, shot, description. Free. It also says how many clips have no description yet; describing them is the panel tool footage.describe.',
    look: 'Look at particular clips yourself, through a few small stills, to answer something the descriptions don’t (“is the logo visible?”, “which take has both of them in frame?”, “is it day or night?”): args {"clips":["i3","i7"] (ids from a bin or footage reading) or ["exact clip name"],"bin":"the bin those ids came from – leave out for the whole project","question":"what you need to know","stills":2}. At most 8 clips. The stills go to the AI the editor chose for footage; they are asked first when stills leave the computer.',
    search: 'Search the interview transcripts by words: args {"query":"words or a topic","speaker":"optional name","limit":25}. Returns lines: id, interview, speaker, time, text. Free and instant.',
    lines: 'Read transcript lines in full with what was said around them: args {"ids":["L12"],"around":2}. Free.',
    themes: 'The themes found in Story so far, each with its best lines: args {"limit":6}. Free.',
    interviews: 'Put a question or a brief about what the interviews SAY to the whole of the transcripts and get a written answer with the clips that back it – shown to the editor as a card they can reorder, build into a sequence, mark on a sequence or save: args {"request":"the question or brief, in full, in the editor’s words"}. Use it for find / list / compare / summarise questions and for selections of soundbites (“every story about Grandma, in order”, “where do they disagree?”, “a 45-second opening about why they came”, “which stories about faith haven’t I used yet?”). It reads every transcript, so call it once per question; for a quick lookup use search.',
    edit: 'Change clips. args {"where":"sequence|selection|transcripts|bin|project","sequence":"an s… id or name (leave out for your working sequence or the open one)","bin":"name or path, for where: bin","inPlace":false,"steps":[{"op":"…","targets":{…},"params":{…},"why":"a few words","sequences":{…}}]}. The edits (op) and how to pick targets are listed under EDITS. On a sequence the edits go on a copy of it (made once, then your working sequence) unless "inPlace" is true – use inPlace only when the editor says to change the sequence itself. In a bin or the project they change the editor’s clips (labels, names and bins can be undone).',
    action: 'Run one of Ultra Studio’s own tools: args {"id":"silence.cut","params":{…}} – every id and its settings are listed under PANEL TOOLS. They work on the open sequence or the clips selected in the Project panel, as each says; the ones that cut make their own copy.',
    build: 'Build a NEW sequence from transcript lines, in the order you give them: args {"name":"short name","sections":[{"name":"Opening","lineIds":["L12","L40"]}],"targetSeconds":120}. Every line you give is used – nothing is dropped to fit, so choose lines that add up to the length wanted (a line runs its time range plus about half a second of room); "targetSeconds" is the length the editor asked for, and the result says how far off the cut is. It becomes your working sequence.',
    open: 'Open a sequence in the editor and make it your working sequence: args {"sequence":"an s… id or its name"}.',
    version: 'Keep a copy of your working sequence as it is now, so the editor can compare: args {"name":"v1 – 2:10"}.',
    ask: 'Ask the editor ONE question and wait for the answer – when you can’t tell what they mean, or there is a real choice only they can make: args {"question":"…","options":["2–5 short answers to pick from"],"kind":"choice|clip|bin|sequence|track|text"}. For kind clip / bin / sequence / track the panel shows a picker of the project’s own. They can always type their own answer instead.',
    finish: 'End your turn and report to the editor: args {"reply":"the answer, or what you did, in plain words – a few sentences","done":["each thing done, with numbers"],"notDone":["anything you could not do, why, and how to do it by hand"],"check":["what the editor should look at"],"next":["up to 3 short requests they might want next, in their own words"]}. For a question you can answer straight away (how to do something in the editor, what a tool does), call finish at once with the answer in "reply".'
  };
  const STEP_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['say', 'understood', 'plan', 'tool', 'argsJson'],
    properties: { say: { type: 'string' }, understood: { type: 'string' }, plan: { type: 'array', items: { type: 'string' } }, tool: { type: 'string', enum: Object.keys(TOOLS) }, argsJson: { type: 'string' } }
  };
  // how often it asks before a step: always before anything changes; only before changing the editor's own things,
  // exporting or downloading; never
  const MODES = [
    { id: 'ask', label: 'Ask before changes', hint: 'A card to approve before every step that changes the project (reading is never asked about).' },
    { id: 'own', label: 'Only for my own work', hint: 'New sequences, copies and markers just happen. It still asks before changing your own sequences and clips, exporting or downloading.' },
    { id: 'never', label: 'Don’t ask', hint: 'It works straight through. Copies are still made unless you say otherwise.' }
  ];
  const READS = new Set(['project', 'timeline', 'selection', 'bin', 'footage', 'search', 'lines', 'themes', 'ask', 'finish']);
  /** The tools on offer here. */
  function toolsHere() { return Object.assign({}, TOOLS); }

  /**
   * How much a step touches: 'read' (nothing changes) · 'ai' (reads, but a bigger AI request) · 'new' (makes new
   * sequences, copies, bins or markers – the editor's own work is as it was) · 'own' (changes the editor's own
   * sequences or clips) · 'out' (writes files: exports, renders, downloads).
   */
  function riskOf(tool, args = {}, { action = null } = {}) {
    if (READS.has(tool) || tool === 'open') return 'read';
    if (tool === 'interviews') return 'ai';
    // stills leaving the computer: asked about like the editor's own work (a local model looking is just reading)
    if (tool === 'look') return US.footage && US.footage.looker().where === 'local' ? 'ai' : 'sees';
    if (tool === 'build' || tool === 'version') return 'new';
    if (tool === 'edit') {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      if (args.where === 'bin' || args.where === 'project' || args.inPlace || steps.some(s => s && (s.op === 'append' || s.sequences))) return 'own';
      return 'new';
    }
    if (tool === 'action') {
      const id = String(args.id || '');
      if (/^(deliver\.(?!chapters|text)|export|web\.|youtube|download|overnight|relink|tidy|encoder|archive)/i.test(id) || (action && action.writes)) return 'out';
      return action && action.changes ? 'new' : 'read';
    }
    return 'own';
  }
  /** Does the editor approve this step first? always: they chose “Always proceed” in this chat (their own work and exports still ask). */
  function asksFirst(risk, mode = 'ask', always = false) {
    if (risk === 'read' || risk === 'ai') return false;
    if (risk === 'own' || risk === 'out' || risk === 'sees') return mode !== 'never';
    return mode === 'ask' && !always;
  }

  /* ---------- what the AI is told ---------- */
  function actionCard(a) {
    const ps = Object.entries(a.params || {}).map(([k, p]) => `${k}${p.options ? ` (${p.options.join('|')})` : ` (${p.type})`}${p.default !== undefined && p.default !== '' ? ` = ${JSON.stringify(p.default)}` : ''}${p.desc ? ': ' + p.desc : ''}`);
    return `- ${a.id} [${a.tool}] – ${US.say ? US.say(a.title) : a.title}${a.changes ? ' (changes the project)' : ''}. ${US.say ? US.say(a.describe || '') : a.describe || ''}${ps.length ? `\n    settings: ${ps.join('; ')}` : ''}`;
  }
  // the chat's own tools do these better
  const NOT_ACTIONS = new Set(['story.ask', 'edit.ask']);
  const actionsHere = () => (US.actions ? US.actions.list().filter(a => !NOT_ACTIONS.has(a.id)) : []);
  function rules({ resolve = RES(), actions = [], ops = { timeline: [], items: [] }, tools = TOOLS, opsInfo = (E() || {}).OPS || {} } = {}) {
    const ed = resolve ? 'DaVinci Resolve' : 'Adobe Premiere Pro';
    const opLine = k => `- ${k}: ${(opsInfo[k] || {}).desc || ''} Settings: ${(opsInfo[k] || {}).params || ''}`;
    return [
      `You are the assistant inside JMG Ultra Studio, a panel in ${ed}, working for a video editor (documentaries, charity films, interviews, events, podcasts, social cut-downs). They talk to you in one chat. You do what they ask by calling tools, one per turn, and reading what each returns. You can read and change the project and its ${resolve ? 'timelines' : 'sequences'}, search and question the interview transcripts, and run every tool the panel has.${resolve ? ' Use Resolve’s words with the editor: timeline, Media Pool, render queue.' : ''}`,
      'You work from text: clip and sequence names, times, tracks, labels, effects, markers, transcript lines and what each tool reports. You don’t watch video or hear audio. What is IN the picture you know two ways: the written descriptions Ultra Studio keeps of each clip ("footage" – free; use it for “find the shots with a red car”, “organise by what’s in the shot”, B-roll for a line), and, when the descriptions don’t answer it, a few small stills of particular clips ("look"). If clips have no description yet, say so and offer to describe them (the panel tool footage.describe – it tells the editor the cost). For sound, focus, shake and exposure, the panel’s own tools measure the footage on this computer (best shots, sharpness, silences, beats, colour matching).',
      'Answer every turn as JSON: "say" – one short first-person sentence telling the editor what you are doing now and why (plain British English, no jargon, no ids); "understood" – on the first turn after each request from the editor, one or two sentences saying what you take the request to mean, including anything you are assuming (which sequence, which clips, how long) – else ""; "plan" – on that first turn, the steps you intend, 1–8 short lines – later only if the plan changes, else []; "tool" – the tool to call; "argsJson" – its arguments as a JSON object string.',
      'How to work:',
      '- Understand first. Use what you are told about the project, the open sequence and the selection. Read (project, timeline, bin, selection) before you change anything you haven’t read, so you use real ids and names. Reading is free and never needs permission.',
      '- If the request could mean different things, or names something you can’t find, or there is a choice only the editor can make (which of two clips, which bin, in place or on a copy when it matters), call "ask" with a clear question and answers to pick from. Don’t ask what you can find out by reading, and don’t ask for permission – the panel shows the editor a card to approve before changes, as they have chosen.',
      '- Use as few steps as you can. A simple request is one tool call and then finish. Prefer one of the PANEL TOOLS when it does the job (they are built for it and often work without AI); use "edit" for changes clip by clip; "interviews" for questions about what people say.',
      '- Only use ids a tool gave you in this conversation. Never invent clip ids, line ids, effect or transition names, bins or tool ids. Ids from a timeline or bin belong to that reading: read again after it changes.',
      '- After something changes a sequence, read it back when the result matters (lengths, order, what is said) and fix what is off. If a step fails or is turned down, don’t repeat it unchanged: adapt, ask, or say so.',
      '- The editor’s own work is precious. Sequence edits go on a copy unless they ask for the sequence itself to change. Never delete project items. Say plainly when something can’t be done here, and how to do it by hand in the editor.',
      '- Finish every request with "finish": what you did with the numbers that matter, what you could not do, what to check. Never say something was done that a tool did not report as done. If the editor only asked a question, answer it in "reply".',
      `- Questions about using ${resolve ? 'Resolve' : 'Premiere Pro'} or Ultra Studio itself: answer from what you know, briefly, as steps.${resolve ? ` In Resolve add-ons can’t make ${(US.resolveEdits && US.resolveEdits.cantList()) || 'keyframed zooms, text layers or cuts'}.` : ''}`,
      '', 'TOOLS:', ...Object.entries(tools).map(([k, d]) => `- ${k}: ${d}`),
      '', 'EDITS for the "edit" tool on a sequence (op: what it does. Settings → params):', ...ops.timeline.map(opLine),
      'Targets on a sequence: {"ids":["c3","c7"]} from the timeline you read, or a query {"tracks":["V1"],"kind":"video|audio","nameContains":"","fileContains":"","minSeconds":0,"maxSeconds":0,"label":0-15,"disabled":false,"effect":"has this effect","noEffect":"","speakers":["Ruth"],"says":"words","speakerChange":true,"from":seconds,"to":seconds,"every":"all|first|last|everyOther|cuts"} (“cuts” = every clip but the first on its track); transcript lines heard in it: {"lines":true or ["l4"],"speakers":[],"says":""} for markers, text, cuts or the clips under them. where "selection" = only the selected clips; "transcripts" = the lines. Picture edits go on video tracks, volume and audio fades on audio tracks.',
      'To make the same edit in OTHER sequences – one or many – add "sequences": {"sequences":["s3","s8"]} or {"bin":"part of a bin path","nameContains":"part of the name"} to the step (targets is then a query, no c… ids). That, and "append", change those sequences themselves.',
      ...(resolve ? [] : ['Colour labels: Premiere gives no way to colour a clip on a timeline, or to read its colour there (the label column is empty). If the editor asks for clips in a sequence to be coloured, say so up front and offer what works: colouring those clips in their bin (the “label” edit in a bin or the project – it colours every use of them), or markers on them in the sequence.']),
      '', 'EDITS in a bin or the whole project:', ...ops.items.map(opLine),
      'Targets in a bin or project: {"ids":["i3"]} or {"nameContains":"","fileContains":"","kind":"video|audio|still|sequence","label":0-15,"bin":"part of a bin path","minSeconds":0,"maxSeconds":0}; {} means all.',
      '', 'PANEL TOOLS for the "action" tool:', ...(actions.length ? actions.map(actionCard) : ['(none here)'])
    ].join('\n');
  }
  /** The first message of a chat: where the editor is (the project as text, cached for the conversation). */
  function brief({ editor, project, sequence, selection = 0, story = null, mode = 'ask' }) {
    const out = [`EDITOR: ${editor}`, `PROJECT: ${project || '(none open)'}`];
    out.push(sequence ? `OPEN SEQUENCE: “${sequence.name}”${sequence.duration ? ` – ${fmtT(sequence.duration)}` : ''}${sequence.clips != null ? `, ${sequence.clips} clips` : ''}` : 'OPEN SEQUENCE: none');
    out.push(`SELECTED IN THE PROJECT PANEL: ${selection || 0} clips`);
    if (!story || !story.interviews.length) out.push('INTERVIEWS: none transcribed in Story yet (search, lines, interviews and build won’t find anything – say so if they’re needed: Story › 1 Interviews reads them).');
    else {
      out.push(`INTERVIEWS (${story.interviews.length}, ${story.lines} lines):`, ...story.interviews.slice(0, 80).map(i => `- ${i.name}: ${i.lines} lines${i.speakers.length ? ` – ${i.speakers.join(', ')}` : ''}`));
      if (story.interviews.length > 80) out.push(`…and ${story.interviews.length - 80} more`);
      if (story.themes.length) out.push(`THEMES FOUND: ${story.themes.map(t => `${t.name} (${t.n})`).join(', ')}`);
      if (story.brief) out.push(`THE EDITOR’S BRIEF FOR THIS PROJECT: ${story.brief}`);
    }
    out.push(`PERMISSION: ${{ ask: 'the editor approves each step that changes something', own: 'the editor approves changes to their own sequences and clips, and exports; the rest just runs', never: 'the editor has asked not to be asked – work straight through' }[mode] || mode}.`);
    return out.join('\n');
  }
  /** The AI's turn → {say, understood, plan, tool, args, bad}. */
  function parseStep(r, tools = TOOLS) {
    const tool = r && tools[r.tool] ? r.tool : '';
    let args = {}, bad = '';
    if (!tool) bad = `There is no tool “${r && r.tool}” here.`;
    try { args = r && r.argsJson ? JSON.parse(r.argsJson) : {}; if (!args || typeof args !== 'object' || Array.isArray(args)) { args = {}; bad = bad || 'argsJson must be a JSON object.'; } }
    catch (e) { bad = bad || `argsJson isn’t valid JSON (${e.message}).`; }
    return { say: String((r && r.say) || '').trim(), understood: String((r && r.understood) || '').trim(), plan: Array.isArray(r && r.plan) ? r.plan.map(String).map(x => x.trim()).filter(Boolean).slice(0, 10) : [], tool, args, bad };
  }
  /** Older tool results shortened, so a long conversation doesn't send its whole history every turn. */
  function compact(turns, { keep = 5, room = 600 } = {}) {
    return turns.map((t, i) => (i < turns.length - keep && t.user.length > room ? Object.assign({}, t, { user: t.user.slice(0, room) + `\n…(shortened – ${t.user.length} characters; call the tool again if you need it)` }) : t));
  }
  /** A short name for a chat, from its first request. */
  function titleOf(text) { const w = String(text || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().split(' '); return (w.slice(0, 5).join(' ') + (w.length > 5 ? '…' : '')).replace(/^./, c => c.toUpperCase()) || 'New chat'; }
  /** One line for a step, as the editor reads it. */
  function describeCall(tool, a = {}) {
    const act = tool === 'action' && US.actions ? US.actions.get(a.id) : null;
    return ({
      project: () => 'Read the project', timeline: () => `Read ${a.sequence ? `“${clip(a.sequence, 40)}”` : 'the sequence'}`, selection: () => 'Look at what’s selected', bin: () => `Read ${a.bin ? `the bin “${clip(a.bin, 40)}”` : 'the whole project’s clips'}`,
      search: () => `Search the interviews: “${clip(a.query || a.speaker, 50)}”`, lines: () => `Read ${US.plural((a.ids || []).length, 'line')}`, themes: () => 'Look at the themes',
      interviews: () => `Ask the interviews: “${clip(a.request, 70)}”`,
      footage: () => (a.query ? `Find footage showing “${clip(a.query, 50)}”` : `Read what’s in the footage${a.bin ? ` in “${clip(a.bin, 30)}”` : ''}`),
      look: () => `Look at ${US.plural((a.clips || []).length, 'clip')}: “${clip(a.question, 60)}”`,
      edit: () => `Edit ${a.where === 'bin' ? `the bin${a.bin ? ` “${clip(a.bin, 30)}”` : ''}` : a.where === 'project' ? 'the project' : a.where === 'selection' ? 'the selected clips' : a.sequence ? `“${clip(a.sequence, 40)}”` : 'the sequence'}${a.inPlace ? ' itself' : ''}: ${(a.steps || []).map(s => ((E() && E().OPS[s.op]) || {}).title || s.op).join(', ')}`,
      action: () => (act ? (US.say ? US.say(act.title) : act.title) : `Run ${a.id}`),
      build: () => `Build “${clip(a.name, 40)}” from ${US.plural(US.sum((a.sections || []).map(x => (x.lineIds || []).length)), 'line')}${a.targetSeconds ? `, aiming for ${fmtT(a.targetSeconds)}` : ''}`,
      open: () => `Open “${clip(a.sequence, 40)}”`, version: () => `Keep a version “${clip(a.name, 30)}”`, ask: () => 'Ask you a question', finish: () => 'Report'
    }[tool] || (() => tool))();
  }

  /* ---------- the interviews, as the AI reads them ---------- */
  /** The rows for transcript lines: id, interview, speaker, time, text. */
  function lineRows(lines, { text = 220 } = {}) {
    return lines.map(l => [l.id, clip(l.interview, 40), l.speaker || '', `${fmtT(l.start)}–${fmtT(l.end)}`, clip(String(l.text || '').replace(/\s+/g, ' '), text)].join('\t')).join('\n');
  }
  function storyLine(l) {
    const S = US.story, t = S.interviewOf ? S.interviewOf(l.id) : null;
    return { id: l.id, interview: t ? t.name : '', speaker: S.speakerName ? S.speakerName(l.speaker) : l.speaker, start: l.start, end: l.end, text: l.text, asked: S.isInterviewer ? !!S.isInterviewer(l) : false };
  }
  /** What Story has, in a few lines, for the brief: {interviews:[{name, lines, speakers}], lines, themes:[{name, n}], brief} or null. */
  function storySummary() {
    try {
      const S = US.story; S.loadState && S.loadState();
      const st = S.state(), interviews = (st.transcripts || []).map(t => ({ name: t.name, lines: (t.lines || []).length, speakers: [...new Set((t.lines || []).map(l => S.speakerName(l.speaker)).filter(Boolean))].slice(0, 6) }));
      return { interviews, lines: US.sum(interviews.map(i => i.lines)), themes: (st.themes || []).filter(t => t.name !== 'Other' && t.lineIds && t.lineIds.length).map(t => ({ name: t.name, n: t.lineIds.length })).slice(0, 40), brief: String(US.settings.get('story.brief', '') || '').trim() };
    } catch (e) { return null; }
  }

  /* ---------- chats ---------- */
  /**
   * A chat: {id, title, items (what's shown: [{k:'me'|'say'|'understood'|'plan'|'step'|'card'|'warn'|'end'…}]), turns (the
   * conversation with the AI after the first message), context + first (the first message), work (its working
   * sequence), versions, status ('idle'|'thinking'|'working'|'waiting'|'asking'), spent, steps, model, always}
   */
  function newChat(o = {}) { return Object.assign({ id: US.uid('chat'), title: 'New chat', items: [], turns: [], context: '', first: '', work: null, versions: [], status: 'idle', spent: 0, steps: 0, model: 'auto', always: false, at: Date.now(), updated: Date.now() }, o); }
  /** What's kept with the project: the conversation and what was shown, without the heavy or live parts. */
  function toStored(c) {
    return { id: c.id, title: c.title, at: c.at, updated: c.updated, model: c.model, context: clip(c.context, 20000), first: clip(c.first, 4000), turns: compact(c.turns || [], { keep: 3, room: 400 }).slice(-40).map(t => ({ assistant: clip(t.assistant, 3000), user: clip(t.user, 3000) })),
      last: c.last || '', pendingResult: clip(c.pendingResult || '', 2000), work: c.work, versions: (c.versions || []).slice(-20), spent: c.spent || 0, steps: c.steps || 0,
      items: (c.items || []).filter(x => x.k !== 'card' || x.keep).slice(-120).map(x => { const y = Object.assign({}, x); delete y.el; delete y.live; return y; }) };
  }
  function fromStored(s) { return newChat(Object.assign({}, s, { status: 'idle', always: false })); }

  /* ---------- hands on the editor: one step at a time, across every chat ---------- */
  let chain = Promise.resolve(), queued = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /**
   * Run fn(job) as a job, after any step another chat (or another tool) is running. Errors come back to the caller
   * (no toast: the chat tells the AI and the editor); Stop ends it with CANCELLED.
   */
  function hands(chat, title, fn, onWait = () => {}, onTurn = () => {}) {
    const go = async () => {
      let told = false;
      while (US.jobs.current) { if (chat.stop) throw new US.UserError('CANCELLED'); if (!told) { told = true; onWait(US.jobs.current.title); } await sleep(US.chat && US.chat._tick != null ? US.chat._tick : 250); }
      if (chat.stop) throw new US.UserError('CANCELLED');
      onTurn();
      let out, err, ran = false;
      const r = await US.jobs.run({ title, tool: 'assistant', about: chat.about || '' }, async job => {
        chat.job = job;
        try { out = await fn(job); ran = true; } catch (e) { if (cancelled(e)) throw e; err = e; }
        return { summary: err ? `${title}: didn’t work – the chat carries on` : (out && out.summary) || 'Done' };
      });
      chat.job = null;
      if (err) throw err;
      if (r === undefined || !ran) throw new US.UserError('CANCELLED');
      return out;
    };
    // another chat's step is running or queued: this one waits its turn, and says so
    if (queued > 0) onWait((US.jobs.current && US.jobs.current.title) || 'another chat');
    queued++;
    const p = chain.then(go, go).finally(() => { queued--; });
    chain = p.catch(() => {});
    return p;
  }

  /* ---------- the tools ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  /** A sequence by its s… id (from the last project reading) or its name. -> {seqId, name} or {ask: [...names]} or null */
  async function findSequence(chat, want) {
    const w = String(want || '').trim();
    if (!w) return null;
    if (!chat.project) { try { chat.project = E().projectModel(await US.host.call('editProject', {})); } catch (e) { chat.project = null; } }
    const seqs = (chat.project && chat.project.sequences) || [];
    let hit = seqs.find(x => x.id === w) || seqs.find(x => x.seqId === w);
    if (!hit) { const exact = seqs.filter(x => norm(x.name) === norm(w)); if (exact.length === 1) hit = exact[0]; else if (exact.length > 1) return { ask: exact.map(x => `${x.name} (${x.id}, in ${x.bin || 'the project'})`) }; }
    if (!hit) { const part = seqs.filter(x => norm(x.name).includes(norm(w))); if (part.length === 1) hit = part[0]; else if (part.length > 1) return { ask: part.slice(0, 12).map(x => `${x.name} (${x.id})`) }; }
    return hit ? { seqId: hit.seqId, name: hit.name } : null;
  }
  /** The sequence a step means: the one named, else the chat's working one, else the open one. */
  async function seqFor(chat, want) {
    if (want) { const f = await findSequence(chat, want); if (!f) return { error: `There is no sequence “${want}”. Read the project for the names.` }; if (f.ask) return { error: `More than one sequence matches “${want}”: ${f.ask.join('; ')}. Use the s… id, or ask the editor which.` }; return f; }
    if (chat.work) return { seqId: chat.work.seqId, name: chat.work.name };
    const sq = US.ctx && US.ctx.sequence;
    return sq ? { seqId: sq.id, name: sq.name } : { error: 'No sequence is open. Ask the editor to open one, or name one from the project.' };
  }
  async function findBin(want) {
    const bins = (await US.host.call('listBins')).filter(b => b.path !== '(Project root)'), w = norm(want);
    const exact = bins.filter(b => norm(b.path) === w || norm(b.path.split('/').pop()) === w);
    const hits = exact.length ? exact : bins.filter(b => norm(b.path).includes(w));
    return hits.length === 1 ? { bin: hits[0] } : hits.length ? { error: `More than one bin matches “${want}”: ${hits.slice(0, 12).map(b => b.path).join('; ')}. Give the full path, or ask the editor which.` } : { error: `There is no bin “${want}”. Bins: ${bins.slice(0, 40).map(b => b.path).join('; ') || '(none)'}.` };
  }
  const rows = (text, max = 300) => { const t = String(text).split('\n'); return t.length > max ? t.slice(0, max).join('\n') + `\n…and ${t.length - max} more rows (use queries, not ids, for those)` : text; };

  /**
   * The steps of an edit, checked against what's really there. -> {scope, model, plan, others, risk} or {error}
   */
  async function prepareEdit(job, chat, a) {
    const ed = E(), where = ['sequence', 'selection', 'transcripts', 'bin', 'project'].includes(a.where) ? a.where : 'sequence';
    const scope = { where };
    if (where === 'bin') { if (!a.bin) return { error: 'Give the bin’s name in "bin" (or use where: "project").' }; const b = await findBin(a.bin); if (b.error) return b; scope.binId = b.bin.id; scope.binName = b.bin.path; }
    else if (where !== 'project') { const s = await seqFor(chat, a.sequence); if (s.error) return s; scope.seqId = s.seqId; scope.seqName = s.name; }
    const m = await ed.read(job, scope);
    chat.project = m.project || chat.project;
    const raw = { reply: '', done: false, steps: (Array.isArray(a.steps) ? a.steps : []).slice(0, 12).map(x => ({ op: String((x && x.op) || ''), targetsJson: JSON.stringify((x && x.targets) || {}), paramsJson: JSON.stringify((x && x.params) || {}), why: String((x && x.why) || ''), sequencesJson: x && x.sequences ? JSON.stringify(x.sequences) : '' })) };
    const c = { model: m };
    await ed.readOthers(job, raw, c);
    const plan = ed.checkPlan(raw, m, c.others);
    return { scope, model: m, plan, others: c.others };
  }

  /** One tool call → the text the AI reads back. hooks: {event, approve, choose}. */
  async function callTool(chat, st, hooks, opts) {
    const a = st.args || {}, ed = E(), tool = st.tool;
    const note = text => { hooks.event({ k: 'result', text }); return text; };
    const title = describeCall(tool, a);
    const withHands = fn => { chat.status = 'working'; hooks.status(); return hands(chat, title, fn, t => { chat.status = 'waiting'; chat.waitingFor = t; hooks.status(); }, () => { if (chat.status !== 'working') { chat.status = 'working'; hooks.status(); } }); };
    const approve = async (risk, card) => {
      if (!asksFirst(risk, opts.mode, chat.always)) return { ok: true };
      chat.status = 'asking'; hooks.status();
      const r = (await hooks.approve(Object.assign({ risk, title }, card))) || { ok: false };
      if (r.always) chat.always = true;
      if (!r.ok && r.note) said = r.note;
      return r;
    };
    let said = '';
    const REFUSED = 'The editor turned this step down – it did not run. Don’t repeat it unchanged: carry on without it, ask them what they’d like instead, or finish.';
    const refusedNow = () => (said ? `The editor did not approve this step – it did not run. Instead they say: “${said}”. Go by that.` : REFUSED);
    switch (tool) {
      case 'project': return withHands(async job => {
        job.set({ who: 'premiere', msg: 'Reading the project' });
        chat.project = ed.projectModel(await US.host.call('editProject', {}));
        note(`${US.plural(chat.project.sequences.length, 'sequence')}, ${US.plural(chat.project.clips.length + (chat.project.more || 0), 'clip')}, ${US.plural(chat.project.bins.length, 'bin')}`);
        return rows(ed.projectOutline(chat.project), 700);
      });
      case 'timeline': return withHands(async job => {
        const s = await seqFor(chat, a.sequence); if (s.error) return s.error;
        const m = await ed.read(job, { where: 'sequence', seqId: s.seqId });
        chat.project = m.project || chat.project;
        note(`“${m.seq.name}” – ${fmtT(m.seq.duration)}, ${US.plural(m.clips.length, 'clip')}${m.lines.length ? `, ${US.plural(m.lines.length, 'line')} heard` : ''}`);
        return rows(ed.outline(Object.assign({}, m, { project: null })), 420);
      });
      case 'selection': return withHands(async job => {
        const s = await seqFor(chat, ''); if (s.error) return s.error;
        let m;
        try { m = await ed.read(job, { where: 'selection', seqId: s.seqId }); } catch (e) { if (e instanceof US.UserError && e.code === 'NOTHING_FOUND') { note('Nothing selected'); return `${explain(e).title} Clips selected in the Project panel: ${(US.ctx && US.ctx.selection) || 0}.`; } throw e; }
        note(`${US.plural(m.clips.length, 'clip')} selected in “${m.seq.name}”`);
        return `Selected in “${m.seq.name}” (edit them with where: "selection"):\n` + rows(ed.outline(Object.assign({}, m, { project: null })), 300);
      });
      case 'bin': return withHands(async job => {
        const scope = { where: a.bin ? 'bin' : 'project' };
        if (a.bin) { const b = await findBin(a.bin); if (b.error) return b.error; scope.binId = b.bin.id; scope.binName = b.bin.path; }
        let m;
        try { m = await ed.read(job, scope); } catch (e) { if (e instanceof US.UserError && e.code === 'NOTHING_FOUND') return explain(e).title; throw e; }
        note(`${US.plural(m.items.length, 'clip')} in ${a.bin ? `“${scope.binName}”` : 'the project'}`);
        return rows(ed.outline(Object.assign({}, m, { project: null })), 500);
      });
      case 'footage': return withHands(async job => {
        const F = US.footage; if (!F) return 'Footage descriptions aren’t available here.';
        const scope = { where: a.bin ? 'bin' : 'project' };
        if (a.bin) { const b = await findBin(a.bin); if (b.error) return b.error; scope.binId = b.bin.id; scope.binName = b.bin.path; }
        let m;
        try { m = await ed.read(job, scope); } catch (e) { if (e instanceof US.UserError && e.code === 'NOTHING_FOUND') return explain(e).title; throw e; }
        const raw = await F.listClips(job, { binId: scope.binId }), byId = new Map(raw.map(x => [x.id, x]));
        const all = m.items.map(it => ({ it, item: byId.get(it.itemId) })).filter(r => r.item && F.describable([r.item]).length).map(r => ({ id: r.it.id, item: r.item, look: F.lookOf(r.item) }));
        const have = all.filter(r => r.look), hits = F.find(all, a.query, { limit: Math.max(5, Math.min(120, +a.limit || 40)) });
        note(a.query ? `${US.plural(hits.length, 'clip')} for “${clip(a.query, 40)}”` : `${have.length} of ${US.plural(all.length, 'clip')} described`);
        const missing = all.length - have.length, L = F.looker();
        const tail = missing ? `\n${missing} of ${all.length} clips here have no description yet${L.where === 'cloud' ? ` (describing them would cost about ${US.ai.fmtUSD(F.costFor(missing, 2, L.provider === 'claude' ? L.model : null))} with ${L.label})` : L.where === 'local' ? ` (${L.label} can describe them on this computer, free)` : ''}: offer the panel tool footage.describe${a.bin ? ` with bin "${a.bin}"` : ''}.` : '';
        if (!have.length) return `None of the ${all.length} clips ${a.bin ? `in “${scope.binName}”` : 'in the project'} has been described yet.${tail}`;
        if (!hits.length) return `Nothing in the descriptions matches “${a.query}”. Try other words (what is seen, not what it means).${tail}`;
        return `${hits.length} clips (id, name, shot, description, setting, people, text in picture, tags)${a.query ? ', best first' : ''}:\n` + hits.map(r => `${r.id}\t${F.rowOf(r.item, r.look)}`).join('\n') + tail;
      });
      case 'look': {
        const F = US.footage; if (!F) return 'Looking at footage isn’t available here.';
        const q = String(a.question || '').trim(), want = (Array.isArray(a.clips) ? a.clips : []).map(String).filter(Boolean).slice(0, 8);
        if (!q || !want.length) return 'ERROR: give "clips" (ids or names) and a "question".';
        let L;
        L = F.looker();
        if (L.where === 'cloud') { try { F.mustBeAllowed(L); } catch (e) { const x = explain(e); return `Not possible yet: ${x.title} Tell the editor: ${x.action}`; } }
        let items = [];
        const p0 = await withHands(async job => {
          const scope = { where: a.bin ? 'bin' : 'project' };
          if (a.bin) { const b = await findBin(a.bin); if (b.error) return b.error; scope.binId = b.bin.id; }
          const m = await ed.read(job, scope), raw = await F.listClips(job, { binId: scope.binId }), byId = new Map(raw.map(x => [x.id, x]));
          items = want.map(w => m.items.find(it => it.id === w) || m.items.find(it => norm(it.name) === norm(w))).filter(Boolean).map(it => byId.get(it.itemId)).filter(Boolean);
          return items.length ? '' : `None of those clips were found (${want.join(', ')}). Use ids from a bin or footage reading of the same bin.`;
        });
        if (!items.length) return p0;
        const n = Math.max(1, Math.min(4, +a.stills || 2));
        const ok = await approve(L.where === 'local' ? 'ai' : 'sees', { detail: `${L.where === 'local' ? 'On this computer' : `Small stills (768 pixels wide) will be sent to ${L.label}`}: up to ${US.plural(n, 'still')} each of ${items.slice(0, 6).map(it => `“${it.name}”`).join(', ')}${items.length > 6 ? ` and ${items.length - 6} more` : ''}.\nTo answer: ${q}\nNo video or sound is sent.` });
        if (!ok.ok) return refusedNow();
        return withHands(async job => {
          const r = await F.ask(job, items, q, { perClip: n });
          chat.spent += r.usd || 0;
          note(`Looked at ${US.plural(r.stills, 'still')} with ${r.by}`);
          return `From ${US.plural(r.stills, 'still')} (${r.by}): ${r.answer}${r.skipped.length ? `\nCouldn’t be read: ${r.skipped.map(x => `${x.name} (${x.why})`).join(', ')}.` : ''}`;
        });
      }
      case 'search': return withHands(async job => {
        if (!US.story) return 'Story isn’t available here.';
        US.story.loadState && US.story.loadState();
        job.set({ who: 'studio', msg: `Searching the interviews for “${clip(a.query, 40)}”` });
        const lines = await US.story.linesInScope(job), lim = Math.max(5, Math.min(60, +a.limit || 25));
        let pool = lines;
        if (a.speaker) { const sp = String(a.speaker).toLowerCase(); pool = lines.filter(l => String(US.story.speakerName(l.speaker)).toLowerCase().includes(sp) || String((US.story.interviewOf(l.id) || {}).name || '').toLowerCase().includes(sp)); }
        const hits = a.query ? US.transcript.search(String(a.query), pool, { limit: lim * 2 }).map(h => h.line) : pool.slice(0, lim);
        const found = hits.map(storyLine).filter(l => !l.asked).slice(0, lim);
        note(`${US.plural(found.length, 'line')} for “${clip(a.query || a.speaker, 40)}”`);
        return found.length ? `${found.length} lines (id, interview, speaker, time, text):\n${lineRows(found)}` : 'Nothing found. Try other words, a person’s name, or a broader topic.';
      });
      case 'lines': {
        const S = US.story, ids = (Array.isArray(a.ids) ? a.ids : []).slice(0, 30), around = Math.max(0, Math.min(4, +a.around || 0)), out = [];
        if (!S) return 'Story isn’t available here.';
        S.loadState && S.loadState();
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
        const S = US.story; if (!S) return 'Story isn’t available here.';
        S.loadState && S.loadState();
        const lim = Math.max(1, Math.min(12, +a.limit || 6)), th = (S.state().themes || []).filter(t => t.name !== 'Other' && t.lineIds && t.lineIds.length);
        note(US.plural(th.length, 'theme'));
        if (!th.length) return 'No themes yet (Story › Find themes). Use search instead.';
        return th.slice(0, 30).map(t => `THEME “${t.name}” (${t.lineIds.length} lines):\n${lineRows(t.lineIds.slice(0, lim).map(id => S.lineOf(id)).filter(Boolean).map(storyLine))}`).join('\n');
      }
      case 'version': {
        if (!chat.work) return 'There is no working sequence yet.';
        const ok = await approve('new', { detail: `A copy of “${chat.work.name}” to compare later.` }); if (!ok.ok) return refusedNow();
        return withHands(async () => {
          const nm = `${chat.work.name} – ${clip(String(a.name || `v${chat.versions.length + 1}`).replace(/[\\/:*?"<>|]/g, ''), 30)}`;
          const c = await US.host.call('cloneSequence', { seqId: chat.work.seqId, name: nm, binPath: 'JMG Ultra Studio/Ask/Versions' });
          chat.versions.push({ seqId: c.id, name: c.name, why: 'kept as a version' });
          await US.host.call('openSequence', { seqId: chat.work.seqId }).catch(() => {});
          note(`Kept “${c.name}”`);
          return `Kept a copy “${c.name}”. You carry on working in “${chat.work.name}”.`;
        });
      }
      case 'build': {
        const S = US.story; if (!S) return 'Story isn’t available here.';
        S.loadState && S.loadState();
        const sections = (Array.isArray(a.sections) ? a.sections : []).map((x, i) => ({ name: String(x.name || '').slice(0, 60), label: [9, 5, 7, 4, 6, 10, 15, 2][i % 8], lineIds: (x.lineIds || []).map(String).filter(id => S.lineOf(id)) })).filter(x => x.lineIds.length);
        const unknown = US.sum((a.sections || []).map(x => (x.lineIds || []).filter(id => !S.lineOf(String(id))).length));
        if (!sections.length) return 'ERROR: none of those line ids exist. Use ids from search, lines or themes.';
        const name = `Ask – ${clip(String(a.name || chat.title).replace(/[\\/:*?"<>|]/g, ''), 50)}`, n = US.sum(sections.map(x => x.lineIds.length));
        const ok = await approve('new', { detail: `A new sequence “${name}” from ${US.plural(n, 'line')} of the interviews${sections.length > 1 ? `, in ${US.plural(sections.length, 'section')}: ${sections.map(x => x.name).filter(Boolean).slice(0, 6).join(' · ')}` : ''}${+a.targetSeconds ? `, aiming for ${fmtT(a.targetSeconds)}` : ''}. Your clips and sequences aren’t changed.` });
        if (!ok.ok) return refusedNow();
        return withHands(async job => {
          // the lines are the AI's choice: none is dropped to fit a length (Story's own "weaker lines left out" would
          // take one out without saying which – found in Premiere, 18 Nov 2026). The length is reported against the target.
          const out = await S.buildSequence(job, { name, groups: sections, target: 0 });
          const want = Math.max(0, +a.targetSeconds || 0), got = +out.seconds || 0, off = got - want;
          const length = want && got ? (Math.abs(off) <= Math.max(2, want * 0.1) ? ` That is within reach of the ${fmtT(want)} asked for.` : ` That is ${fmtT(Math.abs(off))} ${off > 0 ? 'LONGER' : 'SHORTER'} than the ${fmtT(want)} asked for – build again with ${off > 0 ? 'fewer or shorter' : 'more'} lines if the length matters, or say so in your report.`) : '';
          const short = out.placed != null && out.placed < n ? ` Only ${out.placed} of your ${US.plural(n, 'line')} went in: the editor’s soundbite settings leave out the interviewer’s lines and can run neighbouring lines together, and a line whose clip isn’t in the project is skipped – read the sequence to see which.` : '';
          chat.work = { seqId: out.seq.id, name: out.seq.name, ours: true };
          chat.versions.push({ seqId: out.seq.id, name: out.seq.name, why: 'built from the interviews' });
          note(out.summary);
          return `${out.summary}.${length}${short}${unknown ? ` ${unknown} unknown line ids were left out.` : ''} It is now your working sequence – read it with "timeline" to check it.`;
        });
      }
      case 'open': return withHands(async () => {
        const s = await seqFor(chat, a.sequence); if (s.error) return s.error;
        await US.host.call('openSequence', { seqId: s.seqId }); if (US.refreshContext) await US.refreshContext();
        chat.work = { seqId: s.seqId, name: s.name, ours: !!(chat.versions || []).some(v => v.seqId === s.seqId) };
        note(`Opened “${s.name}”`);
        return `“${s.name}” is open and is now your working sequence.`;
      });
      case 'interviews': {
        if (!US.story || !US.story.askInterviews) return 'Story isn’t available here.';
        const req = String(a.request || '').trim(); if (!req) return 'ERROR: give the question in "request".';
        return withHands(async job => {
          const r = await US.story.askInterviews(job, { request: req });
          hooks.event({ k: 'card', card: 'ask', askId: r.ask.id, keep: true });
          note(r.summary);
          const idx = US.storyAsk.indexOf(US.story.state().transcripts), g = r.ask.result.groups;
          return `The editor now sees this answer as a card with the clips (they can reorder them, build a sequence, mark a sequence, make themes or save it – offer that; don’t rebuild it yourself unless asked).\nANSWER: ${r.ask.result.answer || '(clips only)'}\n` +
            g.map(x => `GROUP “${x.name}” (${US.plural(x.items.length, 'clip')}): ${x.summary || ''}\n` + x.items.slice(0, 12).map(it => `  ${it.from}${it.to !== it.from ? '–' + it.to : ''} ${fmtT(US.storyAsk.lengthOf(it, idx))} – ${it.note}`).join('\n')).join('\n') + (r.ask.cut ? `\nChecked against the cut “${r.ask.cut.name}”: clips already in it were left out.` : '');
        });
      }
      case 'edit': {
        let prep;
        const p0 = await withHands(async job => { prep = await prepareEdit(job, chat, a); return prep.error ? prep.error : ''; });
        if (prep.error) return p0;
        const { plan, model: m, scope } = prep;
        if (plan.questions && plan.questions.length) return `Not run – this needs an answer first: ${plan.questions.map(q => q.ask + (q.options.length ? ` (${q.options.join(' | ')})` : '')).join(' · ')}. Ask the editor with the "ask" tool, then edit again.`;
        if (!plan.steps.length) return `Nothing to do: ${plan.dropped.join('; ') || 'no steps matched anything'}. Read it again and check the targets.`;
        const timeline = m.kind === 'timeline', ownSteps = plan.steps.filter(x => x.op === 'append' || x.multi), rest = plan.steps.filter(x => !(x.op === 'append' || x.multi));
        const mine = timeline && chat.work && chat.work.ours && chat.work.seqId === scope.seqId;
        const inPlace = !!a.inPlace || mine, risk = !timeline || ownSteps.length || (a.inPlace && !mine) ? 'own' : 'new';
        const where = !timeline ? `your clips in ${scope.where === 'bin' ? `the bin “${scope.binName}”` : 'the project'} (labels, names and bins can be put back with Undo afterwards)` : mine ? `“${m.seq.name}” (the copy this chat made)` : a.inPlace ? `“${m.seq.name}” ITSELF – no copy` : `a copy of “${m.seq.name}” (yours stays as it is)`;
        const ok = await approve(risk, { kind: 'edit', steps: plan.steps, model: m, dropped: plan.dropped, detail: `${rest.length ? `On ${where}.` : ''}${ownSteps.length ? ` ${US.say ? US.say('Edits in other sequences change those sequences themselves.') : ''}` : ''}`.trim() });
        if (!ok.ok) return refusedNow();
        const steps = ok.steps && ok.steps.length ? ok.steps : plan.steps;
        return withHands(async job => {
          const conv = { model: m, others: prep.others, workSeqId: mine ? chat.work.seqId : null, workSeqName: mine ? chat.work.name : '' };
          const out = await ed.run(job, conv, steps, { copy: timeline && !inPlace });
          if (timeline && out.seqId && rest.length) {
            if (out.copyName && !mine) { chat.work = { seqId: out.seqId, name: out.copyName, ours: true }; chat.versions.push({ seqId: out.seqId, name: out.copyName, why: `copy of “${m.seq.name}”` }); }
            else if (!chat.work) chat.work = { seqId: out.seqId, name: m.seq.name, ours: false };
          }
          if (out.undo && out.undo.length) hooks.event({ k: 'undo', undo: out.undo, keep: false });
          if (out.unplace && out.unplace.length) hooks.event({ k: 'unplace', unplace: out.unplace, keep: false });
          const lines = out.results.map(r => `- ${ed.describe(r.step)}: ${r.unsupported ? 'NOT DONE – ' + r.why : `${r.done} done${r.skipped && r.skipped.length ? `, ${r.skipped.length} skipped (${[...new Set(r.skipped.map(x => x.why))].slice(0, 3).join('; ')})` : ''}`}`);
          note(out.summary);
          const left = steps.length < plan.steps.length ? [`The editor unticked ${US.plural(plan.steps.length - steps.length, 'step')}: not run.`] : [];
          return lines.concat(plan.dropped.length ? [`Left out: ${plan.dropped.join('; ')}`] : [], left, out.copyName && !mine ? [`These ran on the copy “${out.copyName}”, now your working sequence (the editor’s “${m.seq.name}” is unchanged).`] : []).join('\n');
        });
      }
      case 'action': {
        const id = String(a.id || ''), act = !NOT_ACTIONS.has(id) && US.actions && US.actions.get(id);
        if (!act) return `ERROR: there is no panel tool “${id}”. Use an id from PANEL TOOLS.`;
        const params = US.actions.normalize(act, a.params || {});
        const risk = riskOf('action', a, { action: act });
        const detail = Object.entries(params).filter(([k, v]) => v !== '' && v != null && act.params[k] && v !== act.params[k].default).map(([k, v]) => `${k}: ${typeof v === 'string' ? `“${clip(v, 60)}”` : v}`).join(' · ');
        const ok = await approve(risk, { detail: [US.say ? US.say(act.describe || '') : act.describe || '', detail].filter(Boolean).join('\n') });
        if (!ok.ok) return refusedNow();
        return withHands(async job => {
          if (chat.work && chat.work.ours) { await US.host.call('openSequence', { seqId: chat.work.seqId }).catch(() => {}); if (US.refreshContext) await US.refreshContext(); }
          const before = US.ctx && US.ctx.sequence && US.ctx.sequence.id;
          job.set({ who: 'studio', msg: US.say ? US.say(act.title) : act.title });
          const out = await act.run(params, job);
          if (US.refreshContext) await US.refreshContext();
          const now = US.ctx && US.ctx.sequence;
          let moved = '';
          if (now && before && now.id !== before) { chat.work = { seqId: now.id, name: now.name, ours: true }; chat.versions.push({ seqId: now.id, name: now.name, why: US.say ? US.say(act.title) : act.title }); moved = ` Its result is the sequence “${now.name}”, now your working sequence.`; }
          if (out && out.ask) hooks.event({ k: 'card', card: 'ask', askId: out.ask.id, keep: true });
          const sum = (out && out.summary) || 'Done.';
          note(sum);
          return `${sum}${/[.!?]$/.test(sum) ? '' : '.'}${moved}${out && out.file ? ` File: ${US.basename ? US.basename(out.file) : out.file}.` : ''}`;
        });
      }
      case 'ask': {
        const q = String(a.question || '').trim(); if (!q) return 'ERROR: give the question.';
        chat.status = 'asking'; hooks.status();
        const kind = ['choice', 'clip', 'bin', 'sequence', 'track', 'text'].includes(a.kind) ? a.kind : 'choice';
        if (kind !== 'choice' && kind !== 'text' && !chat.project) { try { chat.project = ed.projectModel(await US.host.call('editProject', {})); } catch (e) { chat.project = null; } }
        const ans = await hooks.choose({ question: q, options: (Array.isArray(a.options) ? a.options : []).map(String).filter(Boolean).slice(0, 6), kind, project: chat.project });
        if (ans == null) return 'The editor closed the question without answering. Finish, saying what you need from them.';
        return `The editor answers: “${String(ans).trim()}”`;
      }
      default: return 'ERROR: unknown tool.';
    }
  }

  /* ---------- the run ---------- */
  /**
   * Take the editor's message and work until it's answered. hooks: {event(item) – something to show; status() – the
   * chat's state changed; approve(card) -> {ok, always, steps}; choose(q) -> answer}. opts: {mode, maxSteps, budget}.
   * -> the chat (chat.status back to 'idle').
   */
  async function send(chat, text, hooks, opts = {}) {
    const o = Object.assign({ mode: 'ask', maxSteps: 25, budget: 2 }, opts);
    // limit({kind: 'money'|'steps', used, limit, total}) -> 'more' (as much again), 'free' (no limit in this chat) or 'stop'
    const h = Object.assign({ event() {}, status() {}, approve: async () => ({ ok: true }), choose: async () => null, limit: async () => 'stop' }, hooks);
    const show = item => { const it = Object.assign({ at: Date.now() }, item); if (it.k === 'result') { const last = chat.items[chat.items.length - 1]; if (last && last.k === 'step' && !last.result) { last.result = it.text; h.event(Object.assign({}, it, { on: last })); return; } } chat.items.push(it); h.event(it); };
    const hk = { event: show, status: () => h.status(chat), approve: h.approve, choose: h.choose };
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    text = String(text || '').trim();
    chat.stop = false; chat.updated = Date.now();
    if (chat.title === 'New chat') chat.title = titleOf(text);
    chat.about = US.storyContext && US.storyContext.about ? US.storyContext.about(text) : '';
    show({ k: 'me', text });
    const as = { id: chat.id, title: `Ask: ${chat.title}`, about: chat.about };
    const tools = toolsHere(), ed = E();
    const system = [{ text: rules({ actions: actionsHere(), ops: { timeline: ed.opsFor('timeline'), items: ed.opsFor('items') }, tools }), cache: '1h' }];
    const schema = Object.assign({}, STEP_SCHEMA, { properties: Object.assign({}, STEP_SCHEMA.properties, { tool: { type: 'string', enum: Object.keys(tools) } }) });
    const now = () => { const c = US.ctx || {}; return `Now: open sequence ${c.sequence ? `“${c.sequence.name}”` : 'none'}${chat.work ? `; your working sequence “${chat.work.name}”` : ''}; ${c.selection || 0} clips selected in the Project panel.`; };
    if (!chat.context) {
      const c = US.ctx || {}, story = US.story ? storySummary() : null;
      chat.context = brief({ editor: RES() ? 'DaVinci Resolve' : 'Premiere Pro', project: c.project && c.project.name, sequence: c.sequence ? { name: c.sequence.name, duration: c.sequence.duration } : null, selection: c.selection, story, mode: o.mode });
      chat.first = `The editor says: “${text}”`;
    } else {
      chat.turns.push({ assistant: chat.last || '{}', user: `${chat.pendingResult || ''}\n\n${now()}\nThe editor says: “${text}”\nSay what you understand by it and your plan, then carry on.`.trim() });
      chat.pendingResult = '';
    }
    const startSteps = chat.steps, startSpent = chat.spent, usd = x => (US.ai.fmtUSD ? US.ai.fmtUSD(x) : '$' + x.toFixed(2));
    let fresh = true, done = false, stepsAllowed = o.maxSteps, moneyAllowed = o.budget;
    // the chat keeps its own account (and asks at its limit), so single requests don't each stop to ask; the monthly limit still holds
    if (US.ai.setBudget) US.ai.setBudget(1e6, as);
    const atLimit = async (kind, used, limit) => {
      chat.status = 'asking'; hk.status();
      const r = await h.limit({ kind, used, limit, total: chat.spent });
      if (r === 'free') { chat.noLimit = true; return true; }
      if (r === 'more') { if (kind === 'money') moneyAllowed += o.budget; else stepsAllowed += o.maxSteps; return true; }
      show({ k: 'warn', text: kind === 'money' ? `Stopped at the spending limit for one request (${usd(limit)}; this request used about ${usd(used)}). What’s made so far is kept. Say “carry on” to let me finish.` : `Stopped after ${limit} steps – the most for one request. Say “carry on” if you want more.` });
      chat.pendingResult = `You were stopped at the ${kind === 'money' ? 'spending' : 'step'} limit. Carry on from where you were if the editor asks.`;
      return false;
    };
    try {
      while (!done) {
        if (chat.stop) throw new US.UserError('CANCELLED');
        if (!chat.noLimit && chat.steps - startSteps >= stepsAllowed && !(await atLimit('steps', chat.steps - startSteps, stepsAllowed))) break;
        if (!chat.noLimit && o.budget > 0 && chat.spent - startSpent >= moneyAllowed && !(await atLimit('money', chat.spent - startSpent, moneyAllowed))) break;
        chat.status = 'thinking'; hk.status();
        let r;
        try { r = await US.ai.json({ system, user: [{ text: chat.context, cache: '1h' }, chat.first], turns: compact(chat.turns), schema, maxTokens: 6000, effort: 'medium', feature: 'Ask', as, use: chat.model && chat.model !== 'auto' ? chat.model : undefined, onUsage: u => { chat.spent += u.usd || 0; chat.usedModel = u.name; } }); }
        catch (e) {
          if (cancelled(e)) throw e;
          const x = explain(e);
          show({ k: 'warn', text: `${x.title} ${x.action || ''}`.trim() });
          chat.pendingResult = `You were stopped before your next step (${x.title}). Carry on from where you were.`;
          break;
        }
        if (chat.stop) throw new US.UserError('CANCELLED');
        chat.last = JSON.stringify(r || {});
        const st = parseStep(r, tools);
        chat.steps++;
        if (fresh && st.understood) show({ k: 'understood', text: st.understood });
        if (st.plan.length && (fresh || st.tool !== 'finish')) show({ k: 'plan', plan: st.plan });
        fresh = false;
        if (st.say && st.tool !== 'finish') show({ k: 'say', text: st.say });
        let result;
        if (st.bad) result = `ERROR: ${st.bad} Try again.`;
        else if (st.tool === 'finish') {
          const a = st.args, list = x => (Array.isArray(x) ? x : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 10);
          show({ k: 'end', total: chat.spent, reply: String(a.reply || st.say || '').trim(), done: list(a.done), notDone: list(a.notDone), check: list(a.check), next: list(a.next).slice(0, 3), versions: (chat.versions || []).slice(), work: chat.work, model: chat.usedModel || US.ai.label(), spent: chat.spent - startSpent, steps: chat.steps - startSteps });
          chat.pendingResult = ''; done = true; break;
        } else {
          if (st.tool !== 'ask') show({ k: 'step', tool: st.tool, text: describeCall(st.tool, st.args) });
          try { result = await callTool(chat, st, hk, o); }
          catch (e) {
            if (cancelled(e)) throw e;
            const x = explain(e);
            result = `ERROR: ${x.title} ${x.action || ''}`.trim();
            show({ k: 'result', text: `didn’t work: ${x.title}` });
          }
        }
        chat.turns.push({ assistant: chat.last, user: clip(`RESULT of ${st.tool || 'that'}:\n${result}`, 9000) });
      }
    } catch (e) {
      if (!cancelled(e)) throw e;
      show({ k: 'warn', text: 'Stopped. What was made so far is kept.' });
      chat.pendingResult = 'The editor pressed Stop before you finished. Wait for what they say next.';
    } finally { if (US.ai.endBudget) US.ai.endBudget(as); chat.status = 'idle'; chat.job = null; chat.updated = Date.now(); hk.status(); }
    return chat;
  }
  /** Stop a chat: after its current step (and the step itself, if it is the one running). */
  function stop(chat) { chat.stop = true; if (chat.job && US.jobs.current === chat.job) US.jobs.cancel(); }

  US.chat = { lineRows, storySummary, TOOLS, STEP_SCHEMA, MODES, toolsHere, riskOf, asksFirst, rules, brief, parseStep, compact, titleOf, describeCall, actionCard, actionsHere, newChat, toStored, fromStored, hands, findSequence, prepareEdit, callTool, send, stop };
})();
