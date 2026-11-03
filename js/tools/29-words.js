/* JMG Ultra Studio – Word cloud: the words and phrases said most in the interviews (Story's transcripts, the lines
   chosen in What to work on), drawn as a cloud – bigger means said more. Click one to see every time it was said, play
   any of them, and build a sequence of them: just the words (a supercut), the whole line, or the full sentence.
   Counted on this computer from the text; nothing is sent anywhere. Pure logic (unit-tested) first, then the tab. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const T = () => US.transcript;
  const S = () => US.story;

  /* ---------- counting ---------- */
  // fillers and very common talk that would crowd the cloud (on top of the transcript's own stop words)
  const EXTRA_STOP = new Set(('um umm uh uhh er erm ah ahh hmm mm mhm yeah yep nope okay ok oh like just really actually basically literally ' +
    'gonna wanna gotta kinda sorta dunno cause cos lot lots thing things stuff something anything everything nothing someone anyone everyone ' +
    'one two three yes no right well sure maybe probably obviously definitely also even still back way much many more most very quite pretty ' +
    'said says say saying think thought know knew mean meant feel felt went go goes going got get getting come came make made take took ' +
    'want wanted see saw look looked put let lets kind sort bit always never ever every other another because ' +
    'all now after before again around ago being doing done honestly anyway whatever though since until while each both few own here there then').split(' '));
  const isStop = t => T().STOP.has(t) || EXTRA_STOP.has(t);
  /** A line's tokens, each with the word it came from (whitespace words, as wordTimes counts them) and whether a pause
      (punctuation) follows it, so phrases never run across a comma or a full stop. */
  function lineTokens(line) {
    const out = [], words = T().lineWords(line.text);
    words.forEach((w, wi) => {
      const ts = T().tokens(w), brk = /[.,!?;:…—–)"”]$|-$/.test(w);
      ts.forEach((t, k) => out.push({ t, wi, brk: brk && k === ts.length - 1 }));
    });
    return out;
  }
  const bareWord = w => String(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
  /** The key a word or phrase is counted under: word forms together (community/communities) unless forms is off. */
  const keyOf = (toks, forms = true) => (toks.length === 1 ? 'w:' : 'p:') + toks.map(t => (forms ? T().stem(t) : t)).join(' ');
  /** The key for something typed in the search box. */
  const keyForText = (text, forms = true) => { const ts = T().tokens(text); return ts.length ? keyOf(ts, forms) : ''; };
  const usable = (t, minLen) => t.length >= minLen && !isStop(t) && !/^\d+$/.test(t) && !/'/.test(t);

  /**
   * The words and phrases said most in lines. -> [{key, kind: 'word'|'phrase', text, n, lines, interviews}], most said
   * first. forms: count word forms together; phrases: 2–3 word phrases too (said in at least two lines); hidden: keys
   * left out; interviewOf(line): which interview a line is from (for the spread).
   */
  function count(lines, { forms = true, phrases = true, minLen = 3, minCount = 2, hidden = [], max = 80, interviewOf = () => '' } = {}) {
    const all = new Map(), hide = new Set(hidden);
    const add = (key, kind, surface, line) => {
      let x = all.get(key);
      if (!x) all.set(key, x = { key, kind, n: 0, forms: new Map(), lineSet: new Set(), ivSet: new Set() });
      x.n++; x.forms.set(surface, (x.forms.get(surface) || 0) + 1); x.lineSet.add(line.id); x.ivSet.add(interviewOf(line));
    };
    for (const line of lines) {
      const toks = lineTokens(line), words = T().lineWords(line.text);
      for (let i = 0; i < toks.length; i++) {
        const a = toks[i];
        if (usable(a.t, minLen)) add(keyOf([a.t], forms), 'word', a.t, line);
        if (!phrases) continue;
        for (let n = 2; n <= 3; n++) {
          const part = toks.slice(i, i + n);
          if (part.length < n || part.slice(0, -1).some(x => x.brk)) break;
          const first = part[0].t, last = part[n - 1].t;
          if (!usable(first, 2) || !usable(last, 3) || part.some(x => EXTRA_STOP.has(x.t) && !T().STOP.has(x.t)) || first === last) continue;
          const surface = words.slice(part[0].wi, part[n - 1].wi + 1).map(bareWord).join(' ').toLowerCase();
          add(keyOf(part.map(x => x.t), forms), 'phrase', surface, line);
        }
      }
    }
    let items = Array.from(all.values()).filter(x => !hide.has(x.key) && x.n >= minCount && (x.kind === 'word' || (x.lineSet.size >= 2 && x.n >= Math.max(3, minCount))));
    // a two-word phrase that's nearly always part of a longer one ("the local" in "the local community") goes
    const long = items.filter(x => x.kind === 'phrase' && x.key.split(' ').length === 3);
    items = items.filter(x => !(x.kind === 'phrase' && x.key.split(' ').length === 2 && long.some(y => y.n >= x.n * 0.75 && (y.key.startsWith(x.key + ' ') || y.key.endsWith(' ' + x.key.slice(2))))));
    items.sort((a, b) => b.n - a.n || b.lineSet.size - a.lineSet.size || a.key.localeCompare(b.key));
    // phrases take at most a third of the cloud, so the words still show
    const out = []; let ph = 0;
    for (const x of items) { if (out.length >= max) break; if (x.kind === 'phrase') { if (ph >= Math.ceil(max / 3)) continue; ph++; } out.push(x); }
    return out.map(x => ({ key: x.key, kind: x.kind, text: Array.from(x.forms.entries()).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0], n: x.n, lines: x.lineSet.size, interviews: x.ivSet.size }));
  }

  /**
   * Every time a word or phrase (by key) was said, in the lines given (their order kept).
   * -> [{id, lineId, line, wi0, wi1, start, end, exact, before, hit, after}]; start/end: the words' own times.
   */
  function mentions(lines, key, { forms = true } = {}) {
    if (!key) return [];
    const want = key.slice(2).split(' '), n = want.length, out = [];
    const norm = t => (forms ? T().stem(t) : t);
    for (const line of lines) {
      const toks = lineTokens(line);
      let wt = null;
      for (let i = 0; i + n <= toks.length; i++) {
        let ok = true;
        for (let k = 0; k < n && ok; k++) ok = norm(toks[i + k].t) === want[k] && (k === n - 1 || !toks[i + k].brk);
        if (!ok) continue;
        wt = wt || T().wordTimes(line);
        const wi0 = toks[i].wi, wi1 = toks[i + n - 1].wi, ws = wt.words;
        out.push({ id: `${line.id}@${wi0}`, lineId: line.id, line, wi0, wi1, start: ws[wi0].s, end: ws[wi1].e, exact: wt.exact,
          before: ws.slice(Math.max(0, wi0 - 10), wi0).map(w => w.text).join(' '), hit: ws.slice(wi0, wi1 + 1).map(w => w.text).join(' '), after: ws.slice(wi1 + 1, wi1 + 11).map(w => w.text).join(' ') });
        i += n - 1;
      }
    }
    return out;
  }

  /**
   * One group per word or phrase for Story's builder: its mentions as clips, in the order given. clip: 'words' – just
   * the words, with a little air each side (several mentions in one line make one clip from the first to the last);
   * 'line' – the whole line; 'sentence' – the line run on to the end of its sentence (Story's soundbite rules).
   * -> [{name, label, lineIds, trims, lineMarks, pinned, ideas}]
   */
  function groupsFor(sets, { clip = 'words', before = 0.12, after = 0.22 } = {}) {
    return sets.map((s, si) => {
      const g = { name: `“${s.text}”`, label: s.label != null ? s.label : null, lineIds: [], trims: {}, lineMarks: {}, pinned: new Set(), ideas: [] };
      for (const m of s.mentions) {
        const have = g.lineIds.includes(m.lineId);
        if (!have) g.lineIds.push(m.lineId);
        if (clip === 'words') {
          // evenly spread word times are a guess: more air, so the word isn't clipped
          const b = m.exact ? before : 0.5, a = m.exact ? after : 0.6;
          const st = Math.max(0, m.start - b), en = m.end + a, tr = g.trims[m.lineId];
          g.trims[m.lineId] = tr ? { start: Math.min(tr.start, st), end: Math.max(tr.end, en) } : { start: st, end: en };
        }
        if (!have) g.lineMarks[m.lineId] = { name: `“${s.text}”`.slice(0, 64), comment: m.line.text };
      }
      return g;
    }).filter(g => g.lineIds.length);
  }
  /** Font size for a count: between small and big, on a square-root scale so a few big words don't flatten the rest. */
  const sizeFor = (n, lo, hi, min = 11, max = 34) => (hi <= lo ? (min + max) / 2 : min + (max - min) * Math.sqrt((n - lo) / (hi - lo)));
  /** The cloud's order: biggest in the middle, the rest alternating either side – stable for the same words. */
  function arrange(items) {
    const out = [];
    items.forEach((x, i) => { if (i % 2) out.push(x); else out.unshift(x); });
    return out;
  }

  /**
   * The order mentions are built in: 'said' – as given (interview by interview, in time); 'mix' – taking turns between
   * the people (or interviews) saying it, so one voice doesn't run on – the classic supercut. whoOf(m): who said it.
   */
  function orderMentions(ms, order = 'said', whoOf = m => m.line.speaker) {
    if (order !== 'mix') return ms.slice();
    const by = new Map();
    for (const m of ms) { const k = whoOf(m); if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
    const queues = Array.from(by.values()), out = [];
    while (out.length < ms.length) for (const q of queues) if (q.length) out.push(q.shift());
    return out;
  }
  /** The counts as text to paste (tab between columns) or a .csv: word, kind, times, lines, interviews. */
  function toTable(items, { csv = false } = {}) {
    const cell = v => (csv && /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const rows = [['Word or phrase', 'Kind', 'Times said', 'Lines', 'Interviews']].concat(items.map(x => [x.text, x.kind, x.n, x.lines, x.interviews]));
    return rows.map(r => r.map(cell).join(csv ? ',' : '\t')).join('\n') + '\n';
  }

  /* ---------- running it ---------- */
  const WHO = { everyone: 'Everyone', noInterviewer: 'Everyone but the interviewer' };
  /** The lines to count: Story's What to work on, by speaker. */
  async function linesFor(job, { who = 'noInterviewer' } = {}) {
    if (!S() || !S().linesInScope) throw new US.UserError('NOTHING_FOUND', { title: 'The word cloud reads Story’s transcripts.' });
    S().loadState();
    if (!(S().state().transcripts || []).length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts yet.', action: 'Read or import them in Story › 1 Interviews first.' });
    const lines = await S().linesInScope(job);
    if (who === 'everyone') return lines;
    if (who === 'noInterviewer') return lines.filter(l => !S().isInterviewer(l));
    return lines.filter(l => l.speaker === who);
  }
  const settings = () => ({ forms: US.settings.get('words.forms', true), phrases: US.settings.get('words.phrases', true), hidden: US.settings.get('words.hidden', []), max: US.settings.get('words.max', 80), who: US.settings.get('words.who', 'noInterviewer'), clip: US.settings.get('words.clip', 'words'), order: US.settings.get('words.order', 'said'), view: US.settings.get('words.view', 'cloud') });
  /** Lines in interview order, then time. */
  function inOrder(lines) {
    const ivs = (S().state().transcripts || []).map(t => t.key), at = k => { const i = ivs.indexOf(k); return i < 0 ? 1e9 : i; };
    return lines.slice().sort((a, b) => at((S().interviewOf(a.id) || {}).key) - at((S().interviewOf(b.id) || {}).key) || a.start - b.start);
  }
  /** A sequence of every mention of some words or phrases (one group each). -> buildSequence's result */
  async function build(job, sets, { clip = 'words', order = 'said' } = {}) {
    const groups = groupsFor(sets.map(s => Object.assign({}, s, { mentions: orderMentions(s.mentions, order, m => S().speakerName(m.line.speaker) + '|' + ((S().interviewOf(m.lineId) || {}).key || '')) })), { clip });
    if (!groups.length) throw new US.UserError('NOTHING_FOUND', { title: 'No mentions are ticked.' });
    const look = Object.assign({}, S().lookOptions(), { themeNames: 'none', inOrder: false });
    look.strong = Object.assign({}, look.strong, { first: false, highlight: false });
    if (clip === 'words') look.handles = 0;
    look.bites = Object.assign({}, look.bites, clip === 'sentence' ? { sentences: true } : { sentences: false, minSeconds: 0 }, { noInterviewer: false, why: true });
    const n = sets.reduce((k, s) => k + s.mentions.length, 0);
    const name = `Words – ${sets.map(s => `“${s.text}”`).join(', ')}`.slice(0, 70) + ` (${n})`;
    return S().buildSequence(job, { name, groups, look });
  }

  US.actions.register({
    id: 'words.cloud', tool: 'words', title: 'Show the words said most', changes: false,
    describe: 'Counts the words and phrases said most in the interviews (Story’s transcripts, on this computer) and shows them as a word cloud.',
    examples: ['word cloud', 'what words do they say most', 'most common phrases in the interviews'],
    match: t => (/\bword ?cloud\b/i.test(t) || /\b(most|common|frequent)\b.*\b(words?|phrases?)\b/i.test(t) ? { _score: 2.5 } : null),
    run: async (p, job) => {
      const o = settings(), lines = await linesFor(job, o);
      const items = count(lines, Object.assign({}, o, { interviewOf: l => (S().interviewOf(l.id) || {}).key }));
      US.tools.open('words');
      return { summary: items.length ? `Said most: ${items.slice(0, 6).map(x => `“${x.text}” (${x.n})`).join(', ')}` : 'No word is said more than once.' };
    }
  });
  US.actions.register({
    id: 'words.build', tool: 'words', title: 'Build every time a word is said', changes: true,
    describe: 'A new sequence of every time a word or phrase is said in the interviews – just the words (a supercut), the whole line or the full sentence.',
    params: { text: { type: 'string', default: '', desc: 'The word or phrase' }, order: { type: 'enum', options: ['said', 'mix'], default: 'said', desc: 'As said, or taking turns between the people saying it' }, clip: { type: 'enum', options: ['words', 'line', 'sentence'], default: 'words', desc: 'Just the words, the whole line, or the full sentence' } },
    examples: ['build every time they say “community”', 'supercut of everyone saying amazing', 'a sequence of every mention of hope'],
    match(t) {
      const m = /\b(?:every|each) (?:time|mention)\b.*?\b(?:says?|said|say|saying|mentions?|of)\s+["“']?([^"”']+?)["”']?\s*$/i.exec(t) || /\bsupercut\b.*?\b(?:of|saying|says?)\s+["“']?([^"”']+?)["”']?\s*$/i.exec(t);
      if (!m) return null;
      const text = m[1].replace(/^(?:the (?:word|phrase)|everyone saying|saying)\s+/i, '').replace(/[,;]\s*(?:whole|full|mix|mixed|alternat|taking|take|as said|in order).*$/i, '').trim();
      return text ? { text, order: /\b(mix|mixed|alternat\w*|take turns|back and forth)\b/i.test(t) ? 'mix' : 'said', clip: /\b(sentences?|whole thought)\b/i.test(t) ? 'sentence' : /\b(whole|full) lines?\b/i.test(t) ? 'line' : 'words', _score: 2.6 } : null;
    },
    run: async (p, job) => {
      const o = settings(), lines = inOrder(await linesFor(job, o));
      const ms = mentions(lines, keyForText(p.text, o.forms), o);
      if (!ms.length) throw new US.UserError('NOTHING_FOUND', { title: `“${p.text}” isn’t said in the lines you’re working on.`, action: 'Check the spelling, or choose more interviews in Story › 1 Interviews › What to work on.' });
      return build(job, [{ text: p.text, mentions: ms }], { clip: p.clip, order: p.order });
    }
  });

  /* ---------- the tab ---------- */
  const COLOURS = ['#3d7ff0', '#e2483f', '#3fbf4a', '#f08a24', '#a35bd6', '#18898f', '#c33ea8', '#c9a87f'];
  US.tools.register({
    id: 'words', name: 'Word cloud', short: 'Words', icon: 'cloud', group: 'find', order: 23,
    blurb: 'The words and phrases said most, as a cloud. Click one to see every time it’s said, and build a sequence of them.',
    hostFns: ['storyCue', 'storyPlace', 'newSequence'],
    create() {
      const v = ui.toolView({ icon: 'cloud', title: 'Word cloud', blurb: 'The words and phrases said most in your interviews – bigger means said more. Click one to see every time it’s said and play it; shift-click to pick several. Then build a sequence of them: just the words (a supercut), the whole line, or the full sentence. Counted on this computer from Story’s transcripts – nothing is sent anywhere.' });
      let o = settings(), lines = null, items = [], picked = [], found = new Map(), off = new Set(), stamp = '';
      const save = (k, val) => { US.settings.set('words.' + k, val); o = settings(); };
      const scopeNote = h('div.field-hint'), cloud = h('div.word-cloud'), detail = h('div');
      const whoSel = ui.select({ options: [], value: o.who, onChange: x => { save('who', x); load(); } });
      const search = ui.input({ placeholder: 'Any word or phrase…', onEnter: x => { const k = keyForText(x, o.forms); if (k) { picked = [{ key: k, text: x.trim().toLowerCase() }]; drawDetail(); drawCloud(); } } });

      function fillWho() {
        const sp = Array.from(new Set(((S() && S().state() && S().state().transcripts) || []).flatMap(t => t.lines.map(l => l.speaker)).filter(Boolean)));
        whoSel.setOptions([{ value: 'noInterviewer', label: WHO.noInterviewer }, { value: 'everyone', label: WHO.everyone }].concat(sp.map(s => ({ value: s, label: S().speakerName(s) }))), o.who);
      }
      async function load(job) {
        try {
          lines = await linesFor(job || null, o);
        } catch (e) { lines = null; items = []; US.clear(cloud); cloud.appendChild(ui.note(e.title || e.message, 'info')); if (e.action) cloud.appendChild(h('div.field-hint', e.action)); US.clear(detail); return; }
        recount();
      }
      function recount() {
        items = count(lines, Object.assign({}, o, { interviewOf: l => (S().interviewOf(l.id) || {}).key }));
        found = new Map();
        picked = picked.filter(p => p.custom || items.some(x => x.key === p.key));
        scopeNote.textContent = `${S().scopeLabel()} · ${WHO[o.who] || S().speakerName(o.who)} · ${US.plural(lines.length, 'line')}`;
        drawCloud(); drawDetail();
      }
      function drawCloud() {
        US.clear(cloud);
        if (!items.length) { cloud.appendChild(ui.empty('No word is said more than once in these lines.')); return; }
        const lo = Math.min(...items.map(x => x.n)), hi = Math.max(...items.map(x => x.n)), keys = new Set(picked.map(p => p.key));
        cloud.classList.toggle('as-list', o.view === 'list');
        if (o.view === 'list') items.forEach((x, i) => cloud.appendChild(h('button.word-row' + (keys.has(x.key) ? '.on' : ''), { onclick: e => pick(x, e.shiftKey || e.metaKey || e.ctrlKey), title: `In ${US.plural(x.lines, 'line')}, ${US.plural(x.interviews, 'interview')}` },
          h('span.word-rank', String(i + 1)), h('span.word-name' + (x.kind === 'phrase' ? '.phrase' : ''), x.text), h('span.word-bar', h('span', { style: { width: `${Math.max(4, 100 * x.n / hi).toFixed(0)}%`, background: COLOURS[i % COLOURS.length] } })), h('span.word-n', String(x.n)))));
        else arrange(items).forEach((x, i) => cloud.appendChild(h('button.word' + (x.kind === 'phrase' ? '.phrase' : '') + (keys.has(x.key) ? '.on' : ''), {
          style: { fontSize: `${sizeFor(x.n, lo, hi).toFixed(1)}px`, color: COLOURS[items.indexOf(x) % COLOURS.length] },
          title: `“${x.text}” – said ${US.plural(x.n, 'time')} in ${US.plural(x.lines, 'line')}, ${US.plural(x.interviews, 'interview')}`,
          onclick: e => pick(x, e.shiftKey || e.metaKey || e.ctrlKey)
        }, x.text)));
        const hidden = o.hidden.length;
        if (hidden) cloud.appendChild(h('button.btn.small.ghost.word-unhide', { onclick: () => { save('hidden', []); recount(); } }, `Show ${US.plural(hidden, 'hidden word')} again`));
      }
      function pick(x, add) {
        const i = picked.findIndex(p => p.key === x.key);
        if (add) { if (i >= 0) picked.splice(i, 1); else picked.push({ key: x.key, text: x.text }); } else picked = i >= 0 && picked.length === 1 ? [] : [{ key: x.key, text: x.text }];
        drawCloud(); drawDetail();
      }
      const mentionsOf = p => { if (!found.has(p.key)) found.set(p.key, mentions(inOrder(lines), p.key, o)); return found.get(p.key); };
      function drawDetail() {
        US.clear(detail);
        if (!picked.length || !lines) return;
        const sets = picked.map((p, i) => ({ text: p.text, key: p.key, label: picked.length > 1 ? [9, 6, 5, 7, 8, 2, 11, 12][i % 8] : null, mentions: mentionsOf(p) }));
        const total = sets.reduce((n, s) => n + s.mentions.length, 0);
        const clipSeg = ui.segmented({ value: o.clip, onChange: x => save('clip', x), options: [{ value: 'words', label: 'Just the words', title: 'A supercut: each mention with a little air either side' }, { value: 'line', label: 'Whole line' }, { value: 'sentence', label: 'Full sentence', title: 'The line run on to the end of its sentence' }] });
        const orderSeg = ui.segmented({ value: o.order, onChange: x => save('order', x), options: [{ value: 'said', label: 'As said', title: 'Interview by interview, in the order it was said' }, { value: 'mix', label: 'Mix the voices', title: 'Taking turns between the people saying it' }] });
        const tickAll = on => { for (const s of sets) for (const m of s.mentions) { if (on) off.delete(m.id); else off.add(m.id); } drawDetail(); };
        const ticked = () => sets.map(s => Object.assign({}, s, { mentions: s.mentions.filter(m => !off.has(m.id)) }));
        const buildBtn = ui.actionButton(`Build a sequence of ${US.plural(total, 'mention')}`, () => US.jobs.run({ title: 'Building the mentions', tool: 'words' }, job => build(job, ticked(), { clip: o.clip, order: o.order })), { icon: 'film' });
        const themeBtn = ui.button('Add to Story as a theme', { small: true, title: 'A theme in Story with every line these are said in', onClick: () => { const ids = Array.from(new Set(ticked().flatMap(s => s.mentions.map(m => m.lineId)))); const th = S().newThemeFrom(sets.map(s => s.text).join(', '), ids); ui.toast({ type: 'ok', title: `Theme “${th.name}” added`, text: US.plural(th.lineIds.length, 'line'), action: { label: 'Open', fn: () => S().open('themes') } }); } });
        const hideBtn = picked.length === 1 && !picked[0].custom && items.some(x => x.key === picked[0].key) ? ui.button('Hide this word', { small: true, kind: 'ghost', title: 'Leave it out of the cloud (Show hidden words brings it back)', onClick: () => { save('hidden', o.hidden.concat(picked[0].key)); picked = []; recount(); } }) : null;
        const body = sets.map(s => h('div.word-set',
          sets.length > 1 ? h('div.field-label', `“${s.text}” · ${US.plural(s.mentions.length, 'time')}`) : null,
          s.mentions.length ? h('div.list.word-mentions', s.mentions.slice(0, 300).map(m => {
            const iv = S().interviewOf(m.lineId) || {}, who = S().speakerName(m.line.speaker);
            const canPlace = !!(S().dragLines && iv.path);
            return h('label.list-row.word-mention' + (canPlace ? '.story-drag' : ''), { draggable: canPlace ? 'true' : 'false', title: canPlace ? 'Drag its line onto the timeline' : '', ondragstart: e => S().dragLines(e, [m.line]) },
              h('input', { type: 'checkbox', checked: !off.has(m.id), onchange: e => { if (e.target.checked) off.delete(m.id); else off.add(m.id); } }),
              h('div.list-main', h('div.word-context', m.before ? '…' + m.before + ' ' : '', h('mark', m.hit), m.after ? ' ' + m.after + '…' : ''),
                h('div.list-sub', `${US.keep(iv.name || '')} · ${who} · ${US.fmtDur(m.start)}${m.exact ? '' : ' · word times estimated'}`)),
              h('button.btn.small.ghost', { title: 'Play from here', onclick: e => { e.preventDefault(); S().cueLine(m.line, m.start - 1); } }, '▶'),
              canPlace ? h('button.btn.small.ghost', { title: 'Put its line at the playhead', onclick: e => { e.preventDefault(); S().placeAtPlayhead([m.line]); } }, US.icon('playhead', 14)) : null);
          })) : ui.empty(`“${s.text}” isn’t said in these lines.`),
          s.mentions.length > 300 ? h('div.field-hint', `Showing the first 300 of ${s.mentions.length} – all are built.`) : null));
        const tickRow = total > 1 ? h('div.row.word-tick', ui.button('Tick all', { small: true, kind: 'ghost', onClick: () => tickAll(true) }), ui.button('Untick all', { small: true, kind: 'ghost', onClick: () => tickAll(false) })) : null;
        detail.appendChild(ui.card(h('div.card-title', sets.length > 1 ? `${sets.length} words · ${US.plural(total, 'mention')}` : `“${sets[0].text}” · said ${US.plural(total, 'time')}`, h('span.right', h('div.row', themeBtn, hideBtn))),
          tickRow, body, total ? h('div', ui.field('Each clip', clipSeg), ui.field('Order', orderSeg), buildBtn, sets.length > 1 ? h('div.field-hint', 'One group per word, each in its own colour, in the order you picked them.') : null) : null));
      }
      const opts = h('div.row.word-opts',
        ui.toggle({ label: 'Word forms together', hint: 'community + communities', value: o.forms, onChange: x => { save('forms', x); picked = []; recount(); } }),
        ui.toggle({ label: 'Phrases', hint: 'two- and three-word phrases', value: o.phrases, onChange: x => { save('phrases', x); recount(); } }));
      const viewSeg = ui.segmented({ value: o.view, onChange: x => { save('view', x); drawCloud(); }, options: [{ value: 'cloud', label: 'Cloud' }, { value: 'list', label: 'List', title: 'Ranked, with the count of each' }] });
      const sizeSl = ui.slider({ label: 'How many words', min: 20, max: 200, step: 10, value: o.max, onChange: x => { save('max', x); if (lines) recount(); } });
      const copyBtn = ui.button('Copy the counts', { small: true, kind: 'ghost', title: 'Word, times said, lines and interviews – paste into a spreadsheet or document', onClick: () => { ui.copy(toTable(items)); ui.toast({ type: 'ok', title: `${US.plural(items.length, 'word')} copied` }); } });
      const saveBtn = ui.button('Save as spreadsheet', { small: true, kind: 'ghost', icon: 'folder', onClick: () => {
        try {
          const f = US.audioKit.saveText(`Word cloud ${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + toTable(items, { csv: true }).replace(/\n/g, '\r\n')); // BOM + CRLF so Excel on Windows reads accents
          ui.toast({ type: 'ok', title: 'Word counts saved', text: `In Documents › JMG Ultra Studio (${US.basename(f)}).`, action: { label: 'Open', fn: () => US.audioKit.open(f) } });
        } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); }
      } });
      v.body.append(ui.card(h('div.row', ui.field('Who', whoSel), h('div.grow', ui.field('Find', search))), opts, scopeNote,
        h('div.row', ui.button('Count again', { small: true, icon: 'refresh', onClick: () => US.jobs.run({ title: 'Counting the words', tool: 'words' }, async job => { await load(job); return { summary: `${US.plural(items.length, 'word')} from ${US.plural((lines || []).length, 'line')}` }; }) }),
          ui.button('What to work on…', { small: true, kind: 'ghost', title: 'Choose interviews or a sequence in Story', onClick: () => S().open('transcripts') }))),
        ui.card(h('div.row.word-view', viewSeg, h('div.grow'), copyBtn, saveBtn), sizeSl, cloud), detail);
      return {
        el: v.el,
        onShow() {
          if (!S()) return;
          S().loadState(); fillWho();
          const st = S().state(), now = `${(st.transcripts || []).length}:${JSON.stringify(st.scope || {})}:${(st.glossary || []).length}`;
          if (!lines || now !== stamp) { stamp = now; load(); }
        }
      };
    }
  });

  US.wordCloud = { count, mentions, groupsFor, orderMentions, toTable, keyOf, keyForText, lineTokens, sizeFor, arrange, EXTRA_STOP };
})();
