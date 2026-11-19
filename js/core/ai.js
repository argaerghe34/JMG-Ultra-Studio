/* JMG Ultra Studio – optional AI. Used only for open-ended requests (the Assistant, theme grouping).
   Every other tool runs on this computer with no key. Keys stay on this computer (secrets.json, owner-only).
   Calls go straight from this computer to Anthropic or Google over HTTPS; nothing passes through anyone else. */
(function () {
  'use strict';
  const US = window.US;
  const https = require('https'), fs = require('fs'), path = require('path');

  /* ---------- secrets ---------- */
  const secretsFile = path.join(US.fsx.dataDir, 'secrets.json');
  function readSecrets() { return US.fsx.readJSON(secretsFile, {}); }
  US.secrets = {
    get(name) { return readSecrets()[name] || ''; },
    set(name, value) {
      const s = readSecrets();
      if (value) s[name] = value; else delete s[name];
      US.fsx.writeJSON(secretsFile, s);
      if (value && KEY_PROVIDER[name]) noteKey(KEY_PROVIDER[name], value, { added: Date.now() });
      try { fs.chmodSync(secretsFile, 0o600); } catch (e) { /* Windows */ }
      US.bus.emit('secrets', name);
    }
  };

  /* ---------- models and prices (US dollars per million tokens; Anthropic bills in USD) ---------- */
  const MODELS = {
    'claude-opus-5-5': { name: 'Claude Opus 5.5', short: 'Opus – best', in: 4, out: 20, cacheRead: 0.20, cacheWrite: 5, fallbacks: true },
    'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', short: 'Sonnet – about half', in: 2, out: 10, cacheRead: 0.20, cacheWrite: 2.5, fallbacks: true },
    'claude-haiku-5-5': { name: 'Claude Haiku 5.5', short: 'Haiku – cheapest', in: 0.10, out: 0.50, cacheRead: 0.01, cacheWrite: 0.125, fallbacks: false }
  };
  const CLAUDE_MODEL = 'claude-opus-5-5';
  function claudeModel() { const m = US.settings.get('claudeModel', CLAUDE_MODEL); return MODELS[m] ? m : CLAUDE_MODEL; }

  /* ---------- spending ledger: every request's real token usage, per month ---------- */
  const ledgerFile = path.join(US.fsx.dataDir, 'ai-usage.json');
  const monthKey = () => new Date().toISOString().slice(0, 7);
  function ledger() { return US.fsx.readJSON(ledgerFile, { months: {} }); }
  function thisMonth() { const l = ledger(); return l.months[monthKey()] || { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0, byFeature: {}, byModel: {} }; }
  function costOf(model, u) {
    const p = MODELS[model]; if (!p || !u) return 0;
    // cache writes: 5-minute at 1.25× input, 1-hour at 2× (split given in usage.cache_creation when present)
    const cc = u.cache_creation || null;
    const w5 = cc ? (cc.ephemeral_5m_input_tokens || 0) : (u.cache_creation_input_tokens || 0), w1h = cc ? (cc.ephemeral_1h_input_tokens || 0) : 0;
    return ((u.input_tokens || 0) * p.in + w5 * p.cacheWrite + w1h * p.in * 2 + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.output_tokens || 0) * p.out) / 1e6;
  }
  /* ---------- usage per API key: each key known by a fingerprint and its last 4 characters – never the key itself ---------- */
  const KEY_PROVIDER = { anthropicKey: 'claude', geminiKey: 'gemini' };
  const keyId = key => US.fsx.hash('api-key:' + key);
  /** Register a key (when it's saved in Settings: added = then). */
  function noteKey(provider, key, { added = null } = {}) {
    try {
      const l = ledger(), id = keyId(key);
      l.keys = l.keys || {};
      if (!l.keys[id]) l.keys[id] = { provider, last4: String(key).slice(-4), added, name: '', calls: 0, cost: 0, tokensIn: 0, tokensOut: 0, first: null, last: null, months: {} };
      else if (added && !l.keys[id].added) l.keys[id].added = added;
      if (!l.trackedSince) l.trackedSince = Date.now();
      US.fsx.writeJSON(ledgerFile, l);
    } catch (e) { /* bookkeeping only */ }
  }
  // keys saved before usage was tracked per key: known from now on
  try { for (const [n, p] of Object.entries(KEY_PROVIDER)) { const k = readSecrets()[n]; if (k) { const l = ledger(); if (!(l.keys && l.keys[keyId(k)])) noteKey(p, k); } } } catch (e) { /* no keys */ }
  function record(model, usage, feature, cost, key) {
    try {
      const l = ledger(), k = monthKey(), m = l.months[k] || { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0, byFeature: {}, byModel: {} };
      const tin = (usage.input_tokens || usage.promptTokenCount || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
      const tout = (usage.output_tokens || 0) + (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
      if (key) {
        l.keys = l.keys || {};
        const id = keyId(key), provider = /^gemini/.test(model) ? 'gemini' : 'claude';
        const K = l.keys[id] || (l.keys[id] = { provider, last4: String(key).slice(-4), added: null, name: '', calls: 0, cost: 0, tokensIn: 0, tokensOut: 0, first: null, last: null, months: {} });
        const KM = K.months[k] || (K.months[k] = { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0 });
        for (const x of [K, KM]) { x.calls++; x.cost += cost; x.tokensIn += tin; x.tokensOut += tout; }
        K.last = Date.now(); if (!K.first) K.first = K.last;
        if (!l.trackedSince) l.trackedSince = K.last;
      }
      m.calls++; m.cost += cost; m.tokensIn += tin; m.tokensOut += tout;
      m.cacheRead = (m.cacheRead || 0) + (usage.cache_read_input_tokens || 0); m.cacheWrite = (m.cacheWrite || 0) + (usage.cache_creation_input_tokens || 0);
      const f = m.byFeature[feature || 'Other'] || (m.byFeature[feature || 'Other'] = { calls: 0, cost: 0 }); f.calls++; f.cost += cost;
      const b = m.byModel[model] || (m.byModel[model] = { calls: 0, cost: 0 }); b.calls++; b.cost += cost;
      l.months[k] = m; US.fsx.writeJSON(ledgerFile, l);
      const cr = usage.cache_read_input_tokens || 0, cw = usage.cache_creation_input_tokens || 0;
      US.log('info', `AI: ${feature || 'request'} · ${(MODELS[model] || { name: model }).name} · ${tin.toLocaleString()} in / ${tout.toLocaleString()} out tokens${cr ? ` (${cr.toLocaleString()} read from the cache)` : ''}${cw ? ` (${cw.toLocaleString()} written to the cache)` : ''}${cost ? ` · $${cost.toFixed(3)}` : ' · free'}`);
      US.bus.emit('ai-usage', m);
    } catch (e) { /* never let bookkeeping break a request */ }
  }

  /* ---------- what Claude is holding in its cache (per model): a block sent with cache:'1h' stays an hour from its last use ---------- */
  const warmFile = path.join(US.fsx.dataDir, 'ai-cache.json');
  const warmKey = (model, b) => model + ':' + US.fsx.hash(b.text || '');
  const ttlOf = b => (b.cache === '1h' ? 3600e3 : 300e3);
  function warmMap() { const m = US.fsx.readJSON(warmFile, {}), now = Date.now(); for (const k of Object.keys(m)) if (m[k].until < now) delete m[k]; return m; }
  /** When a cached block (sent before) runs out, or 0 if Claude isn't holding it. A little early, to be safe. */
  function warmUntil(b, model = claudeModel()) { const e = warmMap()[warmKey(model, b)]; return e ? e.until - 60e3 : 0; }
  function noteWarm(blocks, model, startedAt) {
    try {
      const m = warmMap();
      for (const b of blocks) if (b && b.cache && b.text) m[warmKey(model, b)] = { until: startedAt + ttlOf(b), chars: b.text.length };
      US.fsx.writeJSON(warmFile, m);
    } catch (e) { /* only an estimate */ }
  }

  /* ---------- stills: a few small pictures in a request (user blocks {image: {data, mime, w, h, note}}) ----------
     Off unless the editor has switched it on for the project (a local model may always look: nothing leaves). Only small
     stills – never video or audio. What was sent to AI keeps a line saying which still it was, not the picture. */
  const isImage = b => !!(b && typeof b === 'object' && b.image && b.image.data);
  const imagesOf = user => (Array.isArray(user) ? user.filter(isImage) : []);
  /** Claude's count for a picture: one token per 28×28 pixels (a 512×288 still is about 200). */
  const imageTokens = im => Math.max(1, Math.ceil((+im.w || 512) / 28) * Math.ceil((+im.h || 512) / 28));
  const imageNote = im => `[still${im.note ? ': ' + im.note : ''}${im.w ? ` – ${im.w}×${im.h}` : ''}; the picture itself isn’t kept here]`;
  const stillsProjects = () => US.settings.get('ai.stillsProjects', {}) || {};
  /** May small stills from the open project go to Claude or Gemini? (Never for a project kept on this computer.) */
  const stillsOn = () => !projectOffline() && !!stillsProjects()[projectOf().key];
  function setStills(on) { const m = Object.assign({}, stillsProjects()); if (on) m[projectOf().key] = projectOf().name; else delete m[projectOf().key]; US.settings.set('ai.stillsProjects', m); }

  /* ---------- seeing and hearing (the user's choice of 19 Nov 2026): sound – and stills with it – to a cloud model ----------
     user blocks {media: {kind: 'audio'|'video', data (base64), mime, bytes, seconds, note}}. Off for every project until
     the editor chooses “Cloud” for it in Settings › Vision & listening models (asked with the estimate); never for a
     project set to “nothing leaves this computer”. Only US.ai.media() sends them, and what was sent keeps a line
     with the size – not the sound. */
  const isMedia = b => !!(b && typeof b === 'object' && b.media && b.media.data);
  const mediaOf = user => (Array.isArray(user) ? user.filter(isMedia) : []);
  const mediaBytes = m => +m.bytes || Math.floor(String(m.data).length * 3 / 4);
  const fmtBytes = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const mediaNote = m => `[${m.kind === 'video' ? 'video' : 'sound'}${m.note ? ': ' + m.note : ''} – ${m.seconds ? Math.round(m.seconds) + ' s, ' : ''}${fmtBytes(mediaBytes(m))}; the ${m.kind === 'video' ? 'video' : 'sound'} itself isn’t kept here]`;
  const mediaProjects = () => US.settings.get('ai.mediaProjects', {}) || {};
  /** May sound and stills of the open project's footage go to a cloud model? (Never for a project kept on this computer.) */
  const mediaOn = () => !projectOffline() && !!mediaProjects()[projectOf().key];
  function setMedia(on) { const m = Object.assign({}, mediaProjects()); if (on) m[projectOf().key] = projectOf().name; else delete m[projectOf().key]; US.settings.set('ai.mediaProjects', m); }

  /** Rough cost before sending: ~3.6 characters per token for English; output allowance grows with effort (thinking). */
  function blocksText(x) { return Array.isArray(x) ? x.map(b => (typeof b === 'string' ? b : b.text || '')).join('\n') : (x && typeof x === 'object' ? x.text || '' : String(x || '')); }
  const turnsText = turns => (turns || []).map(t => String(t.assistant || '') + String(t.user || '')).join('');
  function estimate({ system, user, turns, maxTokens = 16000, effort = 'low', expectedOutput, model } = {}) {
    const m = model || claudeModel(), p = MODELS[m];
    const inTok = Math.ceil((blocksText(system).length + blocksText(user).length + turnsText(turns).length) / 3.6) + 50 + imagesOf(user).reduce((n, b) => n + imageTokens(b.image), 0);
    const cached = [].concat(Array.isArray(user) ? user : [], Array.isArray(system) ? system : []).filter(b => b && b.cache);
    // a block Claude still holds is read at the cache price; one it doesn't is written (5 minutes 1.25×, an hour 2×)
    const now = Date.now(), tok = b => Math.ceil((b.text || '').length / 3.6);
    let premium = 0, readTok = 0;
    for (const b of cached) { if (b.warm || warmUntil(b, m) > now) { premium -= tok(b) * (p.in - p.cacheRead); readTok += tok(b); } else premium += tok(b) * (b.cache === '1h' ? p.in : p.cacheWrite - p.in); }
    const thinking = { low: 800, medium: 3000, high: 8000, xhigh: 16000, max: 32000 }[effort] || 3000;
    const outTok = Math.min(maxTokens, (expectedOutput || 1500) + thinking);
    return { model: m, name: p.name, inputTokens: inTok, outputTokens: outTok, cachedTokens: readTok, usd: (inTok * p.in + premium + outTok * p.out) / 1e6 };
  }
  const fmtUSD = x => (x < 0.01 ? 'under 1¢' : x < 1 ? `${Math.round(x * 100)}¢` : `$${x.toFixed(2)}`);

  /** Ask once per job before spending more than the user's threshold; enforce the optional monthly cap. */
  const approvedJobs = new Map();
  // whose request it is: the job that's running, or – for work that runs beside other work (the Assistant's chats) – the
  // owner the request names itself: as = {id, title, about}
  const whoKey = as => (as && as.id) || (US.jobs.current ? US.jobs.current.id : 'none');
  // unattended jobs (Overnight prep) never ask: they have a budget, and a request that doesn't fit is skipped
  const unattended = new Map();   // job id -> dollars left
  function fromBudget(usd, feature, as) {
    const key = whoKey(as);
    if (!unattended.has(key)) return false;
    const left = unattended.get(key);
    if (usd > left + 1e-9) throw new US.UserError('AI_FAILED', { title: `Skipped: ${feature || 'this AI step'} would cost about ${fmtUSD(usd)}, more than is left of tonight’s AI limit (${fmtUSD(left)}).`, action: 'Raise the limit for the next run, or run it by hand.' });
    unattended.set(key, left - usd);
    return true;
  }
  /** After an answer: a job with a budget is charged what the request really cost, not the (cautious) estimate. */
  function settleBudget(estUsd, actualUsd, as) {
    const key = whoKey(as);
    if (!unattended.has(key) || !(estUsd > 0) || !(actualUsd >= 0)) return;
    unattended.set(key, unattended.get(key) + Math.max(0, estUsd - actualUsd));
  }
  async function checkSpend(est, feature, as) {
    const cap = +US.settings.get('aiMonthlyCap', 0);
    const spent = thisMonth().cost;
    if (cap > 0 && spent + est.usd > cap) throw new US.UserError('AI_FAILED', { title: `This would go over your monthly AI limit ($${cap.toFixed(2)}; $${spent.toFixed(2)} used so far).`, action: 'Raise the limit in Settings, or switch to Gemini or a cheaper Claude model.', detail: `estimate $${est.usd.toFixed(3)} for ${feature || 'request'}` });
    if (fromBudget(est.usd, feature, as)) return;
    const ask = +US.settings.get('aiConfirmAbove', 0.25);
    if (!(ask > 0) || est.usd <= ask || !US.ui) return;
    const key = whoKey(as), had = approvedJobs.get(key) || 0;
    if (had && est.usd <= had * 3) return;                              // already approved for this job
    const ok = await US.ui.confirm({ title: `Use about ${fmtUSD(est.usd)} of Claude?`, text: `${feature || 'This request'} will send about ${est.inputTokens.toLocaleString()} tokens of text to ${est.name}. Estimated cost ${fmtUSD(est.usd)} (you’ve used $${spent.toFixed(2)} this month). You can change when Ultra Studio asks in Settings.`, ok: 'Go ahead' });
    if (!ok) throw new US.UserError('CANCELLED', { title: 'AI request cancelled.', action: 'Nothing was sent.' });
    approvedJobs.set(key, est.usd);
  }
  /** For jobs that make several requests (e.g. Moments in batches): ask once for the whole total, then don't ask per request. */
  async function approveTotal(usd, feature) {
    const est = { usd, inputTokens: 0, name: MODELS[claudeModel()].name };
    const cap = +US.settings.get('aiMonthlyCap', 0), spent = thisMonth().cost;
    if (cap > 0 && spent + usd > cap) throw new US.UserError('AI_FAILED', { title: `This would go over your monthly AI limit ($${cap.toFixed(2)}; $${spent.toFixed(2)} used so far).`, action: 'Raise the limit in Settings, or use “Only the best”, Gemini or a cheaper Claude model.' });
    { const job = US.jobs.current, key = job ? job.id : 'none'; if (unattended.has(key)) { if (usd > unattended.get(key) + 1e-9) fromBudget(usd, feature); return; } }
    const ask = +US.settings.get('aiConfirmAbove', 0.25);
    if (ask > 0 && usd > ask && US.ui) {
      const ok = await US.ui.confirm({ title: `Use about ${fmtUSD(usd)} of Claude?`, text: `${feature || 'This job'} will cost about ${fmtUSD(usd)} with ${est.name} in total (you’ve used $${spent.toFixed(2)} this month).`, ok: 'Go ahead' });
      if (!ok) throw new US.UserError('CANCELLED', { title: 'AI request cancelled.', action: 'Nothing was sent.' });
    }
    const job = US.jobs.current; approvedJobs.set(job ? job.id : 'none', Math.max(usd, 1e-9));
  }

  /* ---------- what was sent: a local, per-project record of the exact text each request carried ---------- */
  // ai-sent/<project>.jsonl holds one line per request (and one when it ends); the text itself is kept once per block in
  // ai-sent/blocks/<hash>.txt, so the shared transcript sent fifty times is stored once. Nothing here leaves the computer.
  const sentDir = () => US.fsx.ensureDir(path.join(US.fsx.dataDir, 'ai-sent'));
  const blockDir = () => US.fsx.ensureDir(path.join(sentDir(), 'blocks'));
  const KEEP = { entries: 500, days: 90 };
  const projectOf = () => { const p = US.ctx && US.ctx.project; return p ? { key: US.fsx.hash(p.path || p.name), name: p.name || 'Project' } : { key: 'no-project', name: 'No project open' }; };
  /** The request as the provider receives it, in order: [{role, text, cached}] */
  function partsOf({ system, user, turns, schema }) {
    const out = [], add = (role, x) => { for (const b of [].concat(x || [])) { const text = typeof b === 'string' ? b : isImage(b) ? imageNote(b.image) : isMedia(b) ? mediaNote(b.media) : (b && b.text) || ''; if (text) out.push({ role, text, cached: !!(b && b.cache) }); } };
    add('system', system); add('user', user);
    for (const t of turns || []) { add('assistant', String(t.assistant || '')); add('user', String(t.user || '')); }
    if (schema) out.push({ role: 'format', text: 'Answer format (JSON schema): ' + JSON.stringify(schema), cached: false });
    return out;
  }
  const sentLog = {
    on: () => US.settings.get('ai.sentLog', true) !== false,
    /** Record a request about to be sent. -> entry (or null when the log is off) */
    begin({ provider, model, feature, req, est, as }) {
      if (!sentLog.on()) return null;
      const pr = projectOf(), parts = partsOf(req), id = US.uid('s');
      try {
        for (const p of parts) { p.block = US.fsx.hash(p.text); const f = path.join(blockDir(), p.block + '.txt'); if (!fs.existsSync(f)) fs.writeFileSync(f, p.text); }
        const j = as || (US.jobs && US.jobs.current);
        const e = { id, at: Date.now(), project: pr.name, feature: feature || '', job: j ? { id: j.id, title: j.title || '', about: j.about || '' } : null, provider, model, chars: parts.reduce((n, p) => n + p.text.length, 0), parts: parts.map(p => ({ role: p.role, block: p.block, chars: p.text.length, cached: p.cached })), estTokens: est ? est.inputTokens : 0, estUsd: est ? est.usd : 0 };
        fs.appendFileSync(path.join(sentDir(), pr.key + '.jsonl'), JSON.stringify(e) + '\n');
        return { id, key: pr.key };
      } catch (err) { console.error('sent log', err); return null; }
    },
    /** Note how it ended: tokens and cost, or the error. */
    end(h, out) { if (!h) return; try { fs.appendFileSync(path.join(sentDir(), h.key + '.jsonl'), JSON.stringify(Object.assign({ id: h.id, end: Date.now() }, out)) + '\n'); } catch (e) { /* the log is a convenience */ } },
    /** Projects with a log, newest first: [{key, name, count, last}] */
    projects() {
      let files = []; try { files = fs.readdirSync(sentDir()).filter(f => f.endsWith('.jsonl')); } catch (e) { return []; }
      return files.map(f => { const list = sentLog.list(f.replace(/\.jsonl$/, '')); return { key: f.replace(/\.jsonl$/, ''), name: list[0] ? list[0].project : f, count: list.length, last: list[0] ? list[0].at : 0 }; }).filter(p => p.count).sort((a, b) => b.last - a.last);
    },
    /** One project's requests, newest first, each with how it ended merged in. */
    list(key = projectOf().key) {
      let raw = ''; try { raw = fs.readFileSync(path.join(sentDir(), key + '.jsonl'), 'utf8'); } catch (e) { return []; }
      const byId = new Map(), order = [];
      // a request line carries its parts; a line without them says how one ended (after pruning they're merged in one)
      for (const line of raw.split('\n')) { if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch (e) { continue; } if (!o.parts) { if (byId.has(o.id)) Object.assign(byId.get(o.id), o); } else if (!byId.has(o.id)) { byId.set(o.id, o); order.push(o); } }
      return order.reverse();
    },
    /**
     * Requests gathered into what the editor did: one group per job (an Agent run, a wiki, Find themes in batches), and
     * requests made outside a job grouped by feature when they come within a few minutes of each other. items: newest
     * first (as list() gives them). -> [{key, title, about, features, items, from, to, usd, estUsd, chars, failed, provider}]
     */
    groups(items, { gapMin = 3 } = {}) {
      const out = [], open = new Map();
      for (const e of items || []) {
        let g = e.job && e.job.id ? open.get('job:' + e.job.id) : null;
        if (!g && !(e.job && e.job.id)) { const prev = open.get('f:' + e.feature); if (prev && prev.from - e.at <= gapMin * 60000) g = prev; }
        if (!g) {
          g = { key: e.job && e.job.id ? 'job:' + e.job.id : 'f:' + e.feature + ':' + e.id, title: (e.job && e.job.title) || e.feature || 'AI request', about: (e.job && e.job.about) || '', features: [], items: [], from: e.at, to: e.at, usd: 0, estUsd: 0, chars: 0, failed: 0, provider: e.provider };
          out.push(g);
          open.set(e.job && e.job.id ? 'job:' + e.job.id : 'f:' + e.feature, g);
        }
        g.items.push(e); g.from = Math.min(g.from, e.at); g.to = Math.max(g.to, e.at);
        g.usd += e.usd || 0; g.estUsd += e.estUsd || 0; g.chars += e.chars || 0; if (e.ok === false) g.failed++;
        if (e.feature && !g.features.includes(e.feature)) g.features.push(e.feature);
        if (!g.about && e.job && e.job.about) g.about = e.job.about;
      }
      return out;
    },
    /** The full text of a request, as sent, with a heading for each part. */
    text(e) {
      return (e.parts || []).map(p => { let t = ''; try { t = fs.readFileSync(path.join(blockDir(), p.block + '.txt'), 'utf8'); } catch (err) { t = '(no longer kept)'; } return `===== ${p.role.toUpperCase()}${p.cached ? ' (cached – Claude reads it again at a lower price)' : ''} · ${p.chars.toLocaleString('en-GB')} characters =====\n${t}`; }).join('\n\n');
    },
    /** Keep the last KEEP.entries and KEEP.days per project, and only the blocks still referred to. */
    prune() {
      try {
        const cut = Date.now() - KEEP.days * 86400e3, used = new Set();
        for (const f of fs.readdirSync(sentDir()).filter(x => x.endsWith('.jsonl'))) {
          const key = f.replace(/\.jsonl$/, ''), keep = sentLog.list(key).filter(e => e.at >= cut).slice(0, KEEP.entries);
          keep.forEach(e => (e.parts || []).forEach(p => used.add(p.block)));
          if (!keep.length) { fs.unlinkSync(path.join(sentDir(), f)); continue; }
          fs.writeFileSync(path.join(sentDir(), f), keep.slice().reverse().map(e => JSON.stringify(e)).join('\n') + '\n');
        }
        for (const b of fs.readdirSync(blockDir())) if (!used.has(b.replace(/\.txt$/, ''))) fs.unlinkSync(path.join(blockDir(), b));
      } catch (e) { /* tidy next time */ }
    },
    /** Forget one project's log (or every project's). */
    clear(key) {
      try { if (key) fs.unlinkSync(path.join(sentDir(), key + '.jsonl')); else for (const f of fs.readdirSync(sentDir()).filter(x => x.endsWith('.jsonl'))) fs.unlinkSync(path.join(sentDir(), f)); } catch (e) { /* already gone */ }
      sentLog.prune();
    },
    dir: () => sentDir(),
    project: projectOf
  };
  setTimeout(() => sentLog.prune(), 20000);   // tidy once a session, after start-up

  /* ---------- names kept out of AI (Story › Names and terms): placeholders out, real names back ---------- */
  let redactions = () => null;
  /** fn() -> {redact(text), restore(text)} or null – set by Story for the open project. */
  function setRedactions(fn) { redactions = typeof fn === 'function' ? fn : () => null; }
  /** The request with names swapped for placeholders (cache flags kept), and how to put them back. */
  function redacted({ system, user, turns }) {
    let R = null; try { R = redactions(); } catch (e) { R = null; }
    if (!R) return { system, user, turns, restore: t => t };
    const one = b => (typeof b === 'string' ? R.redact(b) : b && typeof b === 'object' && b.text != null ? Object.assign({}, b, { text: R.redact(b.text) }) : b);
    const many = x => (Array.isArray(x) ? x.map(one) : one(x));
    return { system: many(system), user: many(user), turns: (turns || []).map(t => ({ assistant: R.redact(String(t.assistant || '')), user: R.redact(String(t.user || '')) })), restore: t => R.restore(t) };
  }

  /**
   * “Show me before sending”: the exact text and its cost, before each request (Send, Send the rest of this job, Cancel).
   * Only when the editor asked for it (Settings › What was sent to AI); otherwise the cost question above applies.
   */
  const previewedJobs = new Set();
  async function preview({ provider, name, feature, req, est, as }) {
    if (US.settings.get('ai.preview', 'cost') !== 'always' || !US.ui || !US.ui.modal) return false;
    const job = as || US.jobs.current, key = whoKey(as);
    if (unattended.has(key)) return false;   // overnight runs have a budget instead, and nobody to ask
    if (previewedJobs.has(key)) return true;
    const parts = partsOf(req), chars = parts.reduce((n, p) => n + p.text.length, 0), h = US.h;
    const cost = provider === 'gemini' ? 'no charge within Google’s free allowance' : `about ${fmtUSD(est.usd)}${est.cachedTokens ? ` (${est.cachedTokens.toLocaleString('en-GB')} tokens read from Claude’s cache)` : ''}`;
    const shown = parts.map(p => `===== ${p.role.toUpperCase()}${p.cached ? ' (cached)' : ''} =====\n${p.text.length > 120000 ? p.text.slice(0, 120000) + `\n…and ${(p.text.length - 120000).toLocaleString('en-GB')} more characters` : p.text}`).join('\n\n');
    const v = await US.ui.modal({ title: `Send this to ${name}?`, wide: true,
      body: h('div', h('p', `${feature || 'This request'}: ${chars.toLocaleString('en-GB')} characters of text (about ${(est.inputTokens || Math.ceil(chars / 3.6)).toLocaleString('en-GB')} tokens) – ${cost}. ${mediaOf(req.user).length ? `This text, ${imagesOf(req.user).length} small still(s) and ${mediaOf(req.user).length} piece(s) of sound (${fmtBytes(mediaOf(req.user).reduce((n, b) => n + mediaBytes(b.media), 0))}) are sent – you chose “Cloud” for this project in Settings › Vision & listening models. Each is listed below, not shown.` : imagesOf(req.user).length ? `This text and ${imagesOf(req.user).length === 1 ? 'one small still' : imagesOf(req.user).length + ' small stills'} are sent (each still is listed below, not shown); no video or audio.` : 'Only this text is sent; no footage, frames or audio.'}`),
        h('textarea.input.mono.ai-preview', { readOnly: true, rows: 14 }, shown)),
      buttons: [{ label: 'Cancel', value: 'no', kind: 'ghost' }].concat(job ? [{ label: 'Send the rest of this job too', value: 'all' }] : []).concat([{ label: 'Send', value: 'one', kind: 'primary' }]) });
    if (v !== 'one' && v !== 'all') throw new US.UserError('CANCELLED', { title: 'AI request cancelled.', action: 'Nothing was sent.' });
    if (v === 'all' && job) previewedJobs.add(key);
    return true;
  }

  // requests in flight, so three quick clicks on Stop can cut them off (a request already answered is still billed by the provider)
  const live = new Set();
  US.bus.on('hard-stop', () => { for (const req of live) req.destroy(new US.UserError('CANCELLED')); live.clear(); });
  function postJSON(host, pathname, headers, body, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const req = https.request({ host, path: pathname, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': data.length }, headers), timeout: timeoutMs }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
          resolve({ status: res.statusCode, json, text });
        });
      });
      live.add(req);
      req.on('close', () => live.delete(req));
      req.on('timeout', () => req.destroy(new Error('timeout after ' + timeoutMs + 'ms')));
      req.on('error', e => reject(e));
      req.write(data); req.end();
    });
  }

  function httpError(provider, r) {
    const msg = (r.json && (r.json.error && (r.json.error.message || r.json.error.type))) || r.text.slice(0, 300);
    const detail = `${provider} ${r.status}: ${msg}`;
    if (r.status === 401 || r.status === 403) return new US.UserError('AI_KEY', { title: `Your ${provider} key was turned down.`, action: 'Check the key in Settings (copy it again from the provider’s website).', detail });
    if (r.status === 429) return new US.UserError('AI_FAILED', { title: `${provider} says you’ve hit your usage limit for now.`, action: 'Wait a minute and try again, or use the built-in commands.', detail });
    if (r.status === 404) return new US.UserError('AI_FAILED', { title: `That ${provider} model isn’t available to your key.`, action: 'Pick another model in Settings, or switch to the other AI.', detail });
    if (r.status === 400) return new US.UserError('AI_FAILED', { title: `${provider} didn’t accept the request.`, action: 'Try again; if it keeps happening, send the details to support.', detail });
    if (r.status >= 500) return new US.UserError('AI_FAILED', { title: `${provider} is having problems right now.`, action: 'Try again in a few minutes.', detail });
    return new US.UserError('AI_FAILED', { detail });
  }
  function networkError(provider, e) {
    if (e && e.code === 'CANCELLED') return e;   // three quick clicks on Stop
    const timeout = /timeout/i.test(String(e && e.message));
    return new US.UserError('AI_FAILED', timeout
      ? { title: `${provider} took too long to answer.`, action: 'Try again. If it keeps happening, switch to the other AI in Settings.', detail: String(e && e.message) }
      : { title: `Couldn’t reach ${provider}.`, action: 'Check your internet connection, then try again.', detail: String(e && e.message) });
  }

  /* ---------- Claude (Anthropic Messages API, raw HTTPS: the SDK needs Node 18+, Premiere's panel runs Node 17) ---------- */
  /** Text or blocks → Anthropic content. A block {text, cache:true} becomes a cache breakpoint (e.g. a transcript
      listing sent again and again), so repeated requests read it at a tenth of the price or less. */
  function toContent(x) {
    if (!Array.isArray(x)) return String(x || '');
    // cache: true = 5 minutes (write costs 1.25× input); cache: '1h' = an hour (write 2×) for listings reused across an editing session
    return x.map(b => typeof b === 'string' ? { type: 'text', text: b } : isImage(b) ? { type: 'image', source: { type: 'base64', media_type: b.image.mime || 'image/jpeg', data: b.image.data } } : Object.assign({ type: 'text', text: b.text }, b.cache ? { cache_control: b.cache === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' } } : {}));
  }
  /** turns: earlier rounds of the same conversation after the first message, [{assistant, user}] (a follow-up keeps the
      cached first message, so the transcripts in it are read from the cache). */
  async function claude({ system, user, turns, schema, maxTokens = 16000, effort = 'low', feature, as, model: wanted, onUsage }) {
    const red = redacted({ system, user, turns }); ({ system, user, turns } = red);
    const key = US.secrets.get('anthropicKey');
    if (!key) throw new US.UserError('AI_KEY');
    const model = MODELS[wanted] ? wanted : claudeModel(), price = MODELS[model], est = estimate({ system, user, turns, maxTokens, effort, model });
    if (!(await preview({ provider: 'claude', name: price.name, feature, req: { system, user, turns, schema }, est, as }))) await checkSpend(est, feature, as);
    else { const cap = +US.settings.get('aiMonthlyCap', 0), spent = thisMonth().cost; if (cap > 0 && spent + est.usd > cap) await checkSpend(est, feature, as); }
    const body = {
      model,
      max_tokens: maxTokens,
      system: Array.isArray(system) || (system && typeof system === 'object') ? toContent([].concat(system)) : system,
      messages: [{ role: 'user', content: toContent(user) }].concat((turns || []).flatMap(t => [{ role: 'assistant', content: String(t.assistant) }, { role: 'user', content: String(t.user) }])),
      output_config: Object.assign({ effort }, schema ? { format: { type: 'json_schema', schema } } : {})
    };
    const headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
    if (price.fallbacks) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    let r;
    const startedAt = Date.now(), logged = sentLog.begin({ provider: 'claude', model, feature, req: { system, user, turns, schema }, est, as });
    try { r = await postJSON('api.anthropic.com', '/v1/messages', headers, body, 300000); }
    catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw networkError('Claude', e); }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw httpError('Claude', r); }
    const msg = r.json;
    const usedModel = msg.model && MODELS[msg.model] ? msg.model : model;
    if (msg.usage) record(usedModel, msg.usage, feature, costOf(usedModel, msg.usage), key);
    if (msg.usage) settleBudget(est.usd, costOf(usedModel, msg.usage), as);
    if (onUsage) { try { onUsage({ provider: 'claude', model: usedModel, name: MODELS[usedModel].name, usd: msg.usage ? costOf(usedModel, msg.usage) : 0, tokensIn: msg.usage ? (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0) : 0, tokensOut: msg.usage ? msg.usage.output_tokens || 0 : 0 }); } catch (e) { /* the caller's sums */ } }
    sentLog.end(logged, { ok: true, model: usedModel, usd: msg.usage ? costOf(usedModel, msg.usage) : 0, tokensIn: msg.usage ? msg.usage.input_tokens + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0) : 0, cacheRead: msg.usage ? msg.usage.cache_read_input_tokens || 0 : 0, tokensOut: msg.usage ? msg.usage.output_tokens : 0 });
    if (msg.usage && (msg.usage.cache_read_input_tokens || msg.usage.cache_creation_input_tokens)) noteWarm([].concat(Array.isArray(user) ? user : [], Array.isArray(system) ? system : []), usedModel, startedAt);
    if (msg.stop_reason === 'refusal') throw new US.UserError('AI_REFUSED', { detail: JSON.stringify(msg.stop_details || {}) });
    if (msg.stop_reason === 'max_tokens') throw new US.UserError('AI_FAILED', { title: 'The AI’s answer was too long and got cut off.', action: 'Try a smaller request (fewer clips or interviews at once).', detail: 'stop_reason max_tokens' });
    const text = red.restore((msg.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
    return { text, usage: msg.usage };
  }

  /* ---------- Gemini (Google AI Studio key) ---------- */
  const GEMINI_DEFAULT = 'gemini-flash-latest', GEMINI_FAST_DEFAULT = 'gemini-flash-lite-latest';
  /** 'gemini-3.8-flash' -> 'Gemini 3.8 Flash'; a “-latest” name -> the model it last turned out to be. */
  function geminiName(id) {
    id = String(id || '');
    if (/-latest$/.test(id)) { const seen = (US.settings.get('geminiSeen', {}) || {})[id]; return seen ? geminiName(seen) : /lite/.test(id) ? 'Gemini Flash-Lite (latest)' : 'Gemini Flash (latest)'; }
    return id.replace(/^models\//, '').split('-').map(w => (w === 'gemini' ? 'Gemini' : w === 'flash' ? 'Flash' : w === 'lite' ? 'Lite' : w === 'pro' ? 'Pro' : w === 'preview' ? '(preview)' : w)).join(' ').replace('Flash Lite', 'Flash-Lite');
  }
  function noteGemini(alias, version) {
    const seen = US.settings.get('geminiSeen', {}) || {};
    if (seen[alias] !== version) US.settings.set('geminiSeen', Object.assign({}, seen, { [alias]: version }));
  }
  /** The text models this key can use (Flash, Flash-Lite and Pro), newest first. */
  async function geminiModels() {
    const key = US.secrets.get('geminiKey');
    if (!key) return [];
    const r = await new Promise(resolve => {
      const req = https.request({ host: 'generativelanguage.googleapis.com', path: '/v1beta/models?pageSize=200', method: 'GET', headers: { 'x-goog-api-key': key }, timeout: 20000 }, res => { const c = []; res.on('data', x => c.push(x)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { resolve({}); } }); });
      req.on('error', () => resolve({})); req.on('timeout', () => { req.destroy(); resolve({}); }); req.end();
    });
    const ver = n => (n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1];
    return (r.models || []).map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini-[\d.]+-(flash|pro)/.test(n) && !/tts|image|audio|live|embedding|omni|exp/.test(n))
      .sort((a, b) => ver(b) - ver(a) || a.localeCompare(b));
  }
  async function gemini({ system, user, turns, schema, maxTokens = 16000, fast, feature, as, model: wanted, onUsage }) {
    const red = redacted({ system, user, turns }); ({ system, user, turns } = red);
    const asked = { system, user, turns, schema }, stills = imagesOf(user);
    // text first, then the stills in order (each still's line of text says which one it is)
    const userParts = stills.length ? user.map(b => (isImage(b) ? { inlineData: { mimeType: b.image.mime || 'image/jpeg', data: b.image.data } } : { text: typeof b === 'string' ? b : b.text || '' })).filter(x => x.inlineData || x.text) : null;
    system = blocksText(system); user = blocksText(user);
    const key = US.secrets.get('geminiKey');
    if (!key) throw new US.UserError('AI_KEY');
    // the "flash" models think before answering (10–45 s); "flash-lite" answers quick requests in about a second
    const model = wanted || (fast ? US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT) : US.settings.get('geminiModel', GEMINI_DEFAULT));
    const body = {
      systemInstruction: { parts: [{ text: system + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '') }] },
      contents: [{ role: 'user', parts: userParts || [{ text: user }] }].concat((turns || []).flatMap(t => [{ role: 'model', parts: [{ text: String(t.assistant) }] }, { role: 'user', parts: [{ text: String(t.user) }] }])),
      generationConfig: Object.assign({ maxOutputTokens: Math.max(maxTokens, fast ? 256 : 2048) }, schema ? { responseMimeType: 'application/json' } : {})
    };
    const ask = (m, ms) => postJSON('generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(m)}:generateContent`, { 'x-goog-api-key': key }, body, ms);
    const gEst = { usd: 0, inputTokens: Math.ceil((system.length + user.length + turnsText(turns).length) / 3.6) };
    await preview({ provider: 'gemini', name: geminiName(model), feature, req: asked, est: gEst, as });
    const logged = sentLog.begin({ provider: 'gemini', model, feature, req: asked, est: gEst, as });
    let r, used = model;
    try { r = await ask(model, fast ? 60000 : 180000); } catch (e) { if (fast) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw networkError('Gemini', e); } r = { status: 0, error: e }; }
    // the thinking model is often overloaded (503 "high demand", rate limits, or no answer for minutes):
    // then the quick model answers this request instead of failing or keeping the editor waiting
    if (!fast && (r.status === 0 || r.status === 429 || r.status >= 500)) {
      const lite = US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT);
      US.log('info', `Gemini ${model} was busy (${r.status || 'no answer'}), so ${lite} answered instead`, '', 'ai');
      try { r = await ask(lite, 120000); used = lite; } catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw networkError('Gemini', e); }
    }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw httpError('Gemini', r); }
    { const u = r.json.usageMetadata || {}; sentLog.end(logged, { ok: true, model: r.json.modelVersion || used, usd: 0, tokensIn: u.promptTokenCount || 0, tokensOut: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) }); }
    // the “-latest” names follow Google's newest model: remember which one answered, so Settings can say
    if (r.json.modelVersion) noteGemini(used, r.json.modelVersion);
    if (r.json.usageMetadata) record(r.json.modelVersion || used, r.json.usageMetadata, feature, 0, key); // within Google's free allowance
    if (onUsage) { try { onUsage({ provider: 'gemini', model: r.json.modelVersion || used, name: geminiName(r.json.modelVersion || used), usd: 0, tokensIn: (r.json.usageMetadata || {}).promptTokenCount || 0, tokensOut: ((r.json.usageMetadata || {}).candidatesTokenCount || 0) + ((r.json.usageMetadata || {}).thoughtsTokenCount || 0) }); } catch (e) { /* the caller's sums */ } }
    const cand = (r.json.candidates || [])[0];
    if (!cand) throw new US.UserError('AI_REFUSED', { detail: JSON.stringify(r.json.promptFeedback || r.json).slice(0, 500) });
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    if (!text && cand.finishReason === 'MAX_TOKENS') throw new US.UserError('AI_FAILED', { title: 'The AI ran out of room before answering.', action: 'Try a smaller request (fewer interviews or lines at once).', detail: `${used}: finishReason MAX_TOKENS, ${JSON.stringify(r.json.usageMetadata || {})}` });
    if (!text) throw new US.UserError('AI_FAILED', { title: 'The AI sent back an empty answer.', action: 'Try again.', detail: `${used}: finishReason ${cand.finishReason}` });
    return { text: red.restore(text), usage: r.json.usageMetadata, model: used };
  }

  /* ---------- on this computer: a local model (Ollama, LM Studio – their OpenAI-style endpoint), nothing leaves ---------- */
  const LOCAL_URL = 'http://localhost:11434';
  const localUrl = () => String(US.settings.get('ai.localUrl', LOCAL_URL) || LOCAL_URL).replace(/\/+$/, '');
  const localModel = () => String(US.settings.get('ai.localModel', '') || '').trim();
  /** Only this computer: a local model's address must be localhost. */
  function localTarget(base) {
    let u; try { u = new URL(base || localUrl()); } catch (e) { throw new US.UserError('AI_FAILED', { title: 'The local AI’s address isn’t right.', action: 'Use something like http://localhost:11434 (Ollama) or http://localhost:1234 (LM Studio) in Settings.' }); }
    if (!/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(u.hostname)) throw new US.UserError('AI_FAILED', { title: 'The local AI must run on this computer.', action: 'Its address has to start with http://localhost – a model elsewhere would mean text leaving this computer.' });
    return u;
  }
  /* "localhost" as 127.0.0.1 first: Windows resolves it to ::1 first, and Premiere's Node (17) doesn't try the other
     address, while Ollama and LM Studio listen on 127.0.0.1 only – so they seemed not to be running on a PC. The Mac
     already gets 127.0.0.1 first; this makes Windows the same. */
  function localLookup(host, opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (!/^localhost$/i.test(host)) return require('dns').lookup(host, opts, cb);
    const fam = typeof opts === 'number' ? opts : (opts && opts.family) || 0;
    const list = (fam === 6 ? [] : [{ address: '127.0.0.1', family: 4 }]).concat(fam === 4 ? [] : [{ address: '::1', family: 6 }]);
    return opts && opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  }
  function httpLocal(method, pathname, body, timeoutMs = 600000, base) {
    const u = localTarget(base), mod = u.protocol === 'https:' ? https : require('http');
    return new Promise((resolve, reject) => {
      const data = body ? Buffer.from(JSON.stringify(body)) : null;
      const req = mod.request({ hostname: u.hostname.replace(/^\[|\]$/g, ''), lookup: localLookup, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: (u.pathname.replace(/\/$/, '') || '') + pathname, method, headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, timeout: timeoutMs }, res => {
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, json, text }); });
      });
      live.add(req); req.on('close', () => live.delete(req));
      req.on('timeout', () => req.destroy(new Error('timeout after ' + timeoutMs + 'ms')));
      req.on('error', e => reject(e));
      if (data) req.write(data); req.end();
    });
  }
  /** The models the local AI has (names to choose from). */
  async function localModels() {
    try { const r = await httpLocal('GET', '/v1/models', null, 8000); if (r.json && Array.isArray(r.json.data)) return r.json.data.map(m => m.id).filter(Boolean); } catch (e) { /* try Ollama's own list */ }
    try { const r = await httpLocal('GET', '/api/tags', null, 8000); if (r.json && Array.isArray(r.json.models)) return r.json.models.map(m => m.name).filter(Boolean); } catch (e) { /* not running */ }
    return [];
  }
  /** Is the local AI app answering (Ollama or LM Studio)? -> {ok, kind: 'ollama'|'other'|''} */
  async function localStatus() {
    try { const r = await httpLocal('GET', '/api/tags', null, 4000); if (r.status === 200 && r.json && Array.isArray(r.json.models)) return { ok: true, kind: 'ollama' }; } catch (e) { /* not Ollama, or not running */ }
    try { const r = await httpLocal('GET', '/v1/models', null, 4000); if (r.status === 200) return { ok: true, kind: 'other' }; } catch (e) { /* nothing there */ }
    return { ok: false, kind: '' };
  }
  /**
   * Download a model with Ollama (only when the editor asks). onProgress({status, done, total}) as it comes down.
   * Resolves when it is ready; Stop (three clicks) or cancel() ends it – what has come down so far is kept by Ollama.
   */
  function pullLocal(model, onProgress = () => {}) {
    const u = localTarget(), mod = u.protocol === 'https:' ? https : require('http');
    let req = null;
    const p = new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify({ model, stream: true }));
      req = mod.request({ hostname: u.hostname.replace(/^\[|\]$/g, ''), lookup: localLookup, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: (u.pathname.replace(/\/$/, '') || '') + '/api/pull', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, res => {
        if (res.statusCode !== 200) { const c = []; res.on('data', x => c.push(x)); res.on('end', () => reject(new US.UserError('AI_FAILED', { title: res.statusCode === 404 ? 'This needs Ollama.' : 'The download didn’t start.', action: res.statusCode === 404 ? 'LM Studio downloads models in its own window; with Ollama (ollama.com) Ultra Studio can do it for you.' : 'Check Ollama is running, then try again.', detail: `${res.statusCode}: ${Buffer.concat(c).toString('utf8').slice(0, 300)}` }))); return; }
        let buf = '', failed = '';
        res.on('data', chunk => {
          buf += chunk.toString('utf8');
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line) continue;
            try { const j = JSON.parse(line); if (j.error) failed = j.error; else onProgress({ status: j.status || '', done: j.completed || 0, total: j.total || 0 }); } catch (e) { /* a partial line */ }
          }
        });
        res.on('end', () => (failed ? reject(new US.UserError('AI_FAILED', { title: 'The model couldn’t be downloaded.', action: 'Check the internet connection and free disk space, then try again.', detail: failed })) : resolve(true)));
      });
      live.add(req); req.on('close', () => live.delete(req));
      req.on('error', e => reject(e && e.code === 'CANCELLED' ? e : new US.UserError('AI_FAILED', { title: 'Ollama isn’t answering.', action: 'Start Ollama (ollama.com), then try again.', detail: String(e && e.message || e) })));
      req.write(data); req.end();
    });
    p.cancel = () => { try { req && req.destroy(new US.UserError('CANCELLED')); } catch (e) { /* gone */ } };
    return p;
  }
  /** Remove a model Ollama has (frees its disk space). */
  async function removeLocal(model) {
    const r = await httpLocal('DELETE', '/api/delete', { model }, 20000);
    if (r.status !== 200) throw new US.UserError('AI_FAILED', { title: 'The model couldn’t be removed.', action: 'Remove it in Ollama itself (ollama rm …).', detail: `${r.status}: ${String(r.text || '').slice(0, 200)}` });
    return true;
  }
  async function local({ system, user, turns, schema, maxTokens = 16000, feature, as, onUsage, model: wanted, url, temperature = 0.2, noThinking = false }) {
    // url: another address on this computer (Ultra Studio's own helper for seeing and hearing) – still localhost only
    const model = wanted || localModel();
    if (!model) throw new US.UserError('AI_KEY', { title: 'Choose a local model first.', action: 'Settings › AI › On this computer: pick the model (Ollama or LM Studio must be running).' });
    localTarget(url);   // this computer only – checked before anything is logged or sent
    const sys = blocksText(system) + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '');
    const stills = imagesOf(user).concat(mediaOf(user));
    const content = stills.length ? user.map(b => (isImage(b) ? { type: 'image_url', image_url: { url: `data:${b.image.mime || 'image/jpeg'};base64,${b.image.data}` } } : isMedia(b) ? { type: 'input_audio', input_audio: { data: b.media.data, format: /mp3|mpeg/.test(b.media.mime || '') ? 'mp3' : 'wav' } } : { type: 'text', text: typeof b === 'string' ? b : b.text || '' })).filter(x => x.image_url || x.input_audio || x.text) : blocksText(user);
    const messages = [{ role: 'system', content: sys }, { role: 'user', content }].concat((turns || []).flatMap(t => [{ role: 'assistant', content: String(t.assistant) }, { role: 'user', content: String(t.user) }]));
    // noThinking (Ultra Studio's helper): a model that thinks before answering (Gemma 4) spends the whole answer on its
    // thoughts and leaves the answer empty – llama-server switches that off with these two (other servers ignore them)
    const body = Object.assign({ model, messages, max_tokens: Math.min(maxTokens, 16000), temperature, stream: false }, noThinking ? { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } } : {}, schema ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema, strict: false } } } : {});
    const logged = sentLog.begin({ provider: 'local', model, feature, req: { system, user, turns, schema }, est: { usd: 0, inputTokens: Math.ceil(sys.length / 3.6) }, as });
    let r;
    try { r = await httpLocal('POST', '/v1/chat/completions', body, 600000, url); }
    catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw new US.UserError('AI_FAILED', { title: 'The local AI didn’t answer.', action: 'Start Ollama or LM Studio (with the model loaded), then try again.', detail: String(e && e.message || e) }); }
    // older Ollama: no json_schema – ask again with its own JSON mode
    if (r.status === 400 && schema) { delete body.response_format; body.format = 'json'; try { r = await httpLocal('POST', '/v1/chat/completions', body, 600000, url); } catch (e) { /* reported below */ } }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw new US.UserError('AI_FAILED', { title: 'The local AI said no.', action: 'Check the model name in Settings, and that it’s loaded.', detail: `${r.status}: ${String(r.text || '').slice(0, 400)}` }); }
    const ch = (r.json.choices || [])[0] || {}, text = String((ch.message && ch.message.content) || '').replace(/^<think>[\s\S]*?<\/think>\s*/, '');
    const u = r.json.usage || {};
    sentLog.end(logged, { ok: true, model, usd: 0, tokensIn: u.prompt_tokens || 0, tokensOut: u.completion_tokens || 0 });
    record('local:' + model, { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 }, feature, 0, null);   // no key: nothing to bill
    if (onUsage) { try { onUsage({ provider: 'local', model, name: `${model} (on this computer)`, usd: 0, tokensIn: u.prompt_tokens || 0, tokensOut: u.completion_tokens || 0 }); } catch (e) { /* the caller's sums */ } }
    if (!text) {
      // thoughts are never taken for the answer, even when they hold something that looks like one
      const thought = !!(ch.message && ch.message.reasoning_content), cut = ch.finish_reason === 'length';
      const e = new US.UserError('AI_FAILED', cut
        ? { title: 'The model on this computer ran out of room before answering.', action: thought ? 'It spent its answer thinking. Try again; if it keeps happening, choose another model in Settings.' : 'Try a smaller request, or a larger model.', detail: `finish_reason length after ${u.completion_tokens || '?'} tokens${thought ? ' (all of it reasoning_content)' : ''}; max_tokens ${body.max_tokens}` }
        : { title: 'The local AI sent back an empty answer.', action: 'Try again, or a larger model.', detail: `finish_reason ${ch.finish_reason || '?'}${thought ? '; only reasoning_content came back' : ''}` });
      e.emptyAnswer = true; e.thought = thought; e.cut = cut;
      throw e;
    }
    return { text };
  }
  /** "Nothing leaves this computer" for the open project: only the local model (or no AI) is used for it. */
  const offlineProjects = () => US.settings.get('ai.offlineProjects', {}) || {};
  const projectOffline = () => !!offlineProjects()[projectOf().key];
  function setProjectOffline(on) { const m = Object.assign({}, offlineProjects()); if (on) m[projectOf().key] = projectOf().name; else delete m[projectOf().key]; US.settings.set('ai.offlineProjects', m); }

  function provider() {
    const pref = US.settings.get('aiProvider', 'auto');
    const hasC = !!US.secrets.get('anthropicKey'), hasG = !!US.secrets.get('geminiKey'), hasL = !!localModel();
    if (projectOffline()) return hasL ? 'local' : 'none';
    if (pref === 'local') return hasL ? 'local' : 'none';
    if (pref === 'claude' && hasC) return 'claude';
    if (pref === 'gemini' && hasG) return 'gemini';
    if (pref === 'off') return 'none';
    return hasC ? 'claude' : hasG ? 'gemini' : 'none';
  }

  function parseJSON(text) {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (e) {
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) { /* fall through */ } }
      throw new US.UserError('AI_FAILED', { title: 'The AI’s answer didn’t make sense.', action: 'Try again – it usually works the second time.', detail: t.slice(0, 800) });
    }
  }

  /* ---------- cloud seeing and hearing: prices for the estimates, and the one function that sends sound ---------- */
  // US dollars per million tokens at Google's standard paid rate, read on MEDIA_PRICES.date (ai.google.dev/gemini-api/docs/pricing).
  // Google's pages give two token rates for sound and stills – the estimates use both as a range. A key on Google's free
  // allowance pays nothing, but Google may then use what is sent to improve its products (paid: it doesn't).
  const MEDIA_PRICES = {
    date: '19 Nov 2026', source: 'ai.google.dev/gemini-api/docs/pricing',
    gemini: {
      'gemini-3.5-flash-lite': { name: 'Gemini 3.5 Flash-Lite', in: 0.30, out: 2.50 },
      'gemini-3.8-flash': { name: 'Gemini 3.8 Flash', in: 0.75, out: 3.75 },
      'gemini-4-hydrogen': { name: 'Gemini 4 Hydrogen', in: 1.50, out: 7.50 }
    },
    // tokens: sound per second (25–32), a small still (258–280 at low media resolution), words back per minute of footage
    tokens: { audioPerSec: [25, 32], still: [258, 280], outPerMin: [120, 260] }
  };
  /** The price row for a Gemini model name (a “-latest” name is priced as the model it follows). */
  function mediaPrice(model) {
    let id = String(model || '');
    if (/-latest$/.test(id)) id = (US.settings.get('geminiSeen', {}) || {})[id] || (/lite/.test(id) ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash');
    const G = MEDIA_PRICES.gemini;
    return G[id] || G[Object.keys(G).find(k => id.indexOf(k) === 0)] || (/lite/.test(id) ? G['gemini-3.5-flash-lite'] : /flash/.test(id) ? G['gemini-3.8-flash'] : G['gemini-4-hydrogen']);
  }
  const MEDIA_MAX = 18 * 1024 * 1024;   // one request's stills and sound together (Gemini's inline limit, with room to spare)
  /** Which cloud model sees and hears: {provider, model, label, hears} – Gemini hears; Claude sees stills only. */
  function mediaModel(use) {
    const want = use || US.settings.get('understand.cloudModel', '');
    const hasG = !!US.secrets.get('geminiKey'), hasC = !!US.secrets.get('anthropicKey');
    const m = /^(gemini|claude):(.+)$/.exec(String(want || ''));
    if (m && m[1] === 'claude' && hasC && MODELS[m[2]]) return { provider: 'claude', model: m[2], label: MODELS[m[2]].name, hears: false };
    if (m && m[1] === 'gemini' && hasG) return { provider: 'gemini', model: m[2], label: geminiName(m[2]), hears: true };
    if (hasG) { const g = US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT); return { provider: 'gemini', model: g, label: geminiName(g), hears: true }; }
    if (hasC) return { provider: 'claude', model: 'claude-haiku-5-5', label: MODELS['claude-haiku-5-5'].name, hears: false };
    return { provider: 'none', model: '', label: 'No cloud AI', hears: false };
  }
  /**
   * Stills and sound of the footage to a cloud model, answered as JSON. The only way sound leaves this computer:
   * refused for a project kept on this computer, refused until “Cloud” is chosen for the project, and written to
   * What was sent to AI with each piece's size. Gemini takes stills and sound; Claude takes stills only.
   */
  async function media({ system, user, schema, maxTokens = 2000, feature = 'Seeing and hearing', as, use, onUsage }) {
    if (projectOffline()) throw new US.UserError('AI_FAILED', { title: 'This project is set to “nothing leaves this computer”.', action: 'Its footage is only looked at and listened to on this computer (Settings › Vision & listening models).' });
    if (!mediaOn()) throw new US.UserError('AI_FAILED', { title: 'Seeing and hearing in the cloud isn’t switched on for this project.', action: 'Settings › Vision & listening models: choose “Cloud” for this project (you’re shown the cost first) – or stay on this computer.' });
    const M = mediaModel(use), sounds = mediaOf(user);
    if (M.provider === 'none') throw new US.UserError('AI_KEY', { title: 'There’s no Gemini or Claude key for cloud seeing and hearing.', action: 'Add a key in Settings › AI, or use the models on this computer.' });
    if (M.provider === 'claude') {
      if (sounds.length) throw new US.UserError('AI_FAILED', { title: 'Claude can look at stills but can’t listen.', action: 'Choose a Gemini model for cloud listening, or listen on this computer.' });
      const r = await claude({ system, user, schema, maxTokens, effort: 'low', feature, as, model: M.model, onUsage });
      return parseJSON(r.text);
    }
    const key = US.secrets.get('geminiKey'), asked = { system, user, schema };
    const bytes = sounds.reduce((n, b) => n + mediaBytes(b.media), 0) + imagesOf(user).reduce((n, b) => n + Math.floor(String(b.image.data).length * 3 / 4), 0);
    if (bytes > MEDIA_MAX) throw new US.UserError('AI_FAILED', { title: 'That is too much sound for one request.', action: 'Ultra Studio sends long clips in pieces; try again.', detail: `${fmtBytes(bytes)} in one request (limit ${fmtBytes(MEDIA_MAX)})` });
    const parts = (Array.isArray(user) ? user : [user]).map(b => (isImage(b) ? { inlineData: { mimeType: b.image.mime || 'image/jpeg', data: b.image.data } } : isMedia(b) ? { inlineData: { mimeType: b.media.mime || 'audio/wav', data: b.media.data } } : { text: typeof b === 'string' ? b : (b && b.text) || '' })).filter(x => x.inlineData || x.text);
    const body = {
      systemInstruction: { parts: [{ text: blocksText(system) + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '') }] },
      contents: [{ role: 'user', parts }],
      generationConfig: Object.assign({ maxOutputTokens: Math.max(maxTokens, 1024), mediaResolution: 'MEDIA_RESOLUTION_LOW' }, schema ? { responseMimeType: 'application/json' } : {})
    };
    const price = mediaPrice(M.model), secs = sounds.reduce((n, b) => n + (+b.media.seconds || 0), 0);
    const estIn = Math.ceil(blocksText(system).length / 3.6 + blocksText(user).length / 3.6) + imagesOf(user).length * MEDIA_PRICES.tokens.still[1] + Math.ceil(secs * MEDIA_PRICES.tokens.audioPerSec[1]);
    const est = { usd: 0, inputTokens: estIn, paidUsd: estIn * price.in / 1e6 };
    await preview({ provider: 'gemini', name: M.label, feature, req: asked, est, as });
    const logged = sentLog.begin({ provider: 'gemini', model: M.model, feature, req: asked, est, as });
    let r;
    try { r = await postJSON('generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(M.model)}:generateContent`, { 'x-goog-api-key': key }, body, 300000); }
    catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw networkError('Gemini', e); }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw httpError('Gemini', r); }
    const um = r.json.usageMetadata || {}, used = r.json.modelVersion || M.model, up = mediaPrice(used);
    const paidUsd = ((um.promptTokenCount || 0) * up.in + ((um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0)) * up.out) / 1e6;
    sentLog.end(logged, { ok: true, model: used, usd: 0, paidRateUsd: paidUsd, mediaBytes: bytes, mediaSeconds: secs, tokensIn: um.promptTokenCount || 0, tokensOut: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0) });
    if (r.json.modelVersion) noteGemini(M.model, r.json.modelVersion);
    if (r.json.usageMetadata) record(used, r.json.usageMetadata, feature, 0, key);   // as every Gemini request: nothing is billed within Google's free allowance
    if (onUsage) { try { onUsage({ provider: 'gemini', model: used, name: geminiName(used), usd: 0, paidUsd, bytes }); } catch (e) { /* the caller's sums */ } }
    const cand = (r.json.candidates || [])[0];
    if (!cand) throw new US.UserError('AI_REFUSED', { detail: JSON.stringify(r.json.promptFeedback || r.json).slice(0, 500) });
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    if (!text) throw new US.UserError('AI_FAILED', { title: 'The AI sent back an empty answer.', action: 'Try again.', detail: `${used}: finishReason ${cand.finishReason}` });
    return parseJSON(text);
  }
  /** A model on this computer at its own address (Ultra Studio's helper): stills and sound, JSON back. Nothing leaves. */
  async function localAt({ url, model, system, user, schema, maxTokens = 1500, feature, as, onUsage, temperature }) {
    const ask = max => local({ system, user, schema, maxTokens: max, feature, as, onUsage, model: model || 'local', url, temperature, noThinking: true });
    let r;
    try { r = await ask(maxTokens); }
    catch (e) {
      // an empty answer (the model thought, or ran out of room): once more with thinking off and three times the room
      if (!(e && e.emptyAnswer)) throw e;
      US.log('info', `The model on this computer gave no answer (${e.cut ? 'ran out of room' : 'empty'}${e.thought ? ', it was thinking' : ''}) – asking once more with more room`, e.detail || '', 'understand');
      r = await ask(Math.min(16000, maxTokens * 3));
    }
    return parseJSON(r.text);
  }

  US.ai = {
    /** Seeing and hearing (Settings › Vision & listening models). */
    media, mediaOn, setMedia, mediaModel, mediaPrice, MEDIA_PRICES, localAt, _media: { isMedia, mediaOf, mediaNote, mediaBytes, fmtBytes },
    CLAUDE_MODEL, MODELS, claudeModel, estimate, costOf, fmtUSD, warmUntil,
    /** The local record of what was sent (Settings › What was sent to AI). */
    sent: sentLog, setRedactions,
    /**
     * Usage per API key, newest first: [{id, provider, name, last4, added, first, last, calls, cost, tokensIn, tokensOut,
     * thisMonth, current}], and what was used before keys were tracked: {since, claude:{calls, cost}, gemini:{calls, cost}}.
     */
    keyUsage() {
      const l = ledger(), cur = Object.fromEntries(Object.entries(KEY_PROVIDER).map(([n, p]) => [p, readSecrets()[n] ? keyId(readSecrets()[n]) : '']));
      const keys = Object.entries(l.keys || {}).map(([id, K]) => Object.assign({ id }, K, { thisMonth: K.months[monthKey()] || { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0 }, current: cur[K.provider] === id }))
        .sort((a, b) => (b.current - a.current) || ((b.added || b.first || 0) - (a.added || a.first || 0)));
      // before: all the months' totals by model, less what the keys account for
      const before = { since: l.trackedSince || null, claude: { calls: 0, cost: 0 }, gemini: { calls: 0, cost: 0 } };
      for (const m of Object.values(l.months || {})) for (const [model, b] of Object.entries(m.byModel || {})) { if (/^local:/.test(model)) continue; const p = /^gemini/.test(model) ? 'gemini' : 'claude'; before[p].calls += b.calls; before[p].cost += b.cost; }
      for (const K of keys) { const b = before[K.provider]; if (b) { b.calls -= K.calls; b.cost -= K.cost; } }
      for (const p of ['claude', 'gemini']) { before[p].calls = Math.max(0, before[p].calls); before[p].cost = Math.max(0, before[p].cost); }
      return { keys, before };
    },
    /** A name for a key (the providers don't tell apps the name you gave it). */
    nameKey(id, name) { const l = ledger(); if (l.keys && l.keys[id]) { l.keys[id].name = String(name || '').trim().slice(0, 60); US.fsx.writeJSON(ledgerFile, l); } },
    /** Spending this month: {calls, cost, tokensIn, tokensOut, byFeature, byModel} */
    spending: thisMonth,
    approveTotal: (usd, feature) => provider() === 'claude' ? approveTotal(usd, feature) : Promise.resolve(),
    /** Give the running job a budget it spends without asking (unattended runs). Ask the person first, while they're there. */
    setBudget(usd, as) { unattended.set(whoKey(as), Math.max(0, usd)); },
    budgetLeft(as) { const key = whoKey(as); return unattended.has(key) ? unattended.get(key) : null; },
    endBudget(as) { unattended.delete(whoKey(as)); },
    /**
     * The AIs that can be used right now, for a chat that picks its own: [{id, provider, model, label, hint}] – the first
     * is “Automatic” (whatever Settings says). A project kept on this computer only offers the local model.
     */
    choices() {
      const out = [{ id: 'auto', provider: '', model: '', label: 'Automatic', hint: provider() === 'none' ? 'No AI is set up' : `Settings’ choice – now ${US.ai.label()}` }];
      if (projectOffline()) return out;
      if (US.secrets.get('anthropicKey')) for (const [id, m] of Object.entries(MODELS)) out.push({ id: 'claude:' + id, provider: 'claude', model: id, label: m.name, hint: m.short });
      if (US.secrets.get('geminiKey')) { out.push({ id: 'gemini:' + US.settings.get('geminiModel', GEMINI_DEFAULT), provider: 'gemini', model: US.settings.get('geminiModel', GEMINI_DEFAULT), label: geminiName(US.settings.get('geminiModel', GEMINI_DEFAULT)), hint: 'Google – free allowance' }); out.push({ id: 'gemini:' + US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT), provider: 'gemini', model: US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT), label: geminiName(US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT)), hint: 'Google – quickest' }); }
      if (localModel()) out.push({ id: 'local:' + localModel(), provider: 'local', model: localModel(), label: `${localModel()} (on this computer)`, hint: 'Nothing leaves this computer' });
      return out;
    },
    /** The provider and model a request's “use” means (a choices() id, or {provider, model}); the usual one when it can't be used. */
    resolveUse(use) {
      const u = typeof use === 'string' ? US.ai.choices().find(c => c.id === use) : use;
      const p = provider();
      if (u && u.provider === 'local' && u.model) return { provider: 'local', model: u.model };
      if (!u || !u.provider || projectOffline()) return { provider: p, model: '' };
      if (u.provider === 'claude' && US.secrets.get('anthropicKey') && MODELS[u.model]) return { provider: 'claude', model: u.model };
      if (u.provider === 'gemini' && US.secrets.get('geminiKey')) return { provider: 'gemini', model: u.model || '' };
      if (u.provider === 'local' && (u.model || localModel())) return { provider: 'local', model: u.model || '' };
      return { provider: p, model: '' };
    },
    /** What a request would cost with the current provider (Gemini: free). */
    estimateFor(req) { const p = provider(); return p === 'claude' ? estimate(req) : { usd: 0, free: true, name: p === 'local' ? localModel() : geminiName(US.settings.get('geminiModel', GEMINI_DEFAULT)) }; },
    provider,
    available: () => provider() !== 'none',
    label: () => ({ claude: MODELS[claudeModel()].name, gemini: geminiName(US.settings.get('geminiModel', GEMINI_DEFAULT)), local: `${localModel()} (on this computer)`, none: 'No AI' }[provider()]),
    localModels, localStatus, pullLocal, removeLocal, LOCAL_URL, projectOffline, setProjectOffline,
    stillsOn, setStills, imageTokens, _stills: { isImage, imagesOf, imageNote, toContent, partsOf },
    geminiName, geminiModels, GEMINI_DEFAULT, GEMINI_FAST_DEFAULT,
    /** Plain text answer. */
    async text({ system, user, maxTokens, effort, fast, feature }) {
      const p = provider();
      if (p === 'none') throw new US.UserError('AI_KEY');
      return (p === 'claude' ? claude({ system, user, maxTokens, effort, feature }) : p === 'local' ? local({ system, user, maxTokens, feature }) : gemini({ system, user, maxTokens, fast, feature })).then(r => r.text);
    },
    /** JSON answer matching a JSON Schema (objects need additionalProperties:false and required for Claude). */
    /** fast: a quick, short request (the Assistant's plans) – uses Gemini's quick model; Claude is quick at low effort. */
    /** as: whose request it is when it runs beside other work ({id, title, about}); use: another AI than Settings' for
        this request (a choices() id); onUsage({provider, model, name, usd, tokensIn, tokensOut}): what it really cost. */
    async json({ system, user, turns, schema, maxTokens, effort, fast, feature, as, use, onUsage }) {
      const u = use ? US.ai.resolveUse(use) : { provider: provider(), model: '' }, p = u.provider, model = u.model || undefined;
      if (p === 'none') throw new US.UserError('AI_KEY');
      // pictures only leave this computer when the editor has said so for this project; a local model may always look
      if (p !== 'local' && imagesOf(user).length && !stillsOn()) throw new US.UserError('AI_FAILED', { title: 'Stills from this project aren’t allowed to leave this computer.', action: 'Settings › AI › Footage: switch on “Small stills may be sent” for this project, or choose a model on this computer to look at footage.' });
      const r = p === 'claude' ? await claude({ system, user, turns, schema, maxTokens, effort, feature, as, model, onUsage }) : p === 'local' ? await local({ system, user, turns, schema, maxTokens, feature, as, onUsage, model }) : await gemini({ system, user, turns, schema, maxTokens, fast, feature, as, model, onUsage });
      return parseJSON(r.text);
    },
    /** Quick check that a key works. */
    async test(which) {
      const system = 'You are a connection test. Reply with the single word OK.';
      const r = which === 'gemini' ? await gemini({ system, user: 'Say OK.', maxTokens: 64, fast: true, feature: 'Key test' }) : which === 'local' ? await local({ system, user: 'Say OK.', maxTokens: 64, feature: 'Key test' }) : await claude({ system, user: 'Say OK.', maxTokens: 200, feature: 'Key test' });
      return r.text.trim();
    }
  };
})();
