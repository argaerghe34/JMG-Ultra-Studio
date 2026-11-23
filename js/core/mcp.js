/* JMG Ultra Studio – MCP client (prototype, 23 Nov 2026).
   Ultra Studio talks to an MCP server the editor has installed – first of all the Premiere Pro MCP
   (npm premiere-pro-mcp, ~450 tools through its own UXP plugin) – the same way Claude Code does: it starts its own copy
   of the server (stdio, newline-delimited JSON-RPC), lists its tools and calls them. Several copies may run at once:
   the copy that has Premiere work asks the others, with the shared token, to hand the connection over.
   Where the server comes from: Settings (mcp.servers.<id> = {command, args, env}), else the one set up for Claude
   (~/.claude.json, mcpServers["premiere-pro"]) – its token is read from there, never stored or sent anywhere else.
   The footage rule: what goes back to an AI is TEXT. Pictures and sound in a tool's answer are left out (counted).
   Pure parts (framing, ranking, the result as text) are unit-tested in dev/tests/mcp.test.js. */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');

  /* ---------- pure ---------- */
  /** Bytes from the server → whole JSON messages; returns the rest (a line not finished yet). */
  function frames(buf, onMessage) {
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { onMessage(JSON.parse(line)); } catch (e) { /* a log line on stdout: not ours */ }
    }
    return buf;
  }
  /** Does a tool only read? The server's own hint first, then its name. */
  function readsOnly(t) {
    const a = (t && t.annotations) || {};
    if (a.readOnlyHint === true) return true;
    if (a.readOnlyHint === false || a.destructiveHint === true) return false;
    return /^(get_|list_|inspect_|search_|find_|check_|verify_|audit_|analy[sz]e_|detect_|read_|preview_|plan_|validate_|has_|is_|can_|compare_|review_|rank_|predict_|calculate_|convert_|map_|ping$)/.test(String(t && t.name));
  }
  /** Tools Ultra Studio never offers (they replace, close or open whole projects, or run code the AI wrote). */
  // …and the ones that would break the footage rule: capture_frame hands a picture to the AI, transcribe_audio uploads
  // the sound to ElevenLabs, transcribe_clip_uxp may use Adobe's cloud (Ultra Studio transcribes on this computer).
  const NEVER = /^(open_project|close_project|create_project|save_project_as|export_as_project|consolidate_and_transfer|set_scratch_disk_path|set_project_scratch_disk|manage_app_preferences_uxp|capture_frame|transcribe_audio|transcribe_clip_uxp|execute_extendscript|evaluate_expression|send_raw_script|.*unsafe.*)$/;
  /** What Ultra Studio's own copy of the server may do: look and edit – no exports, files or scripts (the server checks). */
  const AUTHORITY = 'inspect,edit';
  /** The tools that best match some words, best first: [{name, score}]. */
  function rank(tools, query, limit = 12) {
    const words = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    if (!words.length) return [];
    return tools.map(t => {
      const n = String(t.name).toLowerCase(), d = String(t.description || '').toLowerCase();
      let s = 0;
      for (const w of words) { if (n === w) s += 10; if (n.includes(w)) s += 4; if (d.includes(w)) s += 1; }
      if (/_uxp$/.test(n)) s -= 0.1;   // the plain one first when both exist
      return { t, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.t);
  }
  /** A tool's arguments in one line for the AI: name (type, required*) … */
  function argsLine(t) {
    const p = (t.inputSchema && t.inputSchema.properties) || {}, req = new Set((t.inputSchema && t.inputSchema.required) || []);
    return Object.entries(p).filter(([k]) => !/^expected_/.test(k)).slice(0, 14).map(([k, v]) => `${k}${req.has(k) ? '*' : ''}:${v.type || (v.enum ? 'enum' : v.anyOf ? 'any' : '?')}${v.enum ? '(' + v.enum.slice(0, 6).join('|') + ')' : ''}`).join(', ');
  }
  /** A tool's answer as text for an AI – pictures and sound left out, long answers cut. -> {text, left, isError} */
  function asText(result, max = 6000) {
    const parts = [], left = { images: 0, audio: 0 };
    for (const c of (result && result.content) || []) {
      if (c.type === 'text') parts.push(c.text);
      else if (c.type === 'image') left.images++;
      else if (c.type === 'audio') left.audio++;
      else if (c.type === 'resource' && c.resource && typeof c.resource.text === 'string') parts.push(c.resource.text);
      else if (c.type === 'resource_link') parts.push(`(file: ${c.name || c.uri})`);
    }
    let text = parts.join('\n');
    if (!text && result && result.structuredContent) text = JSON.stringify(result.structuredContent);
    if (text.length > max) text = text.slice(0, max) + `… (${text.length - max} more characters left out)`;
    if (left.images || left.audio) text += `\n[${[left.images ? left.images + ' picture(s)' : '', left.audio ? left.audio + ' sound clip(s)' : ''].filter(Boolean).join(' and ')} left out: footage stays on this computer]`;
    return { text, left, isError: !!(result && result.isError) };
  }
  /** Can a tool run, given which of the server's bridges answer? backends from its catalog: ['uxp'], ['cep', 'extendscript'],
      or neither (it works on files on this computer). */
  function canRun(backends, live) {
    const b = backends || [];
    const needsHost = b.includes('uxp') || b.includes('cep');
    if (!needsHost) return true;
    return (b.includes('uxp') && !!live.uxp) || (b.includes('cep') && !!live.cep);
  }
  /** Does a bridge answer? From verify_premiere_connection: its connector answered (an open sequence isn't needed). */
  function bridgeLive(d) {
    if (!d) return false;
    const c = (d.components || []).find(x => x && x.id === 'premiere_connector');
    return c ? c.state === 'ready' : d.overall === 'ready';
  }
  /** The server set up for Claude Code (~/.claude.json), if any: {command, args, env} */
  function fromClaudeConfig(id = 'premiere-pro', file = path.join(os.homedir(), '.claude.json')) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const all = [j.mcpServers || {}].concat(Object.values(j.projects || {}).map(p => p.mcpServers || {}));
      for (const m of all) if (m[id] && m[id].command) return { command: m[id].command, args: m[id].args || [], env: m[id].env || {}, from: 'Claude Code' };
    } catch (e) { /* none */ }
    return null;
  }

  /** Where the MCP's CEP panel lives when it's installed (per user), and the folder it reads commands from. */
  function cepDir(home = os.homedir(), win = process.platform === 'win32') {
    return win ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions', 'MCPBridgeCEP')
      : path.join(home, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'MCPBridgeCEP');
  }
  const cepInstalled = (dir = cepDir()) => { try { return fs.existsSync(path.join(dir, 'CSXS', 'manifest.xml')); } catch (e) { return false; } };
  const sharedFolder = () => path.join(os.tmpdir(), 'premiere-mcp-bridge');
  /** Commands another copy (Claude Code's) has in the shared folder right now – a starting server would clear them. */
  function inFlight(dir = sharedFolder(), now = Date.now(), maxAgeMs = 120000) {
    try { return fs.readdirSync(dir).filter(f => /^(cmd|busy)_/.test(f) && now - fs.statSync(path.join(dir, f)).mtimeMs < maxAgeMs).length; } catch (e) { return 0; }
  }
  /** The MCP package's own folder, from how it's started (node …/premiere-pro-mcp/dist/index.js). */
  function packageDir(cfg) {
    const js = ((cfg && cfg.args) || []).find(a => /index\.js$/.test(String(a)));
    if (js) return path.dirname(path.dirname(js));
    if (cfg && /premiere-pro-mcp$/.test(String(cfg.command))) { try { return path.dirname(path.dirname(fs.realpathSync(cfg.command))); } catch (e) { return null; } }
    return null;
  }

  /* ---------- a connection ---------- */
  function connect(cfg, { timeoutMs = 60000, onLog = null, version = 'dev' } = {}) {
    if (!cfg || !cfg.command) throw new Error('No MCP server is set up.');
    const env = Object.assign({}, process.env, cfg.env || {});
    env.PREMIERE_MCP_CAPABILITIES = cfg.authority || AUTHORITY;
    delete env.ELEVENLABS_API_KEY;
    // Premiere answers one script at a time: while Ultra Studio's own commands run, the server's 30 s wait is too short
    if (!env.PREMIERE_TIMEOUT_MS) env.PREMIERE_TIMEOUT_MS = '90000';   // never an upload of the editor's sound
    // the CEP half reads its commands from one folder (the same one Claude Code's copy uses), so with the CEP panel
    // installed Ultra Studio uses that folder too (cfg.tempDir, after waiting for work in flight – see ready()); without
    // it, its own folder: a starting server clears the folder's queue, which would drop Claude Code's work in flight
    if (cfg.tempDir) env.PREMIERE_TEMP_DIR = cfg.tempDir;
    if (!env.PREMIERE_TEMP_DIR) { const d = path.join(os.tmpdir(), 'jmg-ultra-studio-mcp'); try { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); } catch (e) { /* there */ } env.PREMIERE_TEMP_DIR = d; }
    // Premiere's panel has its own Node; the server needs the editor's (cfg.command is a full path to it)
    const child = cp.spawn(cfg.command, cfg.args || [], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let buf = '', next = 1, closed = null;
    const waiting = new Map();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', d => { buf = frames(buf + d, m => { if (m.id != null && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); clearTimeout(w.timer); m.error ? w.reject(Object.assign(new Error(m.error.message || 'MCP error'), { mcp: m.error })) : w.resolve(m.result); } }); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', d => { if (onLog) onLog(String(d)); });
    const fail = why => { closed = why; for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error(why)); } waiting.clear(); };
    child.on('exit', code => fail('The MCP server stopped (' + code + ')'));
    child.on('error', e => fail('The MCP server could not start: ' + e.message));
    const send = (method, params, ms = timeoutMs) => new Promise((resolve, reject) => {
      if (closed) return reject(new Error(closed));
      const id = next++;
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`The MCP server took too long to answer ${method}`)); }, ms);
      waiting.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    const notify = (method, params) => { if (!closed) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); };
    let tools = null, info = null;
    const api = {
      child,
      async init() {
        info = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jmg-ultra-studio', version } });
        notify('notifications/initialized', {});
        return info;
      },
      get info() { return info; },
      async tools(force = false) {
        if (tools && !force) return tools;
        let out = [], cursor;
        do { const r = await send('tools/list', cursor ? { cursor } : {}); out = out.concat(r.tools || []); cursor = r.nextCursor; } while (cursor);
        tools = out; return tools;
      },
      call(name, args = {}, ms = timeoutMs) { return send('tools/call', { name, arguments: args }, ms); },
      close() { try { child.stdin.end(); } catch (e) { /* gone */ } try { child.kill('SIGTERM'); } catch (e) { /* gone */ } fail('closed'); },
      get closed() { return closed; }
    };
    return api;
  }

  /* ---------- the panel's one connection ---------- */
  const US = root && root.US;
  let conn = null, starting = null, reach = null;
  /** Which bridges answer, and which tools can therefore run: {live: {uxp, cep}, backends: Map(name -> [..])}. The
      Premiere MCP has two halves – a UXP plugin and a CEP panel – and an editor may have installed only one. */
  async function reachable(force = false) {
    if (reach && !force && Date.now() - reach.at < 10 * 60e3) return reach;
    const c = await ready(), backends = new Map(), live = {};
    for (let off = 0; off < 2000; off += 128) {
      const raw = await c.call('get_capabilities', { tool_offset: off, tool_limit: 128 }, 30000).catch(() => null);
      let d = null; try { d = raw && (raw.structuredContent || JSON.parse(raw.content[0].text)); d = d && (d.data || d); } catch (e) { d = null; }
      const cat = d && d.tools; if (!cat || !cat.tools) break;
      for (const t of cat.tools) backends.set(t.name, t.backends || []);
      if (!cat.pagination || !cat.pagination.hasMore) break;
    }
    for (const b of ['uxp', 'cep']) {
      const raw = await c.call('verify_premiere_connection', { backend: b }, 20000).catch(() => null);
      let d = null; try { d = raw && (raw.structuredContent || JSON.parse(raw.content[0].text)); d = d && (d.data || d); } catch (e) { d = null; }
      live[b] = bridgeLive(d);
    }
    reach = { at: Date.now(), live, backends };
    return reach;
  }
  function config(id = 'premiere-pro') {
    const own = US && US.settings ? (US.settings.get('mcp.servers', {}) || {})[id] : null;
    if (own && own.command) return Object.assign({ from: 'Settings' }, own);
    return fromClaudeConfig(id);
  }
  /** The editor's choices (Settings › Premiere MCP): on/off, and how much it may do – 'look' or 'edit'. */
  const setting = (k, d) => (US && US.settings ? US.settings.get('mcp.' + k, d) : d);
  const enabled = () => setting('enabled', true) !== false;
  const level = () => (setting('level', 'edit') === 'look' ? 'look' : 'edit');
  async function ready(id = 'premiere-pro') {
    if (conn && !conn.closed) return conn;
    if (starting) return starting;
    starting = (async () => {
      if (!enabled()) throw new Error('The Premiere MCP is switched off in Settings.');
      const cfg = Object.assign({}, config(id), { authority: level() === 'look' ? 'inspect' : AUTHORITY });
      if (cepInstalled()) {
        cfg.tempDir = sharedFolder();
        // Claude Code's copy may be in the middle of a command: wait for it (up to 30 s) before starting
        for (let i = 0; i < 30 && inFlight(cfg.tempDir); i++) await new Promise(z => setTimeout(z, 1000));
      }
      const c = connect(cfg, { version: US && US.version ? US.version : 'dev', onLog: line => { if (US && US.log) US.log('mcp', line.slice(0, 300)); } });
      try { await c.init(); await c.tools(); conn = c; return c; } catch (e) { c.close(); throw e; }
    })().finally(() => { starting = null; });
    return starting;
  }
  /**
   * Install the MCP's CEP panel – its own installer (premiere-pro-mcp --install-cep): a link in Premiere's per-user
   * extensions folder to the panel in the MCP's package. Premiere needs restarting before it shows. -> {ok, text}
   */
  function installCep(cfg = config()) {
    const dir = packageDir(cfg), index = dir && path.join(dir, 'dist', 'index.js');
    if (!index || !fs.existsSync(index)) return Promise.resolve({ ok: false, text: 'The MCP’s installer wasn’t found next to the server Ultra Studio starts.' });
    return new Promise(resolve => cp.execFile(cfg.command, [index, '--install-cep'], { timeout: 120000, windowsHide: true, env: Object.assign({}, process.env, cfg.env || {}) }, (err, out, errOut) => {
      const text = String(out || '') + String(errOut || '');
      resolve({ ok: !err && cepInstalled(), text: text.trim().slice(-1500) || (err ? err.message : '') });
    }));
  }
  /** Everything Settings shows: {configured, from, enabled, level, cep:{installed}, live, tools, usable, error} */
  async function status({ force = false } = {}) {
    const cfg = config(), out = { configured: !!cfg, from: cfg ? cfg.from : '', enabled: enabled(), level: level(), cep: { installed: cepInstalled(), dir: cepDir() }, live: {}, tools: 0, usable: 0 };
    if (!cfg || !out.enabled) return out;
    try {
      const r = await reachable(force), ts = await (await ready()).tools();
      out.live = r.live; out.tools = ts.length; out.usable = ts.filter(t => !NEVER.test(t.name) && canRun(r.backends.get(t.name), r.live)).length;
      out.version = conn && conn.info && conn.info.serverInfo ? conn.info.serverInfo.version : '';
    } catch (e) { out.error = String(e.message || e); }
    return out;
  }
  const api = {
    frames, readsOnly, NEVER, AUTHORITY, rank, argsLine, asText, fromClaudeConfig, connect, config,
    bridgeLive, cepDir, cepInstalled, sharedFolder, inFlight, packageDir, installCep, status, enabled, level,
    configured: id => enabled() && !!config(id),
    ready, reachable, canRun,
    /** Tools that can run here now (not NEVER, and their bridge answers). */
    async usable() { const r = await reachable(), ts = await (await ready()).tools(); return ts.filter(t => !NEVER.test(t.name) && canRun(r.backends.get(t.name), r.live)); },
    async tools() { return (await ready()).tools(); },
    /** Call a tool; -> {text, left, isError, ms} (text only: the footage rule). */
    async call(name, args = {}, { timeoutMs = 120000 } = {}) {
      if (NEVER.test(name)) throw new Error(`Ultra Studio doesn’t run “${name}”.`);
      const c = await ready(), t0 = Date.now();
      let r = asText(await c.call(name, args, timeoutMs));
      // Premiere was busy (another script running): a tool that only reads is asked once more
      const t = (await c.tools()).find(x => x.name === name);
      if (r.isError && /timed out|UXP_NOT_CONNECTED|HANDOFF_IN_PROGRESS/i.test(r.text) && t && readsOnly(t)) { await new Promise(z => setTimeout(z, 1500)); r = asText(await c.call(name, args, timeoutMs)); r.retried = true; }
      r.ms = Date.now() - t0; return r;
    },
    /** For Ultra Studio's own code (not the AI): a tool's whole answer as data -> {ok, data, text, isError}. */
    async callJSON(name, args = {}, { timeoutMs = 60000 } = {}) {
      if (NEVER.test(name)) throw new Error(`Ultra Studio doesn’t run “${name}”.`);
      const r = await (await ready()).call(name, args, timeoutMs);
      let data = r && r.structuredContent, text = '';
      for (const c of (r && r.content) || []) if (c.type === 'text') text += c.text;
      let failed = false;
      // the server wraps its structured answer as {ok, tool, data}; the text holds the same data unwrapped
      if (data && typeof data === 'object' && 'tool' in data && 'data' in data) { failed = data.ok === false; data = data.data; }
      if (!data) { try { data = JSON.parse(text); } catch (e) { data = null; } }
      return { ok: !(r && r.isError) && !failed && !(data && data.ok === false), data, text, isError: !!(r && r.isError) };
    },
    stop() { if (conn) conn.close(); conn = null; reach = null; }
  };
  if (US) US.mcp = api;
  if (isNode) module.exports = api;
  if (US && typeof window !== 'undefined' && window.addEventListener) window.addEventListener('beforeunload', () => api.stop());
})(typeof window !== 'undefined' ? window : null);
