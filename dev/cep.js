// Usage: node cep.js <port> <mode> <file|->
//   mode "jsx": runs the file as ExtendScript via the panel's evalScript, prints the result
//   mode "js":  runs the file as page JavaScript (awaited), prints the JSON result
//   mode "shot": saves a PNG screenshot of the panel to <file>
//   mode "reload": reloads the panel page (file ignored)
const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');
const [port, mode, file] = process.argv.slice(2);
const src = (mode === 'jsx' || mode === 'js') ? fs.readFileSync(file === '-' ? 0 : file, 'utf8') : '';
const timeoutMs = +(process.env.CEP_TIMEOUT || 600000);

function getJSON(url) {
  return new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
}

(async () => {
  const targets = await getJSON(`http://127.0.0.1:${port}/json`);
  const t = targets.find(x => x.type === 'page') || targets[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  if (mode === 'shot' || mode === 'reload') {
    const method = mode === 'shot' ? 'Page.captureScreenshot' : 'Page.reload';
    ws.send(JSON.stringify({ id: 1, method, params: mode === 'shot' ? { format: 'png' } : { ignoreCache: true } }));
    ws.on('message', m => { const msg = JSON.parse(m); if (msg.id !== 1) return; if (mode === 'shot') fs.writeFileSync(file, Buffer.from(msg.result.data, 'base64')); console.log(mode + ' ok'); ws.close(); process.exit(0); });
    return;
  }
  let expr;
  if (mode === 'jsx') {
    expr = `new Promise(r => window.__adobe_cep__.evalScript(${JSON.stringify(src)}, r))`;
  } else {
    expr = `(async () => { ${src} })().then(v => JSON.stringify(v), e => 'PAGE-ERROR: ' + (e && e.stack || e))`;
  }
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, timeoutMs);
  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id !== 1) return;
    clearTimeout(timer);
    if (msg.result && msg.result.exceptionDetails) console.log('EXCEPTION', JSON.stringify(msg.result.exceptionDetails));
    else console.log(msg.result && msg.result.result ? msg.result.result.value : JSON.stringify(msg));
    ws.close(); process.exit(0);
  });
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
