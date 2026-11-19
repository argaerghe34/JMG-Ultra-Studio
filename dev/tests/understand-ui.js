// Headless check of Settings › Vision & listening models and the status line (jsdom, a stand-in Premiere): the section
// draws with no model on the computer – both routes with their pros, cons and this project's estimate, every model with
// its size on its Download button, the update toggle off – and choosing Cloud asks first and stays off on “no”.
// Run on its own (node dev/tests/understand-ui.js) or through understand.test.js. Prints JSON on the last line.
const { w, US, $$, tick, boot, errors } = require('./panel-dom');
(async () => {
  const out = { errors };
  try {
    await boot();
    const sec = (US.settingsSections.list || []).find(s => s.id === 'understand') || { create: US.understandUI.create, title: 'Vision & listening models' };
    out.title = sec.title;
    // this project's footage, as counted
    US.understand.queue.items = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, path: '/f/C' + i + '.mp4', name: 'C' + i + '.mp4', duration: 150 }));
    US.understand.queue.listed = true; US.understand.queue.project = US.ctx.project.path;
    US.secrets.set('geminiKey', 'g-test');
    const el = sec.create(); w.document.body.appendChild(el); await tick();
    const text = el.textContent;
    out.section = el.dataset.section;
    out.routes = $$('.segmented .seg', el).map(b => b.textContent.trim());
    out.prosCons = { pros: $$('.und-pro', el).length, cons: $$('.und-con', el).length };
    out.estimate = { footage: /12 clips, /.test(text), local: /Cost: nothing/.test(text), cloud: /prices read on 19 Nov 2026/.test(text), assumed: /an estimate/.test(text) };
    out.downloads = $$('button', el).map(b => b.textContent.trim()).filter(t => /^Download \(/.test(t));
    out.deleteButtons = $$('button', el).filter(b => b.textContent.trim() === 'Delete').length;
    out.kept = /Kept in: /.test(text);
    out.autoUpdate = /Update models automatically/.test(text);
    out.status = (el.querySelector('.und-chip') || {}).dataset ? el.querySelector('.und-chip').dataset.state : '';
    out.statusText = (el.querySelector('.und-chip .pill') || {}).textContent || '';
    // choosing Cloud asks first, with the estimate; “keep it on this computer” leaves it off
    const cloudBtn = $$('.segmented .seg', el).find(b => b.textContent.trim() === 'Cloud');
    cloudBtn.click(); await tick(); await tick();
    const modal = w.document.querySelector('.modal');
    out.confirm = modal ? { title: (modal.querySelector('.modal-title') || modal.querySelector('h3') || modal).textContent.slice(0, 80), says: /512 pixels wide/.test(modal.textContent) && /12 clips/.test(modal.textContent), buttons: $$('button', modal).map(b => b.textContent.trim()) } : null;
    if (modal) { $$('button', modal).find(b => /Keep it on this computer/.test(b.textContent)).click(); await tick(); await tick(); }
    out.afterNo = { route: US.understand.route(), mediaOn: US.ai.mediaOn() };
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
