// A stand-in MCP server for dev/tests/mcp.test.js: stdio, newline-delimited JSON-RPC, three tools. It echoes the env
// it was started with, so the test can check what Ultra Studio's copy of a server is (and isn't) given.
let buf = '';
const out = m => process.stdout.write(JSON.stringify(m) + '\n');
const TOOLS = [
  { name: 'get_thing', description: 'Read a thing', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { readOnlyHint: true } },
  { name: 'set_thing', description: 'Change a thing', inputSchema: { type: 'object', properties: { id: { type: 'string' }, value: { type: 'number' } } }, annotations: { readOnlyHint: false } },
  { name: 'capture_frame', description: 'A picture of the frame', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } }
];
process.stdout.write('a log line that is not JSON\n');
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id == null) continue;   // a notification
    if (m.method === 'initialize') out({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'fake', version: '1' }, capabilities: { tools: {} } } });
    else if (m.method === 'tools/list') out({ jsonrpc: '2.0', id: m.id, result: m.params && m.params.cursor ? { tools: TOOLS.slice(2) } : { tools: TOOLS.slice(0, 2), nextCursor: 'p2' } });
    else if (m.method === 'tools/call' && m.params.name === 'get_thing') out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'thing ' + m.params.arguments.id + ' caps=' + process.env.PREMIERE_MCP_CAPABILITIES + ' eleven=' + (process.env.ELEVENLABS_API_KEY || 'none') + ' tmp=' + (process.env.PREMIERE_TEMP_DIR ? 'own' : 'none') }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] } });
    else if (m.method === 'tools/call') out({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no such tool' } });
    else out({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unknown method' } });
  }
});
