// Development: every tool at a narrow panel width (default 460×900) – anything wider than the panel is listed, and each
// tool is screenshotted. Restores the viewport afterwards.  Usage: node dev/probes/narrow_cdp.js <out-dir> [width]
const WebSocket = require('ws'), http = require('http'), fs = require('fs'), path = require('path');
const out = process.argv[2] || '.', W = +(process.argv[3] || 460), H = 900;
const get = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
(async () => {
  const t = (await get('http://127.0.0.1:8890/json')).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0;
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const on = m => { const x = JSON.parse(m); if (x.id !== i) return; ws.off('message', on); x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result); }; ws.on('message', on); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const report = {};
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const tools = await js(`return US.tools.list().filter(t => !t.hidden).map(t => t.id);`);
    for (const id of tools.concat(['settings'])) {
      await js(`US.tools.open(${JSON.stringify(id)}); return 1;`);
      await sleep(900);
      report[id] = await js(`
        const vw = document.documentElement.clientWidth, wide = [];
        const scrollers = '.wall, .wall-strip, .colour-grid, .story-board, .cam-strip, pre, .story-tl-list';
        for (const el of document.querySelectorAll('.tool:not(.hidden) *')) {
          if (!el.offsetParent || el.closest(scrollers)) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.right > vw + 1) wide.push((el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : el.tagName) + ' ' + Math.round(r.right) + 'px: ' + (el.innerText || '').slice(0, 40).replace(/\\n/g, ' '));
        }
        return { pageScroll: document.documentElement.scrollWidth > vw, wide: Array.from(new Set(wide)).slice(0, 6) };`);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, `narrow-${id}.png`), Buffer.from(s.data, 'base64'));
    }
  } finally { await send('Emulation.clearDeviceMetricsOverride').catch(() => {}); ws.close(); }
  console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
