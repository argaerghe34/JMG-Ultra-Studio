/* JMG Ultra Studio – Take Sets: the retakes in a sequence (a presenter's pieces to camera, an interview with do-overs,
   a podcast read), grouped by what they try to say – including retakes in other words or minutes apart – with the last
   complete take chosen. Pick another (or keep them all), check the cuts, and get a copy of the sequence with only the
   chosen takes: every track cut together, so nothing goes out of sync, and never words from two takes stitched
   together. Grouping: the AI reads the lines as text (and your script, if you paste one); without AI, lines that share
   most of their words. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const kit = () => US.audioKit;

  /* ---------- the lines heard in the sequence ---------- */
  /** Timeline entries → lines L1, L2… with speaker, times and text, in time order. */
  function linesOf(entries, names = new Map()) {
    return (entries || []).slice().sort((a, b) => a.start - b.start).map((e, i) => ({ id: 'L' + (i + 1), start: e.start, end: e.end, speaker: (names.get && names.get(e.speakerKey)) || e.speaker || '', text: String(e.text || '').replace(/\s+/g, ' ').trim(), words: e.words || [], exact: !!e.exact }));
  }
  const toks = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(w => w.length > 1);
  function overlap(a, b) { const A = new Set(toks(a)), B = new Set(toks(b)); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); }

  /* ---------- grouping ---------- */
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['sets'],
    properties: { sets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'takes'], properties: {
      name: { type: 'string' },
      takes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'complete', 'note'], properties: { from: { type: 'string' }, to: { type: 'string' }, complete: { type: 'boolean' }, note: { type: 'string' } } } } } } } }
  };
  const SYSTEM = [
    'You help a video editor find retakes. You get the lines heard in a sequence, in time order, each with an id, speaker, time and text – and sometimes the script they were reading from.',
    'Group the retakes: each set is several attempts at the same sentence or thought by the same speaker – word for word, reworded, cut short, or picked up again minutes later. A take is one stretch of consecutive lines (from → to, same speaker) that makes one attempt.',
    '- Only make a set where there are at least two attempts. Lines said once are not listed.',
    '- "complete": true when the take gets all the way through the thought without stopping, stumbling or being abandoned.',
    '- "note": a few words on how this take differs (stumbles at the end, reworded, cut off, cleanest).',
    '- "name": the thought, in 3–8 words.',
    '- Never combine lines from different attempts into one take; never put one line in two takes.',
    '- With a script: name each set after its script line, and judge complete against it.'
  ].join('\n');
  function request(lines, { script = '' } = {}) {
    const listing = lines.map(l => `${l.id}\t${l.speaker || 'Speaker'}\t${Math.round(l.start)}s\t${l.text}`).join('\n');
    return { system: [{ text: SYSTEM, cache: true }], user: [`LINES:\n${listing}${String(script).trim() ? `\n\nSCRIPT:\n${String(script).trim().slice(0, 30000)}` : ''}\n\nGroup the retakes.`], schema: SCHEMA, maxTokens: 12000, effort: 'medium', feature: 'Take Sets' };
  }
  /**
   * The AI's sets tidied: known ids, both ends in order and the same speaker, no line in two takes, at least two takes
   * per set; chosen = the last complete take (else the last). -> [{name, takes:[{from, to, i0, i1, start, end, complete, note, text}], chosen}]
   */
  function organise(r, lines) {
    const at = new Map(lines.map((l, i) => [l.id, i])), used = new Set(), out = [];
    for (const s of (r && r.sets) || []) {
      const takes = [];
      for (const t of s.takes || []) {
        let a = at.get(String(t.from)), b = at.get(String(t.to || t.from));
        if (a == null) continue; if (b == null) b = a; if (b < a) [a, b] = [b, a];
        if (b - a > 12) b = a + 12;
        while (b > a && lines[b].speaker !== lines[a].speaker) b--;
        let clash = false; for (let k = a; k <= b; k++) if (used.has(k)) clash = true;
        if (clash) continue;
        for (let k = a; k <= b; k++) used.add(k);
        takes.push({ from: lines[a].id, to: lines[b].id, i0: a, i1: b, start: lines[a].start, end: lines[b].end, complete: !!t.complete, note: String(t.note || '').slice(0, 120), text: lines.slice(a, b + 1).map(l => l.text).join(' ') });
      }
      if (takes.length < 2) { for (const t of takes) for (let k = t.i0; k <= t.i1; k++) used.delete(k); continue; }
      takes.sort((x, y) => x.start - y.start);
      out.push({ name: String(s.name || '').trim() || takes[takes.length - 1].text.split(' ').slice(0, 6).join(' '), takes, chosen: defaultTake(takes) });
    }
    return out.sort((a, b) => a.takes[0].start - b.takes[0].start);
  }
  /** The last complete take, else the last one. */
  const defaultTake = takes => { for (let i = takes.length - 1; i >= 0; i--) if (takes[i].complete) return i; return takes.length - 1; };
  /**
   * Without AI: lines by the same speaker within two minutes that share most of their words are takes of the same
   * thing; a take that's much shorter than the longest, or ends without a full stop, counts as incomplete.
   */
  function basic(lines, { within = 120, same = 0.6 } = {}) {
    const sets = [], inSet = new Map();
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length && lines[j].start - lines[i].end <= within; j++) {
      if (lines[i].speaker !== lines[j].speaker || toks(lines[i].text).length < 3) continue;
      if (overlap(lines[i].text, lines[j].text) < same) continue;
      const si = inSet.has(i) ? inSet.get(i) : inSet.has(j) ? inSet.get(j) : sets.push([]) - 1;
      for (const k of [i, j]) if (!inSet.has(k)) { inSet.set(k, si); sets[si].push(k); }
    }
    return sets.filter(s => s.length >= 2).map(s => {
      s.sort((a, b) => a - b);
      const longest = Math.max(...s.map(k => toks(lines[k].text).length));
      const takes = s.map(k => ({ from: lines[k].id, to: lines[k].id, i0: k, i1: k, start: lines[k].start, end: lines[k].end, complete: /[.!?]["”’]?$/.test(lines[k].text) && toks(lines[k].text).length >= longest * 0.75, note: '', text: lines[k].text }));
      return { name: lines[s[s.length - 1]].text.split(' ').slice(0, 7).join(' '), takes, chosen: defaultTake(takes) };
    }).sort((a, b) => a.takes[0].start - b.takes[0].start);
  }

  /* ---------- the cuts ---------- */
  /**
   * The stretches of the sequence to remove: every take not chosen (a set kept whole – chosen -1 – loses nothing),
   * from its first word to just before what follows it, so the pause after a bad take goes with it.
   * -> [{id, kind, start, end, title, sub, on: true, set}]
   */
  function cuts(sets, lines) {
    const out = [];
    sets.forEach((s, si) => {
      if (s.chosen < 0) return;
      s.takes.forEach((t, ti) => {
        if (ti === s.chosen) return;
        const next = lines[t.i1 + 1], first = lines[t.i0].words && lines[t.i0].words[0];
        const start = Math.max(0, (first ? first.start : t.start) - 0.05);
        // the pause after goes too – but never into what follows (lines can overlap)
        const end = next ? Math.min(next.start - 3 > t.end ? t.end + 0.1 : Math.max(t.end, next.start - 0.05), Math.max(next.start, start + 0.05)) : t.end + 0.1;
        out.push({ id: `take-${si}-${ti}`, kind: t.complete ? 'complete' : 'incomplete', start, end, set: si, title: `“${s.name}” – take ${ti + 1} of ${s.takes.length}`, sub: `${t.text.length > 140 ? t.text.slice(0, 140) + '…' : t.text}${t.note ? ' · ' + t.note : ''}`, on: true });
      });
    });
    return out.sort((a, b) => a.start - b.start);
  }

  /* ---------- running it ---------- */
  async function readLines(target, job) {
    if (!US.story || !US.story.timelineTranscript) throw new US.UserError('NOTHING_FOUND', { title: 'Take Sets reads Story’s transcripts.' });
    job && job.set({ who: 'premiere', msg: 'Reading what is said in the sequence' });
    const tl = await US.story.timelineTranscript(job, { seqId: target.id });
    if (!tl.result.entries.length) throw new US.UserError('NOTHING_FOUND', { title: `No transcribed speech is heard in “${target.name}”.`, action: 'Transcribe the clips in Story › 1 Interviews first – takes are found from the words.' });
    return linesOf(tl.result.entries, US.story.namesFor ? US.story.namesFor(tl) : new Map());
  }
  async function findSets(target, job, { script = '', useAI = true } = {}) {
    const lines = await readLines(target, job);
    let sets, by = 'basic';
    if (useAI && US.ai && US.ai.available()) {
      job && job.set({ who: 'ai', msg: `${US.ai.label()} is grouping the takes` });
      sets = organise(await US.ai.json(request(lines, { script })), lines); by = 'ai';
    } else sets = basic(lines);
    return { lines, sets, by };
  }
  /** A copy of the sequence without the unchosen takes (all tracks), and a marker on each kept take. */
  async function cutCopy(target, found, items, job) {
    // overlapping cuts joined, so each stretch is removed once
    const asc = items.filter(x => x.on).map(x => [x.start, x.end]).sort((a, b) => a[0] - b[0]), joined = [];
    for (const r of asc) { const l = joined[joined.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else joined.push(r.slice()); }
    const ranges = joined.reverse();
    if (!ranges.length) throw new US.UserError('NOTHING_FOUND', { title: 'No takes are set to be cut.', action: 'Choose a take in a set (or tick a cut in the list).' });
    const locked = await US.host.call('lockedTracksWithClips', { seqId: target.id });
    if (locked.length) throw new US.UserError('BAD_INPUT', { title: `Some tracks are locked (${locked.join(', ')}).`, action: 'Unlock them in the Timeline, then try again – otherwise the cuts would knock them out of sync.' });
    job.set({ who: 'premiere', msg: 'Making a copy of the sequence' });
    const copy = await US.host.call('cloneSequence', { seqId: target.id, name: `${target.name} – best takes`, binPath: 'JMG Ultra Studio/Take Sets' });
    let removed = 0;
    for (const part of kit().chunk(ranges, 20)) { job.check(); const r = await US.host.call('extractRanges', { seqId: copy.id, ranges: part }); removed += r.removed; }
    // where each kept take now sits: its old start less what was removed before it
    const before = t => ranges.reduce((n, r) => n + Math.max(0, Math.min(r[1], t) - r[0]), 0);
    const marks = found.sets.filter(s => s.chosen >= 0).map(s => { const t = s.takes[s.chosen]; const st = t.start - before(t.start); return { start: st, end: st + (t.end - t.start), name: `Take ${s.chosen + 1} of ${s.takes.length}: ${s.name}`.slice(0, 64), comment: t.note || '', color: 0 }; });
    if (marks.length) await US.host.call('addSequenceMarkers', { seqId: copy.id, markers: marks });
    await US.host.call('openSequence', { seqId: copy.id });
    return { summary: `“${copy.name}”: ${US.plural(items.filter(x => x.on).length, 'take')} cut (${US.fmtDur(removed, true)}), ${US.plural(marks.length, 'best take')} marked. The original is unchanged.`, copy, removed };
  }

  US.actions.register({
    id: 'takes.cut', tool: 'takes', title: 'Keep the best take of each retake', changes: true,
    describe: 'Groups the retakes in the active sequence (from Story’s transcripts; the AI reads only the text), keeps the last complete take of each and makes a copy of the sequence without the others.',
    params: { script: { type: 'string', default: '', desc: 'The script they read from, if any' } },
    examples: ['keep the best takes', 'cut out the bad takes', 'pick the best retake of each line'],
    match: t => (/\b(re-?takes?|bad takes?|best takes?|take sets?)\b/i.test(t) ? { _score: 2.4 } : null),
    run: async (p, job) => {
      const target = await kit().activeSequenceTarget();
      const found = await findSets(target, job, { script: p.script });
      if (!found.sets.length) return { summary: `No retakes found in “${target.name}”.` };
      return cutCopy(target, found, cuts(found.sets, found.lines), job);
    }
  });

  /* ---------- the tool ---------- */
  US.tools.register({
    id: 'takes', name: 'Take Sets', short: 'Takes', icon: 'selects', group: 'selects', order: 13,
    blurb: 'Retakes grouped by what they say, the best take of each kept, the rest cut from a copy.',
    hostFns: ['cloneSequence', 'extractRanges', 'addSequenceMarkers', 'lockedTracksWithClips', 'openSequence', 'setPlayhead'],
    create() {
      const v = ui.toolView({ icon: 'selects', title: 'Take Sets', blurb: 'Finds the retakes in a sequence – pieces to camera, do-overs in an interview, a podcast read – and groups each set of attempts, even reworded or minutes apart. The last complete take is chosen; pick another if you prefer, check the cuts, and get a copy with only the chosen takes. Every track is cut together, and words from two takes are never stitched together.' });
      const picker = ui.sourcePicker({ modes: ['sequence'], kinds: ['audio'], label: 'Sequence', onChange: () => { found = null; draw(); } });
      const scriptIn = h('textarea.input', { rows: 4, placeholder: 'Optional: paste the script they were reading – sets are named after its lines and judged against it.' }, US.settings.get('takes.script', ''));
      scriptIn.addEventListener('input', US.debounce(() => US.settings.set('takes.script', scriptIn.value), 400));
      let found = null, target = null, items = [];
      const out = h('div');
      const findBtn = ui.actionButton('Find the takes', () => US.jobs.run({ title: 'Finding the takes', tool: 'takes' }, async job => {
        target = await kit().resolveTarget(picker, job);
        found = await findSets(target, job, { script: scriptIn.value });
        items = cuts(found.sets, found.lines);
        draw();
        return { summary: `${US.plural(found.sets.length, 'set')} of retakes in “${target.name}”${found.by === 'basic' ? ' (basic – no AI: only near word-for-word retakes)' : ''}` };
      }), { icon: 'selects' });
      function draw() {
        US.clear(out);
        if (!found) return;
        if (!found.sets.length) { out.appendChild(ui.note('No retakes found – every line is said once.', 'info')); return; }
        const go = t => kit().goTo(target, Math.max(0, t));
        out.appendChild(h('div.takes-sets', found.sets.map((s, si) => {
          const name = `takes-${si}`;
          return h('div.card.take-set', h('div.card-title', s.name, h('span.right', US.plural(s.takes.length, 'take'))),
            s.takes.map((t, ti) => h('label.take-row' + (ti === s.chosen ? '.on' : ''),
              h('input', { type: 'radio', name, checked: ti === s.chosen, onchange: () => { s.chosen = ti; refreshCuts(); draw(); } }),
              h('div.grow', h('div', h('b', `Take ${ti + 1}`), ' ', t.complete ? ui.pill('complete', 'var(--ok)') : ui.pill('incomplete', 'var(--warn)'), t.note ? h('span.field-hint', ' ' + t.note) : null), h('div.take-text', t.text)),
              h('span.field-hint', US.fmtDur(t.end - t.start)), h('button.btn.small.ghost', { title: 'Play from here', onclick: e => { e.preventDefault(); go(t.start); } }, '▶'))),
            h('label.take-row' + (s.chosen < 0 ? '.on' : ''), h('input', { type: 'radio', name, checked: s.chosen < 0, onchange: () => { s.chosen = -1; refreshCuts(); draw(); } }), h('div.grow.field-hint', 'Keep every take (these aren’t retakes)')));
        })));
        out.append(h('div.field-label', 'What will be cut'), ui.reviewList({ items, kinds: { complete: 'Complete takes', incomplete: 'Incomplete takes' }, onJump: x => go(x.start - 1) }),
          ui.actionButton('Make a copy with the chosen takes', () => US.jobs.run({ title: 'Cutting the other takes', tool: 'takes' }, job => cutCopy(target, found, items, job)), { icon: 'selects' }));
      }
      function refreshCuts() { const keep = new Map(items.map(x => [x.id, x.on])); items = cuts(found.sets, found.lines).map(x => Object.assign(x, keep.has(x.id) ? { on: keep.get(x.id) } : {})); }
      v.body.append(ui.card(picker.el, ui.field('Script', scriptIn), findBtn, h('div.field-hint', US.ai && US.ai.available() ? `${US.ai.label()} groups the takes from the text of the lines – reworded ones and ones minutes apart too. Only text is sent.` : 'No AI: retakes that share most of their words are grouped. Add a key in Settings to catch reworded ones.')), out);
      return { el: v.el, onShow() { picker.refresh(); } };
    }
  });

  US.takeSets = { linesOf, request, organise, basic, cuts, defaultTake, overlap, SCHEMA };
})();
