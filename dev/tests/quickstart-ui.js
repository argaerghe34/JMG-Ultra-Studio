// Settings › Quick start in the real panel (jsdom, dev/tests/panel-dom.js): the button opens QUICKSTART.md in a modal,
// Search lists it, and the guide is found where each package and development link keeps it. Also reports the rail's
// places and tools and the text of Settings, so quickstart.test.js can check every name the guide uses.
// Prints JSON on the last line (quickstart.test.js reads it).
const fs = require('fs'), os = require('os'), path = require('path');
const { US, $$, tick, boot, errors, w, ROOT } = require('./panel-dom');

(async () => {
  await boot();
  const out = { errors };
  out.places = US.PLACES.map(p => ({ id: p.id, name: p.name, tools: (p.id === 'advanced' ? [] : US.placeTools(p.id)).map(d => ({ id: d.id, name: d.name, short: d.short || '' })) }));
  out.tools = US.tools.list().map(d => ({ id: d.id, name: d.name, short: d.short || '' }));
  // Settings: the Quick start card near the top, and its button opens the guide
  US.tools.open('settings'); await tick();
  const view = w.document.querySelector('.view > :not(.hidden)');
  out.settingsText = view ? view.textContent.replace(/\s+/g, ' ') : '';
  const cards = view ? Array.from(view.querySelectorAll('[data-section]')).filter(e => !e.parentNode.closest('[data-section]')).map(e => e.dataset.section) : [];
  out.cardIndex = cards.indexOf('quickstart');
  const btn = $$('button', view || w.document).find(b => b.textContent.trim() === 'Open the quick start');
  out.button = !!btn;
  if (btn) {
    btn.click(); await tick();
    const m = w.document.querySelector('.modal');
    out.modalTitle = m ? m.querySelector('.modal-title').textContent : '';
    out.headings = m ? $$('.quickstart .card-title', m).map(e => e.textContent) : [];
    out.items = m ? $$('.quickstart li', m).length : 0;
    out.bold = m ? $$('.quickstart b', m).map(e => e.textContent) : [];
    out.rawMarkdown = m ? /\*\*|\]\(/.test(m.textContent) : true;
    const close = m && $$('button', m).find(b => b.textContent.trim() === 'Close');
    if (close) close.click();
    await tick();
    out.closed = !w.document.querySelector('.modal');
  }
  out.inSearch = US.search.results('quick start').some(e => e.id === 'help:quickstart');
  // where it's found: the development copy (the root), a package (docs/), and Resolve's development link (dev/ linked)
  const real = US.host.extensionDir;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'us-qs-'));
  const at = dir => { US.host.extensionDir = () => dir; const f = US.quickstart.file(); return f && fs.realpathSync(f); };
  out.foundDev = at(ROOT) === fs.realpathSync(path.join(ROOT, 'QUICKSTART.md'));
  fs.mkdirSync(path.join(tmp, 'pkg', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'pkg', 'docs', 'QUICKSTART.md'), '# x');
  out.foundPackage = at(path.join(tmp, 'pkg')) === fs.realpathSync(path.join(tmp, 'pkg', 'docs', 'QUICKSTART.md'));
  fs.mkdirSync(path.join(tmp, 'link'));
  fs.symlinkSync(path.join(ROOT, 'dev'), path.join(tmp, 'link', 'dev'), 'junction');
  out.foundResolveLink = at(path.join(tmp, 'link')) === fs.realpathSync(path.join(ROOT, 'QUICKSTART.md'));
  US.host.extensionDir = real;
  try { fs.unlinkSync(path.join(tmp, 'link', 'dev')); } catch (e) { /* the temporary folder is left for the system to clear */ }
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: e.stack })); process.exit(1); });
