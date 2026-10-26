// Development: Story in the real panel over CDP (port 8890) – a real mouse drag on the board, layout checks at 460 px
// and wide, and screenshots. Restores the board and the viewport afterwards.
// Usage: dev/with-premiere.sh node dev/probes/story_cdp.js <out-dir>
const WebSocket = require('ws'), http = require('http'), fs = require('fs'), path = require('path');
const out = process.argv[2] || '.';
const get = url => new Promise((res, rej) => http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
(async () => {
  const t = (await get('http://127.0.0.1:8890/json')).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0;
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const on = m => { const x = JSON.parse(m); if (x.id !== i) return; ws.off('message', on); x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result); }; ws.on('message', on); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // CEP can't paint beyond the panel's own window, so a viewport wider than it is laid out at full size and scaled down to fit
  let cur = null, win = null;
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const size = async (w, h) => {
    if (!win) { await send('Emulation.clearDeviceMetricsOverride'); win = await js('return [innerWidth, innerHeight];'); }
    const scale = Math.min(1, win[0] / w, win[1] / h); cur = [w, h];
    return send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false, scale });
  };
  const only = process.env.ONLY || '';
  const report = {};
  const saved = await js(`const st = US.story.loadState(); return JSON.stringify({ wall: st.wall });`);
  try {
    // ---- a real mouse drag: first card of group 1 onto group 2
    await size(1600, 1000);
    if (!only) {
    await js(`const st = US.story.loadState(); st.wall.mode = 'columns'; US.story.save(); document.body.classList.remove('focus'); US.story.open('board'); return 1;`);
    await sleep(400);
    const pos = await js(`const cols = Array.from(document.querySelectorAll('.wall-col')); const i = cols.findIndex((c, k) => k < cols.length - 1 && c.querySelector('.wall-card')); if (i < 0) return null;
      const card = cols[i].querySelector('.wall-card'), body = cols[i + 1].querySelector('.wall-cards') || cols[i + 1];
      const a = card.getBoundingClientRect(), b = body.getBoundingClientRect();
      return { i, key: card.dataset.key, x: a.left + 30, y: a.top + 30, tx: b.left + b.width / 2, ty: b.top + Math.min(b.height - 10, 60), n0: cols[i].querySelectorAll('.wall-card').length, n1: cols[i + 1].querySelectorAll('.wall-card').length };`);
    if (pos) {
      const m = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
      await m('mouseMoved', pos.x, pos.y, 0); await m('mousePressed', pos.x, pos.y, 1);
      for (let i = 1; i <= 12; i++) { await m('mouseMoved', pos.x + (pos.tx - pos.x) * i / 12, pos.y + (pos.ty - pos.y) * i / 12, 1); await sleep(16); }
      await m('mouseReleased', pos.tx, pos.ty, 0);
      await sleep(300);
      report.drag = await js(`const cols = document.querySelectorAll('.wall-col'); return { group: ${pos.i}, before: [${pos.n0}, ${pos.n1}], after: [cols[${pos.i}].querySelectorAll('.wall-card').length, cols[${pos.i + 1}].querySelectorAll('.wall-card').length], movedIntoNextGroup: !!cols[${pos.i + 1}].querySelector('[data-key="${pos.key}"]') };`);
    } else report.drag = 'fewer than two groups on the board';
    // restore the board before the screenshots
    await js(`const st = US.story.loadState(); Object.assign(st, JSON.parse(${JSON.stringify(saved)})); US.story.save(); return 1;`);
    // ---- 460 px: every tab
    await size(460, 900);
    report.narrow = {};
    for (const [name, section] of [['transcripts', 'transcripts'], ['find', 'find'], ['moments', 'moments'], ['themes', 'themes'], ['board', 'board'], ['build', 'build'], ['narrative', 'narrative'], ['export', 'timeline']]) {
      await js(`document.body.classList.remove('focus'); US.story.open('${section}'); return 1;`);
      await sleep(500);
      report.narrow[name] = await js(`const d = document.documentElement, pane = Array.from(document.querySelectorAll('.story-pane')).find(p => !p.classList.contains('hidden'));
        const wide = Array.from(pane.querySelectorAll('*')).filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.board-free, .wall-cols, .story-tl-list'); }).slice(0, 3).map(e => e.className || e.tagName);
        return { pageScroll: d.scrollWidth > innerWidth + 1, overflowing: wide };`);
      await shot(`story-460-${name}`);
    }
    }
    // ---- wide: board in columns, free board, full screen – at the panel's own size (CEP doesn't paint beyond its window,
    // so an emulated 1600 px viewport repeats a stale strip on the right)
    await send('Emulation.clearDeviceMetricsOverride'); cur = null;
    await js(`const st = US.story.loadState(); st.wall.mode = 'columns'; US.story.save(); US.story.open('board'); return 1;`); await sleep(500);
    report.wideColumns = await js(`const cols = Array.from(document.querySelectorAll('.wall-col')); const r = cols.map(c => c.getBoundingClientRect()); return { groups: cols.length, widths: r.map(x => Math.round(x.width)), rightEdge: Math.round(Math.max(...r.map(x => x.right))), viewport: innerWidth };`);
    await shot('story-wide-board-columns');
    await js(`const st = US.story.loadState(); st.wall.mode = 'free'; US.story.save(); US.story.open('board'); return 1;`); await sleep(500);
    report.wideFree = await js(`const f = document.querySelector('.board-free'); const r = f && f.getBoundingClientRect(); return f ? { width: Math.round(r.width), height: Math.round(r.height), groups: f.querySelectorAll('.bf-group').length } : null;`);
    await shot('story-wide-board-free');
    report.full = await js(`const b = Array.from(document.querySelectorAll('.board-bar .btn')).find(x => /Full screen/.test(x.textContent)); b.click(); await new Promise(r => setTimeout(r, 400));
      const f = document.querySelector('.board-free'); return { focus: document.body.classList.contains('focus'), height: f ? Math.round(f.getBoundingClientRect().height) : 0 };`);
    await shot('story-wide-board-fullscreen');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await new Promise(r => setTimeout(r, 200)); return document.body.classList.contains('focus');`).then(v => { report.escLeavesFull = !v; });
  } finally {
    await js(`const st = US.story.loadState(); Object.assign(st, JSON.parse(${JSON.stringify(saved)})); US.story.save(); document.body.classList.remove('focus'); US.story.open('board'); return 1;`).catch(() => {});
    await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    ws.close();
  }
  console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
