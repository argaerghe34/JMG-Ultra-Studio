const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['ai']);
test('cost of a Claude response follows the price table, including cache reads and writes', () => {
  const c = US.ai.costOf('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e5, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 0 });
  assert.ok(Math.abs(c - (4 + 2 + 0.2)) < 1e-9, c);
  assert.ok(Math.abs(US.ai.costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 }) - 12) < 1e-9);
  assert.ok(Math.abs(US.ai.costOf('claude-haiku-5-5', { input_tokens: 1e6, output_tokens: 1e6 }) - 0.6) < 1e-9);
});
test('estimate scales with the text sent and the effort, and with the chosen model', () => {
  const text = 'x'.repeat(36000);
  US.settings.set('claudeModel', 'claude-opus-5-5');
  const a = US.ai.estimate({ system: 's', user: text, effort: 'low' }), b = US.ai.estimate({ system: 's', user: text, effort: 'high' });
  assert.ok(a.inputTokens > 9900 && a.inputTokens < 10200, a.inputTokens);
  assert.ok(b.usd > a.usd);
  US.settings.set('claudeModel', 'claude-haiku-5-5');
  const c = US.ai.estimate({ system: 's', user: [{ text, cache: true }, 'question'] });
  assert.ok(c.usd < a.usd / 20 && c.model === 'claude-haiku-5-5');
  US.settings.set('claudeModel', 'claude-opus-5-5');
});
test('price formatting', () => {
  assert.strictEqual(US.ai.fmtUSD(0.004), 'under 1¢'); assert.strictEqual(US.ai.fmtUSD(0.37), '37¢'); assert.strictEqual(US.ai.fmtUSD(2.5), '$2.50');
});
test('one-hour cache writes cost twice the input price; the estimate allows for the first write', () => {
  const c = US.ai.costOf('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } });
  assert.ok(Math.abs(c - (5 + 8)) < 1e-9, c);
  const text = 'y'.repeat(36000);
  const plain = US.ai.estimate({ system: 's', user: [text, 'q'] }), cached = US.ai.estimate({ system: 's', user: [{ text, cache: '1h' }, 'q'] });
  assert.ok(cached.usd > plain.usd);
});

test('unattended runs spend a budget without asking, and skip what doesn’t fit', async () => {
  const savedP = US.settings.get('aiProvider'), savedUI = US.ui.confirm;
  US.settings.set('aiProvider', 'claude'); US.secrets.set('anthropicKey', 'test-only');   // the harness's own temporary home
  let asked = 0; US.ui.confirm = async () => { asked++; return true; };
  try {
    US.ai.setBudget(1);
    await US.ai.approveTotal(0.8, 'Find themes');                     // fits: no question
    assert.strictEqual(asked, 0);
    await assert.rejects(US.ai.approveTotal(1.5, 'Moments'), e => /Skipped/.test(e.title) && /tonight/.test(e.title));
    assert.strictEqual(US.ai.budgetLeft(), 1);
    US.ai.endBudget();
    assert.strictEqual(US.ai.budgetLeft(), null);
    await US.ai.approveTotal(0.8, 'by hand');                        // a normal job asks again above 25¢
    assert.strictEqual(asked, 1);
  } finally { US.settings.set('aiProvider', savedP); US.secrets.set('anthropicKey', ''); US.ui.confirm = savedUI; }
});

test('Gemini: when the thinking model is busy, the quick model answers instead', async () => {
  const https = require('https'), EE = require('events'), real = https.request, savedP = US.settings.get('aiProvider');
  const asked = [];
  // a fake Google: the thinking model says "high demand", the quick one answers
  https.request = (opts, cb) => {
    const model = decodeURIComponent(opts.path.split('/models/')[1].split(':')[0]); asked.push(model);
    const req = new EE(); req.write = () => {}; req.destroy = () => {};
    req.end = () => setImmediate(() => {
      const res = new EE(), busy = !/lite/.test(model);
      res.statusCode = busy ? 503 : 200;
      cb(res);
      res.emit('data', Buffer.from(JSON.stringify(busy ? { error: { message: 'This model is currently experiencing high demand.' } } : { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 } })));
      res.emit('end');
    });
    return req;
  };
  US.settings.set('aiProvider', 'gemini'); US.secrets.set('geminiKey', 'test-only');
  try {
    assert.deepStrictEqual(await US.ai.json({ system: 's', user: 'u', schema: { type: 'object' }, feature: 'Themes' }), { ok: true });
    assert.deepStrictEqual(asked, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
    // the quick model itself being busy is reported plainly, not retried
    asked.length = 0; const lite = https.request;
    https.request = (o, cb) => lite(Object.assign({}, o, { path: o.path.replace('lite', 'busy') }), cb);
    await assert.rejects(US.ai.json({ system: 's', user: 'u', fast: true }), e => /having problems/.test(e.title));
    assert.strictEqual(asked.length, 1);
  } finally { https.request = real; US.settings.set('aiProvider', savedP); US.secrets.set('geminiKey', ''); }
});
