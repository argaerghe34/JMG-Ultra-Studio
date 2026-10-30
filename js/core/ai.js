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

  /** Rough cost before sending: ~3.6 characters per token for English; output allowance grows with effort (thinking). */
  function blocksText(x) { return Array.isArray(x) ? x.map(b => (typeof b === 'string' ? b : b.text || '')).join('\n') : (x && typeof x === 'object' ? x.text || '' : String(x || '')); }
  const turnsText = turns => (turns || []).map(t => String(t.assistant || '') + String(t.user || '')).join('');
  function estimate({ system, user, turns, maxTokens = 16000, effort = 'low', expectedOutput, model } = {}) {
    const m = model || claudeModel(), p = MODELS[m];
    const inTok = Math.ceil((blocksText(system).length + blocksText(user).length + turnsText(turns).length) / 3.6) + 50;
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
  // unattended jobs (Overnight prep) never ask: they have a budget, and a request that doesn't fit is skipped
  const unattended = new Map();   // job id -> dollars left
  function fromBudget(usd, feature) {
    const job = US.jobs.current, key = job ? job.id : 'none';
    if (!unattended.has(key)) return false;
    const left = unattended.get(key);
    if (usd > left + 1e-9) throw new US.UserError('AI_FAILED', { title: `Skipped: ${feature || 'this AI step'} would cost about ${fmtUSD(usd)}, more than is left of tonight’s AI limit (${fmtUSD(left)}).`, action: 'Raise the limit for the next run, or run it by hand.' });
    unattended.set(key, left - usd);
    return true;
  }
  async function checkSpend(est, feature) {
    const cap = +US.settings.get('aiMonthlyCap', 0);
    const spent = thisMonth().cost;
    if (cap > 0 && spent + est.usd > cap) throw new US.UserError('AI_FAILED', { title: `This would go over your monthly AI limit ($${cap.toFixed(2)}; $${spent.toFixed(2)} used so far).`, action: 'Raise the limit in Settings, or switch to Gemini or a cheaper Claude model.', detail: `estimate $${est.usd.toFixed(3)} for ${feature || 'request'}` });
    if (fromBudget(est.usd, feature)) return;
    const ask = +US.settings.get('aiConfirmAbove', 0.25);
    if (!(ask > 0) || est.usd <= ask || !US.ui) return;
    const job = US.jobs.current, key = job ? job.id : 'none', had = approvedJobs.get(key) || 0;
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
    const out = [], add = (role, x) => { for (const b of [].concat(x || [])) { const text = typeof b === 'string' ? b : (b && b.text) || ''; if (text) out.push({ role, text, cached: !!(b && b.cache) }); } };
    add('system', system); add('user', user);
    for (const t of turns || []) { add('assistant', String(t.assistant || '')); add('user', String(t.user || '')); }
    if (schema) out.push({ role: 'format', text: 'Answer format (JSON schema): ' + JSON.stringify(schema), cached: false });
    return out;
  }
  const sentLog = {
    on: () => US.settings.get('ai.sentLog', true) !== false,
    /** Record a request about to be sent. -> entry (or null when the log is off) */
    begin({ provider, model, feature, req, est }) {
      if (!sentLog.on()) return null;
      const pr = projectOf(), parts = partsOf(req), id = US.uid('s');
      try {
        for (const p of parts) { p.block = US.fsx.hash(p.text); const f = path.join(blockDir(), p.block + '.txt'); if (!fs.existsSync(f)) fs.writeFileSync(f, p.text); }
        const e = { id, at: Date.now(), project: pr.name, feature: feature || '', provider, model, chars: parts.reduce((n, p) => n + p.text.length, 0), parts: parts.map(p => ({ role: p.role, block: p.block, chars: p.text.length, cached: p.cached })), estTokens: est ? est.inputTokens : 0, estUsd: est ? est.usd : 0 };
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
      for (const line of raw.split('\n')) { if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch (e) { continue; } if (o.end) { if (byId.has(o.id)) Object.assign(byId.get(o.id), o); } else { byId.set(o.id, o); order.push(o); } }
      return order.reverse();
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
  async function preview({ provider, name, feature, req, est }) {
    if (US.settings.get('ai.preview', 'cost') !== 'always' || !US.ui || !US.ui.modal) return false;
    const job = US.jobs.current, key = job ? job.id : 'none';
    if (unattended.has(key)) return false;   // overnight runs have a budget instead, and nobody to ask
    if (previewedJobs.has(key)) return true;
    const parts = partsOf(req), chars = parts.reduce((n, p) => n + p.text.length, 0), h = US.h;
    const cost = provider === 'gemini' ? 'no charge within Google’s free allowance' : `about ${fmtUSD(est.usd)}${est.cachedTokens ? ` (${est.cachedTokens.toLocaleString('en-GB')} tokens read from Claude’s cache)` : ''}`;
    const shown = parts.map(p => `===== ${p.role.toUpperCase()}${p.cached ? ' (cached)' : ''} =====\n${p.text.length > 120000 ? p.text.slice(0, 120000) + `\n…and ${(p.text.length - 120000).toLocaleString('en-GB')} more characters` : p.text}`).join('\n\n');
    const v = await US.ui.modal({ title: `Send this to ${name}?`, wide: true,
      body: h('div', h('p', `${feature || 'This request'}: ${chars.toLocaleString('en-GB')} characters of text (about ${(est.inputTokens || Math.ceil(chars / 3.6)).toLocaleString('en-GB')} tokens) – ${cost}. Only this text is sent; no footage, frames or audio.`),
        h('textarea.input.mono.ai-preview', { readOnly: true, rows: 14 }, shown)),
      buttons: [{ label: 'Cancel', value: 'no', kind: 'ghost' }, { label: 'Send the rest of this job too', value: 'all' }, { label: 'Send', value: 'one', kind: 'primary' }] });
    if (v !== 'one' && v !== 'all') throw new US.UserError('CANCELLED', { title: 'AI request cancelled.', action: 'Nothing was sent.' });
    if (v === 'all') previewedJobs.add(key);
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
    return x.map(b => typeof b === 'string' ? { type: 'text', text: b } : Object.assign({ type: 'text', text: b.text }, b.cache ? { cache_control: b.cache === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' } } : {}));
  }
  /** turns: earlier rounds of the same conversation after the first message, [{assistant, user}] (a follow-up keeps the
      cached first message, so the transcripts in it are read from the cache). */
  async function claude({ system, user, turns, schema, maxTokens = 16000, effort = 'low', feature }) {
    const red = redacted({ system, user, turns }); ({ system, user, turns } = red);
    const key = US.secrets.get('anthropicKey');
    if (!key) throw new US.UserError('AI_KEY');
    const model = claudeModel(), price = MODELS[model], est = estimate({ system, user, turns, maxTokens, effort, model });
    if (!(await preview({ provider: 'claude', name: price.name, feature, req: { system, user, turns, schema }, est }))) await checkSpend(est, feature);
    else { const cap = +US.settings.get('aiMonthlyCap', 0), spent = thisMonth().cost; if (cap > 0 && spent + est.usd > cap) await checkSpend(est, feature); }
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
    const startedAt = Date.now(), logged = sentLog.begin({ provider: 'claude', model, feature, req: { system, user, turns, schema }, est });
    try { r = await postJSON('api.anthropic.com', '/v1/messages', headers, body, 300000); }
    catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw networkError('Claude', e); }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw httpError('Claude', r); }
    const msg = r.json;
    const usedModel = msg.model && MODELS[msg.model] ? msg.model : model;
    if (msg.usage) record(usedModel, msg.usage, feature, costOf(usedModel, msg.usage), key);
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
  async function gemini({ system, user, turns, schema, maxTokens = 16000, fast, feature }) {
    const red = redacted({ system, user, turns }); ({ system, user, turns } = red);
    const asked = { system, user, turns, schema };
    system = blocksText(system); user = blocksText(user);
    const key = US.secrets.get('geminiKey');
    if (!key) throw new US.UserError('AI_KEY');
    // the "flash" models think before answering (10–45 s); "flash-lite" answers quick requests in about a second
    const model = fast ? US.settings.get('geminiFastModel', GEMINI_FAST_DEFAULT) : US.settings.get('geminiModel', GEMINI_DEFAULT);
    const body = {
      systemInstruction: { parts: [{ text: system + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '') }] },
      contents: [{ role: 'user', parts: [{ text: user }] }].concat((turns || []).flatMap(t => [{ role: 'model', parts: [{ text: String(t.assistant) }] }, { role: 'user', parts: [{ text: String(t.user) }] }])),
      generationConfig: Object.assign({ maxOutputTokens: Math.max(maxTokens, fast ? 256 : 2048) }, schema ? { responseMimeType: 'application/json' } : {})
    };
    const ask = (m, ms) => postJSON('generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(m)}:generateContent`, { 'x-goog-api-key': key }, body, ms);
    const gEst = { usd: 0, inputTokens: Math.ceil((system.length + user.length + turnsText(turns).length) / 3.6) };
    await preview({ provider: 'gemini', name: geminiName(model), feature, req: asked, est: gEst });
    const logged = sentLog.begin({ provider: 'gemini', model, feature, req: asked, est: gEst });
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
  function localTarget() {
    let u; try { u = new URL(localUrl()); } catch (e) { throw new US.UserError('AI_FAILED', { title: 'The local AI’s address isn’t right.', action: 'Use something like http://localhost:11434 (Ollama) or http://localhost:1234 (LM Studio) in Settings.' }); }
    if (!/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(u.hostname)) throw new US.UserError('AI_FAILED', { title: 'The local AI must run on this computer.', action: 'Its address has to start with http://localhost – a model elsewhere would mean text leaving this computer.' });
    return u;
  }
  function httpLocal(method, pathname, body, timeoutMs = 600000) {
    const u = localTarget(), mod = u.protocol === 'https:' ? https : require('http');
    return new Promise((resolve, reject) => {
      const data = body ? Buffer.from(JSON.stringify(body)) : null;
      const req = mod.request({ hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (u.protocol === 'https:' ? 443 : 80), path: (u.pathname.replace(/\/$/, '') || '') + pathname, method, headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, timeout: timeoutMs }, res => {
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
  async function local({ system, user, turns, schema, maxTokens = 16000, feature }) {
    const model = localModel();
    if (!model) throw new US.UserError('AI_KEY', { title: 'Choose a local model first.', action: 'Settings › AI › On this computer: pick the model (Ollama or LM Studio must be running).' });
    localTarget();   // this computer only – checked before anything is logged or sent
    const sys = blocksText(system) + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '');
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: blocksText(user) }].concat((turns || []).flatMap(t => [{ role: 'assistant', content: String(t.assistant) }, { role: 'user', content: String(t.user) }]));
    const body = Object.assign({ model, messages, max_tokens: Math.min(maxTokens, 16000), temperature: 0.2, stream: false }, schema ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema, strict: false } } } : {});
    const logged = sentLog.begin({ provider: 'local', model, feature, req: { system, user, turns, schema }, est: { usd: 0, inputTokens: Math.ceil(sys.length / 3.6) } });
    let r;
    try { r = await httpLocal('POST', '/v1/chat/completions', body); }
    catch (e) { sentLog.end(logged, { ok: false, error: String(e && e.message || e) }); throw new US.UserError('AI_FAILED', { title: 'The local AI didn’t answer.', action: 'Start Ollama or LM Studio (with the model loaded), then try again.', detail: String(e && e.message || e) }); }
    // older Ollama: no json_schema – ask again with its own JSON mode
    if (r.status === 400 && schema) { delete body.response_format; body.format = 'json'; try { r = await httpLocal('POST', '/v1/chat/completions', body); } catch (e) { /* reported below */ } }
    if (r.status !== 200 || !r.json) { sentLog.end(logged, { ok: false, error: 'HTTP ' + r.status }); throw new US.UserError('AI_FAILED', { title: 'The local AI said no.', action: 'Check the model name in Settings, and that it’s loaded.', detail: `${r.status}: ${String(r.text || '').slice(0, 400)}` }); }
    const ch = (r.json.choices || [])[0] || {}, text = String((ch.message && ch.message.content) || '').replace(/^<think>[\s\S]*?<\/think>\s*/, '');
    const u = r.json.usage || {};
    sentLog.end(logged, { ok: true, model, usd: 0, tokensIn: u.prompt_tokens || 0, tokensOut: u.completion_tokens || 0 });
    record('local:' + model, { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 }, feature, 0, null);   // no key: nothing to bill
    if (!text) throw new US.UserError('AI_FAILED', { title: 'The local AI sent back an empty answer.', action: 'Try again, or a larger model.' });
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

  US.ai = {
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
    setBudget(usd) { const job = US.jobs.current; unattended.set(job ? job.id : 'none', Math.max(0, usd)); },
    budgetLeft() { const job = US.jobs.current, key = job ? job.id : 'none'; return unattended.has(key) ? unattended.get(key) : null; },
    endBudget() { const job = US.jobs.current; unattended.delete(job ? job.id : 'none'); },
    /** What a request would cost with the current provider (Gemini: free). */
    estimateFor(req) { const p = provider(); return p === 'claude' ? estimate(req) : { usd: 0, free: true, name: p === 'local' ? localModel() : geminiName(US.settings.get('geminiModel', GEMINI_DEFAULT)) }; },
    provider,
    available: () => provider() !== 'none',
    label: () => ({ claude: MODELS[claudeModel()].name, gemini: geminiName(US.settings.get('geminiModel', GEMINI_DEFAULT)), local: `${localModel()} (on this computer)`, none: 'No AI' }[provider()]),
    localModels, LOCAL_URL, projectOffline, setProjectOffline,
    geminiName, geminiModels, GEMINI_DEFAULT, GEMINI_FAST_DEFAULT,
    /** Plain text answer. */
    async text({ system, user, maxTokens, effort, fast, feature }) {
      const p = provider();
      if (p === 'none') throw new US.UserError('AI_KEY');
      return (p === 'claude' ? claude({ system, user, maxTokens, effort, feature }) : p === 'local' ? local({ system, user, maxTokens, feature }) : gemini({ system, user, maxTokens, fast, feature })).then(r => r.text);
    },
    /** JSON answer matching a JSON Schema (objects need additionalProperties:false and required for Claude). */
    /** fast: a quick, short request (the Assistant's plans) – uses Gemini's quick model; Claude is quick at low effort. */
    async json({ system, user, turns, schema, maxTokens, effort, fast, feature }) {
      const p = provider();
      if (p === 'none') throw new US.UserError('AI_KEY');
      const r = p === 'claude' ? await claude({ system, user, turns, schema, maxTokens, effort, feature }) : p === 'local' ? await local({ system, user, turns, schema, maxTokens, feature }) : await gemini({ system, user, turns, schema, maxTokens, fast, feature });
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
