// End-to-end tests in real Premiere: runs every dev/e2e/*.e2e.js inside the panel (port 8890) and prints pass/fail.
// Each file is the body of an async function that receives `T` (helpers below) and throws on failure.
// Usage: node dev/e2e/run.js [name-filter]
const WebSocket = require('ws'), fs = require('fs'), path = require('path'), http = require('http');
const PORT = 8890;
const only = process.argv.slice(2);

function targets() { return new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}/json`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }

// helpers available to every test as T.*
const HELPERS = `
const T = {
  fs: require('fs'), path: require('path'), dir: US.host.extensionDir(),
  media: (...p) => require('path').join(require('fs').realpathSync(US.host.extensionDir()), 'dev', 'test-media', ...p),
  assert(c, msg) { if (!c) throw new Error('Assertion failed: ' + msg); },
  near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'value') + ': expected ' + b + ' ± ' + tol + ', got ' + a); },
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  // file:// URL for a path on this computer (C:\\… on Windows, /… on the Mac)
  fileUrl: p => require('url').pathToFileURL(p).href,
  // the text of a .docx (paragraphs on their own lines) – works on Windows too, where there is no textutil
  docxText(file) {
    const b = require('fs').readFileSync(file), zlib = require('zlib');
    let e = b.length - 22; while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
    for (let o = b.readUInt32LE(e + 16), n = b.readUInt16LE(e + 10); n-- > 0;) {
      const len = b.readUInt16LE(o + 28), name = b.toString('utf8', o + 46, o + 46 + len), at = b.readUInt32LE(o + 42);
      if (name === 'word/document.xml') {
        const data = b.subarray(at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28), at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28) + b.readUInt32LE(o + 20));
        const xml = (b.readUInt16LE(o + 10) === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        return xml.replace(/<\\/w:p>/g, '\\n').replace(/<w:tab\\/>/g, '\\t').replace(/<w:br\\/>/g, '\\n').replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      }
      o += 46 + len + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32);
    }
    throw new Error('No word/document.xml in ' + file);
  },
  async seqByName(name) { return (await US.host.call('listSequences')).find(s => s.name === name); },
  async importOnce(paths, binPath) {
    // reuse clips already imported into this bin
    const bins = await US.host.call('listBins'); const bin = bins.find(b => b.path === binPath.split('/').join(' / '));
    const have = bin ? await US.host.call('binItems', { binId: bin.id, kinds: [], recursive: false }) : [];
    const out = [];
    for (const p of paths) { const hit = have.find(i => i.path === p); out.push(hit || (await US.host.call('importFiles', { paths: [p], binPath }))[0]); }
    return out;
  },
  async freshSequence(name, likeId, binPath) {
    const old = await T.seqByName(name); if (old) await US.host.call('deleteSequence', { seqId: old.id });
    return US.host.call('newSequence', { name, likeId, binPath });
  },
  async open(seqId) { await US.host.call('openSequence', { seqId }); await US.refreshContext(); },
  async action(id, params) {
    const a = US.actions.get(id); if (!a) throw new Error('No action ' + id);
    const job = US.jobs.testJob(id);
    return a.run(US.actions.normalize(a, params), job);
  }
};`;

async function runOne(ws, file) {
  const body = fs.readFileSync(file, 'utf8');
  // exports go to the test project's folder, not the real Documents › JMG Ultra Studio; the settings Jacob's installed
  // copy shares (Selects' footage type, Overnight, B-roll) are put back after every test
  const expr = `(async () => { ${HELPERS}\n const __keep = { sel: US.selects ? JSON.parse(JSON.stringify(US.selects.state.settings)) : null, other: Object.fromEntries(['overnight', 'broll', 'story.tab', 'story.narrativeAI'].map(k => [k, US.settings.get(k)])) };\n const __exp = US.fsx.exportsDir; US.fsx.exportsDir = () => { const d = require('path').join(require('fs').realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports', 'Documents'); require('fs').mkdirSync(d, { recursive: true }); return d; };\n const t0 = performance.now(); try { const info = await (async (T) => { ${body}\n })(T); return JSON.stringify({ ok: true, ms: performance.now() - t0, info }); } catch (e) { return JSON.stringify({ ok: false, ms: performance.now() - t0, error: (e && (e.detail ? e.message + ' | ' + e.detail : e.stack || e.message)) || String(e) }); } finally { US.fsx.exportsDir = __exp; if (__keep.sel) { for (const k of Object.keys(US.selects.state.settings)) delete US.selects.state.settings[k]; Object.assign(US.selects.state.settings, __keep.sel); US.selects.saveSettings(); } for (const [k, v] of Object.entries(__keep.other)) if (v != null) US.settings.set(k, v); } })()`;
  return new Promise(resolve => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = m => { const msg = JSON.parse(m); if (msg.id !== id) return; ws.off('message', onMsg); const v = msg.result && msg.result.result && msg.result.result.value; resolve(v ? JSON.parse(v) : { ok: false, error: JSON.stringify(msg.result && msg.result.exceptionDetails || msg) }); };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
}

(async () => {
  const t = (await targets()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.e2e.js') && (!only.length || only.some(o => f.includes(o)))).sort();
  // E2E_RETRY=1: a failing test runs once more, and is reported as passing on the second try (never hidden)
  const retry = process.env.E2E_RETRY === '1';
  let pass = 0, fail = 0; const second = [];
  for (const f of files) {
    const name = f.replace('.e2e.js', '');
    let r = await runOne(ws, path.join(__dirname, f));
    if (!r.ok && retry) {
      console.log(`  ↻ ${name} failed (${String(r.error).split('\n')[0]}) – trying once more`);
      r = await runOne(ws, path.join(__dirname, f));
      if (r.ok) second.push(name);
    }
    if (r.ok) { pass++; console.log(`  ✓ ${name} (${(r.ms / 1000).toFixed(1)} s)${second.includes(name) ? ' [on the second try]' : ''}${r.info ? '  ' + JSON.stringify(r.info) : ''}`); }
    else { fail++; console.log(`  ✗ ${name} (${(r.ms / 1000).toFixed(1)} s)\n      ${String(r.error).split('\n').slice(0, 5).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (real Premiere Pro)${second.length ? ` · passed on the second try: ${second.join(', ')}` : ''}`);
  ws.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Could not reach the panel on port ' + PORT + ': ' + e.message); process.exit(2); });
