/* JMG Ultra Studio – B-roll finder (Advanced): type what you need (“aerial of London at dusk”), one request per line;
   it looks on Pexels, Pixabay, Wikimedia Commons, YouTube (and, if you tick them, the Internet Archive and NASA) and
   shows the options – thumbnail, a preview that plays straight from the site, length, size, and the licence in plain
   words – each with a tick box. NOTHING is downloaded until you press Download: then the ticked clips go into a
   folder named after the request, with a “Sources and licences.csv” beside them, and (if you switch it on) into a
   bin “JMG Ultra Studio/B-roll/<request>”. YouTube is searched and downloaded with the Download tab's own engine
   (yt-dlp, js/tools/44-youtube.js). What was looked into and why: dev/docs/research-broll-finder.md. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  if (US.addIcon) US.addIcon('brollfinder', 'M3 5h10v10H3z M13 8.5l4-2.5v8l-4-2.5 M6.2 8.2a2 2 0 1 0 2.9 2.9 M9.3 11.3l1.7 1.7');

  /* ---------- pure: requests, names, licences ---------- */
  /** One request per line (bullets and numbers dropped), each once, in order. */
  function parseRequests(text) {
    const out = [], seen = new Set();
    for (let l of String(text || '').split(/\r?\n/)) {
      l = l.replace(/^\s*(?:[-–—*•·]+|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim().replace(/^["“”']+|["“”']+$/g, '');
      if (!l || seen.has(l.toLowerCase())) continue;
      seen.add(l.toLowerCase()); out.push(l.slice(0, 100));
    }
    return out;
  }
  /** A request as a folder (or bin) name: no characters a disk refuses, not too long. */
  function safeName(term) {
    const s = String(term || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60).trim();
    return s || 'B-roll';
  }
  /** “aerial of London at dusk – Pexels – 857251.mp4” */
  function fileName(term, clip, ext) {
    return `${safeName(term)} – ${clip.sourceName} – ${String(clip.id).replace(/[^\w.-]+/g, '_').slice(0, 60)}.${ext || (clip.file && clip.file.ext) || 'mp4'}`;
  }
  /** Licences in plain words. free: may be used in a film, paid work included (perhaps with a credit). */
  const LICENCES = {
    pexels: { name: 'Pexels licence', label: 'Pexels licence – free to use, no credit needed', free: true, link: 'https://www.pexels.com/license/' },
    pixabay: { name: 'Pixabay licence', label: 'Pixabay licence – free to use, no credit needed', free: true, link: 'https://pixabay.com/service/license-summary/' },
    cc0: { name: 'CC0', label: 'CC0 – public domain, free to use', free: true, link: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    pd: { name: 'Public domain', label: 'Public domain – free to use', free: true, link: 'https://creativecommons.org/publicdomain/mark/1.0/' },
    nasa: { name: 'NASA media', label: 'NASA – free to use (not to suggest NASA backs you; check for logos and people)', free: true, link: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
    'cc-by': { name: 'CC BY', label: 'Creative Commons BY – free to use, credit the author', free: true, credit: true },
    'cc-by-sa': { name: 'CC BY-SA', label: 'Creative Commons BY-SA – credit the author, and your film must be shared the same way', free: true, credit: true, careful: true },
    'cc-by-nc': { name: 'CC BY-NC', label: 'Creative Commons BY-NC – not for paid or commercial work', free: false, credit: true },
    'cc-by-nd': { name: 'CC BY-ND', label: 'Creative Commons BY-ND – may not be cut into another film', free: false, credit: true },
    youtube: { name: 'Standard YouTube licence', label: 'YouTube – standard licence: you need permission to use this', free: false, link: 'https://www.youtube.com/t/terms' },
    unknown: { name: 'Not stated', label: 'Licence not stated – you need permission to use this', free: false }
  };
  /** A licence from what a site says: a Creative Commons link, or a short name (“CC BY-SA 4.0”, “Public domain”). */
  function licenceFrom(text, linkHint) {
    const t = String(text || '').trim(), s = (t + ' ' + String(linkHint || '')).toLowerCase();
    let id = 'unknown', m;
    if (/publicdomain\/zero|\bcc0\b|cc-zero/.test(s)) id = 'cc0';
    else if (/publicdomain\/mark|public domain|\bpdm\b|\bpd[- ]|no known copyright|no restrictions/.test(s)) id = 'pd';
    else if ((m = /(?:licenses\/|\bcc[ -])(by(?:-(?:nc|nd|sa))*)/.exec(s))) id = /nd/.test(m[1]) ? 'cc-by-nd' : /nc/.test(m[1]) ? 'cc-by-nc' : /sa/.test(m[1]) ? 'cc-by-sa' : 'cc-by';
    else if (/creative commons attribution/.test(s)) id = /share/.test(s) ? 'cc-by-sa' : /non-?commercial/.test(s) ? 'cc-by-nc' : /no ?deriv/.test(s) ? 'cc-by-nd' : 'cc-by';
    const L = Object.assign({ id }, LICENCES[id]);
    const ver = (/\b([1-4]\.[05])\b/.exec(s) || [])[1];
    if (/^cc-by/.test(id)) {
      const full = (m ? m[1] : id.slice(3)).toUpperCase();
      L.name = 'CC ' + full + (ver ? ' ' + ver : '');
      L.link = /^https?:/i.test(linkHint || '') ? linkHint : /^https?:/i.test(t) ? t : `https://creativecommons.org/licenses/${full.toLowerCase()}/${ver || '4.0'}/`;
    }
    return L;
  }
  const lic = id => Object.assign({ id }, LICENCES[id]);
  const plainText = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const extOf = u => ((/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(u || '').split('?')[0]) || [])[1] || '').toLowerCase();
  const https = u => String(u || '').replace(/^http:/i, 'https:');
  const shortSide = f => Math.min(+f.width || 0, +f.height || 0) || +f.height || 0;
  /** From a clip's files [{url, width, height}]: the one to download (the largest up to maxSide on its short side –
      1080 is “HD”; 0 = the largest there is) and the smallest that's still watchable, for the preview. */
  function pickFiles(files, maxSide = 1080) {
    const fl = (files || []).filter(f => f && f.url).slice().sort((a, b) => shortSide(a) - shortSide(b));
    if (!fl.length) return { file: null, preview: null };
    const fit = maxSide ? fl.filter(f => shortSide(f) <= maxSide) : fl;
    return { file: fit.length ? fit[fit.length - 1] : fl[0], preview: fl.find(f => shortSide(f) >= 240) || fl[0] };
  }

  /* ---------- pure: shape (aspect ratio) and size ---------- */
  const SHAPES = { any: { label: 'Any shape' }, '16:9': { label: '16:9', r: 16 / 9, hint: 'wide' }, '9:16': { label: '9:16', r: 9 / 16, hint: 'upright' }, '1:1': { label: '1:1', r: 1, hint: 'square' }, '4:5': { label: '4:5', r: 4 / 5, hint: 'portrait post' } };
  const NAMED = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:4', 3 / 4], ['3:2', 3 / 2], ['2:3', 2 / 3], ['17:9', 17 / 9], ['21:9', 21 / 9]];
  /** “16:9” for 1920×1080, “1.90:1” for a shape with no everyday name, '' when the size isn't known. */
  function ratioName(w, h) {
    if (!(w > 0 && h > 0)) return '';
    const r = w / h, hit = NAMED.find(n => Math.abs(r / n[1] - 1) < 0.025);
    return hit ? hit[0] : r >= 1 ? r.toFixed(2) + ':1' : '1:' + (1 / r).toFixed(2);
  }
  /** Is a clip the shape asked for? true / false, or null when the site didn't say its width and height.
      A little leeway (8%), so cinema-wide 4K (4096×2160) still counts as 16:9. */
  function shapeFits(clip, shape) {
    const S = SHAPES[shape];
    if (!S || !S.r) return true;
    if (!(clip.width > 0 && clip.height > 0)) return null;
    return Math.abs((clip.width / clip.height) / S.r - 1) <= 0.08;
  }
  /** Is a clip at least minSide on its short side (720, 1080, 2160)? true / false / null (not known). */
  function sizeFits(clip, minSide) {
    if (!(minSide > 0)) return true;
    const side = clip.width > 0 && clip.height > 0 ? Math.min(clip.width, clip.height) : clip.height > 0 ? clip.height : 0;
    return side ? side >= minSide * 0.98 : null;
  }
  const SIZE_NAME = { 720: '720p', 1080: '1080p', 2160: '4K' };
  /** The download-size setting ('720' | '1080' | '2160' | 'max'; 'hd' from the first version) -> the largest short side (0 = any). */
  const sizeSide = v => (v === 'max' ? 0 : v === 'hd' ? 1080 : [720, 1080, 2160].includes(+v) ? +v : 1080);

  /* ---------- pure: each site's answer -> clips ----------
     A clip: {key, source, sourceName, id, title, page, author, authorUrl, thumb, preview (plays in the panel; '' = none),
     previewVia ('ytdlp': ask the downloader for a small stream), duration (s), width, height, licence {id, name, label,
     free, link, credit, careful}, files [{url, width, height, ext}] (direct downloads) or via: 'ytdlp'} */
  const clipOf = (source, o) => Object.assign({ key: source + ':' + o.id, source, sourceName: SOURCE_NAME[source], title: '', page: '', author: '', authorUrl: '', thumb: '', preview: '', duration: 0, width: 0, height: 0, files: [] }, o);
  const SOURCE_NAME = { pexels: 'Pexels', pixabay: 'Pixabay', commons: 'Wikimedia Commons', youtube: 'YouTube', archive: 'Internet Archive', nasa: 'NASA' };

  function parsePexels(j) {
    return ((j && j.videos) || []).map(v => {
      const files = (v.video_files || []).filter(f => f.link && /mp4/i.test(f.file_type || 'mp4') && f.quality !== 'hls').map(f => ({ url: f.link, width: f.width, height: f.height, ext: 'mp4' }));
      const p = pickFiles(files);
      const slug = (/\/video\/(.+?)-\d+\/?$/.exec(v.url || '') || [])[1];
      return clipOf('pexels', { id: v.id, title: slug ? slug.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Pexels video ' + v.id, page: v.url, author: (v.user && v.user.name) || '', authorUrl: (v.user && v.user.url) || '',
        thumb: v.image || '', preview: p.preview ? p.preview.url : '', duration: +v.duration || 0, width: +v.width || 0, height: +v.height || 0, licence: lic('pexels'), files });
    }).filter(c => c.files.length);
  }
  function parsePixabay(j) {
    return ((j && j.hits) || []).map(v => {
      const sizes = Object.values(v.videos || {}).filter(f => f && f.url), files = sizes.map(f => ({ url: f.url, width: f.width, height: f.height, ext: extOf(f.url) || 'mp4' }));
      const p = pickFiles(files), big = sizes.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0] || {};
      const thumb = (sizes.find(f => f.thumbnail && shortSide(f) >= 360 && shortSide(f) <= 720) || sizes.find(f => f.thumbnail) || {}).thumbnail || '';
      return clipOf('pixabay', { id: v.id, title: plainText(v.tags || '').replace(/^./, c => c.toUpperCase()) || 'Pixabay video ' + v.id, page: v.pageURL, author: v.user || '', authorUrl: v.user && v.user_id ? `https://pixabay.com/users/${encodeURIComponent(v.user)}-${v.user_id}/` : '',
        thumb, preview: p.preview ? p.preview.url : '', duration: +v.duration || 0, width: +big.width || 0, height: +big.height || 0, licence: lic('pixabay'), files });
    }).filter(c => c.files.length);
  }
  function parseCommons(j) {
    const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    return pages.map(p => {
      const v = (p.videoinfo || p.imageinfo || [])[0]; if (!v || !v.url) return null;
      const m = v.extmetadata || {}, val = k => (m[k] && m[k].value) || '';
      const clean = u => String(u || '').replace(/[?&]utm_[^#]*$/, '');
      const files = (v.derivatives || []).filter(d => d.src && /webm/i.test(d.type || d.src) && d.height).map(d => ({ url: clean(d.src), width: d.width, height: d.height, ext: 'webm' }));
      const orig = { url: clean(v.url), width: v.width, height: v.height, ext: extOf(v.url) || 'webm' };
      // the original when it's small or the only one; else Commons' own smaller copies (an original can be gigabytes)
      if (!files.length || (+v.size > 0 && +v.size < 150e6)) files.push(orig);
      const p2 = pickFiles(files);
      const L = licenceFrom(val('LicenseShortName') || val('UsageTerms'), val('LicenseUrl'));
      return clipOf('commons', { id: p.pageid, title: String(p.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]{3,4}$/i, '').replace(/_/g, ' '), page: clean(v.descriptionurl), author: plainText(val('Artist')) || plainText(val('Credit')), thumb: clean(v.thumburl),
        preview: p2.preview ? p2.preview.url : '', duration: +v.duration || 0, width: +v.width || 0, height: +v.height || 0, licence: L, files });
    }).filter(Boolean);
  }
  /** yt-dlp's search (--flat-playlist -J). cc: the search was YouTube's own “Creative Commons” filter. */
  function parseYouTube(j, cc) {
    return ((j && j.entries) || []).filter(e => e && e.id && (e.ie_key || 'Youtube') === 'Youtube' && !/^(UC|PL)/.test(e.id) && e.live_status !== 'is_live').map(e => {
      const L = cc ? Object.assign(lic('cc-by'), { name: 'CC BY (YouTube)', label: 'Creative Commons BY (says the uploader on YouTube) – free to use, credit the channel', link: 'https://support.google.com/youtube/answer/2797468' }) : lic('youtube');
      return clipOf('youtube', { id: e.id, title: e.title || 'YouTube video', page: 'https://www.youtube.com/watch?v=' + e.id, author: e.channel || e.uploader || '', authorUrl: e.channel_url || e.uploader_url || '',
        thumb: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`, previewVia: 'ytdlp', duration: +e.duration || 0, licence: L, via: 'ytdlp' });
    });
  }
  const secondsOf = t => { const s = String(t || ''); if (/^\d+(\.\d+)?$/.test(s)) return +s; const p = s.split(':').map(Number); return p.some(isNaN) ? 0 : p.reduce((a, b) => a * 60 + b, 0); };
  /** The Internet Archive: one found item and its list of files -> a clip (null when it has no H.264 MP4). */
  function archiveClip(doc, files) {
    const mp4 = (files || []).filter(f => /\.mp4$/i.test(f.name || '') && !/_512kb|\.ia\./i.test(f.name)).map(f => ({ url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`, width: +f.width || 0, height: +f.height || 0, ext: 'mp4', length: secondsOf(f.length) }));
    if (!mp4.length) return null;
    const p = pickFiles(mp4), one = x => (Array.isArray(x) ? x[0] : x) || '';
    return clipOf('archive', { id: doc.identifier, title: one(doc.title) || doc.identifier, page: 'https://archive.org/details/' + encodeURIComponent(doc.identifier), author: /^https?:/.test(one(doc.creator)) ? '' : one(doc.creator), authorUrl: /^https?:/.test(one(doc.creator)) ? one(doc.creator) : '',
      thumb: 'https://archive.org/services/img/' + encodeURIComponent(doc.identifier), preview: p.preview.url, duration: p.file.length || 0, width: p.file.width, height: p.file.height, licence: licenceFrom(one(doc.licenseurl)), files: mp4 });
  }
  /** NASA's library: one found item and its list of files -> a clip (null when it has no MP4). */
  function nasaClip(item, asset) {
    const d = (item.data || [])[0] || {}, hrefs = (((asset || {}).collection || {}).items || []).map(i => https(i.href)).filter(u => /\.mp4$/i.test(u));
    if (!d.nasa_id || !hrefs.length) return null;
    const side = u => (/~orig\./.test(u) ? 2160 : /~large\./.test(u) ? 1080 : /~medium\./.test(u) ? 720 : /~small\./.test(u) ? 480 : /~mobile\./.test(u) ? 360 : /~preview\./.test(u) ? 240 : 1080);
    const files = hrefs.map(u => ({ url: encodeURI(decodeURI(u)), width: 0, height: side(u), ext: 'mp4' })), p = pickFiles(files);
    const thumb = ((item.links || []).find(l => l.render === 'image' && /preview|thumb|small/i.test(l.rel + l.href)) || (item.links || []).find(l => l.render === 'image') || {}).href || '';
    return clipOf('nasa', { id: d.nasa_id, title: d.title || d.nasa_id, page: 'https://images.nasa.gov/details/' + encodeURIComponent(d.nasa_id), author: ['NASA', d.center].filter(Boolean).join(' / '), thumb: https(thumb), preview: p.preview.url, height: p.file.height === 2160 ? 0 : p.file.height, licence: lic('nasa'), files });
  }

  /* ---------- the internet (tests and the e2e test put a pretend one here) ---------- */
  // every request says what it is: the app's name and version (Wikimedia's User-Agent policy asks for that) – never a browser's
  const UA = `JMG-Ultra-Studio/${US.version || '1'} (B-roll finder; desktop video-editing panel)`;
  const net = {
    key: name => (US.secrets ? US.secrets.get(name) : ''),
    /** GET a JSON answer. Rejects with {status} for an answer that isn't 200. */
    json(url, { headers = {}, hops = 0 } = {}) {
      return new Promise((resolve, reject) => {
        const req = require('https').get(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, headers) }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); resolve(net.json(new URL(res.headers.location, url).toString(), { headers, hops: hops + 1 })); return; }
          let d = ''; res.setEncoding('utf8'); res.on('data', c => { d += c; });
          res.on('end', () => {
            if (res.statusCode !== 200) { reject(Object.assign(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`), { status: res.statusCode })); return; }
            try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Not JSON: ' + d.slice(0, 200))); }
          });
          res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(25000, () => req.destroy(new Error('timed out')));
      });
    },
    /** Download url to file (through file + '.part'), progress(0..1); honours Stop. */
    download(url, file, progress, job, hops = 0) {
      return new Promise((resolve, reject) => {
        const req = require(url.startsWith('http:') ? 'http' : 'https').get(url, { headers: { 'User-Agent': UA } }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 8) { res.resume(); resolve(net.download(new URL(res.headers.location, url).toString(), file, progress, job, hops + 1)); return; }
          if (res.statusCode !== 200) { res.resume(); reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })); return; }
          const total = +res.headers['content-length'] || 0, part = file + '.part', out = fs.createWriteStream(part);
          let got = 0;
          res.on('data', d => { got += d.length; if (total && progress) progress(got / total); if (job && job.cancelled) req.destroy(new Error('cancelled')); });
          res.pipe(out);
          const fail = e => { out.destroy(); try { fs.rmSync(part, { force: true }); } catch (e2) { /* leave it */ } reject(e); };
          out.on('finish', () => out.close(() => { try { fs.renameSync(part, file); resolve(file); } catch (e) { fail(e); } }));
          res.on('error', fail); out.on('error', fail);
        });
        req.on('error', e => { try { fs.rmSync(file + '.part', { force: true }); } catch (e2) { /* none */ } reject(job && job.cancelled ? new US.UserError('CANCELLED') : e); });
        req.setTimeout(60000, () => req.destroy(new Error('timed out')));
      });
    },
    /** The Download tab's yt-dlp and ffmpeg, where they are ('' when not set up). */
    tools: () => (US.youtube && US.youtube.tools ? US.youtube.tools() : { ytdlp: '', ffmpeg: '' }),
    /** Run yt-dlp (only to ask: a search, or a stream's address – never a download) -> what it printed. */
    ytdlp(args, { timeout = 60000 } = {}) {
      const exe = net.tools().ytdlp;
      if (!exe) return Promise.reject(Object.assign(new Error('yt-dlp is not set up'), { noTool: true }));
      return new Promise((resolve, reject) => cp.execFile(exe, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().split(/\r?\n/).pop())) : resolve(out))));
    },
    /** Download YouTube links with the Download tab's engine -> its result {done: [{url, files}], failed: [{url, why}]} */
    ytDownload(job, o) {
      if (!US.youtube || !US.youtube.run) throw new US.UserError('NOT_FOUND', { title: 'The downloader isn’t there.', action: 'Update Ultra Studio.' });
      return US.youtube.run(job, o);
    },
    /** Turn a WebM/Ogg file into an H.264 MP4 Premiere opens (needs the Download tab's ffmpeg) -> the MP4, or '' */
    convert(file, out, job) {
      const ff = net.tools().ffmpeg;
      if (!ff) return Promise.resolve('');
      return new Promise(resolve => {
        const p = cp.spawn(ff, ['-y', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out + '.part.mp4'], { windowsHide: true });
        const kill = setInterval(() => { if (job && job.cancelled) { try { p.kill(); } catch (e) { /* gone */ } } }, 300);
        p.on('error', () => { clearInterval(kill); resolve(''); });
        p.on('close', code => { clearInterval(kill); try { if (code === 0 && !(job && job.cancelled)) { fs.renameSync(out + '.part.mp4', out); resolve(out); return; } fs.rmSync(out + '.part.mp4', { force: true }); } catch (e) { /* fall through */ } resolve(''); });
      });
    }
  };

  /* ---------- the places it looks ---------- */
  const q = encodeURIComponent;
  const SOURCES = [
    { id: 'pexels', name: 'Pexels', on: true, secret: 'pexelsKey', keyUrl: 'https://www.pexels.com/api/', site: 'https://www.pexels.com', about: 'Stock footage, free to use. Needs a free key.',
      // Pexels' own filters: orientation (landscape, portrait, square) and size = the least it may be (small HD, medium Full HD, large 4K)
      async search(term, n, c) {
        const o = { '16:9': 'landscape', '9:16': 'portrait', '4:5': 'portrait', '1:1': 'square' }[c.shape], z = { 720: 'small', 1080: 'medium', 2160: 'large' }[c.minSide];
        return parsePexels(await c.net.json(`https://api.pexels.com/v1/videos/search?query=${q(term)}&per_page=${Math.min(80, n)}${o ? '&orientation=' + o : ''}${z ? '&size=' + z : ''}`, { headers: { Authorization: c.key } }));
      } },
    { id: 'pixabay', name: 'Pixabay', on: true, secret: 'pixabayKey', keyUrl: 'https://pixabay.com/api/docs/', site: 'https://pixabay.com', about: 'Stock footage, free to use. Needs a free key.',
      // Pixabay's own filters: the least width and height (it has none for shape – that's sorted here from each video's size)
      async search(term, n, c) {
        const r = (SHAPES[c.shape] || {}).r || 16 / 9, m = c.minSide || 0;
        const mw = m ? Math.round(r >= 1 ? m * r : m) : 0, mh = m ? Math.round(r >= 1 ? m : m / r) : 0;
        return parsePixabay(await c.net.json(`https://pixabay.com/api/videos/?key=${q(c.key)}&q=${q(term.slice(0, 100))}&per_page=${Math.max(3, Math.min(200, c.shape && c.shape !== 'any' ? n * 3 : n))}&safesearch=true${mw ? `&min_width=${Math.floor(mw * 0.98)}&min_height=${Math.floor(mh * 0.98)}` : ''}`));
      } },
    { id: 'commons', name: 'Wikimedia Commons', on: true, more: true, site: 'https://commons.wikimedia.org', about: 'Free-licensed video (often needs a credit). No key.',
      async search(term, n, c) { return parseCommons(await c.net.json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q('filetype:video ' + term)}&gsrnamespace=6&gsrlimit=${Math.min(50, c.filtered ? n * 2 : n)}&prop=videoinfo&viprop=${q('url|size|mime|extmetadata|derivatives')}&viurlwidth=480`)); } },
    { id: 'youtube', name: 'YouTube', on: true, site: 'https://www.youtube.com', about: 'Only videos marked Creative Commons count as free to use. Uses the Download tab’s downloader.',
      async search(term, n, c) {
        const ask = async (url, cc) => parseYouTube(JSON.parse(await c.net.ytdlp(['--flat-playlist', '-J', '--no-warnings', '--playlist-end', String(n), '--', url])), cc);
        // YouTube's own “Creative Commons” filter (sp=EgIwAQ==); the rest only when footage that needs permission is wanted too
        const cc = await ask(`https://www.youtube.com/results?search_query=${q(term)}&sp=EgIwAQ%253D%253D`, true);
        if (c.freeOnly) return cc;
        const all = await ask(`ytsearch${n}:${term}`, false), has = new Set(cc.map(x => x.id));
        return cc.concat(all.filter(x => !has.has(x.id)));
      } },
    { id: 'archive', name: 'Internet Archive', on: false, site: 'https://archive.org', about: 'Old films, newsreels and public-domain footage. Slower; quality varies. No key.',
      async search(term, n, c) {
        const k = Math.min(n, 8);
        const j = await c.net.json(`https://archive.org/advancedsearch.php?q=${q(`(${term}) AND mediatype:movies` + (c.freeOnly ? ' AND licenseurl:*' : ''))}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=licenseurl&fl%5B%5D=creator&rows=${k}&output=json`);
        const docs = ((j.response || {}).docs || []).slice(0, k);
        const got = await Promise.all(docs.map(d => c.net.json(`https://archive.org/metadata/${q(d.identifier)}/files`).then(f => archiveClip(d, f.result || []), () => null)));
        return got.filter(Boolean);
      } },
    { id: 'nasa', name: 'NASA', on: false, site: 'https://images.nasa.gov', about: 'Space, Earth from orbit, rockets, science. Free to use. No key.',
      async search(term, n, c) {
        const k = Math.min(n, 8);
        const j = await c.net.json(`https://images-api.nasa.gov/search?q=${q(term)}&media_type=video&page_size=${k}`);
        const items = (((j.collection || {}).items) || []).slice(0, k);
        const got = await Promise.all(items.map(it => c.net.json(`https://images-api.nasa.gov/asset/${q(((it.data || [])[0] || {}).nasa_id || '')}`).then(a => nasaClip(it, a), () => null)));
        return got.filter(Boolean);
      } }
  ];
  const sourceOf = id => SOURCES.find(s => s.id === id);
  /** Why a place can't be searched right now ('' = it can). */
  function sourceBlocked(s) {
    if (s.secret && !net.key(s.secret)) return `${s.name}: add its free key to search it (Where to look).`;
    if (s.id === 'youtube' && !net.tools().ytdlp) return 'YouTube: set up the downloader in the Download tab to search it.';
    return '';
  }
  /** A site's failure in plain words. */
  function plainFail(s, e) {
    const st = e && e.status, t = String((e && e.message) || e || '');
    if (st === 401 || st === 403 || (s.id === 'pixabay' && st === 400 && /key/i.test(t))) return `${s.name} didn’t accept the key – check it in Where to look.`;
    if (st === 429) return `${s.name} says too many searches – try again in a while.`;
    if (/getaddrinfo|ENOTFOUND|ECONN|EAI_AGAIN/.test(t) || /timed out|network is/i.test(t)) return `${s.name} didn’t answer – check the internet connection.`;
    if (s.id === 'youtube') return 'YouTube’s search didn’t work – press “Update the downloader” in the Download tab, then try again.';
    return `${s.name} couldn’t be searched just now.`;
  }
  /** Take turns between the places, best first, until there are n (each clip once). lists: [[clips of one place], …] */
  function pick(lists, n) {
    const out = [], seen = new Set(), at = lists.map(() => 0);
    for (let more = true; more && out.length < n;) {
      more = false;
      for (let i = 0; i < lists.length && out.length < n; i++) {
        while (at[i] < lists[i].length && seen.has(lists[i][at[i]].key)) at[i]++;
        if (at[i] < lists[i].length) { const c = lists[i][at[i]++]; seen.add(c.key); out.push(c); more = true; }
      }
    }
    return out;
  }

  /* searches are kept for a day (Pixabay asks for that; it also saves the free allowances) */
  const DAY = 24 * 3600 * 1000;
  const cacheKey = (sid, term, n, freeOnly, shape, minSide) => US.fsx.hash([sid, term.toLowerCase(), n, freeOnly ? 1 : 0, shape || 'any', minSide || 0].join('|'));
  function cacheGet(key) { try { const c = US.cache.get('brollfinder', key); return c && Date.now() - c.at < DAY ? c.clips : null; } catch (e) { return null; } }
  function cachePut(key, clips) { try { US.cache.set('brollfinder', key, { at: Date.now(), clips }); } catch (e) { /* not kept */ } }

  const DEFAULTS = { aim: 8, freeOnly: true, sources: {}, folder: '', toBin: false, size: '1080', maxLen: 600, ai: false, shape: 'any', minSide: 0 };
  const opts = () => Object.assign({}, DEFAULTS, US.settings.get('brollfinder', {}));
  const sourceOn = (o, s) => (o.sources && o.sources[s.id] != null ? !!o.sources[s.id] : s.on);

  /**
   * Look for each request. o: {requests: [text], aim, freeOnly, sources: {id: bool}, maxLen (s; 0 = any), shape ('any' |
   * '16:9' | '9:16' | '1:1' | '4:5'), minSide (0 | 720 | 1080 | 2160: the least it may be on its short side), phrases:
   * {request: [search words]}, fresh (don't use the day's kept searches)}. A site that can filter by shape or size is
   * asked to; the rest are sorted here by each video's width and height – and where a site doesn't say them (YouTube's
   * search), its videos are shown anyway and a note says so.
   * -> {results: [{term, clips (aim of them, places taking turns), pool (every clip found), notes: [plain lines]}], summary}
   */
  async function search(job, o) {
    o = Object.assign({}, DEFAULTS, o);
    const requests = Array.isArray(o.requests) ? o.requests : parseRequests(o.requests);
    if (!requests.length) throw new US.UserError('BAD_INPUT', { title: 'Nothing to look for yet.', action: 'Type what you need – one request per line, like “aerial of London at dusk”.' });
    const aim = Math.max(1, Math.min(40, Math.round(+o.aim || DEFAULTS.aim)));
    const wanted = SOURCES.filter(s => sourceOn(o, s)), blocked = wanted.map(s => sourceBlocked(s)).filter(Boolean), usable = wanted.filter(s => !sourceBlocked(s));
    if (!usable.length) throw new US.UserError('BAD_INPUT', { title: wanted.length ? 'None of the places can be searched yet.' : 'No place to look is switched on.', action: wanted.length ? blocked.join(' ') : 'Open “Where to look” and switch one on.' });
    const shape = SHAPES[o.shape] ? o.shape : 'any', minSide = [720, 1080, 2160].includes(+o.minSide) ? +o.minSide : 0, filtered = shape !== 'any' || minSide > 0;
    const per = Math.max(6, Math.min(30, aim * 2)), results = [];
    for (let i = 0; i < requests.length; i++) {
      job.check();
      const term = requests[i], words = ((o.phrases && o.phrases[term]) || []).filter(Boolean).slice(0, 3);
      const asks = words.length ? words : [term];
      job.set({ who: 'computer', msg: `Looking for “${term}”` });
      job.progress(i / requests.length, `${usable.map(s => s.name).join(', ')} · request ${i + 1} of ${requests.length}`);
      const notes = blocked.slice();
      const lists = await Promise.all(usable.map(async s => {
        const found = [];
        for (const w of asks) {
          const key = cacheKey(s.id, w, per, o.freeOnly, shape, minSide);
          let clips = o.fresh ? null : cacheGet(key);
          if (!clips) {
            try { clips = await s.search(w, per, { net, key: s.secret ? net.key(s.secret) : '', freeOnly: !!o.freeOnly, shape, minSide, filtered }); cachePut(key, clips); }
            catch (e) { if (e && e.code === 'CANCELLED') throw e; notes.push(plainFail(s, e)); US.log && US.log('warn', `B-roll finder: ${s.name} search failed`, String((e && e.message) || e).replace(/key=[^&\s]+/g, 'key=…'), 'brollfinder'); clips = []; }
          }
          found.push(clips);
        }
        let all = pick(found, 999);
        const before = all.length;
        if (o.freeOnly) all = all.filter(c => c.licence && c.licence.free);
        if (o.maxLen > 0) all = all.filter(c => !c.duration || c.duration <= o.maxLen);
        if (before && !all.length) notes.push(`${s.name}: found ${US.plural(before, 'video')}, but none ${o.freeOnly ? 'free to use' : 'short enough'}${o.freeOnly && o.maxLen > 0 ? ' and short enough' : ''}.`);
        if (filtered && all.length) {
          // the shape and size asked for: kept when it fits, left out when it doesn't, and kept with a plain note when the site doesn't say
          const had = all.length, want = [shape !== 'any' ? shape : '', minSide ? `at least ${SIZE_NAME[minSide]}` : ''].filter(Boolean).join(', ');
          let unknown = 0;
          all = all.filter(c => { const a = shapeFits(c, shape), b = sizeFits(c, minSide); if (a === false || b === false) return false; if (a === null || b === null) { unknown++; c.unsure = true; } return true; });
          if (!all.length) notes.push(`${s.name}: found ${US.plural(had, 'video')}, but none ${want}.`);
          else if (unknown) notes.push(s.id === 'youtube' ? `YouTube’s search doesn’t say a video’s shape or size, so it can’t keep to “${want}”: its videos are shown anyway – check the preview. The download takes the best picture up to the size you choose.` : `${s.name} doesn’t say the shape or size of ${unknown === all.length ? 'its videos' : US.plural(unknown, 'video')}, so ${unknown === 1 && all.length > 1 ? 'it is' : 'they are'} shown anyway (“${want}” can’t be checked) – look at the preview.`);
        }
        return all;
      }));
      const pool = pick(lists, 999);
      results.push({ term, clips: pool.slice(0, aim), pool, notes: Array.from(new Set(notes)), asked: asks });
    }
    const total = results.reduce((n, r) => n + r.clips.length, 0);
    return { results, summary: `${US.plural(total, 'option')} for ${US.plural(requests.length, 'request')} – nothing downloaded yet` };
  }

  /** With AI (text only – the requests themselves): 2–3 short search phrases per request, as stock sites like them. */
  async function improve(requests) {
    const r = await US.ai.json({ feature: 'B-roll finder: search words', fast: true, maxTokens: 800,
      system: 'You help a video editor search stock-footage sites (Pexels, Pixabay, YouTube). For each request give 2 or 3 short search phrases (2–5 plain words each, no punctuation) that would find that footage: the first close to the request, the others useful alternatives a stock library would use. Keep the language of the request.',
      user: requests.map((t, i) => `${i + 1}. ${t}`).join('\n'),
      schema: { type: 'object', additionalProperties: false, required: ['requests'], properties: { requests: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'phrases'], properties: { n: { type: 'integer' }, phrases: { type: 'array', items: { type: 'string' } } } } } } } });
    const out = {};
    for (const x of (r && r.requests) || []) { const t = requests[x.n - 1]; if (t) out[t] = (x.phrases || []).map(p => String(p).replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 3); }
    return out;
  }

  /* ---------- the list kept beside the clips ---------- */
  const LIST_NAME = 'Sources and licences.csv';
  const LIST_HEAD = ['File', 'Title', 'Source', 'Page', 'Author', 'Author’s page', 'Licence', 'Licence link', 'Free to use', 'Credit line', 'Search', 'Downloaded'];
  const csv = v => (/[",\r\n]/.test(String(v == null ? '' : v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v == null ? '' : v));
  const creditLine = c => (c.licence && c.licence.credit ? `“${c.title}”${c.author ? ' by ' + c.author : ''} (${c.sourceName}), ${c.licence.name} – ${c.page}` : c.author ? `${c.author} / ${c.sourceName}` : c.sourceName);
  function listRow(file, term, c, when) {
    const L = c.licence || lic('unknown');
    return [path.basename(file), c.title, c.sourceName, c.page, c.author, c.authorUrl, L.label, L.link || '', L.free ? (L.credit ? 'Yes – with a credit' : 'Yes') : 'No – ask permission', creditLine(c), term, when].map(csv).join(',');
  }
  /** Add (or replace) a clip's line in the folder's list. */
  function noteSource(dir, file, term, c, when = new Date().toISOString().slice(0, 10)) {
    const f = path.join(dir, LIST_NAME), name = csv(path.basename(file));
    let lines = [];
    try { lines = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1); } catch (e) { /* a new list */ }
    lines = lines.filter(l => !l.startsWith(name + ','));
    lines.push(listRow(file, term, c, when));
    // with a byte-order mark: it's a spreadsheet for Excel and Numbers, which read the dashes and accents wrongly without one
    fs.writeFileSync(f, '﻿' + [LIST_HEAD.map(csv).join(',')].concat(lines).join('\r\n') + '\r\n');
    return f;
  }

  /* ---------- downloading (only ever from the Download button) ---------- */
  const projectDir = () => {
    const pr = US.ctx && US.ctx.project && US.ctx.project.path;
    if (pr) return path.dirname(pr);
    const k = US.projectFolder && US.projectFolder.known && US.projectFolder.known();
    return k && k.path ? path.dirname(k.path) : '';
  };
  /** The project's “JMG Ultra Studio” folder + “B-roll” (in Documents when no project is open). */
  const defaultFolder = () => { const d = projectDir(); return d ? path.join(d, 'JMG Ultra Studio', 'B-roll') : path.join(US.fsx.exportsDir(), 'B-roll'); };
  const BIN_ROOT = 'JMG Ultra Studio/B-roll';
  const binPath = term => BIN_ROOT + '/' + safeName(term);
  /** A clip's file if it's already in the folder (whatever the extension), else ''. */
  function already(dir, term, clip) {
    const stem = fileName(term, clip, 'x').slice(0, -1);
    try { const f = fs.readdirSync(dir).find(n => n.startsWith(stem) && !/\.part(\.mp4)?$/.test(n) && fs.statSync(path.join(dir, n)).size > 0); return f ? path.join(dir, f) : ''; } catch (e) { return ''; }
  }
  /**
   * Download the chosen clips. o: {picks: [{term, clip}], folder, toBin, size ('720' | '1080' | '2160': the best copy
   * the site has up to that size on its short side; 'max': the largest there is)}
   * -> {summary, done: [{term, clip, file, was (already there)}], failed: [{term, clip, why}], folders: [paths], imported}
   */
  async function run(job, o) {
    const picks = (o.picks || []).filter(p => p && p.clip);
    if (!picks.length) throw new US.UserError('BAD_INPUT', { title: 'No clips are ticked.', action: 'Tick the ones you want, then press Download.' });
    const root = US.fsx.ensureDir(o.folder || defaultFolder()), maxSide = sizeSide(o.size);
    const done = [], failed = [], folders = new Set();
    for (let i = 0; i < picks.length; i++) {
      job.check();
      const { term, clip } = picks[i], dir = US.fsx.ensureDir(path.join(root, safeName(term)));
      folders.add(dir);
      const at = i / picks.length, part = 1 / picks.length, label = `${clip.title || clip.id} · ${clip.sourceName}`;
      job.set({ who: 'computer', msg: `Downloading ${i + 1} of ${picks.length}` });
      job.progress(at, label);
      const had = already(dir, term, clip);
      if (had) { noteSource(dir, had, term, clip); done.push({ term, clip, file: had, was: true }); continue; }
      try {
        let file = '';
        if (clip.via === 'ytdlp') {
          const y = US.settings.get('youtube', {}) || {};
          const sub = { check: () => job.check(), set: () => {}, progress: (f, t) => job.progress(at + part * Math.min(1, f), t || label), get cancelled() { return job.cancelled; } };
          const r = await net.ytDownload(sub, { links: [clip.page], folder: dir, toBin: false, quality: maxSide === 0 || maxSide > 1080 ? 'best' : 'premiere', maxHeight: maxSide || undefined, playlist: false, signIn: y.signIn || 'off', browser: y.browser, cookies: y.cookies });
          job.check();
          const got = r && r.done && r.done[0] && r.done[0].files && r.done[0].files[0];
          if (!got) throw new Error((r && r.failed && r.failed[0] && r.failed[0].why) || 'Nothing was downloaded.');
          file = path.join(dir, fileName(term, clip, extOf(got) || 'mp4'));
          fs.renameSync(got, file);
        } else {
          const f = pickFiles(clip.files, maxSide).file;
          if (!f) throw new Error('No file to download.');
          file = path.join(dir, fileName(term, clip, f.ext || extOf(f.url) || 'mp4'));
          await net.download(f.url, file, x => job.progress(at + part * 0.9 * x, `${label} – ${Math.round(x * 100)}%`), job);
          job.check();
          // Premiere doesn't open WebM or Ogg: made into H.264 MP4 when the Download tab's ffmpeg is there
          if (/\.(webm|ogv|ogg)$/i.test(file)) {
            job.set({ who: 'computer', msg: `Making “${clip.title}” into an MP4` });
            const mp4 = await net.convert(file, file.replace(/\.[a-z0-9]+$/i, '.mp4'), job);
            job.check();
            if (mp4) { fs.rmSync(file, { force: true }); file = mp4; }
          }
        }
        noteSource(dir, file, term, clip);
        done.push({ term, clip, file, was: false });
      } catch (e) {
        if ((e && e.code === 'CANCELLED') || job.cancelled) throw e;
        const st = e && e.status;
        failed.push({ term, clip, why: e instanceof US.UserError ? (e.title || e.message) : st === 404 || st === 410 ? 'It isn’t there any more.' : st === 429 ? `${clip.sourceName} says too many downloads just now – try again in a few minutes, or open its page and download it there.` : st === 401 || st === 403 ? `${clip.sourceName} wouldn’t hand it over – open its page and download it there.` : /getaddrinfo|ENOTFOUND|ECONN|EAI_AGAIN|timed out/.test(String(e && e.message)) ? 'No internet connection, or the site didn’t answer.' : String((e && e.message) || e).slice(0, 160) });
      }
    }
    let imported = 0;
    if (o.toBin && done.length) {
      const byTerm = new Map();
      for (const d of done) { if (!byTerm.has(d.term)) byTerm.set(d.term, []); byTerm.get(d.term).push(d.file); }
      let n = 0;
      for (const [term, paths] of byTerm) {
        job.check();
        job.set({ who: US.app.is('resolve') ? 'resolve' : 'premiere', msg: `Adding “${term}” to the bin` });
        job.progress(0.97 + 0.03 * (n++ / byTerm.size), binPath(term).split('/').join(' › '));
        try { imported += ((await US.host.call('importFiles', { paths, binPath: binPath(term) })) || []).length; }
        catch (e) { failed.push({ term, clip: null, why: `Downloaded, but not added to the bin: ${(e && (e.title || e.message)) || e}` }); }
      }
    }
    const fresh = done.filter(d => !d.was).length, was = done.length - fresh;
    const needAsk = done.filter(d => !(d.clip.licence && d.clip.licence.free)).length;
    US.log && US.log(failed.length ? 'warn' : 'ok', `B-roll finder: ${US.plural(fresh, 'clip')} downloaded to ${root}`, failed.map(f => `${f.clip ? f.clip.title : f.term}: ${f.why}`).join(' · '), 'brollfinder');
    if (!done.length && failed.length) throw new US.UserError('NOT_FOUND', { title: failed.length === 1 ? `Couldn’t download it: ${failed[0].why}` : `None of the ${failed.length} downloaded.`, action: 'Check the internet connection and try again.', detail: failed.map(f => `${f.clip ? f.clip.page : f.term}: ${f.why}`).join('\n') });
    return { summary: `${US.plural(fresh, 'clip')} downloaded${was ? ` · ${was} already there` : ''}${o.toBin ? ` · ${imported} in the bin` : ''}${failed.length ? ` · ${failed.length} didn’t download` : ''}${needAsk ? ` · ${needAsk} need${needAsk === 1 ? 's' : ''} permission to use` : ''}`, done, failed, folders: Array.from(folders), root, imported };
  }

  /* ---------- the tab ---------- */
  const fmtLen = s => (s > 0 ? US.fmtDur(Math.round(s)) : '');
  const fmtSize = c => (c.width && c.height ? `${c.width}×${c.height} · ${ratioName(c.width, c.height)}` : c.height ? `${c.height}p` : 'size not said');
  let fill = null;   // set by the open tab: put a request in the box (Ask uses it)

  US.tools.register({
    id: 'brollfinder', name: 'B-roll finder', short: 'B-roll finder', icon: 'brollfinder', group: 'selects', order: 47,
    blurb: 'Type what you need; it finds free stock footage online, shows you the options, and downloads only the ones you tick.',
    hostFns: ['importFiles'],
    tour: [
      { target: '[data-bf="query"]', title: 'Say what you need', text: 'One request per line – “aerial of London at dusk”, “hands typing on a laptop”. Each gets its own set of options.' },
      { target: '[data-bf="where"]', title: 'Where to look', text: 'Pexels and Pixabay need a free key each (pasted here, once). Wikimedia Commons needs none; YouTube uses the Download tab’s downloader.', tip: '“Only free-to-use footage” is on to start with: everything shown may be used in your film, some with a credit.' },
      { target: 'text:Find B-roll', title: 'Look first', text: 'Shows the options with a preview that plays from the site and the licence in plain words. Nothing is downloaded yet – untick the ones you don’t want.' },
      { target: '[data-bf="download"]', title: 'Then download', text: 'Only the ticked clips, into a folder named after each request, with a list of sources and licences beside them – and into a bin if you switch that on.' }
    ],
    create() {
      const v = ui.toolView({ icon: 'brollfinder', title: 'B-roll finder', blurb: 'Type what you need. It looks on Pexels, Pixabay, Wikimedia Commons and YouTube, and shows the options with previews and licences. Nothing is downloaded until you tick the ones you want and press Download.' });
      let o = opts(), found = [], ticked = new Set(), got = new Map();   // got: clip key -> file, once downloaded
      const save = () => US.settings.set('brollfinder', o);
      const ident = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
      // the folder is remembered for each project (on this computer); without a project, as a setting
      const folderGet = () => { const id = ident(); return (id && US.projectStore ? US.projectStore(id).get('_brollFinderFolder', '') : o.folder) || ''; };
      const folderSet = f => { const id = ident(); if (id && US.projectStore) US.projectStore(id).set('_brollFinderFolder', f); else { o.folder = f; save(); } };
      const folder = () => folderGet() || defaultFolder();

      /* what to look for */
      const query = h('textarea.input', { rows: 4, dataset: { bf: 'query' }, placeholder: 'One request per line\naerial of London at dusk\nhands typing on a laptop', oninput: () => count() });
      const countLine = h('div.field-hint');
      const count = () => { const n = parseRequests(query.value).length; countLine.textContent = US.say(n > 1 ? `${n} requests – each gets its own options and its own folder.` : 'Plain words work best: what’s in the shot, where, what time of day.'); };
      const aim = h('input.input.bff-aim', { type: 'number', min: 1, max: 40, step: 1, value: o.aim, dataset: { bf: 'aim' }, onchange: () => { o.aim = Math.max(1, Math.min(40, Math.round(+aim.value || DEFAULTS.aim))); aim.value = o.aim; save(); } });
      const freeOnly = ui.toggle({ label: 'Only free-to-use footage', hint: 'On: stock sites, public domain and Creative Commons you may use in a film (some need a credit). Off: also shows YouTube videos you’d need permission for – clearly marked, and not ticked.', value: o.freeOnly, onChange: x => { o.freeOnly = x; save(); } });
      const shape = ui.segmented({ options: Object.entries(SHAPES).map(([value, x]) => ({ value, label: x.label, title: x.hint ? `Only ${x.hint} footage` : 'Any shape of picture' })), value: SHAPES[o.shape] ? o.shape : 'any', onChange: x => { o.shape = x; save(); } });
      const minSide = ui.select({ options: [{ value: '0', label: 'Any size' }, { value: '720', label: 'At least 720p (HD)' }, { value: '1080', label: 'At least 1080p (Full HD)' }, { value: '2160', label: 'At least 4K' }], value: String(o.minSide || 0), onChange: x => { o.minSide = +x; save(); } });
      const shapeBox = h('div', { dataset: { bf: 'shape' } }, ui.field('Shape', shape), ui.field('Size', minSide, 'Pexels and Pixabay are asked for exactly this; elsewhere the results are sorted by their own width and height. Where a site doesn’t say (YouTube’s search), its videos are shown anyway and it says so.'));
      const aiBox = h('div');
      function drawAI() {
        US.clear(aiBox);
        if (!(US.ai && US.ai.available && US.ai.available())) return;
        aiBox.appendChild(ui.toggle({ label: 'Let the AI word the searches', hint: 'Turns each request into two or three search phrases, for more to choose from. Only the text of your requests is sent.', value: !!o.ai, onChange: x => { o.ai = x; save(); } }));
      }

      /* where to look */
      const whereBox = h('div.bff-sources');
      function drawWhere() {
        US.clear(whereBox);
        for (const s of SOURCES) {
          const row = h('div.bff-source', { dataset: { source: s.id } });
          row.appendChild(ui.toggle({ label: s.name, hint: s.about, value: sourceOn(o, s), onChange: x => { o.sources = Object.assign({}, o.sources, { [s.id]: x }); save(); } }));
          if (s.secret) {
            const has = !!net.key(s.secret);
            const input = ui.input({ type: 'password', placeholder: has ? '•••••••• saved on this computer' : `Paste your ${s.name} key here` });
            row.appendChild(h('div.row.bff-key', h('div.grow', input),
              ui.button('Save', { small: true, onClick: () => { const k = input.value.trim(); if (!k) return; US.secrets.set(s.secret, k); ui.toast({ type: 'ok', title: `${s.name} key saved on this computer`, timeout: 2000 }); drawWhere(); } }),
              has ? ui.button('Remove', { small: true, kind: 'ghost', onClick: () => { US.secrets.set(s.secret, ''); drawWhere(); } }) : ui.button('Get a free key', { small: true, kind: 'ghost', title: s.keyUrl, onClick: () => US.app.openUrl(s.keyUrl) })));
          } else if (s.id === 'youtube' && !net.tools().ytdlp) {
            row.appendChild(h('div.row.bff-key', h('span.field-hint.grow', 'Needs the downloader – set it up once in the Download tab.'), ui.button('Open Download', { small: true, kind: 'ghost', onClick: () => US.tools.open('youtube') })));
          }
          whereBox.appendChild(row);
        }
        whereBox.appendChild(ui.field('Longest clip', ui.select({ options: [{ value: '120', label: '2 minutes' }, { value: '600', label: '10 minutes' }, { value: '1800', label: '30 minutes' }, { value: '0', label: 'Any length' }], value: String(o.maxLen), onChange: x => { o.maxLen = +x; save(); } }), 'Longer videos are left out – B-roll is usually short, and long ones are big downloads.'));
      }
      const where = h('div', { dataset: { bf: 'where' } }, ui.section('Where to look', [whereBox], { open: !SOURCES.some(s => s.secret && net.key(s.secret)), hint: 'Pexels, Pixabay, Wikimedia Commons, YouTube…' }));

      /* the options */
      const resultsBox = h('div.bff-results', { dataset: { bf: 'results' } });
      const stopOthers = keep => resultsBox.querySelectorAll('video').forEach(x => { if (x !== keep) { try { x.pause(); } catch (e) { /* not playing */ } } });
      function play(clip, frame) {
        const show = src => {
          const vid = h('video', { src, controls: true, autoplay: true, muted: true, loop: true, playsInline: true, preload: 'metadata', onplay: () => stopOthers(vid),
            onerror: () => { US.clear(frame); frame.appendChild(thumbOf(clip, frame, 'No preview here – open its page')); } });
          US.clear(frame); frame.appendChild(vid); stopOthers(vid);
        };
        if (clip.preview) return show(clip.preview);
        if (clip.previewVia !== 'ytdlp') return US.app.openUrl(clip.page);
        // YouTube: the downloader is asked where a small stream is (nothing is saved); it plays without sound
        const wait = h('div.bff-wait', US.say('Getting the preview…')); frame.appendChild(wait);
        net.ytdlp(['-g', '--no-warnings', '--no-playlist', '-f', '18/b[height<=480][ext=mp4]/bv*[height<=480][vcodec^=avc1][protocol^=http]', '--', clip.page], { timeout: 30000 })
          .then(out => { const u = String(out).trim().split(/\r?\n/)[0]; if (!/^https?:/.test(u)) throw new Error('no stream'); if (frame.isConnected !== false) show(u); })
          .catch(() => { wait.remove(); ui.toast({ type: 'info', title: 'No quick preview for this one.', text: 'Its page has been opened in your browser instead.', timeout: 5000 }); US.app.openUrl(clip.page); });
      }
      function thumbOf(clip, frame, title) {
        return h('button.bff-thumb', { title: title || (clip.preview || clip.previewVia ? 'Play a preview (streams from the site – nothing is saved)' : 'Open its page'), onclick: () => play(clip, frame) },
          clip.thumb ? h('img', { src: clip.thumb, loading: 'lazy', alt: '' }) : null, h('span.bff-play', US.icon('play', 18)), fmtLen(clip.duration) ? h('span.bff-len', fmtLen(clip.duration)) : null);
      }
      function card(term, clip) {
        const id = term + '\n' + clip.key, L = clip.licence || lic('unknown');
        const frame = h('div.bff-frame'); frame.appendChild(thumbOf(clip, frame));
        const box = h('input', { type: 'checkbox', checked: ticked.has(id), title: 'Download this one', onchange: () => { if (box.checked) ticked.add(id); else ticked.delete(id); el.classList.toggle('off', !box.checked); drawDownload(); drawHeads(); } });
        const el = h('div.bff-card' + (ticked.has(id) ? '' : '.off'), { dataset: { clip: clip.key } },
          frame,
          h('label.bff-line', box, h('span.bff-title', { title: clip.title }, US.keep(clip.title))),
          h('div.bff-meta', [clip.sourceName, fmtSize(clip), clip.author ? 'by ' + clip.author : ''].filter(Boolean).map((t, i) => (i === 2 ? US.keep(t) : t)).reduce((a, t) => a.concat(a.length ? [' · ', t] : [t]), [])),
          h('div.bff-licence' + (L.free ? (L.careful ? '.careful' : '.free') : '.ask'), { title: L.link || '' }, L.label),
          h('div.row.bff-foot', h('button.link-btn', { onclick: () => US.app.openUrl(clip.page) }, `Open on ${clip.sourceName}`), got.has(clip.key) ? h('span.bff-got', US.icon('check', 12), 'Downloaded') : null));
        return el;
      }
      const heads = new Map();
      function drawHeads() { for (const [r, el] of heads) { const n = r.clips.filter(c => ticked.has(r.term + '\n' + c.key)).length; el.textContent = US.say(r.clips.length ? `${US.plural(r.clips.length, 'option')} · ${n} ticked` : 'Nothing found'); } }
      function drawResults() {
        US.clear(resultsBox); heads.clear();
        for (const r of found) {
          const head = h('span.field-hint');
          heads.set(r, head);
          const more = r.pool.length > r.clips.length ? ui.button(`More options (${r.pool.length - r.clips.length})`, { small: true, kind: 'ghost', onClick: () => { const add = r.pool.slice(r.clips.length, r.clips.length + o.aim); r.clips = r.clips.concat(add); drawResults(); drawDownload(); } }) : null;
          const all = r.clips.length > 1 ? ui.button(r.clips.every(c => !ticked.has(r.term + '\n' + c.key)) ? 'Tick all' : 'Untick all', { small: true, kind: 'ghost', onClick: () => { const none = r.clips.every(c => !ticked.has(r.term + '\n' + c.key)); for (const c of r.clips) { if (none) ticked.add(r.term + '\n' + c.key); else ticked.delete(r.term + '\n' + c.key); } drawResults(); drawDownload(); } }) : null;
          resultsBox.appendChild(ui.card(
            h('div.row', h('div.card-title.grow', '“', US.keep(r.term), '”'), head, all),
            r.asked && r.asked.length > 1 ? h('div.field-hint', 'Searched for: ', US.keep(r.asked.join(' · '))) : null,
            r.notes.map(n => ui.note(n, 'info')),
            r.clips.length ? h('div.bff-grid', r.clips.map(c => card(r.term, c))) : ui.empty({ icon: 'info', title: 'Nothing found for this one.', text: 'Try fewer or plainer words, or switch on more places in “Where to look”.' }),
            more ? h('div.row', more) : null));
        }
        if (found.length) resultsBox.appendChild(h('div.field-hint.bff-credit', 'Footage from ', Array.from(new Set(found.flatMap(r => r.clips.map(c => c.source)))).map((id, i) => [i ? ', ' : '', h('button.link-btn', { onclick: () => US.app.openUrl(sourceOf(id).site) }, sourceOf(id).name)]), '. Previews play straight from the site; nothing has been saved to this computer.'));
        drawHeads();
      }

      /* downloading */
      const folderLine = h('div.grow.field-hint');
      const showFolder = () => { const f = folder(); folderLine.textContent = `Saving to ${US.fsx.pretty ? US.fsx.pretty(f) : f} › a folder for each request`; folderLine.title = f; };
      const toBin = ui.toggle({ label: 'Also add to a bin in the project', hint: `Off: the clips are only saved to the folder. On: they’re also imported into “${BIN_ROOT.split('/').join(' › ')} › the request”.`, value: !!o.toBin, onChange: x => { o.toBin = x; save(); } });
      const sizeOf = () => (o.size === 'max' ? 'max' : String(sizeSide(o.size)));
      const size = ui.segmented({ options: [{ value: '720', label: 'Up to 720p', title: 'Small files' }, { value: '1080', label: 'Up to 1080p', title: 'Plays smoothly – right for most edits' }, { value: '2160', label: 'Up to 4K', title: 'Bigger downloads' }, { value: 'max', label: 'Largest there is', title: 'Whatever the site’s biggest copy is' }], value: sizeOf(), onChange: x => { o.size = x; save(); } });
      const picks = () => found.flatMap(r => r.clips.filter(c => ticked.has(r.term + '\n' + c.key)).map(clip => ({ term: r.term, clip })));
      const warnLine = h('div');
      const dl = ui.actionButton('Download the ticked clips', async () => {
        const p = picks();
        const ask = p.filter(x => !(x.clip.licence && x.clip.licence.free));
        if (ask.length && !(await ui.confirm({ title: `${ask.length === 1 ? 'One of these needs' : `${ask.length} of these need`} permission to use`, text: `${ask.length === 1 ? 'It isn’t' : 'They aren’t'} free to use: download ${ask.length === 1 ? 'it' : 'them'} only if you own ${ask.length === 1 ? 'it' : 'them'} or have the owner’s permission. The list of sources and licences in the folder says which.`, ok: 'Download anyway' }))) return;
        const r = await US.jobs.run({ title: 'Downloading B-roll', tool: 'brollfinder' }, job => run(job, { picks: p, folder: folder(), toBin: !!o.toBin, size: o.size }));
        if (r === undefined) return;
        for (const d of r.done) got.set(d.clip.key, d.file);
        drawResults(); drawDownload(r);
        if (r.failed.length) ui.toast({ type: 'warn', title: `${r.failed.length} didn’t download`, text: r.failed.map(f => `${f.clip ? f.clip.title : f.term}: ${f.why}`).join('\n'), timeout: 12000 });
      }, { icon: 'download' });
      dl.dataset.bf = 'go';
      const doneLine = h('div');
      function drawDownload(r) {
        const p = picks(), label = dl.querySelector('span');
        if (label) label.textContent = US.say(p.length ? `Download ${US.plural(p.length, 'ticked clip')}` : 'Download the ticked clips');
        dl.setEnabled(p.length > 0);
        US.clear(warnLine);
        const ask = p.filter(x => !(x.clip.licence && x.clip.licence.free)).length, credit = p.filter(x => x.clip.licence && x.clip.licence.free && x.clip.licence.credit).length;
        if (ask) warnLine.appendChild(ui.note(`${US.plural(ask, 'ticked clip')} need${ask === 1 ? 's' : ''} the owner’s permission before you use ${ask === 1 ? 'it' : 'them'}.`, 'warn'));
        else if (credit) warnLine.appendChild(h('div.field-hint', `${US.plural(credit, 'ticked clip')} need${credit === 1 ? 's' : ''} a credit – the wording is in “${LIST_NAME}” in the folder.`));
        if (r !== undefined) { US.clear(doneLine); if (r) doneLine.appendChild(h('div.row', h('span.field-hint.grow', r.summary + '.'), ui.button('Show the folder', { small: true, kind: 'ghost', icon: 'folder', onClick: () => US.app.reveal(r.folders.length === 1 ? r.folders[0] : r.root) }))); }
      }
      const downloadCard = h('div', { dataset: { bf: 'download' } }, ui.card(h('div.card-title', 'Download'),
        h('div.row', folderLine, ui.button('Choose folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = US.app.pickFiles({ folder: true, title: 'Where should the B-roll go?', start: folder() }); if (r[0]) { folderSet(US.normPath(r[0])); showFolder(); } } catch (e) { ui.showError(e); } } }),
          ui.button('Open', { small: true, kind: 'ghost', onClick: () => US.app.reveal(US.fsx.ensureDir(folder())) })),
        toBin, ui.field('Size to download', size, 'Where a site has several copies of a clip, the best one up to this size is taken.'), warnLine, dl, doneLine,
        h('div.field-hint', `Each request gets its own folder, with “${LIST_NAME}” – every clip’s page, author and licence. Clips already there are skipped.`)));

      const go = ui.actionButton('Find B-roll', async () => {
        const requests = parseRequests(query.value);
        const r = await US.jobs.run({ title: 'Looking for B-roll', tool: 'brollfinder' }, async job => {
          let phrases = null;
          if (o.ai && requests.length && US.ai && US.ai.available && US.ai.available()) {
            job.set({ who: 'ai', msg: 'Wording the searches' });
            try { phrases = await improve(requests); } catch (e) { if (e && e.code === 'CANCELLED') throw e; US.log && US.log('warn', 'B-roll finder: the AI couldn’t word the searches – your own words are used', (e && (e.title || e.message)) || '', 'brollfinder'); }
          }
          return search(job, { requests, aim: o.aim, freeOnly: o.freeOnly, sources: o.sources, maxLen: o.maxLen, shape: o.shape, minSide: o.minSide, phrases });
        });
        if (r === undefined) return;
        found = r.results; ticked = new Set(); doneLine.textContent = '';
        // ticked to start with: everything free to use; footage that needs permission has to be ticked on purpose
        for (const x of found) for (const c of x.clips) if (c.licence && c.licence.free) ticked.add(x.term + '\n' + c.key);
        drawResults(); drawDownload();
      }, { icon: 'search' });
      go.dataset.bf = 'find';

      fill = text => { if (text) { query.value = String(text); count(); } };
      v.body.append(
        ui.card(h('div.card-title', 'What are you looking for?'), query, countLine,
          h('div.row.bff-aimrow', h('span', 'Aim for'), aim, h('span', 'clips for each request')),
          shapeBox, freeOnly, aiBox, where, go,
          h('div.field-hint', 'Looking only shows you what’s there – nothing is downloaded.')),
        resultsBox, downloadCard);
      count(); drawWhere(); drawAI(); showFolder(); drawDownload();
      return {
        el: v.el,
        onShow(a) { o = opts(); aim.value = o.aim; freeOnly.set(o.freeOnly); toBin.set(!!o.toBin); size.set(sizeOf()); shape.set(SHAPES[o.shape] ? o.shape : 'any'); minSide.set(String(o.minSide || 0)); drawWhere(); drawAI(); showFolder(); if (a && a.query) fill(a.query); },
        onHide() { stopOthers(null); }
      };
    }
  });

  /* ---------- Ask: “find b-roll of …” opens the tab with the request filled in; it never downloads ---------- */
  const WANTS = /\b(b[- ]?roll|stock (?:footage|video|clips?)|cutaways?)\b/i;
  function matchAsk(text) {
    const t = String(text || '').trim();
    if (!WANTS.test(t) || !/\b(find|search|look|get|need|fetch|source|download)\b/i.test(t)) return null;
    if (/\b(cover|jump cuts?|in (?:the|my) (?:project|bin)|already)\b/i.test(t)) return null;   // that's the B-roll matcher's job
    const m = /\b(?:b[- ]?roll|stock (?:footage|video|clips?)|cutaways?)\b\s*(?:(?:of|for|about|showing|with)\b|[:–-])\s*(.+)$/i.exec(t);
    return { query: m ? m[1].replace(/[.?!]+$/, '').replace(/\s+(?:online|on the (?:web|internet)|from (?:pexels|pixabay|youtube).*)$/i, '').trim() : '' };
  }
  US.actions && US.actions.register && US.actions.register({
    id: 'brollfinder.find', tool: 'brollfinder', title: 'Find B-roll online', changes: false,
    describe: 'Opens the B-roll finder with the request filled in: it searches free stock footage (Pexels, Pixabay, Wikimedia Commons, YouTube) and shows options to tick. It never downloads by itself.',
    params: { query: { type: 'string', default: '', desc: 'What the footage should show, e.g. “aerial of London at dusk”. Several requests: one per line.' } },
    examples: ['find b-roll of a city at night', 'look for stock footage of hands typing on a laptop', 'I need b-roll for the harbour scene'],
    match: matchAsk,
    run: async p => { US.tools.open('brollfinder', { query: (p && p.query) || '' }); return { summary: p && p.query ? `B-roll finder is open with “${p.query}” – press Find B-roll. Nothing is downloaded until you tick clips and press Download.` : 'B-roll finder is open – type what you need there.' }; }
  });

  US.brollFinder = { SHAPES, ratioName, shapeFits, sizeFits, sizeSide, parseRequests, safeName, fileName, LICENCES, licenceFrom, pickFiles, parsePexels, parsePixabay, parseCommons, parseYouTube, archiveClip, nasaClip, SOURCES, sourceBlocked, pick, search, improve, run, noteSource, LIST_NAME, defaultFolder, binPath, BIN_ROOT, matchAsk, net, DEFAULTS };
})();
