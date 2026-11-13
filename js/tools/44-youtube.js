/* JMG Ultra Studio – Download (was “YouTube”): paste links from YouTube, Vimeo, Instagram, TikTok, Facebook, X and
   most other video sites; they're downloaded to a folder you choose and imported into the bin you pick. The downloading is done by yt-dlp (with ffmpeg to join picture and sound) – free tools fetched once, with your
   OK, into the panel's own folder. Made for Premiere: H.264 MP4 by default (what YouTube calls “avc1”, up to 1080p), so
   it plays and scrubs smoothly; “Highest quality” converts 4K's VP9/AV1 to H.264, which takes longer. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  const isWin = process.platform === 'win32';
  if (US.addIcon) US.addIcon('download', 'M10 3v10M6 9l4 4 4-4M4 16h12');
  if (US.addIcon) US.addIcon('youtube', 'M3 6.5c0-1 .8-1.8 1.8-1.9C6.6 4.4 9 4.3 10 4.3s3.4.1 5.2.3c1 .1 1.8.9 1.8 1.9v7c0 1-.8 1.8-1.8 1.9-1.8.2-4.2.3-5.2.3s-3.4-.1-5.2-.3c-1-.1-1.8-.9-1.8-1.9z M8.5 7.3v5.4l4.5-2.7z');

  /* ---------- pure: links, yt-dlp's arguments, its output ---------- */
  /** The sites people download from most (yt-dlp handles these and well over a thousand more). */
  const PLATFORMS = [
    { id: 'youtube', name: 'YouTube', re: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/ },
    { id: 'vimeo', name: 'Vimeo', re: /(^|\.)vimeo\.com$/ },
    { id: 'instagram', name: 'Instagram', re: /(^|\.)(instagram\.com|instagr\.am)$/ },
    { id: 'tiktok', name: 'TikTok', re: /(^|\.)tiktok\.com$/ },
    { id: 'facebook', name: 'Facebook', re: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/ },
    { id: 'x', name: 'X (Twitter)', re: /(^|\.)(x\.com|twitter\.com)$/ },
    { id: 'threads', name: 'Threads', re: /(^|\.)threads\.(net|com)$/ },
    { id: 'reddit', name: 'Reddit', re: /(^|\.)(reddit\.com|redd\.it)$/ },
    { id: 'linkedin', name: 'LinkedIn', re: /(^|\.)linkedin\.com$/ },
    { id: 'dailymotion', name: 'Dailymotion', re: /(^|\.)(dailymotion\.com|dai\.ly)$/ },
    { id: 'twitch', name: 'Twitch', re: /(^|\.)twitch\.tv$/ },
    { id: 'soundcloud', name: 'SoundCloud', re: /(^|\.)soundcloud\.com$/ },
    { id: 'bandcamp', name: 'Bandcamp', re: /(^|\.)bandcamp\.com$/ },
    { id: 'bbc', name: 'BBC', re: /(^|\.)bbc\.co\.uk$|(^|\.)bbc\.com$/ }
  ];
  const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^(www|m|mobile|music|web)\./, ''); } catch (e) { return ''; } };
  /** Which site a link is from -> {id, name}; other sites -> {id: 'other', name: the site's address}. */
  function platformOf(url) {
    const host = hostOf(url);
    return PLATFORMS.find(p => p.re.test(host)) || { id: 'other', name: host || 'the website' };
  }
  // links written without https:// – only for the sites above, so “e.g.” or “file.mp4” aren't taken for links
  const BARE = /(?:^|[\s(<"'])((?:www\.|m\.)?(?:youtube\.com|youtu\.be|vimeo\.com|instagram\.com|tiktok\.com|vm\.tiktok\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|reddit\.com)\/[^\s<>"]+)/gi;
  /** Tracking bits that don't change which video it is. */
  const TRACKING = /^(utm_\w+|si|igsh|igshid|fbclid|feature|is_from_webapp|sender_device|_r|_t|ref|ref_src|s|share_id|mibextid|rdid)$/i;
  /** The same video however it was shared: YouTube by its id, the rest by address without tracking bits. */
  function linkKey(u) {
    let url; try { url = new URL(u); } catch (e) { return u; }
    if (platformOf(u).id === 'youtube') {
      const id = url.searchParams.get('v') || (/^\/(?:shorts|live|embed)\/([\w-]+)/.exec(url.pathname) || [])[1] || (url.hostname.endsWith('youtu.be') ? url.pathname.slice(1) : '') || url.searchParams.get('list');
      if (id) return 'youtube:' + id;
    }
    const q = Array.from(url.searchParams).filter(([k]) => !TRACKING.test(k)).map(([k, v]) => k + '=' + v).sort().join('&');
    return hostOf(u) + url.pathname.replace(/\/+$/, '') + (q ? '?' + q : '');
  }
  /** Video links in pasted text (one per line, or anything between) from any site, each once, in order. */
  function parseLinks(text) {
    const out = [], seen = new Set(), t = String(text || '');
    const found = Array.from(t.matchAll(/https?:\/\/[^\s<>"]+/gi), m => ({ at: m.index, u: m[0] }))
      .concat(Array.from(t.matchAll(BARE), m => ({ at: m.index + m[0].indexOf(m[1]), u: m[1] })).filter(b => !/https?:\/\/$/i.test(t.slice(Math.max(0, b.at - 8), b.at))))
      .sort((a, b) => a.at - b.at);
    for (const f of found) {
      let u = f.u.replace(/[)\].,;:!?'"”’>]+$/, '');
      if (!/^https?:/i.test(u)) u = 'https://' + u;
      if (!hostOf(u) || !/\./.test(hostOf(u))) continue;
      const k = linkKey(u);
      if (!seen.has(k)) { seen.add(k); out.push(u); }
    }
    return out;
  }
  /** “3 links found – 2 Instagram, 1 Vimeo” */
  function describeLinks(links) {
    const by = new Map();
    for (const u of links) { const n = platformOf(u).name; by.set(n, (by.get(n) || 0) + 1); }
    return Array.from(by, ([n, c]) => `${c} ${n}`).join(', ');
  }
  const QUALITY = {
    premiere: { label: 'Best for editing', hint: 'H.264 MP4, up to 1080p – plays and scrubs smoothly, no converting' },
    best: { label: 'Highest quality', hint: 'Up to 4K, converted to H.264 MP4 – takes longer' },
    audio: { label: 'Sound only', hint: 'M4A (AAC) – for music and voice-overs' }
  };
  const BROWSERS = isWin ? ['firefox', 'chrome', 'edge', 'brave', 'opera', 'vivaldi'] : ['firefox', 'chrome', 'safari', 'edge', 'brave', 'opera', 'vivaldi'];
  const BROWSER_NAME = { firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge', brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi', safari: 'Safari' };
  /** The sign-in arguments: a browser's sign-in (YouTube, Instagram, Facebook…), or an exported cookies file. o: {signIn: 'off'|'browser'|'file', browser, cookies} */
  function signInArgs(o) {
    if (o.signIn === 'browser' && BROWSERS.includes(o.browser)) return ['--cookies-from-browser', o.browser];
    if (o.signIn === 'file' && o.cookies) return ['--cookies', o.cookies];
    return [];
  }
  /** Needs a signed-in account: age-restricted, YouTube's “confirm you're not a bot”, or a site that wants you logged in
      (Instagram, Facebook, TikTok and X often do; yt-dlp then suggests --cookies). */
  const needsSignIn = t => /sign in to confirm|age-restricted|inappropriate for some users|confirm your age|login required|log ?in to (view|see|watch|continue)|you need to log ?in|requires? (a )?(login|authentication|logged)|only available for registered users|--cookies\b|for the authentication|only works when logged.in|IP address is blocked|cookies for the authentication|NSFW tweet|sensitive content/i.test(String(t || ''));
  /** yt-dlp's arguments for one link. o: {quality, folder, playlist, ffmpeg, signedIn (use the sign-in)} */
  function argsFor(url, o) {
    const q = QUALITY[o.quality] ? o.quality : 'premiere';
    const a = ['--newline', '--no-simulate', '--progress', '--encoding', 'utf-8', '--windows-filenames', '--no-mtime', '--no-part',
      '--progress-template', 'download:US-PROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
      '--print', 'before_dl:US-TITLE %(title)s', '--print', 'after_move:US-FILE %(filepath)s',
      '-P', o.folder, '-o', (o.playlist ? '%(playlist_title).80B/%(playlist_index)03d – ' : '') + '%(title).150B [%(id)s].%(ext)s',
      o.playlist ? '--yes-playlist' : '--no-playlist'];
    if (o.ffmpeg) a.push('--ffmpeg-location', o.ffmpeg);
    if (o.signedIn) a.push(...signInArgs(o));
    if (q === 'audio') a.push('-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a');
    else if (q === 'best') a.push('-f', 'bv*+ba/b', '-S', 'res,fps', '--merge-output-format', 'mkv', '--recode-video', 'mp4', '--postprocessor-args', 'VideoConvertor:-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k');
    else a.push('-f', 'bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*[vcodec^=avc1]+ba/bv*+ba/b', '-S', 'res:1080,vcodec:h264,fps', '--merge-output-format', 'mp4');
    a.push('--', url);
    return a;
  }
  /** One line of yt-dlp's output (also a warning that the site wants a sign-in, so it's asked for) -> {kind: 'progress', f} | {kind: 'title', title} | {kind: 'file', file} | {kind: 'error', text} | null */
  function parseLine(line) {
    const s = String(line || '').trim();
    let m;
    if ((m = /^US-PROG (\d+|NA) (\d+|NA|None) (\d+(?:\.\d+)?|NA|None)/.exec(s))) { const done = +m[1], tot = +m[2] || +m[3]; return isFinite(done) && tot > 0 ? { kind: 'progress', f: Math.min(1, done / tot) } : null; }
    if ((m = /^US-TITLE (.+)$/.exec(s))) return { kind: 'title', title: m[1] };
    if ((m = /^US-FILE (.+)$/.exec(s))) return { kind: 'file', file: m[1] };
    if ((m = /^\[download\] (.+) has already been downloaded$/.exec(s))) return { kind: 'file', file: m[1], already: true };
    if ((m = /^ERROR: (.+)$/.exec(s))) return { kind: 'error', text: m[1].replace(/^\[[^\]]+\] (?:[\w.-]+: )?/, '') };
    return null;
  }
  /** A yt-dlp error in plain words. site: the site's name (“Instagram”) – YouTube when not given. */
  function plainError(t, site) {
    t = String(t || ''); site = site || 'YouTube';
    if (/unsupported url/i.test(t)) return 'That isn’t a link to a video Ultra Studio can download – check it opens the video itself.';
    if (/no video (could be found|formats found|in this)|there'?s no video|no media found|only images/i.test(t)) return 'There’s no video there (a photo post, or a link to a profile).';
    if (/IP address is blocked/i.test(t)) return `${site} is blocking downloads from this internet connection. Try signed in, later, or from another network.`;
    if (site !== 'YouTube' && needsSignIn(t)) return `${site} only shows it to someone signed in (it’s private, for followers or members, or the site wants to check you’re a person).`;
    if (/private video|members-only|join this channel/i.test(t)) return 'It’s private or for members only.';
    if (/could not find .*cookies database|could not copy .*cookie database|failed to decrypt with dpapi|unsupported browser|app.?bound/i.test(t)) return 'Couldn’t read the browser’s sign-in. Close that browser completely and try again – or use Firefox, or a cookies file (Chrome and Edge often lock theirs).';
    if (/cookies are no longer valid|netscape format|invalid cookies/i.test(t)) return `The sign-in has expired or the cookies file isn’t right. Sign in to ${site} in the browser again (or export a new cookies file).`;
    if (/sign in to confirm your age|age-restricted|inappropriate for some users/i.test(t)) return 'It’s age-restricted, so YouTube wants a signed-in account that’s confirmed as over 18.';
    if (/sign in to confirm you.?re not a bot/i.test(t)) return 'YouTube asked to confirm it isn’t a bot. Try again later, or press “Update the downloader”.';
    if (/video unavailable|has been removed|does not exist|(?<!format is )not available|content isn.t available|page not found|HTTP Error 404/i.test(t)) return 'The video isn’t available (removed, private, or blocked in your country).';
    if (/HTTP Error 403|Requested format is not available|nsig|signature|unable to extract|unable to parse|cannot parse data/i.test(t)) return `${site} changed something. Press “Update the downloader”, then try again.`;
    if (/HTTP Error 429|too many requests|rate.?limit/i.test(t)) return `${site} says too many downloads at once. Wait a few minutes and try again.`;
    if (/unable to download webpage|getaddrinfo|timed out|network/i.test(t)) return `No internet connection, or ${site} didn’t answer.`;
    return t.slice(0, 200);
  }

  /* ---------- the tools: yt-dlp and ffmpeg, in the panel's own folder ---------- */
  const toolDir = () => path.join(US.fsx.dataDir, 'youtube-tools');
  const exe = n => (isWin ? n + '.exe' : n);
  function onPath(name) {
    try { const r = cp.execSync(isWin ? `where ${name}` : `command -v ${name}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).split(/\r?\n/)[0].trim(); return r && fs.existsSync(r) ? r : ''; } catch (e) { return ''; }
  }
  function find(name) {
    const own = path.join(toolDir(), exe(name));
    if (fs.existsSync(own)) return own;
    for (const p of isWin ? [] : ['/opt/homebrew/bin/' + name, '/usr/local/bin/' + name]) if (fs.existsSync(p)) return p;
    return onPath(name);
  }
  const tools = () => ({ ytdlp: find('yt-dlp'), ffmpeg: find('ffmpeg') });
  const SOURCES = isWin
    ? { ytdlp: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ffmpeg: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' }
    : { ytdlp: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos', ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/zip' };
  /** Download url to file (following redirects), progress(0..1). */
  function fetchTo(url, file, progress, job, hops = 0) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https:') ? require('https') : require('http');
      const req = lib.get(url, { headers: { 'User-Agent': 'JMG-Ultra-Studio' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 8) { res.resume(); resolve(fetchTo(new URL(res.headers.location, url).toString(), file, progress, job, hops + 1)); return; }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
        const total = +res.headers['content-length'] || 0, out = fs.createWriteStream(file + '.part');
        let got = 0;
        res.on('data', d => { got += d.length; if (total && progress) progress(got / total); if (job && job.cancelled) req.destroy(new Error('cancelled')); });
        res.pipe(out);
        out.on('finish', () => out.close(() => { try { fs.renameSync(file + '.part', file); resolve(file); } catch (e) { reject(e); } }));
        res.on('error', reject); out.on('error', reject);
      });
      req.on('error', e => reject(job && job.cancelled ? new US.UserError('CANCELLED') : e));
      req.setTimeout(60000, () => req.destroy(new Error('timed out')));
    });
  }
  function findFile(dir, name) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { const r = findFile(p, name); if (r) return r; } else if (f.name === name) return p;
    }
    return '';
  }
  async function setUp(job) {
    const dir = US.fsx.ensureDir(toolDir()), have = tools();
    if (!have.ytdlp) {
      job.set({ who: 'computer', msg: 'Downloading yt-dlp' }); job.range && job.range(0, 0.3);
      const f = path.join(dir, exe('yt-dlp'));
      await fetchTo(SOURCES.ytdlp, f, x => job.progress(x), job);
      if (!isWin) fs.chmodSync(f, 0o755);
    }
    if (!have.ffmpeg) {
      job.set({ who: 'computer', msg: 'Downloading ffmpeg (joins picture and sound)' }); job.range && job.range(0.3, 0.95);
      const zip = path.join(dir, 'ffmpeg.zip'), tmp = path.join(dir, 'ffmpeg-unzip');
      await fetchTo(SOURCES.ffmpeg, zip, x => job.progress(x), job);
      job.set({ who: 'computer', msg: 'Unpacking ffmpeg' });
      fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
      await new Promise((res, rej) => cp.execFile(isWin ? 'tar' : 'unzip', isWin ? ['-xf', zip, '-C', tmp] : ['-o', '-q', zip, '-d', tmp], { windowsHide: true }, e => (e ? rej(e) : res())));
      const got = findFile(tmp, exe('ffmpeg'));
      if (!got) throw new US.UserError('NOT_FOUND', { title: 'ffmpeg wasn’t in the download.', action: 'Try again later.' });
      fs.copyFileSync(got, path.join(dir, exe('ffmpeg')));
      const probe = findFile(tmp, exe('ffprobe')); if (probe) fs.copyFileSync(probe, path.join(dir, exe('ffprobe')));
      if (!isWin) fs.chmodSync(path.join(dir, exe('ffmpeg')), 0o755);
      fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
    }
    job.range && job.range(0, 1);
    return tools();
  }
  function update(job) {
    const t = tools();
    if (!t.ytdlp) return Promise.resolve('not set up');
    job.set({ who: 'computer', msg: 'Updating yt-dlp' });
    return new Promise(res => cp.execFile(t.ytdlp, ['-U'], { windowsHide: true, timeout: 180000 }, (e, out, err) => res(String(out || err || (e && e.message) || '').trim().split(/\r?\n/).pop())));
  }

  /* ---------- downloading and importing ---------- */
  /** One link -> {files: [paths], title, error} */
  function download(job, url, o, onProgress) {
    return new Promise(resolve => {
      const files = [], errors = []; let title = '';
      const [cmd, ...pre] = [].concat(o.ytdlp);   // a command, or [command, its own first arguments]
      const p = cp.spawn(cmd, pre.concat(argsFor(url, o)), { windowsHide: true, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
      const kill = setInterval(() => { if (job.cancelled) { try { p.kill(); } catch (e) { /* gone */ } } }, 300);
      let buf = '';
      const read = d => {
        buf += d.toString('utf8');
        const ls = buf.split(/\r?\n|\r/); buf = ls.pop();
        for (const l of ls) {
          const x = parseLine(l);
          if (!x) continue;
          if (x.kind === 'progress') onProgress(x.f, title);
          else if (x.kind === 'title') { title = x.title; onProgress(0, title); }
          else if (x.kind === 'file') { if (!files.includes(x.file)) files.push(x.file); }
          else if (x.kind === 'error') errors.push(x.text);
        }
      };
      p.stdout.on('data', read); p.stderr.on('data', read);
      p.on('error', e => errors.push(e.message));
      p.on('close', () => { clearInterval(kill); read('\n'); resolve({ files: files.filter(f => fs.existsSync(f)), title, error: errors.length ? errors[errors.length - 1] : '' }); });
    });
  }
  // “Web downloads” next to the project – or the “YouTube downloads” folder an earlier version made there
  const defaultFolder = () => {
    const pr = US.ctx && US.ctx.project && US.ctx.project.path, base = pr ? path.dirname(pr) : path.dirname(US.fsx.exportsDir());
    const old = path.join(base, 'YouTube downloads');
    return fs.existsSync(old) ? old : path.join(base, 'Web downloads');
  };
  const DEFAULT_BIN = 'Web downloads';
  /** o: {links, folder, toBin (false: download to the folder only, nothing added to the project), binId, binName, quality, playlist} */
  async function run(job, o) {
    const links = Array.isArray(o.links) ? o.links : parseLinks(o.links);
    if (!links.length) throw new US.UserError('BAD_INPUT', { title: 'No links there.', action: 'Paste links to videos – YouTube, Vimeo, Instagram, TikTok, Facebook and so on – one per line.' });
    const t = o.ytdlp ? { ytdlp: o.ytdlp, ffmpeg: o.ffmpeg || '' } : tools();
    if (!t.ytdlp || (!t.ffmpeg && !o.ytdlp)) throw new US.UserError('NOT_FOUND', { title: 'The downloader isn’t set up yet.', action: 'Press “Set up the downloader” first.' });
    const folder = US.fsx.ensureDir(o.folder || defaultFolder()), done = [], failed = [];
    const into = o.binId ? { binId: o.binId } : { binPath: DEFAULT_BIN };
    for (let i = 0; i < links.length; i++) {
      job.check();
      const at = i / links.length, part = 1 / links.length;
      job.set({ who: 'computer', msg: `Downloading ${i + 1} of ${links.length}` });
      const step = (f, title) => job.progress(at + part * 0.9 * f, `${title || links[i]} – ${Math.round(f * 100)}%`);
      const base = Object.assign({}, o, { folder, ytdlp: t.ytdlp, ffmpeg: t.ffmpeg });
      const site = platformOf(links[i]).name;
      // signed in only when the site won't let the video through otherwise (age-restricted, a bot check, a login wall)
      let r = await download(job, links[i], Object.assign({}, base, { signedIn: !!o.signedIn }), step);
      if (!r.files.length && !o.signedIn && needsSignIn(r.error) && signInArgs(o).length) {
        job.check();
        job.set({ who: 'computer', msg: `Signing in for “${r.title || links[i]}”` });
        r = await download(job, links[i], Object.assign({}, base, { signedIn: true }), step);
      }
      job.check();
      if (!r.files.length) { failed.push({ url: links[i], site, title: r.title, why: plainError(r.error || 'Nothing was downloaded.', site), signIn: needsSignIn(r.error) }); continue; }
      if (o.toBin === false) { done.push({ url: links[i], site, title: r.title, files: r.files, items: [] }); continue; }
      job.set({ who: US.app.is('resolve') ? 'resolve' : 'premiere', msg: `Importing “${r.title || path.basename(r.files[0])}”` });
      try { const got = await US.host.call('importFiles', Object.assign({ paths: r.files }, into)); done.push({ url: links[i], site, title: r.title, files: r.files, items: got }); }
      catch (e) { failed.push({ url: links[i], title: r.title, why: `Downloaded, but not imported: ${e.title || e.message}` }); }
    }
    US.log(failed.length ? 'warn' : 'ok', `Download: ${US.plural(done.length, 'video')} downloaded${o.toBin === false ? ` to ${folder}` : ' and imported'}`, failed.map(f => `${f.title || f.url}: ${f.why}`).join(' · '), 'youtube');
    if (!done.length && failed.length && !failed.every(f => f.signIn)) throw new US.UserError('NOT_FOUND', { title: failed.length === 1 ? `Couldn’t download it: ${failed[0].why}` : `None of the ${failed.length} downloaded.`, detail: failed.map(f => `${f.url}: ${f.why}`).join('\n') });
    return { summary: `${US.plural(done.length, 'video')} ${o.toBin === false ? `saved in “${path.basename(folder)}” (not added to the project)` : `in “${o.binName || DEFAULT_BIN}”`}${failed.length ? ` · ${failed.length} didn’t download` : ''}`, done, failed, folder };
  }

  /* ---------- the tab ---------- */
  const opts = () => Object.assign({ toBin: true, folder: '', binId: '', quality: 'premiere', playlist: false, signIn: 'off', browser: 'firefox', cookies: '' }, US.settings.get('youtube', {}));
  US.tools.register({
    id: 'youtube', name: 'Download', short: 'Download', icon: 'download', group: 'selects', order: 14,
    hostFns: ['listBins', 'importFiles'],
    create() {
      const v = ui.toolView({ icon: 'download', title: 'Download', blurb: 'Paste links from YouTube, Vimeo, Instagram, TikTok, Facebook, X and most other video sites: each video is downloaded to the folder you choose and imported into your bin, ready to edit.' });
      let o = opts();
      const save = () => US.settings.set('youtube', o);
      const links = h('textarea.input', { rows: 5, placeholder: 'Paste links here, one per line\nhttps://www.youtube.com/watch?v=…\nhttps://vimeo.com/…\nhttps://www.instagram.com/reel/…', oninput: () => count() });
      const countLine = h('div.field-hint');
      const count = () => { const l = parseLinks(links.value); countLine.textContent = l.length ? `${US.plural(l.length, 'link')} found – ${describeLinks(l)}` : 'YouTube, Vimeo, Instagram, TikTok, Facebook, X, Reddit, LinkedIn, Dailymotion, Twitch, SoundCloud and most other sites.'; };
      const binSel = ui.select({ options: [], placeholder: `A new bin called “${DEFAULT_BIN}”`, onChange: x => { o.binId = x; save(); } });
      let bins = [];
      async function fillBins() { try { bins = (await US.host.call('listBins')).filter(b => b.path !== '(Project root)'); binSel.setOptions([{ value: '', label: `A new bin called “${DEFAULT_BIN}”` }].concat(bins.map(b => ({ value: b.id, label: b.path }))), bins.some(b => b.id === o.binId) ? o.binId : ''); } catch (e) { /* no project yet */ } }
      const folderLine = h('div.grow.field-hint');
      const showFolder = () => { folderLine.textContent = `Saving to ${o.folder || defaultFolder()}`; };
      const quality = ui.segmented({ options: Object.entries(QUALITY).map(([value, q]) => ({ value, label: q.label })), value: o.quality, onChange: x => { o.quality = x; save(); qHint.textContent = QUALITY[x].hint; } });
      const qHint = h('div.field-hint', QUALITY[o.quality] ? QUALITY[o.quality].hint : '');
      const setupBox = h('div');
      /** Some videos need a signed-in account: how to sign in (a browser, or a cookies file) -> true when set, false to skip. */
      async function askSignIn(blocked) {
        let how = o.signIn !== 'off' ? o.signIn : 'browser', browser = o.browser || 'firefox', cookies = o.cookies || '';
        const names = Array.from(new Set(blocked.map(b => b.site || 'YouTube'))), onlyYT = names.every(n => n === 'YouTube');
        const sites = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
        const box = h('div');
        const draw = () => {
          US.clear(box);
          box.appendChild(h('p', onlyYT
            ? `${blocked.length === 1 ? `“${blocked[0].title || blocked[0].url}” is` : `${blocked.length} videos are`} age-restricted (or YouTube asked to confirm it isn’t a bot), so YouTube only lets a signed-in account download ${blocked.length === 1 ? 'it' : 'them'}. Use your spare YouTube account – one confirmed as over 18. It’s only used for videos that need it.`
            : `${blocked.length === 1 ? `“${blocked[0].title || blocked[0].url}”` : `${blocked.length} videos`} on ${sites} only download${blocked.length === 1 ? 's' : ''} for someone signed in (private or followers-only posts, age limits, or a check that you’re a person). Use an account that can see ${blocked.length === 1 ? 'it' : 'them'} – a spare one if you have it. The sign-in is only used for videos that need it.`));
          box.appendChild(ui.segmented({ options: [{ value: 'browser', label: 'Signed in to a browser' }, { value: 'file', label: 'A cookies file' }], value: how, onChange: x => { how = x; draw(); } }));
          if (how === 'browser') {
            box.appendChild(ui.field('Browser', ui.select({ options: BROWSERS.map(b => ({ value: b, label: BROWSER_NAME[b] + (b === 'firefox' ? ' (most reliable)' : '') })), value: browser, onChange: x => { browser = x; draw(); } })));
            box.appendChild(h('div.field-hint', `Sign in to ${sites} in ${BROWSER_NAME[browser]} first.${browser === 'firefox' || browser === 'safari' ? '' : ' Then close it completely – it locks its sign-in while it’s open, and newer versions may not share it at all (Firefox or a cookies file always work).'}`));
          } else {
            box.appendChild(h('div.row', h('span.field-hint.grow', cookies || 'No file chosen yet.'), ui.button('Choose file…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = US.app.pickFiles({ title: 'Choose the cookies file (cookies.txt)', ext: ['txt'] }); if (r[0]) { cookies = US.normPath(r[0]); draw(); } } catch (e) { ui.showError(e); } } })));
            box.appendChild(h('div.field-hint', `Signed in to ${sites}, export the cookies with a “Get cookies.txt” browser extension and choose the file. Keep it private – it’s that account’s sign-in.`));
          }
        };
        draw();
        const v = await ui.modal({ title: `${sites} want${names.length > 1 ? '' : 's'} a signed-in account`, body: box, buttons: [{ label: 'Skip them', value: false, kind: 'ghost' }, { label: 'Sign in and try again', value: true, kind: 'primary' }] });
        if (!v) return false;
        if (how === 'file' && !cookies) { ui.toast({ type: 'warn', title: 'Choose the cookies file first.' }); return false; }
        Object.assign(o, { signIn: how, browser, cookies }); save(); drawSignedIn();
        return true;
      }
      // once a sign-in is set: a line to change or forget it
      const signedLine = h('div');
      function drawSignedIn() {
        US.clear(signedLine);
        if (o.signIn === 'off') return;
        signedLine.appendChild(h('div.row', h('span.field-hint.grow', `Videos that need an account: signed in with ${o.signIn === 'file' ? 'a cookies file' : BROWSER_NAME[o.browser] || o.browser}, only when needed.`),
          ui.button('Forget', { small: true, kind: 'ghost', title: 'Stop using the sign-in – it’s asked for again next time a video needs it', onClick: () => { o.signIn = 'off'; o.cookies = ''; save(); drawSignedIn(); } })));
      }
      function drawSetup() {
        US.clear(setupBox);
        const t = tools();
        if (t.ytdlp && t.ffmpeg) {
          setupBox.appendChild(h('div.row', h('span.field-hint.grow', 'Downloader ready.'), ui.button('Update the downloader', { small: true, kind: 'ghost', icon: 'refresh', title: 'The sites change often – update when downloads start failing', onClick: async () => { const r = await US.jobs.run({ title: 'Updating the downloader', tool: 'youtube' }, job => update(job)); if (r !== undefined) ui.toast({ type: 'ok', title: 'Downloader', text: r }); } })));
          return;
        }
        setupBox.appendChild(ui.note(`Downloading needs two free tools: yt-dlp (fetches the video) and ffmpeg (joins picture and sound). They're downloaded once, from their official GitHub${isWin ? '' : ' and evermeet.cx'} pages, into Ultra Studio's own folder – about ${isWin ? 140 : 90} MB.`));
        setupBox.appendChild(ui.button('Set up the downloader', { kind: 'primary', icon: 'download', onClick: async () => {
          const r = await US.jobs.run({ title: 'Setting up the downloader', tool: 'youtube' }, job => setUp(job));
          if (r !== undefined) drawSetup();
        } }));
      }
      // a folder and a bin, or the folder only
      const binBox = h('div');
      const where = ui.segmented({ options: [{ value: 'bin', label: 'A folder and a bin' }, { value: 'folder', label: 'A folder only' }], value: o.toBin === false ? 'folder' : 'bin', onChange: x => { o.toBin = x === 'bin'; save(); showWhere(); } });
      const whereHint = h('div.field-hint');
      function showWhere() {
        binBox.style.display = o.toBin === false ? 'none' : '';
        whereHint.textContent = o.toBin === false ? 'Saved to the folder below only – nothing is added to the project.' : 'Saved to the folder below and imported into the bin.';
        const label = go && go.querySelector('span'); if (label) label.textContent = o.toBin === false ? 'Download' : 'Download and import';
      }
      let go = null;
      go = ui.actionButton('Download and import', async () => {
        const r = await US.jobs.run({ title: 'Downloading videos', tool: 'youtube' }, job => run(job, { links: links.value, toBin: o.toBin !== false, folder: o.folder, binId: o.binId, binName: (bins.find(b => b.id === o.binId) || {}).path, quality: o.quality, playlist: o.playlist, signIn: o.signIn, browser: o.browser, cookies: o.cookies }));
        if (r === undefined) return;
        const blocked = r.failed.filter(f => f.signIn);
        if (blocked.length && o.signIn === 'off' && await askSignIn(blocked)) {
          const again = await US.jobs.run({ title: 'Downloading the videos that need a sign-in', tool: 'youtube' }, job => run(job, { links: blocked.map(f => f.url), toBin: o.toBin !== false, folder: o.folder, binId: o.binId, binName: (bins.find(b => b.id === o.binId) || {}).path, quality: o.quality, playlist: o.playlist, signIn: o.signIn, browser: o.browser, cookies: o.cookies, signedIn: true }));
          if (again !== undefined) { r.done = r.done.concat(again.done); r.failed = r.failed.filter(f => !f.signIn).concat(again.failed); }
        }
        if (r.failed.length) ui.toast({ type: 'warn', title: `${r.failed.length} didn’t download`, text: r.failed.map(f => `${f.title || f.url}: ${f.why}`).join('\n'), timeout: 12000 });
        else links.value = '';
        count();
      }, { icon: 'download' });
      v.body.append(
        ui.card(h('div.card-title', 'Links'), links, countLine,
          ui.toggle({ label: 'Whole playlist when a link is one', hint: 'Off: just the video, even when its link is part of a playlist.', value: !!o.playlist, onChange: x => { o.playlist = x; save(); } })),
        ui.card(h('div.card-title', 'Where they go'),
          where, whereHint,
          (binBox.append(ui.field('Bin', binSel), h('div.row', ui.button('Refresh', { small: true, kind: 'ghost', icon: 'refresh', onClick: fillBins }))), binBox),
          h('div.row', folderLine, ui.button('Choose folder…', { small: true, kind: 'ghost', icon: 'folder', onClick: () => { try { const r = US.app.pickFiles({ folder: true, title: 'Where should the downloads go?', start: o.folder || defaultFolder() }); if (r[0]) { o.folder = US.normPath(r[0]); save(); showFolder(); } } catch (e) { ui.showError(e); } } }),
            ui.button('Open', { small: true, kind: 'ghost', onClick: () => { const f = US.fsx.ensureDir(o.folder || defaultFolder()); cp.exec((isWin ? 'explorer "' : 'open "') + f + '"'); } })),
          ui.field('Quality', quality), qHint),
        ui.card(setupBox, go, signedLine, h('div.field-hint', 'Only download videos you own or have permission to use.')));
      count(); showFolder(); drawSetup(); drawSignedIn(); showWhere();
      return { el: v.el, onShow() { o = opts(); fillBins(); showFolder(); drawSetup(); drawSignedIn(); showWhere(); } };
    }
  });
  US.actions && US.actions.register && US.actions.register({ id: 'youtube.open', tool: 'youtube', title: 'Download videos from the web', changes: false, describe: 'Opens the Download tab: paste links from YouTube, Vimeo, Instagram, TikTok, Facebook, X and more – they’re downloaded and imported into a bin.', examples: ['download this youtube video', 'import from vimeo', 'download an instagram reel', 'get this tiktok'], match: t => (/\b(youtube|youtu\.be|vimeo|instagram|insta|reels?|tiktok|facebook|fb|twitter|x\.com|reddit|linkedin|dailymotion|twitch|soundcloud|bandcamp)\b/i.test(t) && /\b(download|import|get|grab)\b/i.test(t) ? {} : null), run: async () => { US.tools.open('youtube'); return { summary: 'Download is open – paste the links there.' }; } });

  US.youtube = { parseLinks, platformOf, linkKey, describeLinks, PLATFORMS, argsFor, parseLine, plainError, run, tools, QUALITY, signInArgs, needsSignIn, BROWSERS, DEFAULT_BIN };
})();
