/* JMG Ultra Studio – Ask › Edit: say what to change in plain English and the AI plans edits to your timeline or
   project – dissolves on every cut, a punch-in on each answer, the B-roll bin coloured – which you check before they
   run. The AI reads the timeline (or bin, or project) as text: clip names, times, tracks, labels, effects and, from
   Story, who speaks and what they say. Never footage.

   Where it acts: the open sequence, the clips selected in it, a bin, the whole project, or your transcripts (lines on
   the sequence). Each step is one edit (OPS) on the clips a query picks (select). Timeline edits run on a copy of the
   sequence unless you say otherwise, then the copy is read back and the AI checks the result and offers what's left
   (stage 2). Pure logic first (unit-tested), then the runner. The chat screen is in 40-assistant.js. */
(function () {
  'use strict';
  const US = window.US;
  const RES = () => US.app && US.app.is('resolve');

  /* ---------- the edits the AI may use ---------- */
  // where: 'timeline' (clips or ranges on a sequence) | 'items' (clips in the Project panel / Media Pool)
  // resolve: false = Premiere only (Resolve doesn't let add-ons do it)
  const OPS = {
    transition: { where: 'timeline', resolve: false, title: 'Transition', params: 'name: "Cross Dissolve" | "Dip to Black" | "Dip to White" | "Film Dissolve" | "Additive Dissolve" | "Morph Cut" (audio: "Constant Power" | "Constant Gain" | "Exponential Fade"); at: "start" | "end" | "both"; frames: number, or seconds: number (default half a second)', desc: 'Add a transition to each clip. On audio clips it is an audio fade.' },
    effect: { where: 'timeline', resolve: false, title: 'Effect', params: 'name: as Premiere’s Effects panel shows it, e.g. "Gaussian Blur", "Lumetri Color", "Black & White", "Warp Stabilizer", "Crop" (audio: "DeNoise", "Parametric Equalizer")', desc: 'Add an effect to each clip.' },
    speed: { where: 'timeline', resolve: false, title: 'Speed', params: 'percent: number (50 = half speed)', desc: 'Change each clip’s speed (the clip gets longer or shorter).' },
    motion: { where: 'timeline', resolve: true, title: 'Scale / position', params: 'scale: percent; x, y: 0–1 across the frame (0.5 = centre); rotation: degrees – give only what changes', desc: 'Set framing on each video clip.' },
    zoom: { where: 'timeline', resolve: false, title: 'Slow zoom', params: 'from, to: scale percent (punch-in 100→110, pull-out 110→100); seconds: only the first (or last, with at: "end") seconds, else the whole clip', desc: 'A keyframed zoom across each clip (punch-in or Ken Burns).' },
    opacity: { where: 'timeline', resolve: true, title: 'Opacity', params: 'value: percent', desc: 'Set each clip’s opacity.' },
    volume: { where: 'timeline', resolve: false, title: 'Volume', params: 'db: change in dB (−6 quieter, +3 louder)', desc: 'Raise or lower each audio clip.' },
    label: { where: 'both', resolve: true, title: 'Colour label', params: 'label: 0 Violet, 1 Iris, 2 Caribbean, 3 Lavender, 4 Cerulean, 5 Forest, 6 Rose, 7 Mango, 8 Purple, 9 Blue, 10 Teal, 11 Magenta, 12 Tan, 13 Green, 14 Brown, 15 Yellow', desc: 'Colour each clip.' },
    enable: { where: 'timeline', resolve: true, title: 'Switch on/off', params: 'on: true | false', desc: 'Switch each clip on or off (Enable).' },
    remove: { where: 'timeline', resolve: true, title: 'Delete', params: 'ripple: true closes the gap', desc: 'Delete each clip from the sequence.' },
    rename: { where: 'both', resolve: false, title: 'Rename', params: 'name: the new name; use {n} for a number and {name} for the old name, e.g. "Interview {n}"', desc: 'Rename each clip.' },
    marker: { where: 'both', resolve: true, title: 'Marker', params: 'name, comment; color: 0 Green, 1 Red, 2 Purple, 3 Orange, 4 Yellow, 5 White, 6 Blue, 7 Cyan', desc: 'A marker over each clip or line (sequence markers on a timeline, clip markers in a bin).' },
    text: { where: 'timeline', resolve: false, title: 'Text', params: 'text: what it says ({speaker} and {says} use the line’s); style: "title" | "lowerThird"; seconds: how long (default 4)', desc: 'A text layer at the start of each clip or line, on a top track called “Ask text”.' },
    razor: { where: 'timeline', resolve: false, title: 'Cut', params: '(none) – cuts every track at the start and end of each clip or line picked', desc: 'Razor the whole sequence at the start and end of each target.' },
    move: { where: 'items', resolve: true, title: 'Move to bin', params: 'bin: path like "Selects/Roaming"', desc: 'Move each clip to a bin (made if needed).' },
    sequence: { where: 'items', resolve: true, title: 'New sequence', params: 'name: the sequence’s name', desc: 'A new sequence with the clips one after another, in the order picked.' },
    // where 'any': works on other sequences in the project (SEQUENCES / PROJECT CLIPS), whatever Ask is reading
    append: { where: 'any', resolve: true, title: 'Add a clip to sequences', params: 'clip: a clip id from PROJECT CLIPS (p…) or its exact name; track: "V2" (the video track it goes on – made if a sequence hasn’t got it); audio: true to bring its sound too, false for picture only; audioTrack: "A2" (default: the same number as track); gap: seconds of space before it (default 0)', desc: 'Add one clip from the project at the END of each sequence picked (after everything already in it), on one track. It changes the editor’s own sequences, not copies – the editor confirms first. Targets are sequences: {"sequences":["s3","s8"]} or {"bin":"part of the bin path","nameContains":""}.' }
  };
  /** The edits that make sense here: for this kind of scope, and that this editor allows. */
  const opsFor = (kind, resolve = RES()) => Object.entries(OPS).filter(([, o]) => (o.where === 'both' || o.where === 'any' || o.where === kind) && (!resolve || o.resolve)).map(([k]) => k);

  /* ---------- reading what's there, as a model and as text ---------- */
  const r2 = x => Math.round(x * 100) / 100;
  const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60), ss = s - m * 60; return `${m}:${ss < 10 ? '0' : ''}${ss.toFixed(2)}`; };
  const base = p => String(p || '').split(/[\\/]/).pop();
  /**
   * A sequence as a model: clips c1, c2… (video tracks top first, then audio) with label, effects, scale and – when
   * Story has transcripts – who speaks in it and what they say; lines l1, l2… heard in it; markers.
   * info: editRead's result; heard: Story's entries on this sequence ([{start, end, speaker, text, lineId}]) or null.
   */
  function timelineModel(info, heard = null, { only = null } = {}) {
    const clips = [];
    let n = 0;
    for (const kind of ['video', 'audio']) {
      const tracks = info[kind] || [];
      for (const tr of (kind === 'video' ? tracks.slice().reverse() : tracks)) for (const c of tr.clips || []) {
        const x = { id: 'c' + (++n), kind, track: tr.index, trackName: `${kind === 'video' ? 'V' : 'A'}${tr.index + 1}`, start: c.start, end: c.end, name: c.name || '', file: base(c.path), itemId: c.itemId || '', disabled: !!c.disabled, label: c.label != null ? c.label : null, effects: c.effects || [], scale: c.scale, speed: c.speed, locked: !!tr.locked };
        if (only && !only.some(s => s.kind === kind && s.track === tr.index && Math.abs(s.start - c.start) < 0.02)) continue;
        clips.push(x);
      }
    }
    const lines = [];
    if (heard && heard.length) {
      heard.slice().sort((a, b) => a.start - b.start).forEach((e, i) => lines.push({ id: 'l' + (i + 1), start: e.start, end: e.end, speaker: e.speaker || '', text: String(e.text || ''), lineId: e.lineId }));
      for (const c of clips) {
        const over = lines.filter(l => l.start < c.end - 0.05 && l.end > c.start + 0.05);
        if (!over.length) continue;
        const by = new Map(); for (const l of over) by.set(l.speaker, (by.get(l.speaker) || 0) + Math.min(l.end, c.end) - Math.max(l.start, c.start));
        c.speaker = Array.from(by.entries()).sort((a, b) => b[1] - a[1])[0][0];
        c.says = over.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();
      }
    }
    return { kind: 'timeline', seq: { id: info.id, name: info.name, fps: info.fps || 25, duration: info.duration || 0 }, clips, lines, markers: (info.markers || []).map(m => ({ start: m.start, end: m.end, name: m.name || '', color: m.color })) };
  }
  /** Clips in the Project panel / Media Pool (from binItems) as a model: i1, i2… */
  function itemsModel(items, label) {
    return { kind: 'items', scope: label, items: (items || []).filter(it => it && it.kind !== 'bin').map((it, i) => ({ id: 'i' + (i + 1), itemId: it.id, name: it.name || '', kind: it.kind || '', file: base(it.path), bin: it.bin || '', label: it.label != null ? it.label : null, duration: it.duration || 0, fps: it.fps || 0, width: it.width || 0, height: it.height || 0, offline: !!it.offline })) };
  }
  /** The rest of the project (editProject's result): bins, sequences s1… and clips p1…, for edits that reach other sequences. */
  function projectModel(pr) {
    if (!pr) return null;
    return {
      bins: (pr.bins || []).filter(b => b && b !== '(Project root)'), more: pr.more || 0,
      sequences: (pr.sequences || []).map((x, i) => ({ id: 's' + (i + 1), seqId: x.id, itemId: x.itemId || '', name: x.name || '', bin: x.bin || '', duration: x.duration || 0, video: x.video || 0, audio: x.audio || 0 })),
      clips: (pr.clips || []).map((x, i) => ({ id: 'p' + (i + 1), itemId: x.id, name: x.name || '', file: x.file || '', bin: x.bin || '', kind: x.kind || '' }))
    };
  }
  const LIMIT = { clips: 900, lines: 1500, items: 1500, says: 140, sequences: 600, projectClips: 400 };
  function projectOutline(p) {
    const out = [`PROJECT – bins: ${p.bins.slice(0, 300).join(' · ') || '(none)'}`, '', `SEQUENCES (${p.sequences.length})`, 'id\tname\tbin\tlength\ttracks'];
    for (const x of p.sequences.slice(0, LIMIT.sequences)) out.push([x.id, x.name, x.bin, fmtT(x.duration), `V${x.video} A${x.audio}`].join('\t'));
    if (p.sequences.length > LIMIT.sequences) out.push(`…and ${p.sequences.length - LIMIT.sequences} more (pick them by bin)`);
    const n = p.clips.length + p.more;
    out.push('', `PROJECT CLIPS (${n})`, 'id\tname\tkind\tbin');
    for (const c of p.clips.slice(0, LIMIT.projectClips)) out.push([c.id, c.name + (c.file && c.file !== c.name ? ` (${c.file})` : ''), c.kind, c.bin].join('\t'));
    if (n > LIMIT.projectClips) out.push(`…and ${n - LIMIT.projectClips} more: give the clip’s name in "clip" (the panel finds it), or ask the editor to pick it`);
    return out.join('\n');
  }
  /** The model as the AI reads it: one row per clip, line or item, tab-separated. */
  function outline(m) {
    const text = outlineOf(m);
    return m.project ? text + '\n\n' + projectOutline(m.project) : text;
  }
  function outlineOf(m) {
    const out = [];
    if (m.kind === 'items') {
      out.push(`PROJECT CLIPS (${m.scope}) – ${m.items.length}`, 'id\tname\tkind\tlength\tfps\tsize\tlabel\tbin');
      for (const it of m.items.slice(0, LIMIT.items)) out.push([it.id, it.name, it.kind, it.duration ? r2(it.duration) + 's' : '', it.fps || '', it.width ? `${it.width}x${it.height}` : '', it.label != null ? it.label : '', it.bin].join('\t'));
      if (m.items.length > LIMIT.items) out.push(`…and ${m.items.length - LIMIT.items} more (use a query, not ids, for them)`);
      return out.join('\n');
    }
    out.push(`SEQUENCE “${m.seq.name}” – ${fmtT(m.seq.duration)} long, ${m.seq.fps} fps, ${m.clips.length} clips`);
    const tracks = new Map(); for (const c of m.clips) tracks.set(c.trackName, (tracks.get(c.trackName) || 0) + 1);
    out.push('Tracks: ' + Array.from(tracks.entries()).map(([t, n]) => `${t} (${n})`).join(', '));
    out.push('id\ttrack\tstart–end\tlength\tclip\tlabel\teffects\tspeaker: says');
    for (const c of m.clips.slice(0, LIMIT.clips)) {
      const says = c.says ? `${c.speaker || '?'}: ${c.says.length > LIMIT.says ? c.says.slice(0, LIMIT.says) + '…' : c.says}` : '';
      out.push([c.id, c.trackName, `${fmtT(c.start)}–${fmtT(c.end)}`, r2(c.end - c.start) + 's', c.name + (c.file && c.file !== c.name ? ` (${c.file})` : '') + (c.disabled ? ' [off]' : '') + (c.speed && Math.abs(c.speed - 1) > 0.01 ? ` [${Math.round(c.speed * 100)}%]` : ''), c.label != null ? c.label : '', c.effects.join(', '), says].join('\t'));
    }
    if (m.clips.length > LIMIT.clips) out.push(`…and ${m.clips.length - LIMIT.clips} more clips (use a query, not ids, for them)`);
    if (m.markers.length) out.push('', 'MARKERS', ...m.markers.slice(0, 300).map(k => `${fmtT(k.start)}${k.end > k.start + 0.01 ? '–' + fmtT(k.end) : ''}\tcolour ${k.color}\t${k.name}`));
    if (m.lines.length) {
      out.push('', `TRANSCRIPT LINES HEARD (${m.lines.length})`, 'id\tstart–end\tspeaker\ttext');
      for (const l of m.lines.slice(0, LIMIT.lines)) out.push([l.id, `${fmtT(l.start)}–${fmtT(l.end)}`, l.speaker, l.text].join('\t'));
    }
    return out.join('\n');
  }

  /* ---------- which clips a step means ---------- */
  /**
   * The targets of a query. Clips: {ids, tracks ["V1","A2"] or kind "video"|"audio", nameContains, fileContains,
   * minSeconds, maxSeconds, label, disabled, effect, noEffect, speakers, says, speakerChange, from, to, every:
   * "all"|"first"|"last"|"everyOther"|"cuts" (all but the first on each track)}. Lines (transcripts): {lines: true or
   * ["l3"…], speakers, says} → time ranges. Items: {ids, nameContains, fileContains, kind, label, bin, minSeconds,
   * maxSeconds}. -> [{kind, track, start, end, id, name} | {start, end, line} | {itemId, id, name}]
   */
  function select(m, q = {}) {
    const lc = s => String(s || '').toLowerCase(), has = (a, b) => lc(a).includes(lc(b));
    const ids = Array.isArray(q.ids) && q.ids.length ? new Set(q.ids.map(String)) : null;
    const speakers = Array.isArray(q.speakers) && q.speakers.length ? q.speakers.map(lc) : null;
    const num = x => (x == null || x === '' || x === -1 ? null : Number(x));
    if (m.kind === 'items') {
      return m.items.filter(it => (!ids || ids.has(it.id)) && (!q.nameContains || has(it.name, q.nameContains)) && (!q.fileContains || has(it.file, q.fileContains))
        && (!q.kind || q.kind === it.kind) && (num(q.label) == null || it.label === num(q.label)) && (!q.bin || has(it.bin, q.bin))
        && (num(q.minSeconds) == null || it.duration >= num(q.minSeconds)) && (num(q.maxSeconds) == null || !num(q.maxSeconds) || it.duration <= num(q.maxSeconds)))
        .map(it => ({ itemId: it.itemId, id: it.id, name: it.name }));
    }
    if (q.lines) {
      const want = Array.isArray(q.lines) ? new Set(q.lines.map(String)) : null;
      return m.lines.filter(l => (!want || want.has(l.id)) && (!speakers || speakers.some(s => lc(l.speaker).includes(s))) && (!q.says || has(l.text, q.says))
        && (num(q.from) == null || l.end > num(q.from)) && (num(q.to) == null || l.start < num(q.to)))
        .map(l => ({ start: l.start, end: l.end, line: l.id, text: l.text, speaker: l.speaker }));
    }
    const tracks = Array.isArray(q.tracks) && q.tracks.length ? new Set(q.tracks.map(t => String(t).toUpperCase())) : null;
    let list = m.clips.filter(c => !c.locked && (!ids || ids.has(c.id)) && (!tracks || tracks.has(c.trackName)) && (!q.kind || q.kind === c.kind)
      && (!q.nameContains || has(c.name, q.nameContains) || has(c.file, q.nameContains)) && (!q.fileContains || has(c.file, q.fileContains))
      && (num(q.minSeconds) == null || c.end - c.start >= num(q.minSeconds)) && (num(q.maxSeconds) == null || !num(q.maxSeconds) || c.end - c.start <= num(q.maxSeconds))
      && (num(q.label) == null || c.label === num(q.label)) && (q.disabled == null || q.disabled === '' || !!c.disabled === !!q.disabled)
      && (!q.effect || c.effects.some(e => has(e, q.effect))) && (!q.noEffect || !c.effects.some(e => has(e, q.noEffect)))
      && (!speakers || (c.speaker && speakers.some(s => lc(c.speaker).includes(s)))) && (!q.says || has(c.says, q.says))
      && (num(q.from) == null || c.end > num(q.from)) && (num(q.to) == null || c.start < num(q.to)));
    // per track, in time order: where the speaker changes, every other one, the first/last, every cut
    const byTrack = new Map(); for (const c of list) { if (!byTrack.has(c.trackName)) byTrack.set(c.trackName, []); byTrack.get(c.trackName).push(c); }
    const out = [];
    for (const arr of byTrack.values()) {
      arr.sort((a, b) => a.start - b.start);
      let pick = arr;
      if (q.speakerChange) { const all = m.clips.filter(c => c.trackName === arr[0].trackName).sort((a, b) => a.start - b.start); pick = arr.filter(c => { const i = all.indexOf(c); return i > 0 && all[i - 1].speaker && c.speaker && all[i - 1].speaker !== c.speaker; }); }
      if (q.every === 'first') pick = pick.slice(0, 1);
      else if (q.every === 'last') pick = pick.slice(-1);
      else if (q.every === 'everyOther') pick = pick.filter((c, i) => i % 2 === 0);
      else if (q.every === 'cuts') pick = pick.slice(1);
      out.push(...pick);
    }
    return out.sort((a, b) => a.start - b.start || a.trackName.localeCompare(b.trackName)).map(c => ({ kind: c.kind, track: c.track, start: c.start, end: c.end, id: c.id, name: c.name, speaker: c.speaker, says: c.says }));
  }

  /* ---------- the plan ---------- */
  // what the editor answers a question with: a project clip, a bin, sequences (by bin), a track, one of the options, or words
  const QUESTION_KINDS = ['clip', 'bin', 'sequences', 'track', 'choice', 'text'];
  const PLAN_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['reply', 'done', 'steps', 'questions'],
    properties: {
      reply: { type: 'string' }, done: { type: 'boolean' },
      questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ask', 'kind', 'options'], properties: { ask: { type: 'string' }, kind: { type: 'string', enum: QUESTION_KINDS }, options: { type: 'array', items: { type: 'string' } } } } },
      steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['op', 'sequencesJson', 'targetsJson', 'paramsJson', 'why'], properties: { op: { type: 'string' }, sequencesJson: { type: 'string' }, targetsJson: { type: 'string' }, paramsJson: { type: 'string' }, why: { type: 'string' } } } }
    }
  };
  function rules(kind) {
    const ops = opsFor(kind);
    return [
      `You plan edits for a video editor in ${RES() ? 'DaVinci Resolve' : 'Adobe Premiere Pro'}, inside the JMG Ultra Studio panel. You get what is in their ${kind === 'items' ? 'project (clips in bins)' : 'sequence (every clip, its track, times, label, effects and – when transcribed – who speaks and what they say)'} as text, and a request.`,
      'Turn the request into a short list of steps. Each step is ONE edit (op) on the targets a query picks. Use as few steps as possible, in the order they should run.',
      '- "op": one of the edits below. "paramsJson": a JSON object string with that edit’s settings. "why": a few words for the editor.',
      kind === 'items'
        ? '- "targetsJson": a JSON object string picking clips: {"ids":["i3","i7"]} or a query {"nameContains":"","fileContains":"","kind":"video|audio|still|sequence","label":0-15,"bin":"part of a bin path","minSeconds":0,"maxSeconds":0}. Leave out what you don’t need; {} means all.'
        : '- "targetsJson": a JSON object string picking clips or lines: {"ids":["c3","c7"]}, or a query {"tracks":["V1"],"kind":"video|audio","nameContains":"","fileContains":"","minSeconds":0,"maxSeconds":0,"label":0-15,"disabled":false,"effect":"has this effect","noEffect":"","speakers":["Ruth"],"says":"words in what they say","speakerChange":true,"from":seconds,"to":seconds,"every":"all|first|last|everyOther|cuts"}; "cuts" = every clip but the first on its track (the joins). For transcript lines: {"lines":true or ["l4","l9"],"speakers":[],"says":""} – for markers, text, cuts or to find the clips under them. Prefer a query to long id lists. Leave out what you don’t need.',
      '- Picture edits (transition on video, motion, zoom, effect on video, opacity) go on video tracks; volume and audio fades on audio tracks. A video clip and its sound are separate clips (Vn and An).',
      '- Never invent clip ids, effect or transition names: use Premiere’s own names. If something can’t be done with these edits, say so in "reply" and leave it out.',
      `- "reply": one or two short sentences in plain British English saying what you’ll do (or found). "done": true when nothing more is needed.${RES() ? ' Resolve can’t add transitions, effects, speed changes, keyframes, text or cuts by script – say so if asked.' : ''}`,
      '- The other sequences, bins and clips in the project are listed under SEQUENCES and PROJECT CLIPS. Only "append" uses them.',
      '- If you are not sure what the editor means – which clip, which sequences or bin, which track, with sound or not – do NOT guess: return no steps and ask in "questions" (at most 4, one thing each). "kind" is how they answer: "clip" (they pick a project clip), "bin", "sequences" (they pick the bin they’re in), "track", "choice" (give 2–5 "options"), "text". "options" is [] except for "choice" (for "clip" you may list likely clip names). When the answers come back, plan; ask again only about what is still unclear.',
      `- "sequencesJson": "" for ${kind === 'items' ? 'the clips shown above' : 'the sequence shown above'}. To make an edit in OTHER sequences – one or many at once – give {"sequences":["s3","s8"]} or {"bin":"part of the bin path","nameContains":"part of the name"} from SEQUENCES. "targetsJson" then picks the clips inside EACH of those sequences with a clip query: {"tracks":["V1"],"kind":"video|audio","nameContains":"","minSeconds":0,"maxSeconds":0,"label":0-15,"from":seconds,"to":seconds,"every":"all|first|last|everyOther|cuts"} (no c… ids or transcript lines – those belong to ${kind === 'items' ? 'one sequence only' : 'the sequence shown'}). Example: a 2-second Dip to Black on the first clip on V1 of every sequence called "All Songs": op "transition", sequencesJson {"nameContains":"All Songs"}, targetsJson {"tracks":["V1"],"every":"first"}, paramsJson {"name":"Dip to Black","at":"start","seconds":2}.`,
      '- "append", and every edit with "sequencesJson", changes the editor’s own sequences (no copies); the panel asks them to confirm before it runs, so mention that in "reply".',
      '', 'EDITS:', ...ops.map(k => `- ${k}: ${OPS[k].desc} Settings: ${OPS[k].params}`),
      ...(kind === 'items' ? ['', 'EDITS FOR SEQUENCES (only with "sequencesJson"):', ...opsFor('timeline').filter(k => !ops.includes(k)).map(k => `- ${k}: ${OPS[k].desc} Settings: ${OPS[k].params}`)] : [])
    ].join('\n');
  }
  /** "V2" → 1 (0-based); null when it isn't a track of that kind. */
  function trackIndex(x, kind) {
    const t = /^\s*([VA])?\s*(\d+)\s*$/i.exec(String(x == null ? '' : x));
    if (!t || (t[1] && t[1].toUpperCase() !== kind)) return null;
    const n = Number(t[2]); return n >= 1 && n <= 99 ? n - 1 : null;
  }
  /**
   * The sequences a step means: by id (s…), or by bin (exactly, the end of its path, or part of it) and part of the
   * name – or a question when none match or the bin is ambiguous. -> {seqs, ask}
   */
  function pickSequences(pr, q) {
    const lc = x => String(x || '').toLowerCase().trim(), ask = [];
    let seqs = [];
    if (!pr) return { seqs, ask: [{ ask: 'I couldn’t read the project’s sequences. Which bin are they in?', kind: 'sequences', options: [] }] };
    const binOk = b => { const w = lc(q.bin); return !w || lc(b) === w || lc(b).endsWith(' / ' + w) || lc(b).includes(w); };
    if (Array.isArray(q.sequences) && q.sequences.length) { const ids = new Set(q.sequences.map(String)); seqs = pr.sequences.filter(x => ids.has(x.id) || ids.has(x.seqId)); }
    else if (q.bin || q.nameContains || q.all) seqs = pr.sequences.filter(x => binOk(x.bin) && (!q.nameContains || lc(x.name).includes(lc(q.nameContains))));
    if (q.bin && seqs.length) {
      // one bin, not every bin whose path happens to contain the word
      const exact = seqs.filter(x => lc(x.bin) === lc(q.bin) || lc(x.bin).endsWith(' / ' + lc(q.bin)));
      if (exact.length) seqs = exact;
      else if (new Set(seqs.map(x => x.bin)).size > 1) { ask.push({ ask: `More than one bin matches “${q.bin}”. Which one holds the sequences?`, kind: 'sequences', options: [...new Set(seqs.map(x => x.bin))].slice(0, 12) }); seqs = []; }
    }
    if (!seqs.length && !ask.length) ask.push({ ask: q.bin ? `I can’t find sequences in a bin called “${q.bin}”. Which bin are they in?` : q.nameContains ? `I can’t find sequences called “${q.nameContains}”. Which bin are they in?` : 'Which sequences? Choose the bin they’re in.', kind: 'sequences', options: [] });
    return { seqs, ask };
  }
  const parseJson = x => { if (!x || !String(x).trim()) return null; try { const o = JSON.parse(x); return o && typeof o === 'object' && Object.keys(o).length ? o : null; } catch (e) { return null; } };
  /**
   * An "append" step against the project: the one clip, the sequences and the track(s) – or the questions to ask when
   * any of them isn't certain. -> {step} | {questions}
   */
  function appendStep(m, q, p) {
    const pr = m.project, lc = x => String(x || '').toLowerCase().trim(), ask = [];
    if (!pr) return { questions: [{ ask: 'I couldn’t read the project’s sequences. Which bin are they in?', kind: 'sequences', options: [] }] };
    // the clip: by id, then exact name or file name, then part of either
    const want = String(p.clip || '').trim();
    let clips = [];
    if (want) {
      const byId = pr.clips.find(c => c.id === want || c.itemId === want);
      clips = byId ? [byId] : pr.clips.filter(c => lc(c.name) === lc(want));
      if (!clips.length) clips = pr.clips.filter(c => lc(c.file) === lc(want));
      if (!clips.length) clips = pr.clips.filter(c => lc(c.name).includes(lc(want)) || lc(c.file).includes(lc(want)));
    }
    if (clips.length !== 1) ask.push({ ask: !want ? 'Which clip should go at the end?' : clips.length ? `More than one clip matches “${want}”. Which one?` : `I can’t find a clip called “${want}”. Which one is it?`, kind: 'clip', options: clips.slice(0, 12).map(c => c.name) });
    const clip = clips.length === 1 ? clips[0] : null;
    const picked = pickSequences(pr, q);
    const seqs = picked.seqs; ask.push(...picked.ask);
    // the track(s): a sound-only clip goes on an audio track; a still has no sound
    const soundOnly = !!clip && clip.kind === 'audio', still = !!clip && clip.kind === 'still';
    const v = soundOnly ? null : trackIndex(p.track, 'V');
    if (!soundOnly && v == null) ask.push({ ask: `Which video track should ${clip ? `“${clip.name}”` : 'it'} go on?`, kind: 'track', options: [] });
    let a = trackIndex(p.audioTrack != null && p.audioTrack !== '' ? p.audioTrack : soundOnly ? p.track : '', 'A');
    if (soundOnly && a == null) ask.push({ ask: `Which audio track should “${clip.name}” go on?`, kind: 'track', options: [] });
    if (a == null) a = v != null ? v : 0;
    let audio = soundOnly ? true : still ? false : p.audio;
    if (typeof audio === 'string') audio = /^(true|yes|1)$/i.test(audio);
    if (clip && audio == null) ask.push({ ask: `Bring the sound of “${clip.name}” too, or the picture only?`, kind: 'choice', options: ['Picture and sound', 'Picture only'] });
    if (ask.length) return { questions: ask };
    return {
      step: {
        op: 'append', query: q, params: Object.assign({}, p, { clipId: clip.itemId, clipName: clip.name, clipKind: clip.kind, v: v || 0, a, video: !soundOnly, audio: !!audio, gap: Math.max(0, Number(p.gap) || 0) }),
        targets: seqs.map(x => ({ seqId: x.seqId, name: x.name, bin: x.bin, duration: x.duration, sequence: true }))
      }
    };
  }
  /** The AI's answer → steps with parsed settings and targets; unknown edits and empty picks are dropped (and said). */
  function checkPlan(r, m, others = new Map()) {
    const kind = m.kind, ok = new Set(opsFor(kind)), onSeqs = new Set(opsFor('timeline').filter(k => k !== 'append')), steps = [], dropped = [];
    const questions = ((r && r.questions) || []).filter(x => x && String(x.ask || '').trim()).slice(0, 4)
      .map(x => ({ ask: String(x.ask).trim(), kind: QUESTION_KINDS.includes(x.kind) ? x.kind : 'text', options: Array.isArray(x.options) ? x.options.map(String).filter(Boolean).slice(0, 12) : [] }));
    for (const s of (r && r.steps) || []) {
      const op = String(s.op || ''), sq = op === 'append' ? null : parseJson(s.sequencesJson);
      if (sq) {
        if (!onSeqs.has(op)) { dropped.push(`${op || '?'}: ${OPS[op] && !OPS[op].resolve && RES() ? 'Premiere only' : 'not something I can do in other sequences'}`); continue; }
        const picked = pickSequences(m.project, sq);
        if (picked.ask.length) { for (const k of picked.ask) if (!questions.some(y => y.ask === k.ask)) questions.push(k); continue; }
        let q = parseJson(s.targetsJson) || {}, p = parseJson(s.paramsJson) || {};
        q = Object.assign({}, q); delete q.ids; delete q.lines;   // ids and lines belong to the sequence shown
        const perSeq = picked.seqs.map(x => { const sm = others.get(x.seqId); return { seqId: x.seqId, name: x.name, targets: sm ? select(sm, q).map(t => Object.assign(t, { seqId: x.seqId, seqName: x.name })) : [] }; }).filter(x => x.targets.length);
        if (!perSeq.length) { dropped.push(`${OPS[op].title}: nothing matched in those ${US.plural(picked.seqs.length, 'sequence')}`); continue; }
        steps.push({ op, query: q, params: p, why: String(s.why || ''), multi: true, perSeq, targets: perSeq.flatMap(x => x.targets) });
        continue;
      }
      if (!ok.has(op)) { dropped.push(`${op || '?'}: ${OPS[op] && !OPS[op].resolve && RES() ? 'Premiere only' : 'not something I can do here'}`); continue; }
      let q = {}, p = {};
      try { q = s.targetsJson ? JSON.parse(s.targetsJson) : {}; } catch (e) { q = {}; }
      try { p = s.paramsJson ? JSON.parse(s.paramsJson) : {}; } catch (e) { p = {}; }
      if (op === 'append') {
        const x = appendStep(m, q || {}, p || {});
        if (x.questions) { for (const k of x.questions) if (!questions.some(y => y.kind === k.kind && y.ask === k.ask)) questions.push(k); continue; }
        steps.push(Object.assign(x.step, { why: String(s.why || '') }));
        continue;
      }
      const targets = select(m, q || {});
      if (!targets.length) { dropped.push(`${OPS[op].title}: nothing matched`); continue; }
      steps.push({ op, query: q, params: p || {}, why: String(s.why || ''), targets });
    }
    return { reply: String((r && r.reply) || ''), done: !!(r && r.done) && !questions.length, steps: steps.slice(0, 12), dropped, questions: questions.slice(0, 6) };
  }
  /** In the order they're safe to run: cuts first (they split clips), deletions last (rippling moves what's after). */
  // speed changes can ripple what follows, so they come late too (and each runs from the end, like deleting)
  const RANK = { razor: 0, speed: 2, remove: 3 };
  const runOrder = steps => steps.map((s, i) => ({ s, i })).sort((a, b) => (RANK[a.s.op] != null ? RANK[a.s.op] : 1) - (RANK[b.s.op] != null ? RANK[b.s.op] : 1) || a.i - b.i).map(x => x.s);
  /** One line for a step: "Cross Dissolve at both ends · 42 clips on V1". */
  function describe(s) {
    const p = s.params || {}, n = s.targets.length, lines = s.targets[0] && s.targets[0].line, items = s.targets[0] && s.targets[0].itemId;
    const where = s.op === 'append' ? US.plural(n, 'sequence') : s.multi ? `${US.plural(n, 'clip')} in ${US.plural(s.perSeq.length, 'sequence')}` : items ? US.plural(n, 'clip') : lines ? US.plural(n, 'line') : `${US.plural(n, 'clip')}${(() => { const t = [...new Set(s.targets.map(x => (x.kind === 'audio' ? 'A' : 'V') + (x.track + 1)))]; return t.length && t.length <= 4 ? ' on ' + t.join(', ') : ''; })()}`;
    const what = {
      transition: () => `${p.name || 'Cross Dissolve'} at ${p.at === 'start' ? 'the start' : p.at === 'end' ? 'the end' : 'both ends'}${p.seconds ? ` (${p.seconds} s)` : p.frames ? ` (${p.frames} frames)` : ''}`,
      effect: () => `Add ${p.name}`, speed: () => `Speed ${p.percent}%`,
      motion: () => ['scale ' + p.scale + '%', p.x != null || p.y != null ? `position ${p.x != null ? p.x : '–'}, ${p.y != null ? p.y : '–'}` : '', p.rotation != null ? `rotate ${p.rotation}°` : ''].filter(x => x && !/undefined/.test(x)).join(', ') || 'Framing',
      zoom: () => `Slow zoom ${p.from != null ? p.from : 100}% → ${p.to != null ? p.to : 110}%${p.seconds ? ` over ${p.seconds} s` : ''}`,
      opacity: () => `Opacity ${p.value}%`, volume: () => `Volume ${p.db > 0 ? '+' : ''}${p.db} dB`,
      label: () => `Colour ${US.ui && US.ui.LABELS && US.ui.LABELS[p.label] ? US.ui.LABELS[p.label].name : p.label}`,
      enable: () => (p.on ? 'Switch on' : 'Switch off'), remove: () => (p.ripple ? 'Delete (close the gaps)' : 'Delete'),
      rename: () => `Rename to “${p.name}”`, marker: () => `Marker${p.name ? ` “${p.name}”` : ''}`,
      text: () => `${p.style === 'lowerThird' ? 'Lower third' : 'Title'} “${p.text || '…'}”`, razor: () => 'Cut at the start and end',
      move: () => `Move to “${p.bin}”`, sequence: () => `New sequence “${p.name || 'Ask'}”`,
      append: () => `Add “${p.clipName || p.clip}” at the end${p.video === false ? '' : ` on V${(p.v || 0) + 1}`}${p.audio ? ` (${p.video === false ? 'on' : 'sound on'} A${(p.a || 0) + 1})` : p.video === false ? '' : ', picture only'}${p.gap ? ` after ${p.gap} s` : ''}`
    }[s.op];
    return `${what ? what() : s.op} · ${where}`;
  }

  /* ---------- reading a scope ---------- */
  /** scope: {where: 'sequence'|'selection'|'transcripts'|'bin'|'project', seqId, binId} -> model */
  async function read(job, scope) {
    const m = await readScope(job, scope);
    try { m.project = projectModel(await US.host.call('editProject', {})); } catch (e) { m.project = null; }   // other sequences can't be reached; the rest works
    return m;
  }
  async function readScope(job, scope) {
    if (scope.where === 'bin' || scope.where === 'project') {
      job && job.set({ who: 'premiere', msg: scope.where === 'bin' ? 'Reading the bin' : 'Reading the project' });
      let binId = scope.binId;
      if (scope.where === 'project') binId = ((await US.host.call('listBins'))[0] || {}).id;
      if (!binId) throw new US.UserError('BAD_INPUT', { title: 'Choose a bin first.' });
      const items = await US.host.call('binItems', { binId, recursive: true });
      const m = itemsModel(items, scope.where === 'project' ? 'the whole project' : `the bin ${scope.binName || ''}`.trim());
      if (!m.items.length) throw new US.UserError('NOTHING_FOUND', { title: scope.where === 'bin' ? 'That bin is empty.' : 'There are no clips in this project.' });
      return m;
    }
    const seqId = scope.seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!seqId) throw new US.UserError('NO_SEQUENCE');
    job && job.set({ who: 'premiere', msg: 'Reading the sequence' });
    const info = await US.host.call('editRead', { seqId });
    let heard = null;
    try {
      if (US.story && US.story.timelineTranscript) {
        const tl = await US.story.timelineTranscript(null, { seqId });
        const names = US.story.namesFor ? US.story.namesFor(tl) : new Map();
        heard = tl.result.entries.map(e => Object.assign({}, e, { speaker: names.get(e.speakerKey) || e.speaker }));
      }
    } catch (e) { heard = null; }   // no transcripts: the AI works from names and times
    let only = null;
    if (scope.where === 'selection') {
      only = await US.host.call('editSelection', { seqId });
      if (!only.length) throw new US.UserError('NOTHING_FOUND', { title: RES() ? 'Resolve doesn’t tell add-ons which clips are selected.' : 'No clips are selected in the Timeline.', action: RES() ? 'Put the playhead over the clip, or choose “This sequence”.' : 'Select the clips first, then ask again.' });
    }
    const m = timelineModel(info, heard, { only });
    if (scope.where === 'transcripts' && !m.lines.length) throw new US.UserError('NOTHING_FOUND', { title: 'No transcribed lines are heard in this sequence.', action: 'Transcribe the interviews in Story › 1 Interviews, or choose “This sequence”.' });
    if (!m.clips.length && !m.lines.length) throw new US.UserError('NOTHING_FOUND', { title: 'This sequence is empty.' });
    m.scope = scope;
    return m;
  }

  /* ---------- planning, running, checking ---------- */
  const store = () => { const s = US.settings.get('editAsk.recent', []); return Array.isArray(s) ? s : []; };
  /**
   * Plan an edit. Asking again in the same conversation (conv) keeps the cached outline and adds the earlier plans
   * and results as turns. -> {conv, plan}
   */
  async function plan(job, { request, scope, conv = null }) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('NO_AI', { title: 'Ask › Edit needs AI.', action: 'Add a Claude or Gemini key in Settings.' });
    let m = conv && conv.model;
    if (!m) m = await read(job, scope);
    const c = conv || { id: US.uid('e'), request, scope, model: m, outline: outline(m), turns: [], at: Date.now() };
    const first = !c.turns.length && !c.firstUser;
    const ask = `Where: ${scopeLabel(scope, m)}.\nThe editor asks: “${String(request).trim()}”`;
    if (first) c.firstUser = ask; else c.turns.push({ assistant: c.lastAnswer || '{}', user: c.pendingResult ? `${c.pendingResult}\n\nThe editor now asks: “${String(request).trim()}”` : `The editor follows up: “${String(request).trim()}”` });
    c.pendingResult = '';
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is planning the edit` });
    const r = await US.ai.json({ system: [{ text: rules(m.kind), cache: '1h' }], user: [{ text: c.outline, cache: '1h' }, c.firstUser], turns: c.turns, schema: PLAN_SCHEMA, maxTokens: 6000, effort: 'medium', feature: 'Ask › Edit' });
    c.lastAnswer = JSON.stringify(r || {});
    await readOthers(job, r, c);
    return { conv: c, plan: checkPlan(r, c.model, c.others) };
  }
  /** Read the other sequences the AI's steps name (once per conversation, until something changes them). */
  async function readOthers(job, r, c) {
    if (!c.others) c.others = new Map();
    const want = [];
    for (const st of (r && r.steps) || []) {
      const sq = st.op === 'append' ? null : parseJson(st.sequencesJson);
      if (sq) for (const x of pickSequences(c.model.project, sq).seqs) if (!c.others.has(x.seqId) && !want.some(w => w.seqId === x.seqId)) want.push(x);
    }
    let k = 0;
    for (const x of want.slice(0, 300)) {
      job && job.set({ who: 'premiere', msg: `Reading “${x.name}”` }).progress(k++ / want.length, `${k} of ${want.length}: ${x.name}`);
      try { c.others.set(x.seqId, timelineModel(await US.host.call('editRead', { seqId: x.seqId }), null)); } catch (e) { /* a sequence that won't read is left out */ }
    }
  }
  const scopeLabel = (scope, m) => (scope.where === 'bin' ? `the bin “${scope.binName || ''}”` : scope.where === 'project' ? 'the whole project' : scope.where === 'selection' ? `the clips selected in “${m.seq ? m.seq.name : ''}”` : scope.where === 'transcripts' ? `the transcript lines heard in “${m.seq ? m.seq.name : ''}”` : `the sequence “${m.seq ? m.seq.name : ''}”`);

  /** A clip or line target → the clips under it (for edits that need clips), or itself. */
  /**
   * A clip or line target → the clips under it (for edits that need clips), or itself. cutAt: times the plan cuts at
   * first – a line cut out of its clip stands for just that piece (so "cut around Ruth's line and delete it" deletes the
   * line, not what came before it).
   */
  function clipTargets(m, step, cutAt = []) {
    if (!step.targets[0] || !step.targets[0].line || /^(marker|text|razor)$/.test(step.op)) return step.targets;
    const out = [], seen = new Set(), cut = x => cutAt.some(c => Math.abs(c - x) < 0.02);
    for (const t of step.targets) for (const c of m.clips) {
      if (!(c.start < t.end - 0.05 && c.end > t.start + 0.05)) continue;
      const a = cut(t.start) && t.start > c.start ? t.start : c.start, b = cut(t.end) && t.end < c.end ? t.end : c.end, k = `${c.id}@${a.toFixed(2)}`;
      if (seen.has(k)) continue; seen.add(k);
      out.push({ kind: c.kind, track: c.track, start: a, end: b, id: c.id, name: c.name });
    }
    return out;
  }
  const fill = (tpl, t, n) => String(tpl || '').replace(/\{n\}/g, String(n)).replace(/\{name\}/g, t.name || '').replace(/\{speaker\}/g, t.speaker || '').replace(/\{says\}/g, (t.says || t.text || '').slice(0, 80));

  /**
   * Run a plan. Timeline edits go on a copy of the sequence ("<name> – Ask") unless copy is false; project edits
   * remember what they changed, for Undo. -> {summary, results:[{step, done, skipped, unsupported, why}], seqId, undo}
   */
  async function run(job, conv, steps, opts = {}) {
    const appends = steps.filter(x => x.op === 'append'), multi = steps.filter(x => x.multi), rest = steps.filter(x => x.op !== 'append' && !x.multi);
    let out = { summary: '', results: [] }, placed = [];
    if (appends.length) { const a = await runAppends(job, appends); placed = a.placed; out = { summary: a.summary, results: a.results }; }
    if (multi.length) { const x = await runMulti(job, multi); out = { summary: [out.summary, x.summary].filter(Boolean).join(' · '), results: out.results.concat(x.results), multi: true }; conv.others = new Map(); }
    if (rest.length) { const r = await runSteps(job, conv, rest, opts); out = Object.assign({}, r, { summary: [out.summary, r.summary].filter(Boolean).join(' · '), results: out.results.concat(r.results) }); }
    if (placed.length) out.unplace = placed;
    return out;
  }

  /**
   * "append" steps: the clip at the end of each sequence, in the sequence itself (the editor confirmed that). Comes back
   * to the sequence that was open. -> {summary, results, placed:[{seqId, name, start, end, v, a, video, audio}]}
   */
  async function runAppends(job, steps) {
    const results = [], placed = [], back = US.ctx.sequence && US.ctx.sequence.id;
    try {
      for (const st of steps) {
        const p = st.params, r = { step: st, done: 0, skipped: [] };
        const info = (await US.host.call('itemsInfo', { ids: [p.clipId] }))[0];
        if (!info) { results.push(Object.assign(r, { unsupported: true, why: `“${p.clipName}” isn’t in the project any more` })); continue; }
        // the clip's own range (a subclip's part), or all of it; a still gets 5 seconds
        const from = info.rangeStart || 0, len = (info.rangeEnd || info.duration || 0) - from, to = from + (len > 0.01 ? len : 5);
        let k = 0;
        for (const t of st.targets) {
          job.check();
          k++; job.set({ who: 'premiere', msg: `Adding “${p.clipName}” to “${t.name}”` }).progress((k - 1) / st.targets.length, `${k} of ${st.targets.length}: ${t.name}`);
          try {
            const cursor = p.gap ? (await US.host.call('sequenceInfo', { seqId: t.seqId })).duration + p.gap : null;
            // picture only: its sound is laid on A1 past the end and taken off again, so no empty audio track is made for it
            const res = await US.host.call('placeClips', Object.assign({ seqId: t.seqId, clips: [{ id: p.clipId, in: from, out: to, v: p.v || 0, a: p.audio ? p.a || 0 : 0, video: p.video !== false, audio: !!p.audio }] }, cursor != null ? { cursor } : {}));
            const got = res && res.placed && res.placed[0];
            if (got) { r.done++; placed.push({ seqId: t.seqId, name: t.name, start: got.start, end: got.end, v: p.v || 0, a: p.a || 0, video: p.video !== false, audio: !!p.audio }); }
            else r.skipped.push({ why: `not placed in “${t.name}”` });
          } catch (e) { r.skipped.push({ why: `${t.name}: ${(e && (e.title || e.message)) || e}` }); }
        }
        results.push(r);
      }
    } finally { if (back) await US.host.call('openSequence', { seqId: back }).catch(() => {}); }
    const done = US.sum(results.map(r => r.done || 0)), skipped = US.sum(results.map(r => (r.skipped || []).length));
    US.log(skipped ? 'warn' : 'ok', `Ask › Edit: added to ${US.plural(done, 'sequence')}`, results.map(r => `${describe(r.step)}: ${r.unsupported ? r.why : `${r.done} done${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped.slice(0, 3).map(x => x.why).join('; ')})` : ''}`}`).concat(placed.map(x => `  “${x.name}” ${fmtT(x.start)}–${fmtT(x.end)}`)).join('\n'), 'assistant');
    return { summary: `Added to ${US.plural(done, 'sequence')}${skipped ? ` · ${skipped} not added` : ''}`, results, placed };
  }
  /**
   * Edits in other sequences, made in each sequence itself (the editor confirmed that), one sequence at a time, the
   * safe order within each (cuts first, deletes last). Comes back to the sequence that was open. -> {summary, results}
   */
  async function runMulti(job, steps) {
    const results = steps.map(st => ({ step: st, done: 0, skipped: [] })), back = US.ctx.sequence && US.ctx.sequence.id;
    const seqs = []; for (const st of steps) for (const x of st.perSeq) if (!seqs.some(y => y.seqId === x.seqId)) seqs.push({ seqId: x.seqId, name: x.name });
    const tg = t => ({ kind: t.kind, track: t.track, start: t.start, end: t.end });
    try {
      for (let k = 0; k < seqs.length; k++) {
        job.check();
        const { seqId, name } = seqs[k];
        job.set({ who: 'premiere', msg: `Editing “${name}”` }).progress(k / seqs.length, `${k + 1} of ${seqs.length}: ${name}`);
        for (const st of runOrder(steps)) {
          const part = st.perSeq.find(x => x.seqId === seqId), r = results.find(x => x.step === st);
          if (!part || r.unsupported) continue;
          try {
            if (st.op === 'rename' || st.op === 'text') {
              let n = 0;
              for (const t of part.targets) { n++; const x = await US.host.call('editApply', { seqId, op: st.op, params: Object.assign({}, st.params, st.op === 'rename' ? { name: fill(st.params.name, t, n) } : { text: fill(st.params.text, t, n) }), targets: [tg(t)] }); r.done += x.done || 0; r.skipped.push(...(x.skipped || [])); if (x.unsupported) { r.unsupported = true; r.why = x.why; break; } }
            } else {
              const x = await US.host.call('editApply', { seqId, op: st.op, params: st.params, targets: part.targets.map(tg) });
              r.done += x.done || 0; r.skipped.push(...(x.skipped || [])); if (x.unsupported) { r.unsupported = true; r.why = x.why; }
            }
          } catch (e) { r.skipped.push({ why: `${name}: ${(e && (e.title || e.message)) || e}` }); }
        }
      }
    } finally { if (back) await US.host.call('openSequence', { seqId: back }).catch(() => {}); }
    const done = US.sum(results.map(r => r.done || 0)), skipped = US.sum(results.map(r => r.skipped.length));
    US.log(skipped ? 'warn' : 'ok', `Ask › Edit: ${US.plural(done, 'change')} in ${US.plural(seqs.length, 'sequence')}`, results.map(r => `${describe(r.step)}: ${r.unsupported ? r.why : `${r.done} done${r.skipped.length ? `, ${r.skipped.length} skipped (${[...new Set(r.skipped.map(x => x.why))].slice(0, 3).join('; ')})` : ''}`}`).concat(seqs.map(x => '  ' + x.name)).join('\n'), 'assistant');
    return { summary: `${US.plural(done, 'change')} in ${US.plural(seqs.length, 'sequence')}${skipped ? ` · ${skipped} skipped` : ''}`, results };
  }
  /** Take appended clips out again (exactly what runAppends placed, nothing else moves). -> clips removed */
  async function unplace(list) {
    let n = 0;
    for (const x of list) {
      const targets = [];
      if (x.video !== false) targets.push({ kind: 'video', track: x.v, start: x.start, end: x.end });
      if (x.audio) targets.push({ kind: 'audio', track: x.a, start: x.start, end: x.end });
      const r = await US.host.call('editApply', { seqId: x.seqId, op: 'remove', params: { ripple: false }, targets });
      n += (r && r.done) || 0;
    }
    return n;
  }

  async function runSteps(job, conv, steps, { copy = true } = {}) {
    const m = conv.model, results = [], undo = [];
    if (m.kind === 'items') {
      for (const s of steps) {
        job.check();
        job.set({ who: 'premiere', msg: describe(s) });
        const ids = s.targets.map(t => t.itemId), r = { step: s, done: 0, skipped: [] };
        if (s.op === 'label') {
          undo.push({ op: 'label', items: s.targets.map(t => ({ id: t.itemId, label: (m.items.find(i => i.itemId === t.itemId) || {}).label })) });
          r.done = await US.host.call('setLabels', { items: ids.map(id => ({ id, label: Number(s.params.label) })) });
        } else if (s.op === 'rename') {
          let n = 0;
          for (const t of s.targets) { n++; undo.push({ op: 'rename', id: t.itemId, name: t.name }); await US.host.call('renameItem', { id: t.itemId, name: fill(s.params.name, t, n) }); r.done++; }
        } else if (s.op === 'move') {
          undo.push({ op: 'move', items: s.targets.map(t => ({ id: t.itemId, bin: (m.items.find(i => i.itemId === t.itemId) || {}).bin })) });
          await US.host.call('moveItems', { ids, binPath: String(s.params.bin || 'Ask').replace(/\s*\/\s*/g, '/') }); r.done = ids.length;
        } else if (s.op === 'marker') {
          for (const t of s.targets) { await US.host.call('addClipMarkers', { id: t.itemId, markers: [{ start: 0, end: 0, name: s.params.name || 'Ask', comment: s.params.comment || '', color: s.params.color != null ? s.params.color : 6 }] }); r.done++; }
        } else if (s.op === 'sequence') {
          const seq = await US.host.call('newSequence', { name: s.params.name || 'Ask', binPath: 'JMG Ultra Studio/Ask', likeId: ids[0] });
          const info = await US.host.call('itemsInfo', { ids });
          const placed = await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: info.map((it, k) => it && { id: ids[k], in: it.rangeStart || 0, out: it.rangeEnd || it.duration }).filter(Boolean) });
          r.done = (placed.placed || []).length; r.seqId = seq.id;
        }
        results.push(r);
      }
      return { summary: results.map(r => `${describe(r.step)}: ${r.done} done`).join(' · '), results, undo };
    }
    // timeline: on a copy unless asked otherwise – made once per conversation; later rounds edit the same copy
    let seqId = conv.workSeqId || m.seq.id, copyName = conv.workSeqName || '';
    if (copy && !conv.workSeqId) {
      job.set({ who: 'premiere', msg: 'Making a copy of the sequence to work on' });
      const c = await US.host.call('cloneSequence', { seqId, name: `${m.seq.name} – Ask`, binPath: 'JMG Ultra Studio/Ask' });
      seqId = c.id; copyName = c.name; conv.workSeqId = c.id; conv.workSeqName = c.name;
    }
    // the plan's cuts first; every delete in one batch from the end, so one deletion can't move another's clips
    const cutAt = steps.filter(s => s.op === 'razor').flatMap(s => s.targets.flatMap(t => [t.start, t.end]).filter(x => x != null));
    let order = runOrder(steps);
    const removes = order.filter(s => s.op === 'remove');
    if (removes.length > 1) {
      const rippled = removes.some(s => s.params && s.params.ripple);
      order = order.filter(s => s.op !== 'remove').concat([Object.assign({}, removes[0], { params: Object.assign({}, removes[0].params, { ripple: rippled }), targets: removes.flatMap(s => clipTargets(m, s, cutAt)), merged: removes })]);
    }
    for (let i = 0; i < order.length; i++) {
      job.check();
      const s = order[i], targets = s.merged ? s.targets : clipTargets(m, s, cutAt);
      job.set({ who: 'premiere', msg: describe(s) }).progress(i / order.length, `${i + 1} of ${order.length}: ${describe(s)}`);
      let n = 0;
      const params = s.op === 'rename' || s.op === 'text' ? null : s.params;
      let r;
      if (params) r = await US.host.call('editApply', { seqId, op: s.op, params, targets: targets.map(t => ({ kind: t.kind, track: t.track, start: t.start, end: t.end })) });
      else {
        // per target: names and text can use the clip's or line's own words
        r = { done: 0, skipped: [], log: [] };
        for (const t of targets) { n++; const x = await US.host.call('editApply', { seqId, op: s.op, params: Object.assign({}, s.params, s.op === 'rename' ? { name: fill(s.params.name, t, n) } : { text: fill(s.params.text, t, n) }), targets: [{ kind: t.kind, track: t.track, start: t.start, end: t.end }] }); r.done += x.done; r.skipped.push(...x.skipped); if (x.unsupported) { r = x; break; } }
      }
      if (s.merged) s.merged.forEach((x, k) => results.push(Object.assign({ step: x }, k ? { done: 0, skipped: [], note: 'with the deletes above' } : r)));
      else results.push(Object.assign({ step: s }, r));
    }
    await US.host.call('openSequence', { seqId }).catch(() => {});
    const done = US.sum(results.map(r => r.done || 0)), skipped = US.sum(results.map(r => (r.skipped || []).length));
    US.log(skipped ? 'warn' : 'ok', `Ask › Edit${copyName ? ` in “${copyName}”` : ''}: ${done} changes`, results.map(r => `${describe(r.step)}: ${r.unsupported ? r.why : `${r.done} done${r.skipped && r.skipped.length ? `, ${r.skipped.length} skipped (${[...new Set(r.skipped.map(x => x.why))].slice(0, 3).join('; ')})` : ''}`}`).join('\n'), 'assistant');
    return { summary: `${US.plural(done, 'change')}${copyName ? ` in the copy “${copyName}”` : ''}${skipped ? ` · ${skipped} skipped` : ''}`, results, seqId, copy: !!copy, copyName };
  }

  /** Put project edits back (labels, names, bins). */
  async function undoItems(undo) {
    for (const u of undo.slice().reverse()) {
      if (u.op === 'label') await US.host.call('setLabels', { items: u.items.filter(x => x.label != null).map(x => ({ id: x.id, label: x.label })) });
      else if (u.op === 'rename') await US.host.call('renameItem', { id: u.id, name: u.name });
      else if (u.op === 'move') for (const x of u.items) if (x.bin) await US.host.call('moveItems', { ids: [x.id], binPath: x.bin.replace(/\s*\/\s*/g, '/') });
    }
  }

  /**
   * Stage 2: read what the edit did and let the AI check it against the request; it says whether that's done and
   * plans anything still missing (shown to the editor before it runs). -> {conv, plan}
   */
  async function check(job, conv, outcome) {
    const lines = outcome.results.map(r => `- ${describe(r.step)}: ${r.unsupported ? 'NOT DONE – ' + r.why : `${r.done} done${r.skipped && r.skipped.length ? `, ${r.skipped.length} skipped: ${[...new Set(r.skipped.map(x => x.why))].slice(0, 4).join('; ')}` : ''}`}`);
    let after = '';
    if (outcome.unplace) { try { conv.model.project = projectModel(await US.host.call('editProject', {})); } catch (e) { /* keep the old list */ } }
    if (conv.model.kind === 'timeline' && outcome.seqId) {
      try {
        const info = await US.host.call('editRead', { seqId: outcome.seqId });
        // what is heard now (times move when something was deleted or sped up), so a further step lands where it should
        let heard = null;
        try { if (US.story && US.story.timelineTranscript && conv.model.lines.length) { const tl = await US.story.timelineTranscript(null, { seqId: outcome.seqId }), names = US.story.namesFor ? US.story.namesFor(tl) : new Map(); heard = tl.result.entries.map(e => Object.assign({}, e, { speaker: names.get(e.speakerKey) || e.speaker })); } } catch (e) { heard = null; }
        const m2 = timelineModel(info, heard);
        m2.scope = conv.model.scope; conv.model = m2;
        after = `\nThe sequence now (${m2.clips.length} clips, ${fmtT(m2.seq.duration)}):\n` + outline(m2).split('\n').slice(0, 400).join('\n');
      } catch (e) { after = ''; }
    }
    conv.pendingResult = `RESULT of your plan${outcome.copyName ? ` (run on the copy “${outcome.copyName}”)` : ''}:\n${lines.join('\n')}${after}`;
    return plan(job, { request: 'Check the result against what I asked. If it’s all done, set done: true and say so briefly. If something is missing or a step failed, plan only the steps still needed (they will run on the same sequence).', scope: conv.scope, conv });
  }

  /* ---------- an action, so Anything can hand edits over ---------- */
  US.actions.register({
    id: 'edit.ask', tool: 'assistant', title: 'Edit the timeline or project from a request', changes: true,
    describe: 'Plans edits from a plain-English request: transitions, effects, speed, framing, slow zooms, volume, labels, markers, text, cuts, deleting, renaming, moving clips to bins, a new sequence – on the open sequence (or its selected clips, transcript lines, a bin or the whole project) – and adding a clip (a logo, an end card) to the end of many sequences at once. Asks when it isn’t sure which clip, sequences or track. Shown for checking before it runs; sequence edits run on a copy, except adding to sequences, which you confirm first.',
    params: { request: { type: 'string', default: '', desc: 'The edit, in the editor’s words' }, where: { type: 'string', default: 'sequence', options: ['sequence', 'selection', 'transcripts', 'bin', 'project'], desc: 'Where to act' } },
    examples: ['add a cross dissolve to every clip on V1', 'punch in 110% on every interview answer', 'colour all the drone clips green', 'put the logo at the end of every sequence in the Shorts bin'],
    match: t => (/\b(add|put|insert|append|place)\b/i.test(t) && /\b(end|start)\b/i.test(t) && /\bsequences\b|\btimelines\b|\b(every|each|all)\b[^.]*\b(sequence|timeline)s?\b/i.test(t) ? { request: t, _score: 2.4 } : null) || (/\b(dissolve|transition|fade|punch.?in|zoom|ken burns|blur|lumetri|effect|speed|slow.?mo|opacity|scale|label|colour|color|rename|razor|ripple)\b/i.test(t) && /\b(every|each|all|clips?|shots?)\b/i.test(t) ? { request: t, _score: 2.2 } : null),
    run: async () => ({ summary: 'Open Ask › Edit to plan this.' })
  });

  US.editAsk = { OPS, opsFor, timelineModel, itemsModel, projectModel, outline, select, checkPlan, appendStep, pickSequences, readOthers, trackIndex, unplace, QUESTION_KINDS, runOrder, describe, rules, read, plan, run, check, undoItems, clipTargets, PLAN_SCHEMA, scopeLabel, recent: store };
})();
