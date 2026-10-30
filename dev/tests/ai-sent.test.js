// What was sent to AI: every request's exact text kept on this computer per project (big repeated parts stored once),
// how it ended, pruning, and the optional preview before sending (Send / Send the rest of this job / Cancel).
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
const US = load(['ai']);
const S = US.ai.sent;

test('the log: each request’s text by part, the shared transcript stored once, how it ended merged in; per project', () => {
  US.ctx = { project: { name: 'Doc', path: '/p/Doc.prproj' } };
  S.clear();
  const transcript = 'Interview 1\n' + 'a long transcript line\n'.repeat(500);
  const h1 = S.begin({ provider: 'claude', model: 'claude-opus-5-5', feature: 'Find themes', req: { system: [{ text: 'You are…', cache: '1h' }], user: [{ text: transcript, cache: '1h' }, 'Find themes.'] }, est: { inputTokens: 3000, usd: 0.05 } });
  S.end(h1, { ok: true, usd: 0.04, tokensIn: 3100, tokensOut: 400, cacheRead: 0 });
  const h2 = S.begin({ provider: 'claude', model: 'claude-opus-5-5', feature: 'Ask', req: { system: [{ text: 'You are…', cache: '1h' }], user: [{ text: transcript, cache: '1h' }, 'Every story about Grandma'], turns: [{ assistant: '{"answer":"x"}', user: 'shorter' }], schema: { type: 'object' } }, est: { inputTokens: 3000, usd: 0.01 } });
  S.end(h2, { ok: false, error: 'HTTP 529' });
  const list = S.list();
  assert.deepStrictEqual(list.map(e => [e.feature, e.ok, e.usd || 0]), [['Ask', false, 0], ['Find themes', true, 0.04]], 'newest first, with how each ended');
  assert.deepStrictEqual(list[0].parts.map(p => p.role), ['system', 'user', 'user', 'assistant', 'user', 'format']);
  const text = S.text(list[0]);
  assert.ok(/===== SYSTEM \(cached/.test(text) && text.includes('Every story about Grandma') && text.includes('shorter') && text.includes('a long transcript line'));
  const blocks = fs.readdirSync(path.join(S.dir(), 'blocks'));
  assert.strictEqual(blocks.filter(b => fs.readFileSync(path.join(S.dir(), 'blocks', b), 'utf8') === transcript).length, 1, 'the transcript is kept once');
  US.ctx = { project: { name: 'Other', path: '/p/Other.prproj' } };
  assert.strictEqual(S.list().length, 0, 'another project has its own log');
  assert.deepStrictEqual(S.projects().map(p => [p.name, p.count]), [['Doc', 2]]);
  S.clear(S.projects()[0].key);
  assert.strictEqual(S.projects().length, 0);
  assert.strictEqual(fs.readdirSync(path.join(S.dir(), 'blocks')).length, 0, 'blocks no longer used are removed');
});

test('the log can be switched off', () => {
  US.settings.set('ai.sentLog', false);
  try { assert.strictEqual(S.begin({ provider: 'claude', model: 'm', feature: 'x', req: { user: 'hi' } }), null); }
  finally { US.settings.set('ai.sentLog', true); }
});

test('a real request is logged with its text; “Always show me first” asks before sending, and Cancel sends nothing', async () => {
  US.ctx = { project: { name: 'Doc', path: '/p/Doc.prproj' } }; S.clear();
  const https = require('https'), was = https.request, wasKey = US.secrets.get('anthropicKey'), wasModal = US.ui;
  let posted = 0;
  https.request = (opts, cb) => { posted++; const { EventEmitter } = require('events'); const req = new EventEmitter(); req.write = () => {}; req.setTimeout = () => {}; req.destroy = () => {};
    req.end = () => { const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; cb(res); res.emit('data', Buffer.from(JSON.stringify({ model: 'claude-opus-5-5', content: [{ type: 'text', text: '{"ok":1}' }], usage: { input_tokens: 50, output_tokens: 5 }, stop_reason: 'end_turn' }))); res.emit('end'); }; return req; };
  US.secrets.set('anthropicKey', 'sk-ant-test'); US.settings.set('aiProvider', 'claude'); US.settings.set('aiConfirmAbove', 0);
  let asked = 0, answer = 'one';
  US.ui = { modal: async () => { asked++; return answer; }, confirm: async () => true };
  try {
    await US.ai.json({ system: 'Be brief.', user: 'Name three colours.', feature: 'Test', schema: { type: 'object' } });
    assert.strictEqual(S.list()[0].feature, 'Test'); assert.ok(S.text(S.list()[0]).includes('Name three colours.'));
    assert.strictEqual(S.list()[0].ok, true); assert.strictEqual(asked, 0, 'no preview unless asked for');
    US.settings.set('ai.preview', 'always');
    await US.ai.json({ system: 'Be brief.', user: 'Again.', feature: 'Test 2', schema: { type: 'object' } });
    assert.strictEqual(asked, 1, 'shown first');
    answer = 'no'; const before = posted;
    await assert.rejects(US.ai.json({ system: 'x', user: 'Secret plans', feature: 'Test 3', schema: { type: 'object' } }), e => e.code === 'CANCELLED');
    assert.strictEqual(posted, before, 'Cancel: nothing sent');
    assert.ok(!S.list().some(e => e.feature === 'Test 3'), 'and nothing logged as sent');
  } finally {
    https.request = was; US.ui = wasModal; US.settings.set('ai.preview', 'cost');
    if (wasKey) US.secrets.set('anthropicKey', wasKey); else US.secrets.set('anthropicKey', '');
  }
});

test('tidying keeps the log: requests and how they ended survive a prune, and the text stays readable', () => {
  US.ctx = { project: { name: 'Keep', path: '/p/keep.prproj' } }; S.clear();
  const h = S.begin({ provider: 'claude', model: 'm', feature: 'Themes', req: { user: 'Some transcript text' }, est: { usd: 0.01 } });
  S.end(h, { ok: true, usd: 0.02 });
  S.prune(); S.prune();
  const l = S.list();
  assert.deepStrictEqual(l.map(e => [e.feature, e.ok, e.usd]), [['Themes', true, 0.02]]);
  assert.ok(S.text(l[0]).includes('Some transcript text'), 'its text block is still there');
});
