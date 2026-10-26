/* JMG Ultra Studio – Story › how much the AI reads, and splitting big jobs into batches. Pure logic (unit-tested);
   the screens are in 22-story.js. The editor picks how many lines the AI reads (Best 600 … Everything); above what one
   request holds comfortably the work is split into batches: Find themes finds themes per batch and then merges them
   (names and sizes only), the other features pick lines per batch and merge by score. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  /* ---------- the slider ---------- */
  const STOPS = {
    themes: [600, 1200, 2500, 5000, Infinity],
    candidates: [200, 600, 1200, 2500, Infinity], // your own theme, Find more
    narrative: [120, 600, 1200, 2500, Infinity]
  };
  const DEFAULTS = { themes: 1200, ownTheme: 200, findMore: 200, narrative: 120 };
  const stopsFor = f => (f === 'themes' ? STOPS.themes : f === 'narrative' ? STOPS.narrative : STOPS.candidates);
  const fmtN = n => Number(n).toLocaleString('en-GB');
  /** “Best 1,200” / “Everything (7,237 lines)” */
  const stopLabel = (n, total) => (n === Infinity ? `Everything${total != null ? ` (${fmtN(total)} lines)` : ''}` : `Best ${fmtN(n)}`);
  /** Stored per project as a number or 'all'. */
  const toStored = n => (n === Infinity ? 'all' : n), fromStored = (v, f) => (v === 'all' ? Infinity : stopsFor(f).includes(+v) ? +v : DEFAULTS[f]);

  /* ---------- batches ---------- */
  // one request stays well under the context window and gets a moderate answer: ~1,500 lines or ~200,000 characters
  const BATCH = { lines: 1500, chars: 200000 };
  /** Split items into even batches of at most `lines` items and `chars` characters (rowOf(item) -> the row sent). */
  function split(items, rowOf, { lines = BATCH.lines, chars = BATCH.chars } = {}) {
    if (!items.length) return [];
    const len = items.map(x => rowOf(x).length + 1), total = len.reduce((a, b) => a + b, 0);
    const k = Math.max(Math.ceil(items.length / lines), Math.ceil(total / chars));
    const per = Math.ceil(items.length / k), out = [];
    let cur = [], c = 0;
    items.forEach((x, i) => {
      if (cur.length && (cur.length >= per || c + len[i] > chars)) { out.push(cur); cur = []; c = 0; }
      cur.push(x); c += len[i];
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /* ---------- cost and time, before anything is sent ---------- */
  const THINK = { low: 800, medium: 3000, high: 8000 };
  const charsOf = x => (Array.isArray(x) ? x.reduce((n, b) => n + (typeof b === 'string' ? b : b.text || '').length, 0) : String(x || '').length);
  /** Rough seconds for one request: reading the input, then writing (and thinking about) the answer. */
  function secondsFor(req) {
    const tin = (charsOf(req.system) + charsOf(req.user)) / 3.6, tout = Math.min(req.maxTokens || 16000, 1500 + (THINK[req.effort] || 3000));
    return 3 + tin / 12000 + tout / 60;
  }
  /** Sum the estimates for every request a job will make. -> {requests, usd, free, name, secs} */
  function cost(reqs) {
    const p = { requests: reqs.length, usd: 0, free: false, name: US.ai && US.ai.label ? US.ai.label() : '', secs: 0 };
    for (const r of reqs) {
      const e = US.ai && US.ai.estimateFor ? US.ai.estimateFor(r) : { usd: 0, free: true };
      p.usd += e.usd || 0; p.free = !!e.free; if (e.name) p.name = e.name;
      p.secs += secondsFor(r);
    }
    return p;
  }
  const fmtTime = s => (s < 55 ? `~${Math.max(5, Math.round(s / 5) * 5)} s` : `~${Math.round(s / 60)} min`);
  const fmtUSD = x => (US.ai && US.ai.fmtUSD ? US.ai.fmtUSD(x) : `$${x.toFixed(2)}`);
  /** “All 7,237 lines · about $1.80 with Claude Opus 5.5 · 6 requests · ~3 min” */
  function describe(p, { lines, all = false } = {}) {
    const what = all ? `All ${fmtN(lines)} lines` : `${fmtN(lines)} lines`;
    const money = p.free ? `no charge with ${p.name || 'Gemini'}` : `about ${fmtUSD(p.usd)} with ${p.name}`;
    return `${what} · ${money} · ${US.plural(p.requests, 'request')} · ${fmtTime(p.secs)}`;
  }

  /* ---------- asking, with one retry ---------- */
  const NO_RETRY = new Set(['CANCELLED', 'AI_KEY', 'AI_REFUSED']);
  /** One request; a failure is tried once more. -> answer, or null if it failed twice (err in out.error). */
  async function ask(req, out = {}) {
    for (let i = 0; i < 2; i++) {
      try { return await US.ai.json(req); }
      catch (e) { out.error = e; if (NO_RETRY.has(e && e.code) || /over your monthly AI limit/.test(e && e.title || '')) throw e; }
    }
    return null;
  }
  /** “interviews A to B” for a batch of lines (for saying which part is missing). */
  function partName(lines, nameOf) {
    const names = Array.from(new Set(lines.map(nameOf).filter(Boolean)));
    return names.length ? (names.length === 1 ? names[0] : `${names[0]} … ${names[names.length - 1]}`) : `${lines.length} lines`;
  }

  /* ---------- picking lines in batches (your own theme, Find more, the narrative shortlist) ---------- */
  const PICK_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lineId', 'reason', 'score'], properties: { lineId: { type: 'string' }, reason: { type: 'string' }, score: { type: 'number' } } } } }
  };
  /**
   * The requests for picking from candidate lines (best candidates first), one per batch. all: every line in project
   * order (each batch's listing is in that order, so it is the same each time). task(k, n) -> the instruction.
   */
  function pickRequests(cands, { all, system, task, feature, maxTokens = 8000 }) {
    const batches = split(cands, T().aiRow);
    return batches.map((b, k) => ({ lines: b, req: {
      system, user: T().aiUser('Interview lines (id<TAB>speaker<TAB>text):\n' + T().inOrder(b, all).map(T().aiRow).join('\n'), task(k, batches.length)),
      schema: PICK_SCHEMA, maxTokens, effort: 'low', feature
    } }));
  }
  /**
   * Send the batches and merge: every pick with its score (or, without one, its place in the answer), best first;
   * a batch that fails twice is skipped and reported. -> {picks:[{line, rel, reasons}], missing:[{part, lines, error}]}
   */
  async function runPicks(batches, { limit = 120, exclude = new Set(), job, nameOf = () => '', label = 'Reading' }) {
    const got = [], missing = [];
    for (let k = 0; k < batches.length; k++) {
      job && job.check && job.check();
      if (batches.length > 1) { job && job.set && job.set({ who: 'ai', msg: `${US.ai.label()}: ${label} part ${k + 1} of ${batches.length}` }); job && job.progress && job.progress(0.1 + 0.85 * k / batches.length); }
      const b = batches[k], info = {};
      const r = await ask(b.req, info);
      if (!r) { missing.push({ part: k + 1, of: batches.length, lines: b.lines.length, name: partName(b.lines, nameOf), error: info.error }); continue; }
      const known = new Map(b.lines.map(l => [l.id, l]));
      const raw = (r.picks || (r.lineIds || []).map(id => ({ lineId: id }))).filter(p => p && known.has(String(p.lineId)) && !exclude.has(String(p.lineId)));
      raw.forEach((p, i) => got.push({ line: known.get(String(p.lineId)), score: p.score != null && isFinite(+p.score) ? Math.max(0, Math.min(1, +p.score)) : 1 - 0.6 * i / Math.max(1, raw.length - 1), k, i, reason: String(p.reason || '').slice(0, 140) }));
    }
    if (missing.length === batches.length && batches.length) throw missing[0].error || new US.UserError('AI_FAILED');
    got.sort((a, b) => b.score - a.score || a.k - b.k || a.i - b.i);
    const seen = new Set(), picks = [];
    for (const g of got) { if (seen.has(g.line.id)) continue; seen.add(g.line.id); picks.push({ line: g.line, rel: g.score, reasons: g.reason ? [g.reason] : [] }); if (picks.length >= limit) break; }
    return { picks, missing };
  }
  /** “Part 3 of 5 (Interview 12 … Interview 19) couldn’t be read.” */
  function missingNote(missing) {
    if (!missing || !missing.length) return '';
    return missing.map(m => `Part ${m.part} of ${m.of} (${m.name}) couldn’t be read`).join('; ') + ' – try again later to include it.';
  }

  /* ---------- Find themes: find themes per batch, then merge them ---------- */
  const MERGE_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['themes'],
    properties: { themes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'summary', 'from'], properties: { name: { type: 'string' }, summary: { type: 'string' }, from: { type: 'array', items: { type: 'string' } } } } } }
  };
  const THEME_SYSTEM = 'You help a documentary editor sort interview soundbites into themes for a film. Use clear, short theme names an editor would put on a bin (2–4 words). Put each line in at most one theme, best and most quotable lines first. Leave out weak, off-topic or broken lines. Only use line ids that appear in the list.';
  const MERGE_SYSTEM = 'You help a documentary editor. The interviews were read in parts, and themes were found in each part. Merge them into one list of themes for the whole film: combine themes that are about the same thing, give each final theme a clear, short name an editor would put on a bin (2–4 words) and a one-sentence summary, and list the ids of the part-themes it is made from. Use each part-theme id at most once; leave out part-themes that are too thin or off-topic. Use British English.';
  /** The lines Find themes reads at a slider stop: the best `limit` (by soundbite strength), in project order. */
  function themesPool(lines, limit) {
    const q = l => T().indexLine(l).q;
    const best = limit === Infinity || limit >= lines.length ? lines.slice() : lines.slice().sort((a, b) => q(b) - q(a)).slice(0, limit);
    return T().inOrder(best, lines);
  }
  /** The instruction after the lines: the editor's own themes (if any) are found in the same pass as the others. */
  function themesTask(max, own = []) {
    if (!own.length) return `Group the interview lines above into between 3 and ${max} themes.`;
    return `The editor wants these themes: ${own.map(x => `“${x}”`).join(', ')}. List them first, with exactly these names, and put every line that fits one of them in it (an empty list of lines if nothing fits); set “yours” to the editor's theme name for these, and to "" for the others. ` +
      `Then group the other lines into up to ${max} more themes of your own.`;
  }
  /** Every request Find themes will make (the merge one estimated from the expected size). -> {pool, batches:[{lines, req}], merge} */
  function themesRequests(lines, { limit = 1200, max = 10, own = [] } = {}) {
    const pool = themesPool(lines, limit), parts = split(pool, T().aiRow);
    const batches = parts.map(b => ({ lines: b, req: {
      system: THEME_SYSTEM, user: T().aiUser('Interview lines (id<TAB>speaker<TAB>text):\n' + b.map(T().aiRow).join('\n'), themesTask(max, own)),
      schema: own.length ? ownThemeSchema() : T().AI_THEME_SCHEMA, maxTokens: 16000, effort: 'low', feature: 'Find themes'
    } }));
    const merge = parts.length > 1 ? mergeRequest(parts.flatMap((b, k) => Array.from({ length: max }, (_, i) => ({ id: `p${k + 1}.${i + 1}`, name: 'Example theme name', summary: 'An example one-sentence summary of what this theme is about, for the estimate.', lineIds: Array(Math.ceil(b.length / max / 3)) }))), max) : null;
    return { pool, batches, merge };
  }
  function mergeRequest(parts, max) {
    const listing = 'Part-themes (id<TAB>name<TAB>lines<TAB>summary):\n' + parts.map(t => `${t.id}\t${t.name}\t${t.lineIds.length}\t${String(t.summary || '').replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');
    return { system: MERGE_SYSTEM, user: T().aiUser(listing, `Merge these into between 3 and ${max} themes.`), schema: MERGE_SCHEMA, maxTokens: 6000, effort: 'low', feature: 'Find themes' };
  }
  // any alphabet (Hebrew theme names too); a name of only small words stays itself
  const normName = s => { const low = String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N} ]+/gu, ' '); return low.replace(/(^| )(the|a|an|and|of)(?= |$)/g, ' ').replace(/\s+/g, ' ').trim() || low.replace(/\s+/g, ' ').trim(); };
  const stableId = (i, name) => 'A' + i + '-' + (US.fsx && US.fsx.hash ? US.fsx.hash(normName(name)).slice(0, 6) : normName(name).replace(/ /g, '').slice(0, 6));
  /**
   * Combine part-themes into final themes. groups: [{name, summary, from:[part ids]}] (from the AI, or by name).
   * Each part-theme is used once; lines keep their place (best first within each part-theme, interleaved fairly).
   */
  function combine(parts, groups, max) {
    const byId = new Map(parts.map(t => [t.id, t])), used = new Set(), out = [];
    for (const g of groups) {
      const from = (g.from || []).map(String).filter(id => byId.has(id) && !used.has(id) && used.add(id)).map(id => byId.get(id));
      if (!from.length) continue;
      const rows = [];
      from.forEach((t, j) => t.lineIds.forEach((id, i) => rows.push({ id, pos: i / Math.max(1, t.lineIds.length), j, i })));
      rows.sort((a, b) => a.pos - b.pos || a.j - b.j || a.i - b.i);
      const seen = new Set(), lineIds = rows.map(r => r.id).filter(id => !seen.has(id) && seen.add(id));
      out.push({ name: String(g.name || from[0].name).slice(0, 60), summary: String(g.summary || from[0].summary || ''), lineIds, from: from.map(t => t.id) });
    }
    return out.sort((a, b) => b.lineIds.length - a.lineIds.length).slice(0, max).map((t, i) => Object.assign(t, { id: stableId(i, t.name), keywords: [] }));
  }
  /** Without the AI (or if the merge fails): part-themes with the same name are combined, biggest first. */
  function groupByName(parts) {
    const by = new Map();
    for (const t of parts) { const k = normName(t.name); if (!by.has(k)) by.set(k, { name: t.name, summary: t.summary, from: [] }); by.get(k).from.push(t.id); }
    return Array.from(by.values());
  }
  /**
   * Find themes across `limit` lines (Infinity = all), in batches if needed. -> themes [{id, name, summary, lineIds}]
   * with .missing (parts that couldn't be read) and .merged (how many part-themes went in).
   */
  async function findThemes(lines, { limit = 1200, max = 10, job, nameOf = () => '', own = [] } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    const plan = themesRequests(lines, { limit, max, own });
    if (US.ai.approveTotal) await US.ai.approveTotal(cost(plan.batches.map(b => b.req).concat(plan.merge ? [plan.merge] : [])).usd, `Find themes (${US.plural(plan.batches.length, 'request')})`);
    const parts = [], missing = [];
    for (let k = 0; k < plan.batches.length; k++) {
      job && job.check && job.check();
      const b = plan.batches[k];
      job && job.set && job.set({ who: 'ai', msg: plan.batches.length > 1 ? `${US.ai.label()} is reading part ${k + 1} of ${plan.batches.length} (${fmtN(b.lines.length)} lines)` : `${US.ai.label()} is reading ${fmtN(b.lines.length)} lines` });
      job && job.progress && job.progress(0.05 + 0.8 * k / plan.batches.length);
      const info = {}, r = await ask(b.req, info);
      if (!r) { missing.push({ part: k + 1, of: plan.batches.length, lines: b.lines.length, name: partName(b.lines, nameOf), error: info.error }); continue; }
      const known = new Set(b.lines.map(l => l.id)), used = new Set(), ownOf = ownFor(own, r.themes || []);
      (r.themes || []).forEach((t, i) => {
        const ids = (t.lineIds || []).map(String).filter(id => known.has(id) && !used.has(id) && used.add(id));
        if (ids.length) parts.push(Object.assign({ id: `p${k + 1}.${i + 1}`, name: String(t.name || `Theme ${i + 1}`).slice(0, 60), summary: String(t.summary || ''), lineIds: ids }, ownOf[i] != null ? { own: ownOf[i] } : {}));
      });
    }
    if (missing.length === plan.batches.length) throw missing[0].error || new US.UserError('AI_FAILED');
    // the editor's own themes are combined by name (never merged away); the rest as before
    const mine = [];
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].own != null) { mine.unshift(parts[i]); parts.splice(i, 1); }
    const ownThemes = own.map(name => {
      const from = mine.filter(t => t.own === name);
      const t = from.length ? combine(from, [{ name, summary: from[0].summary, from: from.map(x => x.id) }], 1)[0] : { name, summary: '', lineIds: [], keywords: [] };
      return Object.assign(t, { name, own: true });
    });
    const taken = new Set(ownThemes.flatMap(t => t.lineIds));
    parts.forEach(t => { t.lineIds = t.lineIds.filter(id => !taken.has(id)); });
    for (let i = parts.length - 1; i >= 0; i--) if (!parts[i].lineIds.length) parts.splice(i, 1);
    let themes;
    if (plan.batches.length === 1 || parts.length <= 1) themes = combine(parts, parts.map(t => ({ name: t.name, summary: t.summary, from: [t.id] })), max);
    else {
      job && job.check && job.check();
      job && job.set && job.set({ who: 'ai', msg: `${US.ai.label()} is merging ${US.plural(parts.length, 'theme')} from ${plan.batches.length} parts` });
      job && job.progress && job.progress(0.9);
      let groups = null;
      try { const r = await ask(mergeRequest(parts, max)); groups = r && r.themes; } catch (e) { if (e && e.code === 'CANCELLED') throw e; }
      themes = combine(parts, groups && groups.length ? groups : groupByName(parts), max);
      themes.mergedBy = groups && groups.length ? 'ai' : 'name';
    }
    themes = Object.assign(ownThemes.concat(themes), { mergedBy: themes.mergedBy });
    if (!themes.some(t => t.lineIds.length) && !own.length) throw new US.UserError('AI_FAILED', { title: 'The AI didn’t find any themes.', action: 'Try again, or use “Find themes” without AI.' });
    themes.missing = missing; themes.parts = parts.length; themes.requests = plan.batches.length + (plan.merge ? 1 : 0);
    return themes;
  }

  /** Which of the editor's themes a name the AI gave is: the same words, or one word more or less. -> the editor's name, or null */
  function ownMatcher(own) {
    const keys = own.map(x => [x, normName(x)]).filter(x => x[1]);
    const words = x => x.split(' ').length;
    return name => {
      const n = normName(name);
      const same = keys.find(k => k[1] === n);
      if (same) return same[0];
      const near = keys.filter(k => Math.abs(words(n) - words(k[1])) <= 1 && ((' ' + n + ' ').includes(' ' + k[1] + ' ') || (' ' + k[1] + ' ').includes(' ' + n + ' '))).sort((a, b) => b[1].length - a[1].length)[0];
      return near ? near[0] : null;
    };
  }
  /** With the editor's themes the answer says which of them each theme is (“yours”), so a theme the AI renamed still counts. */
  let ownSchema = null;
  function ownThemeSchema() {
    if (ownSchema) return ownSchema;
    const base = T().AI_THEME_SCHEMA, item = base.properties.themes.items;
    ownSchema = { type: 'object', additionalProperties: false, required: ['themes'], properties: { themes: { type: 'array', items: Object.assign({}, item, { required: item.required.concat('yours'), properties: Object.assign({}, item.properties, { yours: { type: 'string' } }) }) } } };
    return ownSchema;
  }
  /** The editor's theme for each theme in one answer: the one it says it is, else by name. -> [editor's name or null] */
  function ownFor(own, themes) {
    const match = ownMatcher(own);
    return themes.map(t => (t && t.yours ? match(t.yours) : null) || match(t && t.name));
  }

  US.storyAI = { themesTask, ownMatcher, ownFor, ownThemeSchema, STOPS, DEFAULTS, stopsFor, stopLabel, toStored, fromStored, BATCH, split, secondsFor, cost, fmtTime, describe, ask, PICK_SCHEMA, pickRequests, runPicks, missingNote, themesPool, themesRequests, mergeRequest, combine, groupByName, normName, findThemes, MERGE_SCHEMA };
})();
