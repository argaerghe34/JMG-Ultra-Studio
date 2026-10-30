// On this computer: a local model (OpenAI-style endpoint on localhost) answers JSON; a project set to keep everything
// on this computer uses only it (or no AI); an address that isn't this computer is refused.
const assert = require('assert'), http = require('http');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
const US = load(['ai']);

function server(handler) { return new Promise(res => { const s = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => handler(req, b ? JSON.parse(b) : null, rs)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }

test('a local model answers, its models are listed, nothing is billed; the project switch forces it', async () => {
  const seen = [];
  const s = await server((req, body, rs) => {
    seen.push([req.method, req.url, body]);
    rs.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return rs.end(JSON.stringify({ data: [{ id: 'qwen3:8b' }, { id: 'llama3.2' }] }));
    rs.end(JSON.stringify({ choices: [{ message: { content: '<think>hmm</think>\n{"ok": true}' } }], usage: { prompt_tokens: 20, completion_tokens: 4 } }));
  });
  const port = s.address().port;
  US.settings.set('ai.localUrl', `http://localhost:${port}`);
  try {
    assert.deepStrictEqual(await US.ai.localModels(), ['qwen3:8b', 'llama3.2']);
    US.settings.set('ai.localModel', 'qwen3:8b'); US.settings.set('aiProvider', 'local');
    assert.strictEqual(US.ai.provider(), 'local'); assert.ok(/qwen3:8b \(on this computer\)/.test(US.ai.label()));
    const r = await US.ai.json({ system: 'Be brief.', user: [{ text: 'Transcript…', cache: '1h' }, 'Answer.'], schema: { type: 'object' }, feature: 'Test' });
    assert.deepStrictEqual(r, { ok: true }, 'the model’s thinking is skipped');
    const post = seen.find(x => x[0] === 'POST')[2];
    assert.strictEqual(post.model, 'qwen3:8b'); assert.ok(/JSON Schema/.test(post.messages[0].content) && post.messages[1].content.includes('Transcript…'));
    assert.strictEqual(US.ai.spending().cost, 0);
    assert.strictEqual(US.ai.sent.list()[0].provider, 'local', 'logged too');
    // a project set to keep everything here: local even when Claude is chosen
    US.secrets.set('anthropicKey', 'sk-test'); US.settings.set('aiProvider', 'claude');
    US.ctx = { project: { name: 'NDA film', path: '/p/nda.prproj' } };
    assert.strictEqual(US.ai.provider(), 'claude');
    US.ai.setProjectOffline(true);
    assert.strictEqual(US.ai.provider(), 'local');
    US.settings.set('ai.localModel', '');
    assert.strictEqual(US.ai.provider(), 'none', 'no local model: no AI at all, never the cloud');
    US.ai.setProjectOffline(false);
    assert.strictEqual(US.ai.provider(), 'claude');
  } finally { s.close(); US.secrets.set('anthropicKey', ''); US.settings.set('aiProvider', 'auto'); }
});

test('a model somewhere else is refused – it would mean text leaving this computer', async () => {
  US.settings.set('ai.localUrl', 'http://192.168.1.20:11434'); US.settings.set('ai.localModel', 'x'); US.settings.set('aiProvider', 'local');
  try { await assert.rejects(US.ai.json({ system: 's', user: 'u', schema: { type: 'object' } }), e => /must run on this computer/.test(e.title || e.message)); }
  finally { US.settings.set('ai.localUrl', ''); US.settings.set('aiProvider', 'auto'); }
});
