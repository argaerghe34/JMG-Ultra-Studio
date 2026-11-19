// The B-roll finder's screen in the real panel (jsdom, dev/tests/panel-dom.js) with a pretend internet: open it from
// Advanced and from Ask, search, see the options with their licences, untick one, download – only the ticked ones, into
// the folder named after the request, and into the bin when that is switched on. Prints JSON on the last line
// (brollfinder.test.js reads it).
const fs = require('fs'), path = require('path');
const { US, $$, tick, boot, errors, w } = require('./panel-dom');
const problems = [], fail = m => problems.push(m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await boot();
  const B = US.brollFinder, asked = [], host = [];
  const clip = (source, name, id, free) => ({ key: source + ':' + id, source, sourceName: name, id, title: name + ' clip ' + id, page: 'https://example.org/' + id, author: 'Someone', thumb: 'https://example.org/' + id + '.jpg', preview: 'https://example.org/' + id + '-small.mp4', duration: 12, width: 1920, height: 1080,
    licence: free ? Object.assign({ id: 'pexels' }, B.LICENCES.pexels) : Object.assign({ id: 'youtube' }, B.LICENCES.youtube), files: [{ url: 'https://example.org/' + id + '.mp4', width: 1920, height: 1080, ext: 'mp4' }] });
  B.net.key = () => 'TEST-KEY';
  B.net.tools = () => ({ ytdlp: '/fake/yt-dlp', ffmpeg: '' });
  B.net.json = async url => { asked.push(url); throw new Error('the pretend sources answer below'); };
  B.net.download = async (url, file) => { asked.push('download ' + url); fs.writeFileSync(file, 'x'); return file; };
  for (const s of B.SOURCES) s.search = async term => { asked.push(`search ${s.id} ${term}`); return s.id === 'pexels' ? [clip('pexels', 'Pexels', 1, true), clip('pexels', 'Pexels', 2, true)] : s.id === 'youtube' ? [clip('youtube', 'YouTube', 9, false)] : []; };
  const real = US.host.call;
  US.host.call = async (fn, a) => { if (fn === 'importFiles') { host.push(a); return a.paths.map((p, i) => ({ id: 'i' + i, name: path.basename(p) })); } return real(fn, a); };
  const view = () => w.document.querySelector('.view > :not(.hidden)');
  const one = sel => view().querySelector(sel);

  // it's in Advanced, and opens from there
  US.tools.open('advanced'); await tick();
  const tile = one('.tile[data-tool="brollfinder"]');
  if (!tile) fail('no B-roll finder tile in Advanced'); else tile.click();
  await tick();
  if (!one('[data-bf="query"]')) { fail('the B-roll finder didn’t open'); console.log(JSON.stringify({ problems, errors })); process.exit(0); }
  if (!/‹ Advanced/.test(view().textContent)) fail('no way back to Advanced');
  if (one('[data-bf="go"]').disabled !== true) fail('Download should be greyed out before anything is ticked');
  if (asked.length) fail('something was asked for before Find was pressed: ' + asked.join(', '));

  // Ask fills the request in (and doesn't search or download)
  const a = US.actions.get('brollfinder.find');
  await a.run(a.match('find b-roll of a harbour at dawn'));
  await tick();
  if (one('[data-bf="query"]').value !== 'a harbour at dawn') fail('Ask didn’t fill the request in: ' + one('[data-bf="query"]').value);
  if (asked.length) fail('Ask searched or downloaded by itself');

  // free-to-use only is on to start with; switch it off to see the one that needs permission too
  US.settings.set('brollfinder', Object.assign({}, US.settings.get('brollfinder', {}), { freeOnly: false, folder: path.join(process.env.HOME, 'B-roll out') }));
  US.tools.open('home'); US.tools.open('brollfinder'); await tick();
  one('[data-bf="query"]').value = 'harbour at dawn';
  one('[data-bf="find"]').click();
  for (let i = 0; i < 100 && !one('.bff-card'); i++) await sleep(20);
  const cards = $$('.bff-card', view());
  if (cards.length !== 3) fail('expected 3 options, got ' + cards.length);
  if (asked.some(x => /^download/.test(x))) fail('searching downloaded something');
  const boxes = cards.map(c => c.querySelector('input[type=checkbox]'));
  if (boxes.map(b => b.checked).join() !== 'true,false,true') fail('free clips ticked, the one needing permission not: ' + boxes.map(b => b.checked).join());
  if (!cards.some(c => /standard licence: you need permission/.test(c.textContent)) || !cards[0].querySelector('.bff-licence.free')) fail('licences aren’t shown plainly');
  if (!/1920×1080 · 16:9/.test(cards[0].textContent)) fail('a card doesn’t show its size and shape: ' + cards[0].textContent);
  if (!one('[data-bf="shape"]') || !/16:9/.test(one('[data-bf="shape"]').textContent) || !/At least 4K/.test(one('[data-bf="shape"]').innerHTML) || !/Up to 720p/.test(view().textContent)) fail('no shape, size or download-size choice on the screen');
  if (!cards[0].querySelector('img') || !/Open on Pexels/.test(cards[0].textContent) || !/1920×1080/.test(cards[0].textContent)) fail('a card lacks its thumbnail, page link or size');
  if (!/2 ticked/.test(view().textContent) || !/Download 2 ticked clips/.test(one('[data-bf="go"]').textContent)) fail('the ticked count is wrong: ' + one('[data-bf="go"]').textContent);
  // a preview plays from the site's small file
  cards[0].querySelector('.bff-thumb').click(); await tick();
  const vid = cards[0].querySelector('video');
  if (!vid || vid.getAttribute('src') !== 'https://example.org/1-small.mp4') fail('the preview doesn’t stream the small file');
  if (asked.some(x => /^download/.test(x))) fail('a preview downloaded something');

  // untick one, switch the bin on, download
  boxes[2].checked = false; boxes[2].dispatchEvent(new w.Event('change')); await tick();
  if (!/Download 1 ticked clip$/.test(one('[data-bf="go"]').textContent.trim())) fail('unticking didn’t change the button: ' + one('[data-bf="go"]').textContent);
  US.settings.set('brollfinder', Object.assign({}, US.settings.get('brollfinder', {}), { toBin: true }));
  const inst = US.tools.get('brollfinder'); void inst;
  // the toggle itself
  const binToggle = $$('label.toggle', view()).find(l => /Also add to a bin in the project/.test(l.textContent));
  if (!binToggle) fail('no “Also add to a bin in the project” toggle');
  else { const i = binToggle.querySelector('input'); if (i.checked) fail('the bin toggle should be off to start with'); i.checked = true; i.dispatchEvent(new w.Event('change')); }
  one('[data-bf="go"]').click();
  for (let i = 0; i < 100 && !host.length; i++) await sleep(20);
  await sleep(50);
  const downloads = asked.filter(x => /^download/.test(x));
  if (downloads.join() !== 'download https://example.org/1.mp4') fail('only the ticked clip should download: ' + downloads.join());
  const ident = US.ctx && US.ctx.project && US.ctx.project.path;
  const root = ident ? path.join(path.dirname(ident), 'JMG Ultra Studio', 'B-roll') : path.join(process.env.HOME, 'B-roll out');
  const sub = path.join(root, 'harbour at dawn');
  let files = []; try { files = fs.readdirSync(sub).sort(); } catch (e) { fail('no folder named after the request at ' + sub); }
  if (files.join('|') !== 'Sources and licences.csv|harbour at dawn – Pexels – 1.mp4') fail('files in the folder: ' + files.join('|'));
  if (!host.length || host[0].binPath !== 'JMG Ultra Studio/B-roll/harbour at dawn' || host[0].paths.length !== 1) fail('not imported into the request’s bin: ' + JSON.stringify(host));
  if (!/Downloaded/.test(cards.length ? view().querySelector('.bff-card').textContent : '')) fail('the downloaded clip isn’t marked');
  console.log(JSON.stringify({ problems, errors: errors.filter(e => /brollfinder/.test(e)) }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ problems: ['crash: ' + e.stack] })); process.exit(0); });
