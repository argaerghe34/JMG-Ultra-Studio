// The MCP client (js/core/mcp.js) and Ask's Premiere MCP tools (40-assistant-mcp.js): framing, which tools only read,
// the tools never offered, ranking, text-only answers (the footage rule), and a whole session with a stand-in server.
const assert = require('assert'), path = require('path');
const { test } = require('./harness');
const M = require('../../js/core/mcp.js');
const FAKE = { command: process.execPath, args: [path.join(__dirname, 'fixtures', 'fake-mcp-server.js')], env: { ELEVENLABS_API_KEY: 'secret' } };

test('framing: whole JSON lines become messages, log lines are skipped, a half line waits', () => {
  const got = [];
  const rest = M.frames('{"a":1}\nnot json\n\n{"b":2}\n{"c":', m => got.push(m));
  assert.deepStrictEqual(got, [{ a: 1 }, { b: 2 }]);
  assert.strictEqual(rest, '{"c":');
});

test('which tools only read, which are never offered, and the best matches for some words', () => {
  assert.ok(M.readsOnly({ name: 'set_x', annotations: { readOnlyHint: true } }) && !M.readsOnly({ name: 'get_x', annotations: { readOnlyHint: false } }));
  assert.ok(M.readsOnly({ name: 'inspect_sequence_structure_uxp' }) && !M.readsOnly({ name: 'ripple_delete' }));
  for (const n of ['capture_frame', 'transcribe_audio', 'transcribe_clip_uxp', 'open_project', 'close_project', 'execute_extendscript', 'send_raw_script']) assert.ok(M.NEVER.test(n), n);
  for (const n of ['get_clip_transcript_uxp', 'export_frame', 'add_marker']) assert.ok(!M.NEVER.test(n), n);
  const tools = [{ name: 'add_marker', description: 'Add a marker' }, { name: 'search_clip_transcript_uxp', description: 'Search a clip transcript' }, { name: 'get_clip_transcript_uxp', description: 'Read the transcript' }];
  assert.deepStrictEqual(M.rank(tools, 'transcript search').map(t => t.name), ['search_clip_transcript_uxp', 'get_clip_transcript_uxp']);
  assert.strictEqual(M.argsLine({ inputSchema: { properties: { id: { type: 'string' }, mode: { enum: ['a', 'b'] }, expected_cep_target: {} }, required: ['id'] } }), 'id*:string, mode:enum(a|b)');
});

test('answers as text: pictures and sound left out and counted, long answers cut', () => {
  const r = M.asText({ content: [{ type: 'text', text: 'hello' }, { type: 'image', data: 'x' }, { type: 'image', data: 'y' }, { type: 'audio', data: 'z' }] });
  assert.ok(r.text.startsWith('hello') && /2 picture\(s\) and 1 sound clip\(s\) left out: footage stays on this computer/.test(r.text) && !/\bx\b|\by\b/.test(r.text.split('\n')[0].slice(5)));
  assert.ok(M.asText({ content: [{ type: 'text', text: 'a'.repeat(100) }] }, 10).text.includes('90 more characters'));
  assert.strictEqual(M.asText({ isError: true, content: [] }).isError, true);
});

test('a session with a stand-in server: tools listed over two pages, a call answered as text; its copy may only look and edit, gets no upload key and its own command folder', async () => {
  const c = M.connect(FAKE, { version: 'test', timeoutMs: 5000 });
  try {
    const info = await c.init();
    assert.strictEqual(info.serverInfo.name, 'fake');
    const ts = await c.tools();
    assert.deepStrictEqual(ts.map(t => t.name), ['get_thing', 'set_thing', 'capture_frame']);
    const r = M.asText(await c.call('get_thing', { id: 'A7' }));
    assert.ok(/^thing A7 caps=inspect,edit eleven=none tmp=own/.test(r.text) && r.left.images === 1, r.text);
    await assert.rejects(c.call('nope', {}), /no such tool/);
  } finally { c.close(); }
  await assert.rejects(c.call('get_thing', { id: 'x' }), /closed/);
});

test('Claude Code’s set-up is found in ~/.claude.json (top level or a project)', () => {
  const fs = require('fs'), os = require('os');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-')), 'claude.json');
  fs.writeFileSync(f, JSON.stringify({ projects: { '/x': { mcpServers: { 'premiere-pro': { command: '/n', args: ['s.js'], env: { T: '1' } } } } } }));
  assert.deepStrictEqual(M.fromClaudeConfig('premiere-pro', f), { command: '/n', args: ['s.js'], env: { T: '1' }, from: 'Claude Code' });
  assert.strictEqual(M.fromClaudeConfig('other', f), null);
});

test('a tool runs only when its bridge answers (the MCP has a UXP plugin and a CEP panel; one may be missing)', () => {
  assert.ok(M.canRun(['uxp'], { uxp: true, cep: false }) && !M.canRun(['cep', 'extendscript'], { uxp: true, cep: false }));
  assert.ok(M.canRun(['cep', 'extendscript', 'qe'], { cep: true }) && M.canRun([], { uxp: false, cep: false }) && M.canRun(['local'], {}));
});

test('a bridge is live when its connector answers, even with no sequence open', () => {
  const comp = (id, state) => ({ id, state });
  assert.ok(M.bridgeLive({ overall: 'needs_attention', components: [comp('premiere_connector', 'ready'), comp('active_sequence', 'needs_attention')] }));
  assert.ok(!M.bridgeLive({ overall: 'needs_attention', components: [comp('premiere_connector', 'needs_attention')] }));
  assert.ok(M.bridgeLive({ overall: 'ready' }) && !M.bridgeLive(null));
});

test('the CEP panel: where it is installed, the folder it reads, commands in flight, and the MCP package', () => {
  const fs = require('fs'), os = require('os');
  assert.ok(/Library\/Application Support\/Adobe\/CEP\/extensions\/MCPBridgeCEP$/.test(M.cepDir('/Users/x', false)));
  assert.ok(/Adobe[\\/]CEP[\\/]extensions[\\/]MCPBridgeCEP$/.test(M.cepDir('C:\\Users\\x', true)));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cep-'));
  assert.ok(!M.cepInstalled(d));
  fs.mkdirSync(path.join(d, 'CSXS')); fs.writeFileSync(path.join(d, 'CSXS', 'manifest.xml'), '<x/>');
  assert.ok(M.cepInstalled(d));
  const q = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
  fs.writeFileSync(path.join(q, 'cmd_1.json'), '{}'); fs.writeFileSync(path.join(q, 'bridge-heartbeat.json'), '{}');
  assert.strictEqual(M.inFlight(q), 1);
  assert.strictEqual(M.inFlight(q, Date.now() + 10 * 60e3), 0, 'an old command left behind doesn’t count');
  assert.strictEqual(M.packageDir({ command: '/opt/homebrew/bin/node', args: ['/opt/homebrew/lib/node_modules/premiere-pro-mcp/dist/index.js'] }), '/opt/homebrew/lib/node_modules/premiere-pro-mcp');
  assert.strictEqual(M.packageDir({ command: 'npx', args: ['-y', 'x'] }), null);
});

test('look only: Ultra Studio’s copy is started with inspect authority', async () => {
  const c = M.connect(Object.assign({}, FAKE, { authority: 'inspect' }));
  await c.init();
  const r = await c.call('get_thing', { id: 'a' });
  assert.ok(/caps=inspect eleven=none/.test(r.content[0].text), r.content[0].text);
  c.close();
});
