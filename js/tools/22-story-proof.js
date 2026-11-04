/* JMG Ultra Studio – Story › Interviews: check the words. Transcription gets names, places and short forms wrong –
   “FTL” or “FJell” for FJL, “Gersh” for Gersch. This finds the words that are probably wrong, shows each with the line
   it's in (play it to hear), and corrects the ones the editor ticks through Names and terms – so word timings stay exact
   and the corrected transcript can go back into Premiere still in sync with the footage.

   How it finds them, on this computer: near-misses of the names and terms the editor lists (and of the short forms the
   interviews use often), short forms spelt out as letters (“F J L”, “eff jay el”, “FJell”), oddly mixed capitals, rare
   short forms, and names spelt two ways. With AI on, the AI can also look over the unusual words (only those words and a
   few around each are sent – never the whole transcript, never footage). Pure logic first (unit-tested), then the card. */
(function () {
  'use strict';
  const US = window.US;
  const S = () => US.story, GL = () => US.storyGlossary, T = () => US.transcript;

  /* ---------- words ---------- */
  const core = w => String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const bare = w => GL().bare(w);
  const isAcronym = w => /^\p{Lu}{2,6}$/u.test(w) || /^(\p{Lu}\.){2,6}$/u.test(w);
  const lev = (a, b) => T().levenshtein(a, b);
  // short forms everyone uses: never “unusual”
  const COMMON_ACR = new Set('OK TV UK US USA EU UN BBC ITV NHS CEO CFO CTO HR IT PR AI GP MP PM UN NGO DIY FAQ ID PC PE RE TBH BTW LOL OMG ASAP FYI VIP DJ MC TV CV GCSE GCSES BA MA PHD MBA NYC LA DC UAE IDF ICU A&E AM PM BC AD CD DVD GPS SMS WIFI UFO NASA COVID'.split(' '));
  // letters as they're said: “eff”, “jay”, “el”… (only used against a short form the project uses)
  const LETTER = { a: ['a', 'ay', 'eh'], b: ['b', 'bee', 'be'], c: ['c', 'see', 'sea', 'cee'], d: ['d', 'dee', 'de'], e: ['e', 'ee'], f: ['f', 'ef', 'eff'], g: ['g', 'gee', 'jee'], h: ['h', 'aitch', 'haitch'], i: ['i', 'eye', 'aye'], j: ['j', 'jay', 'jey'], k: ['k', 'kay', 'kei'], l: ['l', 'el', 'ell', 'elle'], m: ['m', 'em', 'emm'], n: ['n', 'en', 'enn'], o: ['o', 'oh', 'owe'], p: ['p', 'pee', 'pea'], q: ['q', 'queue', 'cue', 'kew'], r: ['r', 'ar', 'are', 'arr'], s: ['s', 'es', 'ess'], t: ['t', 'tee', 'tea'], u: ['u', 'you', 'yoo'], v: ['v', 'vee'], w: ['w', 'double-u', 'doubleyou'], x: ['x', 'ex'], y: ['y', 'why', 'wye'], z: ['z', 'zed', 'zee'] };
  const SAYS = Object.entries(LETTER).flatMap(([l, xs]) => xs.map(x => [x, l])).sort((a, b) => b[0].length - a[0].length);
  /** “fjell” → ["fjl", …]: every way the letters could be read as spoken letter names (at most a few). */
  function spelled(s) {
    s = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    const out = new Set(), memo = new Map();
    (function walk(i, acc) {
      if (out.size > 8 || acc.length > 7) return;
      if (i === s.length) { if (acc.length >= 2) out.add(acc); return; }
      const k = i + ':' + acc; if (memo.has(k)) return; memo.set(k, 1);
      for (const [say, l] of SAYS) if (s.startsWith(say, i)) walk(i + say.length, acc + l);
    })(0, '');
    return Array.from(out);
  }

  /** Every word, with where it is: [{lineId, i, word, core}] */
  function words(lines) {
    const out = [];
    for (const l of lines || []) T().lineWords(l.text).forEach((word, i) => out.push({ lineId: l.id, i, word, core: core(word) }));
    return out;
  }

  /**
   * The words that are probably wrong. terms: the names and terms the editor listed (and Names and terms' right
   * spellings); ignore: words already said to be fine. -> [{right, heard:[spellings], why, kind, hits:[{lineId, i, n, word}]}]
   * kind: 'term' (near a name you gave) · 'often' (near a short form used often here) · 'letters' · 'shape' · 'twoWays'
   */
  function find(lines, { terms = [], entries = [], ignore = [] } = {}) {
    const ws = words(lines), skip = new Set((ignore || []).map(bare));
    const known = new Set(GL().clean(entries).flatMap(e => [e.right].concat(e.heard)).map(bare));
    const count = new Map(); for (const w of ws) if (w.core) count.set(w.core, (count.get(w.core) || 0) + 1);
    // the terms to compare with: the editor's, and short forms said at least 3 times
    const own = Array.from(new Set((terms || []).concat(GL().clean(entries).map(e => e.right)).map(x => String(x).trim()).filter(Boolean)));
    const often = Array.from(count.entries()).filter(([w, n]) => n >= 3 && isAcronym(w) && !COMMON_ACR.has(w) && !own.some(t => bare(t) === bare(w))).map(([w]) => w);
    const targets = own.map(t => ({ t, kind: 'term' })).concat(often.map(t => ({ t, kind: 'often' })));
    const groups = new Map();
    const add = (right, kind, why, hit) => {
      const key = (right || '?' + bare(hit.word)) + '|' + kind;
      if (!groups.has(key)) groups.set(key, { right: right || '', kind, why, heard: [], hits: [] });
      const g = groups.get(key), h = hit.text || core(hit.word);
      if (g.hits.some(x => x.lineId === hit.lineId && x.i === hit.i)) return;
      g.hits.push({ lineId: hit.lineId, i: hit.i, n: hit.n || 1, word: h });
      if (!g.heard.includes(h)) g.heard.push(h);
      if (why && !g.why.split(' · ').includes(why)) g.why += ' · ' + why;
    };
    const taken = new Set(), mark = (h, n = 1) => { for (let k = 0; k < n; k++) taken.add(h.lineId + ':' + (h.i + k)); };
    const isTaken = (h, n = 1) => { for (let k = 0; k < n; k++) if (taken.has(h.lineId + ':' + (h.i + k))) return true; return false; };
    // 1. near a name or short form: one word, or a few run together (“F J L”, “Jacob Gersh”)
    const byLine = new Map(); for (const w of ws) { if (!byLine.has(w.lineId)) byLine.set(w.lineId, []); byLine.get(w.lineId).push(w); }
    for (const { t, kind } of targets) {
      const tw = t.split(/\s+/), tb = bare(t).replace(/\s+/g, ''), acr = isAcronym(t.replace(/\./g, '')) && tw.length === 1, letters = tb.toLowerCase();
      for (const arr of byLine.values()) for (let i = 0; i < arr.length; i++) {
        for (const n of acr ? [1, 2, 3, 4, 5, 6] : [tw.length]) {
          if (i + n > arr.length) continue;
          const seq = arr.slice(i, i + n), text = seq.map(x => x.core).join(' '), joined = seq.map(x => bare(x.core)).join('');
          if (!joined || (joined === tb && (acr ? n === 1 : true)) || skip.has(bare(text)) || known.has(bare(text)) || isTaken(seq[0], n)) continue;
          let why = '';
          if (acr) {
            const raw = seq.map(x => x.core).join('');
            if (n > 1 && seq.every(x => /^\p{L}{1,6}$/u.test(x.core)) && spelled(raw).includes(letters)) why = `${t} said letter by letter`;
            else if (n === 1 && /^\p{Lu}/u.test(raw) && spelled(raw).includes(letters) && raw.toUpperCase() !== t) why = `sounds like ${t} said as letters`;
            else if (n === 1 && isAcronym(raw) && raw.length === t.length && lev(raw, t) === 1) why = `one letter off ${t}`;
            else if (n === 1 && /\p{Lu}/u.test(raw) && raw.length >= t.length && lev(joined, tb) <= 1 && raw.slice(0, 1) === t.slice(0, 1)) why = `close to ${t}`;
          } else {
            const head = seq[0].core;
            const lim = tb.length >= 6 ? 2 : 1;
            if (/^\p{Lu}/u.test(head) || tb.length >= 6) if (joined[0] === tb[0] && Math.abs(joined.length - tb.length) <= 2 && lev(joined, tb) <= lim) why = `close to ${t}`;
          }
          if (!why) continue;
          add(t, kind, why, { lineId: seq[0].lineId, i: seq[0].i, n, word: text, text }); mark(seq[0], n);
          break;
        }
      }
    }
    // 2. odd shapes: mixed capitals (FJell), letters and numbers mixed, a rare short form
    for (const w of ws) {
      const c = w.core;
      if (!c || isTaken(w) || skip.has(bare(c)) || known.has(bare(c))) continue;
      let why = '';
      if (/^\p{Lu}{2,}\p{Ll}{2,}$/u.test(c) && !/^(MC|MAC|O)/i.test(c.slice(0, 2))) why = 'odd mix of capitals';
      else if (/\p{L}\d+\p{L}/u.test(c) && !/^\d/.test(c)) why = 'letters and numbers mixed';
      else if (isAcronym(c) && !COMMON_ACR.has(c) && (count.get(c) || 0) <= 2 && c.length <= 5) why = 'a short form heard only here';
      if (!why) continue;
      const near = targets.map(x => x.t).find(t => isAcronym(t) && lev(c.toUpperCase(), t) <= 2 && c[0].toUpperCase() === t[0]);
      add(near || '', near ? 'term' : 'shape', near ? `${why} – maybe ${near}` : why, { lineId: w.lineId, i: w.i, word: c, text: c }); mark(w);
    }
    // 3. names spelt two ways (Gersch and Gersh): the rarer spelling, to the commoner one
    for (const g of GL().suggest(lines, entries)) {
      // only a near miss: one letter off (two for long names), and not the same word with an ending (Egypt’s, Africans)
      const stem = x => bare(x).replace(/(['’]s|s|n|ns|an|ans)$/, '');
      const heard = g.heard.filter(x => !skip.has(bare(x)) && stem(x) !== stem(g.right) && !bare(x).startsWith(bare(g.right)) && !bare(g.right).startsWith(bare(x)) && lev(bare(x), bare(g.right)) <= (bare(g.right).length >= 8 ? 2 : 1));
      for (const w of ws) if (heard.includes(w.core) && !isTaken(w)) { add(g.right, 'twoWays', `spelt ${g.right} elsewhere`, { lineId: w.lineId, i: w.i, word: w.core, text: w.core }); mark(w); }
    }
    const rank = { term: 0, often: 1, letters: 1, twoWays: 2, shape: 3 };
    return Array.from(groups.values()).sort((a, b) => rank[a.kind] - rank[b.kind] || b.hits.length - a.hits.length).slice(0, 80);
  }

  /** Corrections from ticked words → a Names and terms entry (limited to those lines unless every hit is ticked). */
  function entryFor(group, right, ticked) {
    const hits = group.hits.filter(h => ticked.has(h.lineId + ':' + h.i));
    if (!hits.length || !String(right || '').trim()) return null;
    const all = hits.length === group.hits.length && group.kind !== 'shape';
    return Object.assign({ right: String(right).trim(), heard: Array.from(new Set(hits.map(h => h.word))), hide: false }, all ? {} : { lines: Array.from(new Set(hits.map(h => String(h.lineId)))) });
  }
  /** Add an entry to Names and terms, merging with one for the same spelling and lines. -> the new list */
  function merge(entries, e) {
    const list = GL().clean(entries || []), same = list.find(x => x.right === e.right && JSON.stringify(x.lines || null) === JSON.stringify(e.lines || null));
    if (same) { same.heard = Array.from(new Set(same.heard.concat(e.heard))); return list; }
    if (e.lines) { const wide = list.find(x => x.right === e.right && x.lines); if (wide) { wide.heard = Array.from(new Set(wide.heard.concat(e.heard))); wide.lines = Array.from(new Set(wide.lines.concat(e.lines))); return list; } }
    return list.concat([e]);
  }

  /* ---------- the AI's look (optional): only the unusual words, a few around each ---------- */
  const AI_SCHEMA = { type: 'object', additionalProperties: false, required: ['fixes'], properties: { fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heard', 'right', 'why'], properties: { heard: { type: 'string' }, right: { type: 'string' }, why: { type: 'string' } } } } } };
  /** The words worth a look: capitalised (not starting a sentence), short forms, odd shapes – each once, with a little context. */
  function aiCandidates(lines, { limit = 250 } = {}) {
    const seen = new Map();
    for (const l of lines || []) {
      const ws = T().lineWords(l.text);
      ws.forEach((w, i) => {
        const c = core(w);
        if (c.length < 2 || seen.has(c)) return;
        const cap = /^\p{Lu}/u.test(c) && i > 0 && !/[.!?]$/.test(ws[i - 1]) && c !== 'I' && !/^I'/.test(c);
        if (!(cap || isAcronym(c) || /\p{Ll}\p{Lu}|\p{L}\d/u.test(c))) return;
        seen.set(c, ws.slice(Math.max(0, i - 5), i + 6).join(' '));
      });
    }
    return Array.from(seen.entries()).slice(0, limit).map(([w, ctx]) => ({ w, ctx }));
  }
  function aiRequest(cands, { terms = [], brief = '' } = {}) {
    return {
      system: 'You check speech-to-text transcripts of documentary interviews for words the transcription probably got wrong – mostly names, places, organisations and short forms. You get the unusual words, each with a few words around it. Only flag a word when you are fairly sure it is wrong and you know what it should be (often one of the editor’s terms). Never flag ordinary words, slang or a spelling that is just British or American. Answer as JSON.',
      user: `${terms.length ? `Names and terms that appear in these interviews: ${terms.join(', ')}\n` : ''}${brief ? `About the film: ${brief}\n` : ''}\nWORDS (word<TAB>context):\n${cands.map(c => `${c.w}\t${c.ctx}`).join('\n')}\n\nList the words that are probably mis-heard: "heard" exactly as given, "right" the correct spelling, "why" a few words.`,
      schema: AI_SCHEMA, maxTokens: 3000, effort: 'low', fast: true, feature: 'Check the words'
    };
  }
  /** The AI's fixes as groups like find()'s (only words that really are in the lines). */
  function aiGroups(lines, fixes, { ignore = [] } = {}) {
    const ws = words(lines), skip = new Set(ignore.map(bare)), out = [];
    for (const f of fixes || []) {
      const h = core(f.heard), r = String(f.right || '').trim();
      if (!h || !r || bare(h) === bare(r) || skip.has(bare(h))) continue;
      const hits = ws.filter(w => w.core === h).map(w => ({ lineId: w.lineId, i: w.i, n: 1, word: h }));
      if (hits.length) out.push({ right: r, heard: [h], kind: 'ai', why: String(f.why || 'the AI thinks so'), hits });
    }
    return out;
  }

  /* ---------- the card (Story › 1 Interviews) ---------- */
  function card({ render }) {
    const h = US.h, ui = US.ui, st = S().state();
    st.proof = st.proof || {};
    const termsIn = ui.input({ value: (st.proof.terms || []).join(', '), placeholder: 'Names and terms that should appear, e.g. FJL, Gersch, Odessa' });
    const box = h('div.proof-groups'), status = h('div.field-hint');
    let groups = st.proof.lastFound || null, sent = null;
    const termsNow = () => String(termsIn.value || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    const saveTerms = () => { st.proof.terms = termsNow(); S().save(); };
    termsIn.addEventListener('change', saveTerms);
    function lineText(hit) {
      const l = S().lineOf(hit.lineId); if (!l) return h('span', '');
      const ws = T().lineWords(l.text), a = Math.max(0, hit.i - 8), b = Math.min(ws.length, hit.i + (hit.n || 1) + 8);
      return h('span.proof-ctx', a > 0 ? '… ' : '', ws.slice(a, hit.i).join(' ') + ' ', h('mark', ws.slice(hit.i, hit.i + (hit.n || 1)).join(' ')), ' ' + ws.slice(hit.i + (hit.n || 1), b).join(' '), b < ws.length ? ' …' : '');
    }
    function draw() {
      US.clear(box);
      if (!groups) return;
      if (!groups.length) { box.appendChild(ui.note('Nothing looks wrong. Add the names and terms that should appear above, and look again – that finds the most.', 'info')); return; }
      for (const g of groups) {
        const ticked = new Set(g.hits.map(x => x.lineId + ':' + x.i));
        const right = ui.input({ value: g.right, placeholder: 'Should be…' });
        const rows = g.hits.slice(0, 40).map(hit => {
          const l = S().lineOf(hit.lineId), t = l && S().interviewOf(hit.lineId), k = hit.lineId + ':' + hit.i;
          return h('div.proof-hit', h('input', { type: 'checkbox', checked: true, title: 'Correct this one', onchange: e => { if (e.target.checked) ticked.add(k); else ticked.delete(k); } }),
            l ? h('button.icon-btn', { title: 'Hear the line', onclick: async () => { try { await S().cueLine(l); } catch (e) { ui.showError(e); } } }, US.icon('play', 13)) : null,
            h('div.grow', lineText(hit), h('span.field-hint', ` – ${t ? t.name : ''}${l ? ' ' + US.fmtDur(l.start) : ''}`)));
        });
        const el = h('div.proof-group',
          h('div.row', h('div.proof-heard', g.heard.slice(0, 6).map(x => h('span.chip', x)), h('span.field-hint', ` ${US.plural(g.hits.length, 'time')} · ${g.why}`)), h('span.grow'), h('span.proof-arrow', '→'), h('div.proof-right', right)),
          h('div.proof-hits', rows, g.hits.length > 40 ? h('div.field-hint', `…and ${g.hits.length - 40} more (all corrected when all are ticked)`) : null),
          h('div.row', ui.button('Correct the ticked ones', { small: true, kind: 'primary', onClick: () => {
            const e = entryFor(g, right.value, ticked);
            if (!e) { ui.toast({ type: 'warn', title: right.value.trim() ? 'Tick at least one.' : 'Type what it should say first.' }); return; }
            if (g.hits.length > 40 && ticked.size >= 40 && !e.lines) { /* every hit */ }
            st.glossary = merge(st.glossary, e);
            const n = GL().apply(st.transcripts.flatMap(x => x.lines), st.glossary);
            S().reindex(); S().save();
            st.proof.changed = Array.from(new Set((st.proof.changed || []).concat(g.hits.filter(x => ticked.has(x.lineId + ':' + x.i)).map(x => (S().interviewOf(x.lineId) || {}).key).filter(Boolean))));
            groups = groups.filter(x => x !== g); st.proof.lastFound = groups; S().save();
            ui.toast({ type: 'ok', title: `${US.plural(n, 'line')} corrected to “${e.right}”`, text: 'Kept in Names and terms – word timings unchanged.', timeout: 3000 });
            draw(); drawSend();
          } }),
          ui.button('It’s right', { small: true, kind: 'ghost', title: 'Don’t show these words again', onClick: () => { st.proof.ignore = Array.from(new Set((st.proof.ignore || []).concat(g.heard))); groups = groups.filter(x => x !== g); st.proof.lastFound = groups; S().save(); draw(); } })));
        box.appendChild(el);
      }
    }
    const sendBox = h('div');
    function drawSend() {
      US.clear(sendBox);
      const keys = st.proof.changed || [];
      if (!keys.length || !US.storyVoices || !US.storyVoices.namesToEditor) return;
      const res = US.app && US.app.is && US.app.is('resolve');
      sendBox.appendChild(h('div.row.proof-send', h('span.field-hint.grow', `${US.plural(keys.length, 'interview')} corrected. ${res ? 'Save subtitles with the corrections for Resolve.' : 'Put the corrections into Premiere’s transcripts – same times, so they stay in sync with the footage.'}`),
        ui.button(res ? 'Save corrected subtitles' : 'Update Premiere’s transcripts', { small: true, kind: 'primary', onClick: async () => { try { await US.storyVoices.namesToEditor({ keys, title: res ? 'Corrected subtitles are ready' : 'The corrected transcripts are ready for Premiere' }); st.proof.changed = []; S().save(); drawSend(); } catch (e) { ui.showError(e); } } })));
    }
    async function look() {
      saveTerms();
      const lines = st.transcripts.flatMap(t => t.lines);
      groups = find(lines, { terms: st.proof.terms, entries: st.glossary, ignore: st.proof.ignore || [] });
      status.textContent = `${US.plural(groups.reduce((n, g) => n + g.hits.length, 0), 'word')} to check, in ${US.plural(groups.length, 'group')}.`;
      if (aiBox.checked && US.ai && US.ai.available()) {
        try {
          const req = aiRequest(aiCandidates(lines), { terms: st.proof.terms, brief: String(US.settings.get('story.brief', '') || '') });
          const r = await US.jobs.run({ title: 'Checking the words', tool: 'story' }, job => { job.set({ who: 'ai', msg: `${US.ai.label()} is looking over the unusual words` }); return US.ai.json(req); });
          const already = new Set(groups.flatMap(g => g.hits.map(x => x.lineId + ':' + x.i)));
          const more = aiGroups(lines, r && r.fixes, { ignore: st.proof.ignore || [] }).map(g => Object.assign(g, { hits: g.hits.filter(x => !already.has(x.lineId + ':' + x.i)) })).filter(g => g.hits.length);
          groups = groups.concat(more);
          status.textContent += more.length ? ` The AI found ${US.plural(more.length, 'more')}.` : ' The AI found nothing more.';
        } catch (e) { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) status.textContent += ` (The AI’s look didn’t work: ${e.title || e.message}.)`; }
      }
      st.proof.lastFound = groups; S().save();
      draw();
    }
    const aiBox = h('input', { type: 'checkbox', checked: US.settings.get('story.proofAI', false), onchange: e => US.settings.set('story.proofAI', e.target.checked) });
    sent = h('label.field-hint', aiBox, ' Ask the AI to look too (only the unusual words and a few around each are sent)');
    draw(); drawSend();
    const n = groups ? groups.reduce((k, g) => k + g.hits.length, 0) : 0;
    return ui.section('Check the words', [
      h('div.field-hint', 'Finds words the transcription probably got wrong – names, places, short forms (“FTL” or “FJell” for FJL). Play the line, untick any that are right, type what it should say, and correct. Corrections keep every word’s timing, so the transcript stays in sync with the footage – and can go back into Premiere.'),
      h('div.field-label', 'Names and terms that should appear'), termsIn,
      h('div.row', { style: { marginTop: '6px' } }, ui.button('Find likely mistakes', { small: true, kind: 'secondary', icon: 'check', onClick: () => look().catch(e => ui.showError(e)) }), US.ai && US.ai.available() ? sent : null),
      status, box, sendBox
    ], { open: !!(groups && groups.length), hint: groups ? (n ? `${US.plural(n, 'word')} to check` : 'nothing to check') : 'mis-heard names and short forms' });
  }

  if (US.actions) US.actions.register({
    id: 'story.proof', tool: 'story', title: 'Find words the transcription got wrong', changes: false,
    describe: 'Finds words in the transcripts that are probably wrong – mis-heard names, places and short forms – to check and correct (timings kept), then put back into Premiere’s transcripts.',
    params: { terms: { type: 'string', default: '', desc: 'Names and terms that should appear, commas between (e.g. FJL, Gersch)' } },
    examples: ['find words the transcript got wrong', 'check the transcript for mistakes', 'FJL is spelt wrong in the transcripts'],
    match: t => (/\b(wrong|incorrect|mis-?heard|mis-?spel+t|mis-?spellings?|typos?|mistakes?|errors?|spell(ing|t)?|proof-?read)\b/i.test(t) && /\b(transcripts?|words?|names?|spelling|terms?)\b/i.test(t) && !/\b(cut|sequence|timeline|bloopers?|out-?takes?|funny)\b/i.test(t) ? { _score: 3 } : null),
    run: async p => {
      const st = S().state(); st.proof = st.proof || {};
      if (p.terms) st.proof.terms = Array.from(new Set((st.proof.terms || []).concat(String(p.terms).split(/[,;]/).map(x => x.trim()).filter(Boolean))));
      const g = find(st.transcripts.flatMap(t => t.lines), { terms: st.proof.terms, entries: st.glossary, ignore: st.proof.ignore || [] });
      st.proof.lastFound = g; S().save();
      S().open('transcripts');
      return { summary: g.length ? `${US.plural(g.reduce((n, x) => n + x.hits.length, 0), 'word')} to check – in Story › 1 Interviews › Check the words` : 'Nothing looks wrong – add the names that should appear in Story › 1 Interviews › Check the words' };
    }
  });

  US.storyProof = { find, spelled, words, entryFor, merge, aiCandidates, aiRequest, aiGroups, card, isAcronym, AI_SCHEMA };
})();
