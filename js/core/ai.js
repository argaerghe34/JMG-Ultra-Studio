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
  function record(model, usage, feature, cost) {
    try {
      const l = ledger(), k = monthKey(), m = l.months[k] || { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0, byFeature: {}, byModel: {} };
      const tin = (usage.input_tokens || usage.promptTokenCount || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
      const tout = (usage.output_tokens || 0) + (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
      m.calls++; m.cost += cost; m.tokensIn += tin; m.tokensOut += tout;
      const f = m.byFeature[feature || 'Other'] || (m.byFeature[feature || 'Other'] = { calls: 0, cost: 0 }); f.calls++; f.cost += cost;
      const b = m.byModel[model] || (m.byModel[model] = { calls: 0, cost: 0 }); b.calls++; b.cost += cost;
      l.months[k] = m; US.fsx.writeJSON(ledgerFile, l);
      US.log('info', `AI: ${feature || 'request'} · ${(MODELS[model] || { name: model }).name} · ${tin.toLocaleString()} in / ${tout.toLocaleString()} out tokens${cost ? ` · $${cost.toFixed(3)}` : ' · free'}`);
      US.bus.emit('ai-usage', m);
    } catch (e) { /* never let bookkeeping break a request */ }
  }

  /** Rough cost before sending: ~3.6 characters per token for English; output allowance grows with effort (thinking). */
  function blocksText(x) { return Array.isArray(x) ? x.map(b => (typeof b === 'string' ? b : b.text || '')).join('\n') : (x && typeof x === 'object' ? x.text || '' : String(x || '')); }
  function estimate({ system, user, maxTokens = 16000, effort = 'low', expectedOutput, model } = {}) {
    const m = model || claudeModel(), p = MODELS[m];
    const inTok = Math.ceil((blocksText(system).length + blocksText(user).length) / 3.6) + 50;
    const cached = [].concat(Array.isArray(user) ? user : [], Array.isArray(system) ? system : []).filter(b => b && b.cache);
    const cachedTok = Math.ceil(cached.reduce((n, b) => n + (b.text || '').length, 0) / 3.6), longCache = cached.some(b => b.cache === '1h');
    const writePremium = cachedTok * (longCache ? p.in : p.cacheWrite - p.in);   // worst case: first run writes the cache
    const thinking = { low: 800, medium: 3000, high: 8000, xhigh: 16000, max: 32000 }[effort] || 3000;
    const outTok = Math.min(maxTokens, (expectedOutput || 1500) + thinking);
    return { model: m, name: p.name, inputTokens: inTok, outputTokens: outTok, usd: (inTok * p.in + writePremium + outTok * p.out) / 1e6 };
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
  async function claude({ system, user, schema, maxTokens = 16000, effort = 'low', feature }) {
    const key = US.secrets.get('anthropicKey');
    if (!key) throw new US.UserError('AI_KEY');
    const model = claudeModel(), price = MODELS[model];
    await checkSpend(estimate({ system, user, maxTokens, effort, model }), feature);
    const body = {
      model,
      max_tokens: maxTokens,
      system: Array.isArray(system) || (system && typeof system === 'object') ? toContent([].concat(system)) : system,
      messages: [{ role: 'user', content: toContent(user) }],
      output_config: Object.assign({ effort }, schema ? { format: { type: 'json_schema', schema } } : {})
    };
    const headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
    if (price.fallbacks) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    let r;
    try { r = await postJSON('api.anthropic.com', '/v1/messages', headers, body, 300000); }
    catch (e) { throw networkError('Claude', e); }
    if (r.status !== 200 || !r.json) throw httpError('Claude', r);
    const msg = r.json;
    if (msg.usage) record(msg.model && MODELS[msg.model] ? msg.model : model, msg.usage, feature, costOf(msg.model && MODELS[msg.model] ? msg.model : model, msg.usage));
    if (msg.stop_reason === 'refusal') throw new US.UserError('AI_REFUSED', { detail: JSON.stringify(msg.stop_details || {}) });
    if (msg.stop_reason === 'max_tokens') throw new US.UserError('AI_FAILED', { title: 'The AI’s answer was too long and got cut off.', action: 'Try a smaller request (fewer clips or interviews at once).', detail: 'stop_reason max_tokens' });
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, usage: msg.usage };
  }

  /* ---------- Gemini (Google AI Studio key) ---------- */
  async function gemini({ system, user, schema, maxTokens = 16000, fast, feature }) {
    system = blocksText(system); user = blocksText(user);
    const key = US.secrets.get('geminiKey');
    if (!key) throw new US.UserError('AI_KEY');
    // the "flash" models think before answering (10–45 s); "flash-lite" answers quick requests in about a second
    const model = fast ? US.settings.get('geminiFastModel', 'gemini-flash-lite-latest') : US.settings.get('geminiModel', 'gemini-flash-latest');
    const body = {
      systemInstruction: { parts: [{ text: system + (schema ? '\n\nReply with JSON only, matching this JSON Schema:\n' + JSON.stringify(schema) : '') }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: Object.assign({ maxOutputTokens: Math.max(maxTokens, fast ? 256 : 2048) }, schema ? { responseMimeType: 'application/json' } : {})
    };
    const ask = (m, ms) => postJSON('generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(m)}:generateContent`, { 'x-goog-api-key': key }, body, ms);
    let r, used = model;
    try { r = await ask(model, fast ? 60000 : 180000); } catch (e) { if (fast) throw networkError('Gemini', e); r = { status: 0, error: e }; }
    // the thinking model is often overloaded (503 "high demand", rate limits, or no answer for minutes):
    // then the quick model answers this request instead of failing or keeping the editor waiting
    if (!fast && (r.status === 0 || r.status === 429 || r.status >= 500)) {
      const lite = US.settings.get('geminiFastModel', 'gemini-flash-lite-latest');
      US.log('info', `Gemini ${model} was busy (${r.status || 'no answer'}), so ${lite} answered instead`, '', 'ai');
      try { r = await ask(lite, 120000); used = lite; } catch (e) { throw networkError('Gemini', e); }
    }
    if (r.status !== 200 || !r.json) throw httpError('Gemini', r);
    if (r.json.usageMetadata) record(used, r.json.usageMetadata, feature, 0); // within Google's free allowance
    const cand = (r.json.candidates || [])[0];
    if (!cand) throw new US.UserError('AI_REFUSED', { detail: JSON.stringify(r.json.promptFeedback || r.json).slice(0, 500) });
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    if (!text && cand.finishReason === 'MAX_TOKENS') throw new US.UserError('AI_FAILED', { title: 'The AI ran out of room before answering.', action: 'Try a smaller request (fewer interviews or lines at once).', detail: `${used}: finishReason MAX_TOKENS, ${JSON.stringify(r.json.usageMetadata || {})}` });
    if (!text) throw new US.UserError('AI_FAILED', { title: 'The AI sent back an empty answer.', action: 'Try again.', detail: `${used}: finishReason ${cand.finishReason}` });
    return { text, usage: r.json.usageMetadata, model: used };
  }

  function provider() {
    const pref = US.settings.get('aiProvider', 'auto');
    const hasC = !!US.secrets.get('anthropicKey'), hasG = !!US.secrets.get('geminiKey');
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
    CLAUDE_MODEL, MODELS, claudeModel, estimate, costOf, fmtUSD,
    /** Spending this month: {calls, cost, tokensIn, tokensOut, byFeature, byModel} */
    spending: thisMonth,
    approveTotal: (usd, feature) => provider() === 'claude' ? approveTotal(usd, feature) : Promise.resolve(),
    /** Give the running job a budget it spends without asking (unattended runs). Ask the person first, while they're there. */
    setBudget(usd) { const job = US.jobs.current; unattended.set(job ? job.id : 'none', Math.max(0, usd)); },
    budgetLeft() { const job = US.jobs.current, key = job ? job.id : 'none'; return unattended.has(key) ? unattended.get(key) : null; },
    endBudget() { const job = US.jobs.current; unattended.delete(job ? job.id : 'none'); },
    /** What a request would cost with the current provider (Gemini: free). */
    estimateFor(req) { const p = provider(); return p === 'claude' ? estimate(req) : { usd: 0, free: true, name: 'Gemini' }; },
    provider,
    available: () => provider() !== 'none',
    label: () => ({ claude: MODELS[claudeModel()].name, gemini: 'Gemini', none: 'No AI' }[provider()]),
    /** Plain text answer. */
    async text({ system, user, maxTokens, effort, fast, feature }) {
      const p = provider();
      if (p === 'none') throw new US.UserError('AI_KEY');
      return (p === 'claude' ? claude({ system, user, maxTokens, effort, feature }) : gemini({ system, user, maxTokens, fast, feature })).then(r => r.text);
    },
    /** JSON answer matching a JSON Schema (objects need additionalProperties:false and required for Claude). */
    /** fast: a quick, short request (the Assistant's plans) – uses Gemini's quick model; Claude is quick at low effort. */
    async json({ system, user, schema, maxTokens, effort, fast, feature }) {
      const p = provider();
      if (p === 'none') throw new US.UserError('AI_KEY');
      const r = p === 'claude' ? await claude({ system, user, schema, maxTokens, effort, feature }) : await gemini({ system, user, schema, maxTokens, fast, feature });
      return parseJSON(r.text);
    },
    /** Quick check that a key works. */
    async test(which) {
      const system = 'You are a connection test. Reply with the single word OK.';
      const r = which === 'gemini' ? await gemini({ system, user: 'Say OK.', maxTokens: 64, fast: true, feature: 'Key test' }) : await claude({ system, user: 'Say OK.', maxTokens: 200, feature: 'Key test' });
      return r.text.trim();
    }
  };
})();
