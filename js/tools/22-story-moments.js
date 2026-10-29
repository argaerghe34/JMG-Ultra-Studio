/* JMG Ultra Studio – Story › Moments (S5). Pure logic (unit-tested); the screen is in 22-story.js.
   Finds bloopers, funny bits, off-camera voices and poignant moments from what the transcripts say and how they're timed:
   restarts and retakes, stumbles, crew chatter (“are we rolling?”), laughter, swearing, a second voice in a clip, the
   interviewer reacting, long pauses mid-thought and emotional language. With AI, each candidate (with a line either side)
   is checked and classified – text only. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  /** label = Premiere label colour (board groups), marker = the nearest sequence marker colour (0 green 1 red 2 purple 3 orange 4 yellow 5 white 6 blue 7 cyan) */
  const TYPES = {
    funny: { name: 'Funny', plural: 'Funny', label: 7, marker: 3 }, // Mango / orange
    blooper: { name: 'Blooper', plural: 'Bloopers', label: 6, marker: 1 }, // Rose / red
    'off-camera': { name: 'Off camera', plural: 'Off camera', label: 10, marker: 7 }, // Teal / cyan
    poignant: { name: 'Poignant', plural: 'Poignant', label: 8, marker: 2 } // Purple / purple
  };
  const ORDER = ['funny', 'blooper', 'off-camera', 'poignant'];

  // a restart, not ordinary speech: “sorry”, “wait”, “start again” only as a clause of their own (“I'm so sorry I wasn't
  // there”, “we had to start again”, “there was no wait” aren't), and “from the top”, “where was I” only ending one
  // (“where was I born?”, “take two tablets” aren't)
  const RESTART = new RegExp([
    String.raw`\b(let me (start|say|try|do) (that|this|it)? ?(again|over)|(can|could|shall|should) i (start|say|do|try) (that|this|it)? ?(again|over)|let me rephrase|i('ll| will) start again|i messed (that|it) up|i('ve| have) lost my (train of thought|thread)|what was i (saying|going to say)|scratch that)\b`,
    String.raw`(?<=^|[.,;:!?…—–-]\s*)(start(ing)? (again|over)|sorry,? (sorry|let me|can i|what)|oh,? sorry|wait,? (no|sorry)|no,? (wait|sorry))\b`,
    String.raw`\b(from the top|take two|one more time|where was i|i('ll| will) say (it|that) again)(?=\s*([.?!;:…—–-]|$))`
  ].join('|'), 'i');
  const CHATTER = /\b(is it recording|are we (rolling|recording|good|ok|okay)|is (this|that|it) (on|rolling)|are you recording|still recording|stop recording|can (we|you) cut|you can cut (that|this)|cut (that|this) (out|bit)|edit (that|this) out|don'?t use (that|this)|off the record|was that (ok|okay|alright|all right|good|fine)|is that (ok|okay|alright|all right) for you|do i look at (you|the camera)|(look|looking) (at|into) the camera|should i look|how do i look|my hair|the (mic|microphone)|(can|shall) i (begin|go|start)\??$|do you want me to (say|start|repeat))\b/i;
  const LAUGH_TAG = /[[(*]\s*(laugh(s|ter|ing)?|chuckles?|giggles?)\s*[\])*]|\b(ha ?ha(ha)*|he ?he(he)*|lol)\b/i;
  const LAUGH_WORDS = /\b(i'?m (only )?joking|just kidding|(that'?s|it was|so) (so )?(funny|hilarious)|hilarious|we (laughed|were laughing)|made (me|us) laugh|cracking up)\b/i;
  const SWEAR = /\b(f+u+c+k\w*|shit\w*|bullshit|damn(ed)?|goddamn|bloody|bugger\w*|crap|bollocks|arse\w*|piss(ed)?|christ almighty|jesus christ)\b|\*{2,}|\[\s*_+\s*\]/i;
  const DOUBLES_OK = new Set(['very', 'so', 'really', 'no', 'yes', 'yeah', 'bye', 'ha', 'he', 'had', 'that', 'is', 'well', 'many', 'more', 'long', 'far', 'much', 'go', 'come', 'again', 'tut', 'knock', 'chop', 'pretty', 'step', 'over', 'round', 'on', 'little', 'ever', 'only', 'one', 'two', 'by', 'after', 'day', 'year', 'side', 'time']);

  // emotional weight of a line, 0..1 (also the narrative's “most heartfelt” line)
  const HEART_STRONG = /\b(cried|cry|crying|tears|wept|weep|sobb?(ed|ing)?|heartbr(oken|eaking)|broke my heart|passed away|died|death|funeral|grie(f|ving|ve)|never forget|emotional|chok(e|ed|ing) up|goosebumps|miracle|survived|devastat(ed|ing)|lump in my throat|meant the world|saved my life|the hardest)\b/gi;
  const HEART_MED = /\b(miss(ed)?|love(d)?|proud|grateful|thankful|blessed|scared|afraid|frightened|terrified|alone|lonely|hope|heart|lost|losing|painful|pain|hurt|forgive(n|ness)?|gone|thank god|so lucky|together again|first time|last time)\b/gi;
  function heart(text) {
    const s = String(text || '');
    let keep = 1;
    for (const m of s.match(HEART_STRONG) || []) keep *= 0.68;
    for (const m of s.match(HEART_MED) || []) keep *= 0.85;
    return Math.round((1 - keep) * 1000) / 1000;
  }
  /** Repeated words: “I I I”, “the the”. -> [“the the”, …] */
  function stumbles(text) {
    const out = [], re = /\b([a-z']+)\b(?:[\s,.…-]+\1\b)+/gi;
    let m;
    // “Education, education, education.” is said on purpose: a long word repeated with punctuation between isn't a stumble
    while ((m = re.exec(text))) if (!DOUBLES_OK.has(m[1].toLowerCase()) && !(m[1].length > 4 && /[,.…-]/.test(m[0]))) out.push(m[0].replace(/\s+/g, ' '));
    return out;
  }
  const straight = s => String(s || '').replace(/[’‘`]/g, "'");   // the patterns here are written with '
  const norm = s => straight(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const firstWords = (s, n) => norm(s).split(' ').slice(0, n).join(' ');
  const quote = (s, n = 6) => { const w = String(s).replace(/\s+/g, ' ').trim().split(' '); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
  const combine = ws => 1 - ws.reduce((k, w) => k * (1 - w), 1);
  const PLAIN = new Set('that this they there their there\'s them then than what which with from have been were will would could should just like really very your about into some more also because when where while being does done much many make made know think thing things going said says'.split(' '));
  // trailing off (“And the best part was…”) doesn't end a sentence
  const endsSentence = s => { s = String(s || '').trim(); return /[.?!…]["”')\]]?$/.test(s) && !/(…|\.{2,})["”')\]]?$/.test(s); };
  /** A retake, not a speaker who likes repeating an opening (“It's going to engage you… It's going to engage you…”):
      the same first three words, and the first line is cut off or very short, or the next one says much of it again. */
  function isRetake(text, nextText) {
    const a = norm(text).split(' '), b = norm(nextText).split(' ');
    if (a.length < 3 || a.slice(0, 3).join(' ') !== b.slice(0, 3).join(' ') || norm(text) === norm(nextText)) return false;
    if (!endsSentence(text) || a.length <= 4) return true;
    // compare the words that carry meaning (“to”, “for”, “have” say nothing about a retake)
    const content = w => w.length >= 4 && !PLAIN.has(w);
    const like = (w, x) => w.slice(0, 5) === x.slice(0, 5) || (w.length >= 6 && x.includes(w.slice(0, 6))) || (x.length >= 6 && w.includes(x.slice(0, 6)));   // strength ~ strengthened, conceptions ~ preconceptions
    const rest = a.slice(3).filter(content), pool = b.slice(3, a.length + 3).filter(content);
    if (!rest.length) return false;
    let hit = 0; for (const w of rest) { const i = pool.findIndex(x => like(w, x)); if (i >= 0) { hit++; pool.splice(i, 1); } }
    return hit / rest.length >= 0.6;
  }

  /** Who is the main voice of a transcript, and which other voices sound like the interviewer (name, or mostly questions). */
  function voices(lines) {
    const talk = new Map(), qs = new Map(), n = new Map();
    for (const l of lines) {
      talk.set(l.speaker, (talk.get(l.speaker) || 0) + (l.end - l.start));
      n.set(l.speaker, (n.get(l.speaker) || 0) + 1);
      if (/\?["”')]?\s*$/.test(l.text)) qs.set(l.speaker, (qs.get(l.speaker) || 0) + 1);
    }
    const main = Array.from(talk.entries()).sort((a, b) => b[1] - a[1])[0];
    const interviewer = new Set();
    for (const s of talk.keys()) if (s !== (main && main[0]) && (T().isInterviewerLabel(s) || (qs.get(s) || 0) / n.get(s) >= 0.4)) interviewer.add(s);
    if (main && T().isInterviewerLabel(main[0])) interviewer.add(main[0]);
    return { main: main ? main[0] : null, interviewer };
  }

  /**
   * Cues on one line. ctx: {prev, next, main, interviewer:Set, speakerName, strength}. -> [{kind, type, w, why}]
   */
  function cues(l, { prev = null, next = null, main = null, interviewer = new Set(), speakerName = s => s || 'someone', strength = 0.5 } = {}) {
    const out = [], text = straight(l.text), add = (kind, type, w, why) => out.push({ kind, type, w, why });
    let m;
    const from = (m, n = 5) => quote(text.slice(m.index), n).replace(/[.,;:!?]+(…?)$/, '$1');
    if ((m = RESTART.exec(text))) add('restart', 'blooper', 0.75, `Starts again (“${from(m)}”)`);
    if (next && next.speaker === l.speaker && isRetake(text, next.text)) add('retake', 'blooper', 0.7, 'Says it again in the next line (a retake)');
    // “and, and” and “my my” are how people talk: only real stammering counts on its own; lighter stumbles back up other signs
    const st = stumbles(text), reps = x => x.split(/[\s,.…-]+/).filter(Boolean).length;   // “I I I” and “I-I-I”
    const heavy = st.length >= 4 || st.some(x => reps(x) >= 4);
    if (heavy || st.length >= 2 || st.some(x => reps(x) >= 3)) add('stumble', 'blooper', heavy ? 0.45 : st.length >= 3 ? 0.3 : 0.15, `Stumbles (“${st[0]}”)`);
    if ((m = CHATTER.exec(text))) add('chatter', 'blooper', 0.8, `Talks to the crew (“${m[0]}”)`);
    else if (/\bcut\b/i.test(text) && norm(text).split(' ').length <= 4) add('chatter', 'blooper', 0.6, '“Cut”');
    if ((m = LAUGH_TAG.exec(text))) add('laugh', 'funny', 0.8, `Laughter (“${m[0].replace(/[[\]()*]/g, '').trim()}”)`);
    else if ((m = LAUGH_WORDS.exec(text))) add('laugh', 'funny', 0.45, `Laughter in the words (“${m[0]}”)`);
    if ((m = SWEAR.exec(text))) add('swear', 'blooper', 0.6, /^\*|\[/.test(m[0]) ? 'Swears (bleeped in the transcript)' : `Swears (“${m[0]}”)`);
    if (main != null && l.speaker !== main) {
      const words = norm(text).split(' ').length;
      if (interviewer.has(l.speaker)) {
        const between = prev && next && prev.speaker === main && next.speaker === main;
        if (between && words <= 8 && (words <= 3 || !/\?["”')]?\s*$/.test(text))) add('interject', 'off-camera', 0.55, `${speakerName(l.speaker)} reacts off camera (“${quote(text)}”)`);
      } else if (!prev || prev.speaker !== l.speaker) add('voice', 'off-camera', 0.65, `A second voice joins in – ${speakerName(l.speaker)}`);
    }
    // a long pause mid-thought: between two lines of the same voice, or between words of one line
    let gap = 0;
    if (next && next.speaker === l.speaker && !endsSentence(text)) gap = next.start - l.end;
    if (l.w && T().wordTimes) { const ws = T().wordTimes(l).words; for (let i = 1; i < ws.length; i++) if (!endsSentence(ws[i - 1].text)) gap = Math.max(gap, ws[i].s - ws[i - 1].e); }
    const h = heart(text + ' ' + (gap >= 2 && next ? next.text : ''));
    // a thoughtful pause is normal: only a long one (6 s or more) mid-sentence suggests a lost thread on its own
    if (gap >= 2) add('pause', h >= 0.3 ? 'poignant' : 'blooper', h >= 0.3 ? Math.min(0.7, 0.35 + (gap - 2) * 0.1) : gap < 6 ? 0.15 : Math.min(0.5, 0.3 + (gap - 6) * 0.02), `Pauses ${gap.toFixed(1)} s mid-thought${h >= 0.3 ? '' : ' (lost the thread?)'}`);
    const hl = heart(text);
    if (hl >= 0.3) add('emotion', 'poignant', Math.min(0.95, hl * (0.6 + 0.5 * strength) + 0.1), 'Emotional words');
    return out;
  }
  /** The type a set of cues points to, with its score. */
  function typeOf(cs) {
    const by = {};
    for (const c of cs) (by[c.type] = by[c.type] || []).push(c.w);
    // laughing while swearing or stumbling is usually a funny moment
    if (by.funny && by.blooper) by.funny.push(0.2);
    let best = null;
    for (const t of ORDER) if (by[t]) { const s = combine(by[t]); if (!best || s > best.score) best = { type: t, score: s }; }
    return best;
  }

  /**
   * All moments in these transcripts, best first. transcripts: [{key, name, lines}].
   * -> [{lineId, key, type, score, reasons, cues, by:'basic'}]
   */
  function detect(transcripts, { speakerName, strengthOf = l => T().quality(l).score, min = 0.25 } = {}) {
    const out = [];
    for (const t of transcripts) {
      const lines = t.lines, v = voices(lines);
      lines.forEach((l, i) => {
        const cs = cues(l, { prev: lines[i - 1] || null, next: lines[i + 1] || null, main: v.main, interviewer: v.interviewer, speakerName, strength: strengthOf(l) });
        if (!cs.length) return;
        const best = typeOf(cs);
        if (!best || best.score < min) return;
        out.push({ lineId: l.id, key: t.key, type: best.type, score: Math.round(best.score * 1000) / 1000, reasons: Array.from(new Set(cs.map(c => c.why))), cues: cs.map(c => c.kind), by: 'basic' });
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  const AI_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['moments'],
    properties: { moments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lineId', 'type', 'reason', 'score'], properties: { lineId: { type: 'string' }, type: { type: 'string', enum: ['funny', 'blooper', 'off-camera', 'poignant', 'none'] }, reason: { type: 'string' }, score: { type: 'number' } } } } }
  };
  /** Snippet for the AI: the line with one line either side. */
  function snippet(lineOf, ctxOf, m, speakerName) {
    const l = lineOf(m.lineId), c = ctxOf(m.lineId), say = x => `${speakerName(x.speaker) || '-'}: ${x.text.replace(/\s+/g, ' ').slice(0, 300)}`;
    return `${m.lineId}\t${m.cues.join(',')}\t${c.prev ? say(c.prev) : '(start)'} || ${say(l)} || ${c.next ? say(c.next) : '(end)'}`;
  }
  /**
   * With AI: classify each candidate as funny / blooper / off-camera / poignant / none, with a reason and a score (0..1).
   * Candidates the AI doesn't answer keep their basic classification. Text only.
   */
  /** How many candidates the AI checks at a How picky setting: Everything useful = all, Balanced = 240, Only the best = 120. */
  function capFor(s) { return s < 0.275 ? Infinity : s < 0.65 ? 240 : 120; }
  /**
   * The requests that check these candidates (the best `max`), in batches of `chunk`: [{part, req}]. Used to send them
   * and, before that, to estimate what they cost.
   */
  const MOMENT_TASK = 'Find moments: for each candidate line listed below, decide what it is – funny (a joke, laughter, a funny story), blooper (a restart, stumble, swearing, crew chatter, a mistake), off-camera (someone other than the interviewee speaks or reacts), poignant (a moving, emotional moment), or none (nothing special). Read the lines around it in the transcripts above for context. Give a short reason (a few words) and a score from 0 to 1 for how good a moment it is. Answer for every candidate.';
  function requests(cands, { lineOf, ctxOf, speakerName = s => s, chunk = 60, max = 240, transcripts = null } = {}) {
    const list = cands.slice(0, max), out = [];
    // the shared transcript (cached an hour): the AI already has the context, so it only needs the ids and the cues
    if (transcripts && US.storyContext) {
      const C = US.storyContext, big = Math.max(chunk, 120);
      for (let i = 0; i < list.length; i += big) {
        const part = list.slice(i, i + big);
        for (const b of C.requests(transcripts, { feature: 'Moments', maxTokens: 12000, effort: 'low', task: (k, n) => `${MOMENT_TASK}\nMake one group per type (key = funny, blooper, off-camera, poignant or none); each item is one candidate (“from” and “to” its id; “lead” and “tag” ""; note = the reason; score).${C.partNote(k, n)}\n\nCandidates (id<TAB>cues):\n${part.map(m => `${m.lineId}\t${m.cues.join(',')}`).join('\n')}` })) {
          const ids = new Set(b.lines.map(l => l.id)), mine = part.filter(m => ids.has(m.lineId));
          if (mine.length) out.push({ part: mine, req: b.req });
        }
      }
      return out;
    }
    for (let i = 0; i < list.length; i += chunk) {
      const part = list.slice(i, i + chunk);
      out.push({ part, req: {
        system: 'You help a documentary editor find moments in interview transcripts. For each candidate, decide what it is: funny (a joke, laughter, a funny story), blooper (a restart, stumble, swearing, crew chatter, a mistake), off-camera (someone other than the interviewee speaks or reacts), poignant (a moving, emotional moment), or none (nothing special). The middle part (between || and ||) is the line; the other parts are the lines before and after, for context. Give a short reason (a few words) and a score from 0 to 1 for how good a moment it is. Answer for every id. Use British English.',
        // the batch's snippets first (cached: the same batches come back if you look again straight away), then the task
        user: T().aiUser(`Candidates (id<TAB>cues<TAB>before || LINE || after):\n${part.map(m => snippet(lineOf, ctxOf, m, speakerName)).join('\n')}`, 'Classify every candidate above.'),
        schema: AI_SCHEMA, maxTokens: 6000, effort: 'low', feature: 'Moments'
      } });
    }
    return out;
  }
  async function classifyAI(cands, { lineOf, ctxOf, speakerName = s => s, job, chunk = 60, max = 240, transcripts = null } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    const batches = requests(cands, { lineOf, ctxOf, speakerName, chunk, max, transcripts }), n = Math.min(max, cands.length), out = [];
    let at = 0; batches.forEach(b => { b.from = at; at += b.part.length; });
    for (const b of batches) {
      job && job.check && job.check();
      job && job.set({ who: 'ai', msg: `${US.ai.label()} is checking moments ${b.from + 1}–${b.from + b.part.length} of ${n}` });
      job && job.progress && job.progress(0.15 + 0.8 * b.from / n);
      let r = await US.ai.json(b.req);
      if (r && r.groups) r = { moments: US.storyContext.items(r, new Set(b.part.map(m => m.lineId))).map(x => ({ lineId: x.from, type: x.group.key, reason: x.note, score: x.score })) };
      out.push(...merge(b.part, r));
    }
    return out.concat(cands.slice(max)).sort((a, b) => b.score - a.score);
  }
  /** Apply the AI's answer to a batch: known ids only; 'none' drops the candidate; unanswered ones stay as they were. */
  function merge(part, r) {
    const byId = new Map(part.map(m => [m.lineId, m])), seen = new Map();
    for (const x of (r && r.moments) || []) { const id = String(x.lineId); if (byId.has(id) && !seen.has(id)) seen.set(id, x); }
    const out = [];
    for (const m of part) {
      const x = seen.get(m.lineId);
      if (!x) { out.push(m); continue; }
      if (x.type === 'none' || !TYPES[x.type]) continue;
      const score = Math.max(0, Math.min(1, Number(x.score) || 0));
      out.push(Object.assign({}, m, { type: x.type, score, reasons: [String(x.reason || '').slice(0, 140)].filter(Boolean).concat(m.reasons.slice(0, 1)), by: 'ai' }));
    }
    return out;
  }
  /** Counts per type: {all, funny, blooper, 'off-camera', poignant} */
  function counts(list) { const c = { all: list.length }; for (const t of ORDER) c[t] = list.filter(m => m.type === t).length; return c; }
  /** Markers for the moments heard in a sequence. entries: timeline transcript entries [{lineId, start, end, text}]. */
  function markers(entries, list) {
    const by = new Map(list.map(m => [m.lineId, m])), out = [];
    for (const e of entries) {
      const m = by.get(e.lineId); if (!m) continue;
      out.push({ start: e.start, end: e.end, name: `${TYPES[m.type].name}: ${quote(e.text)}`, comment: m.reasons.join(' · '), color: TYPES[m.type].marker, lineId: m.lineId, type: m.type });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  US.storyMoments = { TYPES, ORDER, heart, stumbles, voices, cues, typeOf, detect, capFor, requests, classifyAI, merge, counts, markers, AI_SCHEMA };
})();
