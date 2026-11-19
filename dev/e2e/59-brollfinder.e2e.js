// B-roll finder in the real editor, with a pretend internet (no site is contacted, no key is needed): the tab opens
// from Advanced, a search lists the options with nothing downloaded, unticking one takes it out, and Download puts
// the ticked clip (a tiny local test file) in a folder named after the request, with the list of sources and
// licences – and, with the toggle on, in the bin “JMG Ultra Studio/B-roll/<request>”. Works in Premiere and Resolve.
const fs = require('fs'), path = require('path');
const B = US.brollFinder;
T.assert(B && US.tools.get('brollfinder'), 'the B-roll finder is loaded');
T.assert(US.ADVANCED_TOOLS.includes('brollfinder'), 'it lives in Advanced');
const TERM = 'e2e harbour at dawn';
const out = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports', 'B-roll e2e');
fs.rmSync(out, { recursive: true, force: true });
const tiny = T.media('selects', 'S05_static_nothing.mp4');
const ident = (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
const store = ident ? US.projectStore(ident) : null;
const keep = { net: Object.assign({}, B.net), searches: B.SOURCES.map(s => s.search), settings: US.settings.get('brollfinder'), folder: store ? store.get('_brollFinderFolder', '') : '' };
const asked = [];
const clip = (source, name, id, free) => ({ key: source + ':' + id, source, sourceName: name, id, title: name + ' test clip ' + id, page: 'https://example.org/' + id, author: 'E2E', thumb: '', preview: '', duration: 5, width: 1280, height: 720,
  licence: Object.assign({ id: free ? 'pexels' : 'youtube' }, B.LICENCES[free ? 'pexels' : 'youtube']), files: [{ url: 'https://example.org/' + id + '.mp4', width: 1280, height: 720, ext: 'mp4' }] });
const view = () => document.querySelector('.view > :not(.hidden)');
const one = sel => view().querySelector(sel);
const until = async (fn, what, ms = 20000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (fn()) return; await T.sleep(50); } throw new Error('Timed out waiting for ' + what); };
try {
  B.net.key = () => 'E2E-NOT-A-KEY';
  B.net.tools = () => ({ ytdlp: 'pretend', ffmpeg: '' });
  B.net.json = async url => { asked.push('json ' + url); throw new Error('no internet in this test'); };
  B.net.ytdlp = async () => { asked.push('ytdlp'); throw new Error('no internet in this test'); };
  B.net.download = async (url, file, progress) => { asked.push('download ' + url); fs.copyFileSync(tiny, file); if (progress) progress(1); return file; };
  B.SOURCES.forEach(s => { s.search = async () => (s.id === 'pexels' ? [clip('pexels', 'Pexels', 'e2e1', true), clip('pexels', 'Pexels', 'e2e2', true)] : s.id === 'pixabay' ? [clip('pixabay', 'Pixabay', 'e2e3', true)] : []); });
  US.settings.set('brollfinder', { aim: 8, freeOnly: true, toBin: true, size: 'hd', sources: {} });
  if (store) store.set('_brollFinderFolder', out);

  // opens from Advanced
  US.tools.open('advanced'); await T.sleep(100);
  const tile = one('.tile[data-tool="brollfinder"]');
  T.assert(tile, 'a B-roll finder tile in Advanced');
  tile.click(); await T.sleep(150);
  T.assert(one('[data-bf="query"]') && /B-roll finder/.test(one('.tool-title').textContent), 'the tab opened');
  T.assert(one('[data-bf="go"]').disabled, 'Download is greyed out before a search');

  // a search lists the options; nothing is downloaded
  one('[data-bf="query"]').value = TERM;
  one('[data-bf="query"]').dispatchEvent(new Event('input'));
  one('[data-bf="find"]').click();
  await until(() => view().querySelectorAll('.bff-card').length === 3, 'the three options');
  await until(() => !US.jobs.current, 'the search to finish');
  const cards = Array.from(view().querySelectorAll('.bff-card'));
  T.assert(cards.every(c => c.querySelector('input[type=checkbox]').checked), 'free-to-use options are ticked to start with');
  T.assert(cards.every(c => /free to use/.test(c.querySelector('.bff-licence').textContent)), 'each option says its licence');
  T.assert(!asked.length && !fs.existsSync(out), 'searching downloaded nothing: ' + asked.join(', '));
  T.assert(/Download 3 ticked clips/.test(one('[data-bf="go"]').textContent), 'the button counts the ticked clips: ' + one('[data-bf="go"]').textContent);

  // untick two; download the one left, bin toggle on
  for (const c of cards.slice(1)) { const b = c.querySelector('input[type=checkbox]'); b.checked = false; b.dispatchEvent(new Event('change')); }
  T.assert(/Download 1 ticked clip\s*$/.test(one('[data-bf="go"]').textContent) && cards[1].classList.contains('off'), 'unticking works: ' + one('[data-bf="go"]').textContent);
  one('[data-bf="go"]').click();
  await until(() => asked.some(a => /^download/.test(a)), 'the download to start');
  await until(() => !US.jobs.current, 'the download to finish', 60000);
  await T.sleep(300);
  T.assert(asked.join() === 'download https://example.org/e2e1.mp4', 'only the ticked clip was fetched: ' + asked.join());
  const sub = path.join(out, TERM), file = path.join(sub, `${TERM} – Pexels – e2e1.mp4`);
  T.assert(fs.existsSync(file) && fs.statSync(file).size === fs.statSync(tiny).size, 'the clip is in the folder named after the request: ' + (fs.existsSync(sub) ? fs.readdirSync(sub).join(', ') : 'no folder ' + sub));
  const list = fs.readFileSync(path.join(sub, B.LIST_NAME), 'utf8');
  T.assert(/e2e1\.mp4,Pexels test clip e2e1,Pexels,https:\/\/example\.org\/e2e1,E2E/.test(list) && /Pexels licence – free to use/.test(list), 'the list of sources and licences: ' + list.slice(0, 300));
  // …and in the bin
  const bins = await US.host.call('listBins');
  const bin = bins.find(b => b.path === ['JMG Ultra Studio', 'B-roll', TERM].join(' / '));
  T.assert(bin, 'a bin named after the request: ' + bins.map(b => b.path).filter(p => /B-roll/.test(p)).join(', '));
  const items = await US.host.call('binItems', { binId: bin.id, kinds: [], recursive: false });
  T.assert(items.length >= 1, 'the clip is in the bin: ' + JSON.stringify(items.map(i => i.name)));
  T.assert(/Downloaded/.test(view().querySelector('.bff-card').textContent), 'the option is marked as downloaded');

  // again: the file that's there is skipped
  asked.length = 0;
  const again = await B.run(US.jobs.testJob('brollfinder'), { picks: [{ term: TERM, clip: clip('pexels', 'Pexels', 'e2e1', true) }], folder: out, toBin: false });
  T.assert(!asked.length && /1 already there/.test(again.summary), 'skipped the second time: ' + again.summary);

  // Ask opens it with the request filled in, and does nothing else
  const a = US.actions.get('brollfinder.find'), p = a.match('find b-roll of a lighthouse in a storm');
  T.assert(p && p.query === 'a lighthouse in a storm', 'Ask understands the sentence');
  US.tools.open('home'); await a.run(p, US.jobs.testJob('ask')); await T.sleep(150);
  T.assert(one('[data-bf="query"]') && one('[data-bf="query"]').value === 'a lighthouse in a storm' && !asked.length, 'Ask filled the request in and downloaded nothing');
  return [again.summary, 'bin: ' + bin.path, 'items in bin: ' + items.map(i => i.name).join(', ')];
} finally {
  Object.assign(B.net, keep.net);
  B.SOURCES.forEach((s, i) => { s.search = keep.searches[i]; });
  if (keep.settings != null) US.settings.set('brollfinder', keep.settings); else delete US.settings.all().brollfinder;
  if (store) store.set('_brollFinderFolder', keep.folder);
}
