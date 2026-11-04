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

  /* ---------- names (and titles) the interviews mention, suggested by the AI from what's said around them ---------- */
  const KINDS = ['person', 'organisation', 'place', 'other'];
  const NAMES_SCHEMA = { type: 'object', additionalProperties: false, required: ['names'], properties: { names: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'title', 'kind', 'heard', 'why'], properties: { name: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: KINDS }, heard: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } } } } } };
  /** The capitalised words and short forms, each once, with more around them than for the spelling check (titles and roles are often a few words away). */
  function nameCandidates(lines, { limit = 320, around = 12 } = {}) {
    const seen = new Map();
    for (const l of lines || []) {
      const ws = T().lineWords(l.text);
      ws.forEach((w, i) => {
        const c = core(w);
        if (c.length < 2 || c === 'I' || /^I'/.test(c)) return;
        const cap = /^\p{Lu}/u.test(c) && i > 0 && !/[.!?]$/.test(ws[i - 1]);
        if (!(cap || isAcronym(c))) return;
        const n = (seen.get(c) || { n: 0, ctx: [] });
        n.n++;
        if (n.ctx.length < 2) n.ctx.push(ws.slice(Math.max(0, i - around), i + around + 1).join(' '));
        seen.set(c, n);
      });
    }
    // the most mentioned first, so a long project still sends its main people
    return Array.from(seen.entries()).sort((a, b) => b[1].n - a[1].n).slice(0, limit).map(([w, x]) => ({ w, n: x.n, ctx: x.ctx }));
  }
  function namesRequest(cands, { brief = '', known = [] } = {}) {
    return {
      system: 'You read speech-to-text transcripts of documentary interviews and list the names they mention – people, organisations, places and other proper names (events, projects, brands) – spelt correctly, with each person’s title or role as the interviews give it (“Rabbi”, “Dr”, “head teacher at Leeds Grammar”, “founder of FJL”) and for an organisation what it is. The transcription often mis-hears names: when several spellings are clearly the same name, give one correct spelling and list the transcript’s spellings in “heard”. Only names really there; no ordinary words. Answer as JSON.',
      user: `${brief ? `About the film: ${brief}\n` : ''}${known.length ? `Names the editor already gave: ${known.join(', ')}\n` : ''}\nWORDS (word<TAB>times mentioned<TAB>context):\n${cands.map(c => `${c.w}\t${c.n}\t${c.ctx.join(' | ')}`).join('\n')}\n\nList the names: "name" spelt correctly, "title" (a title or role, or a few words on what it is; "" when not said), "kind", "heard" (the spellings in the words above that mean this name), "why" (a few words).`,
      schema: NAMES_SCHEMA, maxTokens: 6000, effort: 'low', feature: 'Names in the interviews'
    };
  }
  /** The AI's names, tidied: one per name, how often each is heard, people first. -> [{name, title, kind, heard, why, n, ok}] */
  function namesFrom(r, lines) {
    const count = new Map(); for (const w of words(lines)) if (w.core) count.set(bare(w.core), (count.get(bare(w.core)) || 0) + 1);
    const out = [], by = new Map();
    for (const x of (r && r.names) || []) {
      const name = String(x.name || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 60) continue;
      const k = bare(name);
      const heard = Array.from(new Set((Array.isArray(x.heard) ? x.heard : []).map(h => String(h).trim()).filter(h => h && bare(h) !== k)));
      if (by.has(k)) { const e = by.get(k); e.heard = Array.from(new Set(e.heard.concat(heard))); if (!e.title && x.title) e.title = String(x.title).trim(); continue; }
      const n = [name].concat(heard).reduce((m, h) => m + (count.get(bare(h.split(/\s+/).pop())) || 0), 0);
      const e = { name, title: String(x.title || '').trim(), kind: KINDS.includes(x.kind) ? x.kind : 'other', heard, why: String(x.why || '').trim(), n, ok: true };
      by.set(k, e); out.push(e);
    }
    const rank = { person: 0, organisation: 1, place: 2, other: 3 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.n - a.n);
  }
  /** The names box from the suggestions ticked, keeping anything the editor typed that isn't one of them. */
  function termsWith(terms, people) {
    const names = new Set((people || []).map(p => bare(p.name)).concat((people || []).flatMap(p => (p.was ? [bare(p.was)] : []))));
    const own = (terms || []).filter(t => !names.has(bare(t)));
    return Array.from(new Set((people || []).filter(p => p.ok).map(p => p.name).concat(own)));
  }

  /* ---------- the card (Story › 1 Interviews) ---------- */
  function card({ render }) {
    const h = US.h, ui = US.ui, st = S().state();
    st.proof = st.proof || {};
    const termsIn = ui.input({ value: (st.proof.terms || []).join(', '), placeholder: 'Names and terms that should appear, e.g. FJL, Gersch, Odessa' });
    const box = h('div.proof-groups'), status = h('div.field-hint');
    let groups = st.proof.lastFound || null, sent = null;
    const setters = [];   // each group's Tick all / Untick all
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
      setters.length = 0;
      if (groups.length > 1) box.appendChild(h('div.row.proof-ticks', h('span.field-hint', 'Every group:'), ui.button('Tick all', { small: true, kind: 'ghost', onClick: () => setters.forEach(f => f(true)) }), ui.button('Untick all', { small: true, kind: 'ghost', onClick: () => setters.forEach(f => f(false)) })));
      for (const g of groups) {
        const ticked = new Set(g.hits.map(x => x.lineId + ':' + x.i)), boxes = [];
        const right = ui.input({ value: g.right, placeholder: 'Should be…' });
        const count = h('span.field-hint');
        const showCount = () => { count.textContent = `${ticked.size} of ${g.hits.length} ticked`; };
        // every one, including any not listed (over 40)
        const setAll = on => { ticked.clear(); if (on) g.hits.forEach(x => ticked.add(x.lineId + ':' + x.i)); boxes.forEach(b => { b.checked = on; }); showCount(); };
        setters.push(setAll);
        const rows = g.hits.slice(0, 40).map(hit => {
          const l = S().lineOf(hit.lineId), t = l && S().interviewOf(hit.lineId), k = hit.lineId + ':' + hit.i;
          const cb = h('input', { type: 'checkbox', checked: true, title: 'Correct this one', onchange: e => { if (e.target.checked) ticked.add(k); else ticked.delete(k); showCount(); } });
          boxes.push(cb);
          return h('div.proof-hit', cb,
            l ? h('button.icon-btn', { title: 'Hear the line', onclick: async () => { try { await S().cueLine(l); } catch (e) { ui.showError(e); } } }, US.icon('play', 13)) : null,
            h('div.grow', lineText(hit), h('span.field-hint', ` – ${t ? t.name : ''}${l ? ' ' + US.fmtDur(l.start) : ''}`)));
        });
        const el = h('div.proof-group',
          h('div.row', h('div.proof-heard', g.heard.slice(0, 6).map(x => h('span.chip', x)), h('span.field-hint', ` ${US.plural(g.hits.length, 'time')} · ${g.why}`)), h('span.grow'), h('span.proof-arrow', '→'), h('div.proof-right', right)),
          h('div.row.proof-ticks', ui.button('Tick all', { small: true, kind: 'ghost', onClick: () => setAll(true) }), ui.button('Untick all', { small: true, kind: 'ghost', onClick: () => setAll(false) }), count),
          h('div.proof-hits', rows, g.hits.length > 40 ? h('div.field-hint', `…and ${g.hits.length - 40} more (ticked or unticked with Tick all / Untick all)`) : null),
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
        showCount();
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
    /* the names the AI found, with their titles: ticked ones go into the names box; untick, re-spell or add a title */
    const peopleBox = h('div.proof-people');
    const fillTerms = () => { termsIn.value = termsWith(termsNow(), st.proof.people || []).join(', '); saveTerms(); };
    function drawPeople() {
      US.clear(peopleBox);
      const ps = st.proof.people || [];
      if (!ps.length) return;
      const all = on => { ps.forEach(p => { p.ok = on; }); fillTerms(); S().save(); drawPeople(); };
      peopleBox.appendChild(h('div.row.proof-ticks', h('span.field-label.grow', `Names found in the interviews (${ps.filter(p => p.ok).length} of ${ps.length} in the box)`),
        ui.button('Tick all', { small: true, kind: 'ghost', onClick: () => all(true) }), ui.button('Untick all', { small: true, kind: 'ghost', onClick: () => all(false) })));
      peopleBox.appendChild(h('div.field-hint', 'Suggested by the AI from what’s said around each name. Untick any that are wrong, correct a spelling or a title – the ticked names are what the check looks for.'));
      const KIND = { person: 'Person', organisation: 'Organisation', place: 'Place', other: 'Name' };
      for (const p of ps) {
        const name = ui.input({ value: p.name, placeholder: 'Name', onInput: v => { if (p.was == null) p.was = p.name; p.name = v.trim() || p.name; fillTerms(); S().save(); } });
        const title = ui.input({ value: p.title, placeholder: p.kind === 'person' ? 'Title or role' : 'What it is', onInput: v => { p.title = v.trim(); S().save(); } });
        peopleBox.appendChild(h('div.proof-person' + (p.ok ? '' : '.off'),
          h('input', { type: 'checkbox', checked: p.ok, title: 'In the names box', onchange: e => { p.ok = e.target.checked; fillTerms(); S().save(); drawPeople(); } }),
          h('div.proof-person-name', name), h('div.proof-person-title', title),
          h('span.chip', { title: p.why || '' }, KIND[p.kind] || 'Name'),
          h('span.field-hint', `${p.n ? US.plural(p.n, 'mention') : ''}${p.heard.length ? ` · heard as ${p.heard.slice(0, 3).join(', ')}` : ''}`)));
      }
    }
    async function suggestNames() {
      if (!US.ai || !US.ai.available()) { ui.toast({ type: 'warn', title: 'This needs AI.', text: 'Add a Claude or Gemini key in Settings.' }); return false; }
      const lines = st.transcripts.flatMap(t => t.lines);
      if (!lines.length) return false;
      const req = namesRequest(nameCandidates(lines), { brief: String(US.settings.get('story.brief', '') || ''), known: termsNow() });
      const r = await US.jobs.run({ title: 'Finding the names in the interviews', tool: 'story' }, job => { job.set({ who: 'ai', msg: `${US.ai.label()} is reading the names and what’s said around them` }); return US.ai.json(req); });
      if (r === undefined) return false;
      // a name already reviewed keeps the editor's spelling, title and tick
      const old = new Map((st.proof.people || []).map(p => [bare(p.was || p.name), p]));
      st.proof.people = namesFrom(r, lines).map(p => { const o = old.get(bare(p.name)); return o ? Object.assign(p, { name: o.name, title: o.title || p.title, ok: o.ok, was: o.was }) : p; });
      fillTerms(); S().save(); drawPeople();
      status.textContent = `${US.plural(st.proof.people.length, 'name')} found – check them below, then find the likely mistakes.`;
      return true;
    }
    async function look() {
      // nothing in the names box yet: the AI suggests them first (they're filled in, to check)
      if (!termsNow().length && !(st.proof.people || []).length && US.ai && US.ai.available() && st.transcripts.length) { try { await suggestNames(); } catch (e) { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) status.textContent = `(The AI couldn’t suggest names: ${e.title || e.message}.)`; } }
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
    draw(); drawSend(); drawPeople();
    const n = groups ? groups.reduce((k, g) => k + g.hits.length, 0) : 0;
    return ui.section('Check the words', [
      h('div.field-hint', 'Finds words the transcription probably got wrong – names, places, short forms (“FTL” or “FJell” for FJL). Play the line, untick any that are right, type what it should say, and correct. Corrections keep every word’s timing, so the transcript stays in sync with the footage – and can go back into Premiere.'),
      h('div.field-label', 'Names and terms that should appear'), termsIn,
      US.ai && US.ai.available() ? h('div.row', { style: { marginTop: '4px' } }, ui.button((st.proof.people || []).length ? 'Suggest names again (AI)' : 'Suggest names from the interviews (AI)', { small: true, kind: 'ghost', icon: 'spark', title: 'The AI lists the people, organisations and places the interviews mention, with titles – from the capitalised words and a few words around each (never whole transcripts or footage)', onClick: () => suggestNames().catch(e => ui.showError(e)) })) : null,
      peopleBox,
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

  US.storyProof = { nameCandidates, namesRequest, namesFrom, termsWith, NAMES_SCHEMA, find, spelled, words, entryFor, merge, aiCandidates, aiRequest, aiGroups, card, isAcronym, AI_SCHEMA };
})();
