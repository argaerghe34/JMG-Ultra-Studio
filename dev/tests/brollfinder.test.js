// B-roll finder: requests read from the box, folder and file names, licences in plain words, each site's answer made
// into options (pretend answers – no internet, no real keys), the places taking turns up to "Aim for", the free-to-use
// filter, and a whole download with a pretend internet: the right folder, clear names, the list of sources and
// licences, files already there skipped, and the bin only when asked. Then the screen itself (jsdom).
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { load, test } = require('./harness');
const US = load(['ui', 'app', 'js/tools/44-youtube.js', 'js/tools/47-brollfinder.js']);
const B = US.brollFinder;
const job = () => ({ cancelled: false, set() {}, progress() {}, check() {} });

const PEXELS = { videos: [
  { id: 857251, width: 3840, height: 2160, url: 'https://www.pexels.com/video/aerial-view-of-london-857251/', image: 'https://images.pexels.com/videos/857251/pic.jpeg', duration: 14, user: { name: 'Ana Drone', url: 'https://www.pexels.com/@ana' },
    video_files: [{ id: 1, quality: 'hd', file_type: 'video/mp4', width: 3840, height: 2160, link: 'https://videos.pexels.com/857251-uhd.mp4' }, { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/857251-hd.mp4' }, { id: 3, quality: 'sd', file_type: 'video/mp4', width: 640, height: 360, link: 'https://videos.pexels.com/857251-sd.mp4' }, { id: 4, quality: 'hls', file_type: 'application/x-mpegURL', link: 'https://videos.pexels.com/857251.m3u8' }] },
  { id: 99, width: 1080, height: 1920, url: 'https://www.pexels.com/video/99/', image: 'https://images.pexels.com/videos/99/pic.jpeg', duration: 8, user: { name: 'Bo' }, video_files: [{ quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/99-hd.mp4' }] }
] };
const PIXABAY = { totalHits: 1, hits: [{ id: 125, pageURL: 'https://pixabay.com/videos/id-125/', type: 'film', tags: 'london, thames, dusk', duration: 12, user: 'Coverr-Free-Footage', user_id: 1281706,
  videos: { large: { url: '', width: 0, height: 0, size: 0, thumbnail: '' }, medium: { url: 'https://cdn.pixabay.com/video/125_medium.mp4', width: 1920, height: 1080, size: 6615235, thumbnail: 'https://cdn.pixabay.com/video/125_medium.jpg' }, small: { url: 'https://cdn.pixabay.com/video/125_small.mp4', width: 1280, height: 720, size: 100, thumbnail: 'https://cdn.pixabay.com/video/125_small.jpg' }, tiny: { url: 'https://cdn.pixabay.com/video/125_tiny.mp4', width: 960, height: 540, size: 50, thumbnail: 'https://cdn.pixabay.com/video/125_tiny.jpg' } } }] };
const COMMONS = { query: { pages: {
  2: { pageid: 2, index: 2, title: 'File:Second one.webm', videoinfo: [{ url: 'https://upload.wikimedia.org/b/Second_one.webm', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Second_one.webm', thumburl: 'https://upload.wikimedia.org/thumb/2.jpg', width: 1280, height: 720, duration: 20, size: 4000000, extmetadata: { LicenseShortName: { value: 'Public domain' } } }] },
  1: { pageid: 1, index: 1, title: 'File:Thames from the air.ogv', videoinfo: [{ url: 'https://upload.wikimedia.org/a/Thames.ogv?utm_source=commons.wikimedia.org&utm_campaign=imageinfo', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Thames.ogv', thumburl: 'https://upload.wikimedia.org/thumb/1.jpg', width: 1920, height: 1080, duration: 346.5, size: 774425973,
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:A">Andrew &amp; Co</a>' } },
    derivatives: [{ src: 'https://upload.wikimedia.org/t/Thames.240p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', width: 426, height: 240 }, { src: 'https://upload.wikimedia.org/t/Thames.1080p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', width: 1920, height: 1080 }, { src: 'https://upload.wikimedia.org/t/Thames.2160p.vp9.webm', type: 'video/webm', width: 3840, height: 2160 }] }] }
} } };
const YT = n => ({ entries: Array.from({ length: n }, (_, i) => ({ _type: 'url', ie_key: 'Youtube', id: 'vid0000000' + i, title: 'London drone ' + i, duration: 100 + i, channel: 'World Aerials', channel_url: 'https://www.youtube.com/channel/UCx' })).concat([{ ie_key: 'Youtube', id: 'UCchannel', title: 'a channel' }]) });

test('requests: one per line, bullets and numbers dropped, each once; safe folder and file names', () => {
  assert.deepStrictEqual(B.parseRequests('  aerial of London at dusk \n\n- hands typing on a laptop\n2) “city at night”\nAerial of London at dusk\n'), ['aerial of London at dusk', 'hands typing on a laptop', 'city at night']);
  assert.deepStrictEqual(B.parseRequests(''), []);
  assert.strictEqual(B.safeName('before/after: a "test"? '), 'before after a test');
  assert.strictEqual(B.safeName('  ...'), 'B-roll');
  assert.ok(B.safeName('x'.repeat(200)).length <= 60);
  assert.strictEqual(B.fileName('aerial of London: dusk', { sourceName: 'Pexels', id: 857251 }, 'mp4'), 'aerial of London dusk – Pexels – 857251.mp4');
  assert.strictEqual(B.binPath('city / night'), 'JMG Ultra Studio/B-roll/city night');
});

test('licences in plain words: what is free to use, what needs a credit, what needs permission', () => {
  const L = (t, u) => B.licenceFrom(t, u);
  assert.deepStrictEqual([L('CC BY-SA 4.0').id, L('CC BY-SA 4.0').name, L('CC BY-SA 4.0').free, L('CC BY-SA 4.0').careful], ['cc-by-sa', 'CC BY-SA 4.0', true, true]);
  assert.strictEqual(L('https://creativecommons.org/licenses/by/2.0/').id, 'cc-by');
  assert.strictEqual(L('https://creativecommons.org/licenses/by/2.0/').link, 'https://creativecommons.org/licenses/by/2.0/');
  assert.deepStrictEqual([L('https://creativecommons.org/licenses/by-nc-sa/3.0/').id, L('https://creativecommons.org/licenses/by-nc-sa/3.0/').free], ['cc-by-nc', false]);
  assert.deepStrictEqual([L('CC BY-ND 4.0').id, L('CC BY-ND 4.0').free], ['cc-by-nd', false]);
  assert.strictEqual(L('http://creativecommons.org/publicdomain/zero/1.0/').id, 'cc0');
  assert.strictEqual(L('Public domain').id, 'pd');
  assert.strictEqual(L('https://creativecommons.org/publicdomain/mark/1.0/').id, 'pd');
  assert.strictEqual(L('Creative Commons Attribution license (reuse allowed)').id, 'cc-by');
  assert.deepStrictEqual([L('').id, L('').free, /need permission/.test(L('').label)], ['unknown', false, true]);
  assert.ok(/standard licence: you need permission/.test(B.LICENCES.youtube.label) && !B.LICENCES.youtube.free);
  assert.ok(/free to use/.test(B.LICENCES.pexels.label) && B.LICENCES.pexels.free && B.LICENCES.pixabay.free);
});

test('Pexels and Pixabay answers: the file to download (HD unless the largest is asked for), a small one to preview', () => {
  const p = B.parsePexels(PEXELS);
  assert.deepStrictEqual(p.map(c => [c.key, c.title, c.author, c.duration, c.width, c.licence.id]), [['pexels:857251', 'Aerial view of london', 'Ana Drone', 14, 3840, 'pexels'], ['pexels:99', 'Pexels video 99', 'Bo', 8, 1080, 'pexels']]);
  assert.strictEqual(p[0].preview, 'https://videos.pexels.com/857251-sd.mp4', 'the smallest watchable file plays as the preview');
  assert.strictEqual(B.pickFiles(p[0].files, 1080).file.url, 'https://videos.pexels.com/857251-hd.mp4');
  assert.strictEqual(B.pickFiles(p[0].files, 0).file.url, 'https://videos.pexels.com/857251-uhd.mp4');
  assert.ok(!p[0].files.some(f => /m3u8/.test(f.url)), 'no streaming playlists');
  assert.strictEqual(B.pickFiles(p[1].files, 1080).file.url, 'https://videos.pexels.com/99-hd.mp4', 'upright video: 1080 on its short side is HD');
  const x = B.parsePixabay(PIXABAY)[0];
  assert.deepStrictEqual([x.key, x.title, x.author, x.width, x.preview, x.files.length], ['pixabay:125', 'London, thames, dusk', 'Coverr-Free-Footage', 1920, 'https://cdn.pixabay.com/video/125_tiny.mp4', 3]);
  assert.ok(/125_(tiny|small)\.jpg$/.test(x.thumb) && x.page === 'https://pixabay.com/videos/id-125/');
  assert.deepStrictEqual(B.parsePexels({}), []); assert.deepStrictEqual(B.parsePixabay(null), []);
});

test('Wikimedia Commons, YouTube, Internet Archive and NASA answers', () => {
  const c = B.parseCommons(COMMONS);
  assert.deepStrictEqual(c.map(x => x.title), ['Thames from the air', 'Second one'], 'in the search’s own order');
  assert.deepStrictEqual([c[0].author, c[0].licence.name, c[0].licence.link, c[0].preview], ['Andrew & Co', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'https://upload.wikimedia.org/t/Thames.240p.vp9.webm']);
  assert.strictEqual(B.pickFiles(c[0].files, 1080).file.url, 'https://upload.wikimedia.org/t/Thames.1080p.vp9.webm', 'a huge original: Commons’ own 1080p copy instead');
  assert.ok(!c[0].files.some(f => /\.ogv/.test(f.url)) && c[1].files[0].url === 'https://upload.wikimedia.org/b/Second_one.webm' && c[1].licence.id === 'pd');
  const cc = B.parseYouTube(YT(2), true), std = B.parseYouTube(YT(1), false);
  assert.deepStrictEqual(cc.map(x => x.id), ['vid00000000', 'vid00000001'], 'channels left out');
  assert.ok(cc[0].licence.free && cc[0].licence.credit && /Creative Commons BY/.test(cc[0].licence.label) && cc[0].via === 'ytdlp' && cc[0].previewVia === 'ytdlp');
  assert.ok(!std[0].licence.free && std[0].page === 'https://www.youtube.com/watch?v=vid00000000' && /i\.ytimg\.com\/vi\/vid00000000\//.test(std[0].thumb));
  const a = B.archiveClip({ identifier: 'Flickr-75', title: 'The making of', licenseurl: 'https://creativecommons.org/licenses/by/2.0/', creator: 'https://www.flickr.com/photos/k/' },
    [{ name: 'The making.mov', format: 'QuickTime' }, { name: 'The making.mp4', format: 'h.264', length: '8.02', width: '640', height: '360' }, { name: 'x.ogv' }]);
  assert.deepStrictEqual([a.key, a.duration, a.width, a.licence.id, a.files[0].url, a.authorUrl], ['archive:Flickr-75', 8.02, 640, 'cc-by', 'https://archive.org/download/Flickr-75/The%20making.mp4', 'https://www.flickr.com/photos/k/']);
  assert.strictEqual(B.archiveClip({ identifier: 'x' }, [{ name: 'a.ogv' }]), null);
  assert.strictEqual(B.archiveClip({ identifier: 'y', title: 'No licence' }, [{ name: 'a.mp4', length: '1:02:03' }]).licence.free, false);
  const n = B.nasaClip({ data: [{ nasa_id: 'GSFC_1', title: 'Earth from Orbit', center: 'GSFC' }], links: [{ href: 'http://images-assets.nasa.gov/video/GSFC_1/GSFC_1~large.jpg', render: 'image', rel: 'alternate' }, { href: 'https://images-assets.nasa.gov/video/GSFC_1/GSFC_1~thumb.jpg', render: 'image', rel: 'preview' }] },
    { collection: { items: [{ href: 'http://images-assets.nasa.gov/video/GSFC_1/GSFC_1~orig.mov' }, { href: 'http://images-assets.nasa.gov/video/GSFC_1/GSFC_1~large.mp4' }, { href: 'http://images-assets.nasa.gov/video/GSFC_1/GSFC_1~preview.mp4' }, { href: 'http://images-assets.nasa.gov/video/GSFC_1/metadata.json' }] } });
  assert.deepStrictEqual([n.key, n.author, n.preview, B.pickFiles(n.files).file.url, n.thumb, n.licence.free], ['nasa:GSFC_1', 'NASA / GSFC', 'https://images-assets.nasa.gov/video/GSFC_1/GSFC_1~preview.mp4', 'https://images-assets.nasa.gov/video/GSFC_1/GSFC_1~large.mp4', 'https://images-assets.nasa.gov/video/GSFC_1/GSFC_1~thumb.jpg', true]);
});

test('the places take turns until “Aim for” is reached, each clip once', () => {
  const k = (s, n) => Array.from({ length: n }, (_, i) => ({ key: s + i }));
  assert.deepStrictEqual(B.pick([k('a', 5), k('b', 1), k('c', 3)], 6).map(c => c.key), ['a0', 'b0', 'c0', 'a1', 'c1', 'a2']);
  assert.deepStrictEqual(B.pick([[{ key: 'x' }, { key: 'y' }], [{ key: 'x' }, { key: 'z' }]], 9).map(c => c.key), ['x', 'z', 'y']);
  assert.deepStrictEqual(B.pick([[], []], 4), []);
});

/** A pretend internet: what was asked is kept in `asked`. */
function fakeNet(o = {}) {
  const was = Object.assign({}, B.net), asked = [];
  Object.assign(B.net, {
    key: n => (o.keys || { pexelsKey: 'PX-TEST', pixabayKey: 'PB-TEST' })[n] || '',
    tools: () => ({ ytdlp: o.noYtdlp ? '' : '/fake/yt-dlp', ffmpeg: o.ffmpeg ? '/fake/ffmpeg' : '' }),
    async json(url, { headers = {} } = {}) {
      asked.push({ url, headers });
      if (/api\.pexels\.com/.test(url)) { if (o.pexelsFails) throw Object.assign(new Error('HTTP 401: bad key'), { status: 401 }); return PEXELS; }
      if (/pixabay\.com\/api/.test(url)) return PIXABAY;
      if (/commons\.wikimedia\.org/.test(url)) return COMMONS;
      throw new Error('unexpected: ' + url);
    },
    async ytdlp(args) { asked.push({ ytdlp: args }); return JSON.stringify(/sp=EgIwAQ/.test(args[args.length - 1]) ? YT(2) : { entries: YT(2).entries.concat(YT(4).entries.slice(2, 4)) }); },
    async download(url, file, progress) { asked.push({ download: url, file }); if (/fail/.test(url) || o.downloadFails) throw Object.assign(new Error('HTTP 404'), { status: 404 }); if (progress) progress(1); fs.writeFileSync(file, 'video from ' + url); return file; },
    async ytDownload(j, a) { asked.push({ ytDownload: a }); const f = path.join(a.folder, 'London drone [x].mp4'); fs.writeFileSync(f, 'yt'); return { done: [{ url: a.links[0], files: [f] }], failed: [] }; },
    async convert(file, out) { asked.push({ convert: file }); if (!o.ffmpeg) return ''; fs.writeFileSync(out, 'mp4'); return out; }
  });
  return { asked, restore() { Object.assign(B.net, was); } };
}

test('a search: every place asked with the request and its key, options up to “Aim for”, only free-to-use footage unless asked', async () => {
  const f = fakeNet();
  try {
    const r = await B.search(job(), { requests: 'aerial of London at dusk', aim: 5, fresh: true });
    const x = r.results[0];
    assert.strictEqual(x.term, 'aerial of London at dusk');
    assert.deepStrictEqual(x.clips.map(c => c.key), ['pexels:857251', 'pixabay:125', 'commons:1', 'youtube:vid00000000', 'pexels:99'], 'the places take turns');
    assert.strictEqual(x.pool.length, 7);
    assert.ok(x.pool.every(c => c.licence.free), 'only free-to-use footage to start with');
    assert.strictEqual(r.summary, '5 options for 1 request – nothing downloaded yet');
    const px = f.asked.find(a => a.url && /pexels/.test(a.url));
    assert.ok(/query=aerial%20of%20London%20at%20dusk/.test(px.url) && px.headers.Authorization === 'PX-TEST');
    assert.ok(/key=PB-TEST&q=aerial%20of%20London/.test(f.asked.find(a => a.url && /pixabay/.test(a.url)).url));
    const yt = f.asked.filter(a => a.ytdlp);
    assert.ok(yt.length === 1 && yt[0].ytdlp.includes('--flat-playlist') && /sp=EgIwAQ/.test(yt[0].ytdlp[yt[0].ytdlp.length - 1]), 'YouTube: only its Creative Commons search');
    assert.ok(!f.asked.some(a => a.download || a.ytDownload), 'looking downloads nothing');
    // the filter off: YouTube's ordinary results too, marked as needing permission
    const all = await B.search(job(), { requests: ['aerial of London at dusk'], aim: 20, freeOnly: false, fresh: true });
    const ask = all.results[0].pool.filter(c => !c.licence.free);
    assert.deepStrictEqual(ask.map(c => [c.key, c.licence.id]), [['youtube:vid00000002', 'youtube'], ['youtube:vid00000003', 'youtube']]);
    // long videos left out; two requests, each with its own options
    const two = await B.search(job(), { requests: 'one\ntwo', aim: 3, maxLen: 60, fresh: true });
    assert.deepStrictEqual(two.results.map(q => [q.term, q.clips.length]), [['one', 3], ['two', 3]]);
    assert.ok(!two.results[0].pool.some(c => c.duration > 60));
    // the AI's search phrases: each is asked, the results joined
    f.asked.length = 0;
    const ph = await B.search(job(), { requests: ['a quiet morning'], aim: 4, sources: { pixabay: false, commons: false, youtube: false }, phrases: { 'a quiet morning': ['sunrise mist', 'empty street dawn'] }, fresh: true });
    assert.deepStrictEqual(f.asked.map(a => /query=([^&]+)/.exec(a.url)[1]), ['sunrise%20mist', 'empty%20street%20dawn']);
    assert.deepStrictEqual([ph.results[0].term, ph.results[0].clips.length, ph.results[0].asked.length], ['a quiet morning', 2, 2]);
  } finally { f.restore(); }
});

test('shape and size: named plainly, checked from each clip’s width and height – “not known” is its own answer', () => {
  assert.deepStrictEqual([B.ratioName(1920, 1080), B.ratioName(1080, 1920), B.ratioName(1080, 1080), B.ratioName(1080, 1350), B.ratioName(4096, 2160), B.ratioName(1440, 1080), B.ratioName(2000, 1000), B.ratioName(0, 1080)], ['16:9', '9:16', '1:1', '4:5', '17:9', '4:3', '2.00:1', '']);
  const c = (width, height) => ({ width, height });
  assert.deepStrictEqual([B.shapeFits(c(1920, 1080), '16:9'), B.shapeFits(c(4096, 2160), '16:9'), B.shapeFits(c(1440, 1080), '16:9'), B.shapeFits(c(1080, 1920), '16:9'), B.shapeFits(c(0, 0), '16:9'), B.shapeFits(c(1, 2), 'any')], [true, true, false, false, null, true]);
  assert.deepStrictEqual([B.shapeFits(c(1080, 1920), '9:16'), B.shapeFits(c(1080, 1350), '9:16'), B.shapeFits(c(1080, 1350), '4:5'), B.shapeFits(c(1000, 1000), '1:1'), B.shapeFits(c(1920, 1080), '1:1')], [true, false, true, true, false]);
  assert.deepStrictEqual([B.sizeFits(c(1920, 1080), 1080), B.sizeFits(c(1080, 1920), 1080), B.sizeFits(c(1280, 720), 1080), B.sizeFits(c(3840, 2160), 2160), B.sizeFits(c(0, 720), 720), B.sizeFits(c(0, 0), 720), B.sizeFits(c(0, 0), 0)], [true, true, false, true, true, null, true]);
  assert.deepStrictEqual(['720', '1080', '2160', 'max', 'hd', undefined].map(B.sizeSide), [720, 1080, 2160, 0, 1080, 1080]);
});

test('a search for a shape and a size: Pexels and Pixabay are asked with their own filters, the rest sorted by width and height, YouTube says it can’t', async () => {
  const f = fakeNet();
  try {
    const r = await B.search(job(), { requests: ['harbour'], aim: 10, shape: '16:9', minSide: 1080, fresh: true });
    const x = r.results[0];
    assert.ok(/orientation=landscape&size=medium/.test(f.asked.find(a => a.url && /pexels/.test(a.url)).url), 'Pexels: its orientation and size filters');
    assert.ok(/min_width=1881&min_height=1058/.test(f.asked.find(a => a.url && /pixabay/.test(a.url)).url), 'Pixabay: the least width and height');
    assert.deepStrictEqual(x.pool.filter(c => c.source !== 'youtube').map(c => c.key), ['pexels:857251', 'pixabay:125', 'commons:1'], 'the upright Pexels clip and the 720p Commons one are left out');
    assert.ok(x.pool.filter(c => c.source === 'youtube').length === 2 && x.pool.filter(c => c.source === 'youtube').every(c => c.unsure), 'YouTube’s are shown anyway, marked as not known');
    assert.ok(x.notes.some(n => /YouTube’s search doesn’t say a video’s shape or size, so it can’t keep to “16:9, at least 1080p”/.test(n)), x.notes.join(' | '));
    // upright: Pexels asked for portrait; only the upright clip fits; a place with nothing that fits says so
    f.asked.length = 0;
    const up = await B.search(job(), { requests: ['harbour'], aim: 10, shape: '9:16', sources: { youtube: false }, fresh: true });
    assert.ok(/orientation=portrait/.test(f.asked.find(a => a.url && /pexels/.test(a.url)).url) && !/size=/.test(f.asked.find(a => a.url && /pexels/.test(a.url)).url));
    assert.deepStrictEqual(up.results[0].pool.map(c => c.key), ['pexels:99']);
    assert.ok(up.results[0].notes.some(n => /Pixabay: found 1 video, but none 9:16/.test(n)) && up.results[0].notes.some(n => /Wikimedia Commons: found 2 videos, but none 9:16/.test(n)));
    // 4K: only what is 4K; any shape and any size ask the sites for nothing special
    const k4 = await B.search(job(), { requests: ['harbour'], aim: 10, minSide: 2160, sources: { youtube: false }, fresh: true });
    assert.deepStrictEqual(k4.results[0].pool.map(c => c.key), ['pexels:857251']);
    f.asked.length = 0;
    await B.search(job(), { requests: ['harbour'], aim: 10, sources: { youtube: false }, fresh: true });
    assert.ok(!f.asked.some(a => /orientation=|size=|min_width/.test(a.url)));
  } finally { f.restore(); }
});

test('a search with a place that can’t be used: said plainly, the others still looked in; none usable is an error', async () => {
  let f = fakeNet({ keys: { pixabayKey: 'PB' }, noYtdlp: true });
  try {
    const r = await B.search(job(), { requests: ['harbour'], aim: 4, fresh: true });
    assert.deepStrictEqual(r.results[0].clips.map(c => c.source), ['pixabay', 'commons', 'commons']);
    assert.ok(r.results[0].notes.some(n => /Pexels: add its free key/.test(n)) && r.results[0].notes.some(n => /YouTube: set up the downloader/.test(n)));
    await assert.rejects(B.search(job(), { requests: ['x'], sources: { commons: false, pixabay: false }, fresh: true }), e => e.code === 'BAD_INPUT' && /Pexels/.test(e.action));
    await assert.rejects(B.search(job(), { requests: '  ' }), e => e.code === 'BAD_INPUT');
  } finally { f.restore(); }
  f = fakeNet({ pexelsFails: true });
  try {
    const r = await B.search(job(), { requests: ['harbour'], aim: 3, fresh: true });
    assert.ok(r.results[0].notes.some(n => /Pexels didn’t accept the key/.test(n)) && r.results[0].clips.length === 3);
  } finally { f.restore(); }
});

test('a search is kept for a day: asked again, the sites aren’t', async () => {
  const f = fakeNet();
  try {
    await B.search(job(), { requests: ['kept for a day'], aim: 3, fresh: true });
    f.asked.length = 0;
    const r = await B.search(job(), { requests: ['kept for a day'], aim: 3 });
    assert.strictEqual(f.asked.length, 0);
    assert.strictEqual(r.results[0].clips.length, 3);
  } finally { f.restore(); }
});

test('a download: a folder named after the request, clear file names, the list of sources and licences, nothing in the project unless asked', async () => {
  const f = fakeNet({ ffmpeg: true }), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));
  const host = [], was = US.host.call;
  US.host.call = async (fn, a) => { host.push([fn, a]); return a.paths.map((p, i) => ({ id: 'n' + i, name: path.basename(p) })); };
  try {
    const s = await B.search(job(), { requests: ['aerial of London: dusk'], aim: 4, fresh: true });
    const term = s.results[0].term, picks = s.results[0].clips.map(clip => ({ term, clip }));
    const r = await B.run(job(), { picks, folder: dir });
    const sub = path.join(dir, 'aerial of London dusk');
    assert.deepStrictEqual(fs.readdirSync(sub).sort(), ['Sources and licences.csv', 'aerial of London dusk – Pexels – 857251.mp4', 'aerial of London dusk – Pixabay – 125.mp4', 'aerial of London dusk – Wikimedia Commons – 1.mp4', 'aerial of London dusk – YouTube – vid00000000.mp4']);
    assert.strictEqual(r.summary, '4 clips downloaded');
    assert.strictEqual(host.length, 0, 'the bin toggle is off: nothing added to the project');
    assert.strictEqual(f.asked.find(a => a.download && /pexels/.test(a.download)).download, 'https://videos.pexels.com/857251-hd.mp4', 'HD, not 4K');
    assert.ok(f.asked.some(a => a.convert && /Wikimedia Commons – 1\.webm$/.test(a.convert)), 'WebM made into MP4');
    const yd = f.asked.find(a => a.ytDownload).ytDownload;
    assert.deepStrictEqual([yd.links, yd.folder, yd.toBin, yd.quality], [['https://www.youtube.com/watch?v=vid00000000'], sub, false, 'premiere'], 'YouTube through the Download tab’s engine, never into a bin by itself');
    const list = fs.readFileSync(path.join(sub, 'Sources and licences.csv'), 'utf8').replace(/^﻿/, '').trim().split('\r\n');
    assert.strictEqual(list.length, 5);
    assert.ok(/^File,Title,Source,Page,Author,/.test(list[0]));
    const px = list.find(l => /Pexels – 857251/.test(l));
    assert.ok(/https:\/\/www\.pexels\.com\/video\/aerial-view-of-london-857251\//.test(px) && /Ana Drone/.test(px) && /Pexels licence – free to use/.test(px) && /,Yes,/.test(px) && /aerial of London: dusk/.test(px));
    const cm = list.find(l => /Wikimedia Commons – 1\.mp4/.test(l));
    assert.ok(/Yes – with a credit/.test(cm) && /“Thames from the air” by Andrew & Co \(Wikimedia Commons\), CC BY-SA 4\.0/.test(cm) && /creativecommons\.org\/licenses\/by-sa\/4\.0/.test(cm));
    // again, with the bin switched on: nothing fetched twice, everything in the bin named after the request
    f.asked.length = 0;
    const again = await B.run(job(), { picks, folder: dir, toBin: true });
    assert.ok(!f.asked.some(a => a.download || a.ytDownload), 'files already there are skipped');
    assert.strictEqual(again.summary, '0 clips downloaded · 4 already there · 4 in the bin');
    assert.deepStrictEqual([host[0][0], host[0][1].binPath, host[0][1].paths.length], ['importFiles', 'JMG Ultra Studio/B-roll/aerial of London dusk', 4]);
    assert.strictEqual(fs.readFileSync(path.join(sub, 'Sources and licences.csv'), 'utf8').trim().split('\r\n').length, 5, 'each clip once in the list');
    // the largest size; one that fails is said, the rest go on; none ticked is an error
    const big = await B.run(job(), { picks: [picks[0], { term: 'other', clip: Object.assign({}, picks[1].clip, { files: [{ url: 'https://cdn/fail.mp4', height: 720, ext: 'mp4' }] }) }], folder: path.join(dir, 'big'), size: 'max' });
    assert.strictEqual(f.asked.find(a => a.download && /pexels/.test(a.download)).download, 'https://videos.pexels.com/857251-uhd.mp4');
    assert.deepStrictEqual([big.done.length, big.failed.length, big.failed[0].why], [1, 1, 'It isn’t there any more.']);
    assert.ok(!fs.readdirSync(path.join(dir, 'big', 'other')).some(n => /\.mp4|\.part/.test(n)));
    // the size to download: the best copy up to it; YouTube through the engine's own format choice
    f.asked.length = 0;
    await B.run(job(), { picks: [picks[0], picks[3]], folder: path.join(dir, 's720'), size: '720' });
    assert.strictEqual(f.asked.find(a => a.download).download, 'https://videos.pexels.com/857251-sd.mp4', 'up to 720p: the 360p copy, not the 1080p one');
    assert.deepStrictEqual([f.asked.find(a => a.ytDownload).ytDownload.quality, f.asked.find(a => a.ytDownload).ytDownload.maxHeight], ['premiere', 720]);
    f.asked.length = 0;
    await B.run(job(), { picks: [picks[0], picks[3]], folder: path.join(dir, 's4k'), size: '2160' });
    assert.strictEqual(f.asked.find(a => a.download).download, 'https://videos.pexels.com/857251-uhd.mp4');
    assert.strictEqual(f.asked.find(a => a.ytDownload).ytDownload.quality, 'best');
    const at = (a, k) => a[a.indexOf(k) + 1];
    assert.ok(/height<=720\]/.test(at(US.youtube.argsFor('u', { folder: '/o', maxHeight: 720 }), '-f')) && /height<=1080\]/.test(at(US.youtube.argsFor('u', { folder: '/o' }), '-f')) && at(US.youtube.argsFor('u', { folder: '/o', maxHeight: 720 }), '-S') === 'res:720,vcodec:h264,fps');
    await assert.rejects(B.run(job(), { picks: [], folder: dir }), e => e.code === 'BAD_INPUT');
    // Stop is honoured between clips
    const stopped = job(); stopped.check = () => { throw new US.UserError('CANCELLED'); };
    await assert.rejects(B.run(stopped, { picks, folder: path.join(dir, 'stopped') }), e => e.code === 'CANCELLED');
  } finally { US.host.call = was; f.restore(); }
});

test('Ask: “find b-roll of …” opens the finder with the request – and leaves the B-roll matcher’s sentences alone', () => {
  assert.deepStrictEqual(B.matchAsk('find b-roll of a city at night'), { query: 'a city at night' });
  assert.deepStrictEqual(B.matchAsk('Look for stock footage of hands typing on a laptop.'), { query: 'hands typing on a laptop' });
  assert.deepStrictEqual(B.matchAsk('I need broll for the harbour scene online'), { query: 'the harbour scene' });
  assert.deepStrictEqual(B.matchAsk('find me some b-roll'), { query: '' });
  assert.strictEqual(B.matchAsk('cover the jump cuts with b-roll'), null);
  assert.strictEqual(B.matchAsk('find b-roll in my project for the interview'), null);
  assert.strictEqual(B.matchAsk('cut the silences'), null);
  const a = US.actions.get('brollfinder.find');
  assert.ok(a && a.changes === false && a.tool === 'brollfinder' && a.examples.every(e => a.match(e)));
  assert.ok(US.ADVANCED_TOOLS.includes('brollfinder') && US.tools.get('brollfinder').tour.length >= 3);
});

test('the screen: a search lists the options, one is unticked, Download fetches only the ticked ones – nothing before the button', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'brollfinder-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let out; try { out = JSON.parse(last); } catch (e) { throw new Error('brollfinder-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(out.problems, [], out.problems.join('\n'));
});
