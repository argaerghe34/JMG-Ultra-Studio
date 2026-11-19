/* JMG Ultra Studio – Ask: working on its own. The tools every chat has (Ask, and Producer on the same engine) for the
   things it used to say it couldn't do:
   - B-roll from the web, start to finish: search the places the B-roll finder knows (broll.search), choose, show the
     picks on the approval card to untick, download them into a folder named after the search and put them in a bin
     (broll.download) – the same code as the B-roll finder's own buttons, run in the background. Links: download.
   - Finding its way round a big project: bins with counts (bins), clips by name / file / bin (find), what is new since
     the chat started or in the last while (recent), files in a folder on disk (files), make a bin – empty too (makebin),
     move clips into a bin (move), import files or a whole folder (import).
   - Putting clips into a sequence at given times on a given track, on a copy (place): B-roll over a string-out, a
     cover for each jump cut, music under a cut.
   - Waiting and coming back: wait for a job, files in a folder, clips in a bin or a number of seconds (wait); and set
     itself a follow-up – “check again in 30 minutes” (later) – with the caps in US.chat.FOLLOW.
   Each is a typed operation with checked arguments; nothing here runs text from the AI as code. Registered in
   US.chatTools (40-assistant-chat.js lists them to the AI and runs them through the same approval, warning, journal
   and Undo as everything else). Pure parts first (unit-tested). */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path');
  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.round(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const arr = x => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
  const B = () => US.brollFinder;
  const MEDIA = /\.(mp4|mov|mxf|m4v|avi|mkv|mpg|mpeg|mts|m2ts|r3d|braw|wav|bwf|mp3|aif|aiff|m4a|aac|flac|jpe?g|png|tiff?|psd|gif|heic|webp)$/i;
  const LIMITS = { bigDownload: 2 * 1024 * 1024 * 1024, manyDownloads: 20, importMax: 500, waitMaxMin: 30, waitDefaultMin: 10, waitEvery: 5, placeMax: 80, moveMany: 150 };
  const mb = b => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1024 / 1024))} MB`);

  /* ---------- pure ---------- */
  /** A licence in a few plain words, for the AI and the card. */
  function licenceWords(c) {
    const L = (c && c.licence) || {};
    if (L.free) return L.credit ? `free to use with a credit (${L.name || L.label || 'Creative Commons'})` : `free to use (${L.name || L.label || 'free licence'})`;
    return `NOT free to use – ${L.label || L.name || 'standard licence'}: needs the owner’s permission`;
  }
  /** About how big a clip's download is (the file the size setting would take; a guess from its length when the site doesn't say). */
  function sizeOf(c, size = '1080') {
    try { const f = B().pickFiles(c.files || [], B().sizeSide(size)).file; if (f && +f.size > 0) return +f.size; } catch (e) { /* guessed below */ }
    return Math.round((+c.duration > 0 ? +c.duration : 30) * 1.2 * 1024 * 1024);
  }
  /** One row the AI reads for a found clip. */
  function brollRow(id, term, c) {
    return [id, clip(term, 30), clip(c.title || c.id, 60), c.sourceName || c.source, c.duration ? fmtT(c.duration) : '?', c.width && c.height ? `${c.width}×${c.height}` : c.height ? `${c.height}p` : '?', licenceWords(c), c.author ? clip(c.author, 30) : ''].join('\t');
  }
  /**
   * The best n of each request's clips for a select reel: free-to-use first, then closer to full HD or larger, then a
   * useful length (5 s – 2 min before very short or very long). list: [{id, term, clip}] -> the chosen, in search order.
   */
  function bestOf(list, n = 3) {
    const score = c => (c.licence && c.licence.free ? 4 : 0) + (Math.min(c.width || 0, c.height || 0) >= 1080 || (c.height || 0) >= 1080 ? 2 : Math.min(c.width || 0, c.height || 0) >= 720 ? 1 : 0) + (c.duration >= 5 && c.duration <= 120 ? 1 : 0);
    const by = new Map();
    for (const x of list) { if (!by.has(x.term)) by.set(x.term, []); by.get(x.term).push(x); }
    const out = [];
    for (const xs of by.values()) out.push(...xs.map((x, i) => ({ x, i, s: score(x.clip) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, Math.max(1, n)).sort((a, b) => a.i - b.i).map(y => y.x));
    return out;
  }
  /** Why a download should stop and warn even with Always proceed: [{id, text}] ([] = it needn't). */
  function downloadReasons(picks, size = '1080') {
    const out = [], notFree = picks.filter(p => !(p.clip.licence && p.clip.licence.free)), bytes = picks.reduce((n, p) => n + sizeOf(p.clip, size), 0);
    if (notFree.length) out.push({ id: 'licence', text: `${notFree.length === picks.length ? (picks.length === 1 ? 'This clip is' : `All ${picks.length} clips are`) : `${notFree.length} of the ${picks.length} clips ${notFree.length === 1 ? 'is' : 'are'}`} not free to use (${[...new Set(notFree.map(p => (p.clip.licence && (p.clip.licence.label || p.clip.licence.name)) || `${p.clip.sourceName}’s standard licence`))].slice(0, 3).join(', ')}): you need the owner’s permission to use ${notFree.length === 1 ? 'it' : 'them'} in a film.` });
    if (bytes > LIMITS.bigDownload) out.push({ id: 'download', text: `It is a large download – about ${mb(bytes)}.` });
    else if (picks.length > LIMITS.manyDownloads) out.push({ id: 'download', text: `It downloads ${picks.length} clips in one go (about ${mb(bytes)}).` });
    return out;
  }
  /** "V2" / "a1" / 3 -> {kind: 'video'|'audio', index (0-based)} or null. */
  function trackOf(t, fallback = 'V2') {
    const m = /^\s*([VA])\s*(\d+)\s*$/i.exec(String(t == null || t === '' ? fallback : t));
    return m && +m[2] >= 1 && +m[2] <= 40 ? { kind: m[1].toUpperCase() === 'A' ? 'audio' : 'video', index: +m[2] - 1 } : null;
  }
  /** When a follow-up is for: {minutes | seconds | at: "HH:MM"} -> ms from `now`, or 0 when it can't be read. */
  function delayOf(a, now = Date.now()) {
    if (+a.seconds > 0 || +a.minutes > 0 || +a.hours > 0) return Math.round(((+a.hours || 0) * 3600 + (+a.minutes || 0) * 60 + (+a.seconds || 0)) * 1000);
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?\s*$/i.exec(String(a.at || ''));
    if (!m) return 0;
    let hh = +m[1]; const mm = +m[2];
    if (m[3]) { if (/pm/i.test(m[3]) && hh < 12) hh += 12; if (/am/i.test(m[3]) && hh === 12) hh = 0; }
    if (hh > 23 || mm > 59) return 0;
    const d = new Date(now); d.setHours(hh, mm, 0, 0);
    let t = d.getTime(); if (t <= now) t += 24 * 3600 * 1000;
    return t - now;
  }
  const inWords = ms => (ms >= 90 * 60000 ? `${Math.round(ms / 360000) / 10} hours` : ms >= 90000 ? `${Math.round(ms / 60000)} minutes` : `${Math.max(1, Math.round(ms / 1000))} seconds`);
  /** The media files in a folder, newest first: [{file, name, size, at}] (sub-folders too when deep). */
  function mediaIn(dir, { deep = false, max = 2000 } = {}) {
    const out = [];
    (function walk(d, depth) {
      let names = []; try { names = fs.readdirSync(d); } catch (e) { return; }
      for (const n of names) {
        if (out.length >= max || n[0] === '.') continue;
        const f = path.join(d, n); let st = null; try { st = fs.statSync(f); } catch (e) { continue; }
        if (st.isDirectory()) { if (deep && depth < 4) walk(f, depth + 1); }
        else if (MEDIA.test(n) && st.size > 0 && !/\.part(\.[a-z0-9]+)?$/i.test(n)) out.push({ file: f, name: n, size: st.size, at: Math.max(st.mtimeMs || 0, st.birthtimeMs || 0) });
      }
    })(dir, 0);
    return out.sort((a, b) => b.at - a.at);
  }
  const partsIn = dir => { try { return fs.readdirSync(dir).filter(n => /\.(part|ytdl|tmp|crdownload)(\.[a-z0-9]+)?$/i.test(n)).length; } catch (e) { return 0; } };

  /* ---------- what a chat remembers between steps ---------- */
  /** Project clips it has been shown get short ids (f1, f2…) for the next step. items: [{id, name, bin, path, kind}] */
  function remember(chat, items) {
    const F = (chat._found = chat._found || { n: 0, byItem: new Map(), byId: new Map() });
    return items.map(it => {
      let id = F.byItem.get(it.id);
      if (!id) { id = 'f' + (++F.n); F.byItem.set(it.id, id); }
      F.byId.set(id, it);
      return id;
    });
  }
  /** A clip the AI names: an f… id, or (failing that) an exact name among the ones it has been shown. */
  function recall(chat, want) {
    const F = chat._found, w = String(want || '').trim();
    if (!F || !w) return null;
    if (F.byId.has(w)) return F.byId.get(w);
    const hits = Array.from(F.byId.values()).filter(x => String(x.name).toLowerCase() === w.toLowerCase());
    return hits.length === 1 ? hits[0] : null;
  }
  const projectDir = () => { const pr = US.ctx && US.ctx.project && US.ctx.project.path; return pr ? path.dirname(pr) : ''; };
  /** Folders it may look into without being told: the project's own, the B-roll and Download folders, and ones it made. */
  function knownFolders(chat) {
    const out = [];
    const add = (p, what) => { if (p && !out.some(x => x.path === p)) out.push({ path: p, what }); };
    try { add(B() && B().defaultFolder(), 'B-roll finder’s usual folder'); } catch (e) { /* none */ }
    try { const o = US.settings.get('brollfinder', {}) || {}; add(o.folder, 'the folder chosen in the B-roll finder'); } catch (e) { /* none */ }
    try { const y = US.settings.get('youtube', {}) || {}; add(y.folder, 'the Download tab’s folder'); } catch (e) { /* none */ }
    for (const f of (chat && chat._folders) || []) add(f, 'downloaded to in this chat');
    add(projectDir(), 'the project’s folder');
    return out;
  }
  /** May this chat list that folder? Yes for a known one (or inside one), or one the editor typed in the chat. */
  function mayRead(chat, dir) {
    const norm = p => path.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase(), d = norm(dir);
    if (knownFolders(chat).some(k => d === norm(k.path) || d.startsWith(norm(k.path) + path.sep))) return true;
    const said = ((chat && chat.items) || []).filter(x => x.k === 'me' && !x.auto).map(x => String(x.text).toLowerCase().replace(/\\/g, '/')).join('\n');
    return said.includes(d.replace(/\\/g, '/'));
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => (US.app && US.app.is && US.app.is('resolve') ? 'resolve' : 'premiere');

  /* ---------- the tools ---------- */
  const T = {};

  T['broll.search'] = {
    available: () => !!(B() && B().search),
    desc: 'Search the web for B-roll (stock footage) – the same places as the B-roll finder (Pexels, Pixabay, Wikimedia Commons, YouTube…), run here in the background; nothing is downloaded: args {"requests":["big container ships at sea","harbour cranes at dusk"],"aim":8,"freeOnly":true,"sources":["youtube"] (leave out for the editor’s usual places),"shape":"any|16:9|9:16|1:1|4:5","minSide":0|720|1080|2160,"maxSeconds":600}. One request per kind of shot, in plain words. Set "freeOnly" false only when the editor asks for a place whose videos are mostly not free to use (ordinary YouTube). Returns clips with ids (b1…): what was searched, title, source, length, size, licence. Choose from them yourself by title, length, size and licence (you can’t see the pictures), then call broll.download.',
    risk: 'ai', title: a => `Search for B-roll: ${arr(a.requests || a.request || a.query).slice(0, 3).map(x => `“${clip(x, 30)}”`).join(', ') || '…'}`,
    run: async (a, x) => {
      const requests = arr(a.requests || a.request || a.query).map(String).map(s => s.trim()).filter(Boolean).slice(0, 8);
      if (!requests.length) return 'ERROR: give "requests" – what the footage should show.';
      const o = Object.assign({}, US.settings.get('brollfinder', {}) || {}, { requests, aim: Math.max(1, Math.min(20, +a.aim || 8)) });
      if (a.freeOnly != null) o.freeOnly = !!a.freeOnly;
      if (Array.isArray(a.sources) && a.sources.length) { const want = a.sources.map(s => String(s).toLowerCase()); o.sources = {}; for (const s of B().SOURCES) o.sources[s.id] = want.includes(s.id) || want.includes(String(s.name).toLowerCase()); }
      if (a.shape) o.shape = a.shape;
      if (a.minSide != null) o.minSide = +a.minSide || 0;
      if (a.maxSeconds != null) o.maxLen = +a.maxSeconds || 0;
      const r = await B().search(x.job, o);
      const store = (x.chat._broll = x.chat._broll || { n: 0, byId: new Map(), last: [] });
      store.last = [];
      const lines = [];
      for (const res of r.results) {
        for (const c of res.clips) { const id = 'b' + (++store.n); store.byId.set(id, { id, term: res.term, clip: c }); store.last.push(id); lines.push(brollRow(id, res.term, c)); }
        for (const n of res.notes || []) lines.push(`NOTE (${clip(res.term, 30)}): ${n}`);
        if (!res.clips.length) lines.push(`NOTHING for “${res.term}”${o.freeOnly ? ' that is free to use – try other words, or (only if the editor wants that place) freeOnly false' : ' – try other words'}.`);
      }
      x.note(r.summary);
      return `${r.summary}. Clips (id, searched for, title, source, length, size, licence, by):\n${lines.join('\n')}\nNothing is downloaded yet: choose, then broll.download with their ids (or "best": n for the best n of each request).`;
    }
  };

  T['broll.download'] = {
    available: () => !!(B() && B().run),
    desc: 'Download B-roll you found with broll.search and (if asked) put it in a bin: args {"ids":["b2","b5"] or "best":3 (the best 3 of each request of your last search: free-to-use first, then size, then a useful length),"folder":"a folder name inside the project’s B-roll folder, or a full path the editor gave – leave out for the usual place","bin":"the bin to put them in, e.g. Big boats – leave out to only download","size":"720|1080|2160|max"}. Each search’s clips go in a folder named after the search, with a list of sources and licences beside them. The editor sees your picks on a card and can untick any; they are warned when a pick is not free to use or the download is large. Returns the files, the folder, the bin and the clips’ ids (f…) to use with place, move or find.',
    risk: 'out', title: a => `Download ${a.ids && a.ids.length ? US.plural(a.ids.length, 'B-roll clip') : `the best ${+a.best || 3} B-roll clips of each search`}${a.bin ? ` into the bin “${clip(a.bin, 30)}”` : ''}`,
    hands: true,
    before: async (a, x) => {
      const S = x.chat._broll;
      if (!S || !S.byId.size) return { error: 'ERROR: nothing has been searched for in this chat yet – call broll.search first.' };
      let picks = arr(a.ids).map(String).map(id => S.byId.get(id)).filter(Boolean);
      const unknown = arr(a.ids).map(String).filter(id => !S.byId.has(id));
      if (!picks.length && !(a.ids && a.ids.length)) picks = bestOf(S.last.map(id => S.byId.get(id)), Math.max(1, Math.min(10, +a.best || 3)));
      if (!picks.length) return { error: `ERROR: none of those ids are clips from your searches (${unknown.join(', ')}). Use ids from broll.search.` };
      const size = ['720', '1080', '2160', 'max'].includes(String(a.size)) ? String(a.size) : (US.settings.get('brollfinder', {}) || {}).size || '1080';
      const base = B().defaultFolder(), folder = a.folder ? (path.isAbsolute(String(a.folder)) ? String(a.folder) : path.join(base, B().safeName(String(a.folder)))) : ((US.settings.get('brollfinder', {}) || {}).folder || base);
      const bytes = picks.reduce((n, p) => n + sizeOf(p.clip, size), 0);
      return {
        state: { picks, size, folder, bin: String(a.bin || '').trim(), unknown },
        info: { extra: downloadReasons(picks, size), thenCard: true },
        card: { kind: 'picks', always: false,
          items: picks.map(p => ({ id: p.id, label: p.clip.title || p.clip.id, sub: `${p.clip.sourceName}${p.clip.duration ? ` · ${fmtT(p.clip.duration)}` : ''}${p.clip.width && p.clip.height ? ` · ${p.clip.width}×${p.clip.height}` : ''} · about ${mb(sizeOf(p.clip, size))} · ${licenceWords(p.clip)}`, thumb: p.clip.thumb || '', link: p.clip.page || '', warn: !(p.clip.licence && p.clip.licence.free) })),
          detail: `${US.plural(picks.length, 'clip')}, about ${mb(bytes)} in all, into ${folder} (a folder for each search, with a list of sources and licences).${a.bin ? `\nThen into the bin “${String(a.bin).trim()}”.` : '\nNot added to the project (no bin was asked for).'}\nUntick any you don’t want.` }
      };
    },
    run: async (a, x) => {
      const st = x.state, keep = x.ok && Array.isArray(x.ok.items) ? new Set(x.ok.items) : null;
      const picks = keep ? st.picks.filter(p => keep.has(p.id)) : st.picks;
      if (!picks.length) return 'The editor unticked every clip: nothing was downloaded.';
      const r = await B().run(x.job, { picks: picks.map(p => ({ term: p.term, clip: p.clip })), folder: st.folder, toBin: false, size: st.size });
      (x.chat._folders = x.chat._folders || []).push(r.root, ...r.folders);
      x.journal({ kind: 'cant', text: `${US.plural(r.done.filter(d => !d.was).length, 'downloaded file')} in “${r.root}” stay on the disk` });
      let binLine = '', ids = [];
      if (st.bin && r.done.length) {
        x.job.set({ who: editor(), msg: `Adding them to the bin “${st.bin}”` });
        const got = arr(await US.host.call('importFiles', { paths: r.done.map(d => d.file), binPath: st.bin.replace(/\s*\/\s*/g, '/') }));
        ids = remember(x.chat, got.filter(Boolean).map(g => ({ id: g.id, name: g.name, bin: st.bin, path: g.path || '', kind: 'video', duration: g.duration || 0 })));
        binLine = `\nIn the bin “${st.bin}”: ${ids.length} clips – ${got.filter(Boolean).map((g, i) => `${ids[i]} ${g.name}${g.duration ? ` (${fmtT(g.duration)})` : ''}`).join('; ')}.`;
        if (got.length) x.journal({ kind: 'cant', text: `${US.plural(got.length, 'clip')} added to the bin “${st.bin}” stay in the project (delete them there if you don’t want them)` });
      }
      x.note(r.summary);
      const need = r.done.filter(d => !(d.clip.licence && d.clip.licence.free));
      return `${r.summary}.${keep && picks.length < st.picks.length ? ` The editor unticked ${st.picks.length - picks.length}.` : ''}\nFolder: ${r.root}\nFiles: ${r.done.map(d => `${path.basename(d.file)}${d.was ? ' (was already there)' : ''}`).join('; ') || '(none)'}${r.failed.length ? `\nDidn’t download: ${r.failed.map(f => `${f.clip ? f.clip.title : f.term} – ${f.why}`).join('; ')}` : ''}${binLine}${need.length ? `\nTELL THE EDITOR: ${need.length} of these ${need.length === 1 ? 'is' : 'are'} not free to use – permission is needed before ${need.length === 1 ? 'it goes' : 'they go'} in a film (the list beside the files says which).` : ''}${st.unknown.length ? `\nUnknown ids left out: ${st.unknown.join(', ')}.` : ''}`;
    }
  };

  T.download = {
    available: () => !!(US.youtube && US.youtube.run),
    desc: 'Download videos from links the editor gave (YouTube, Vimeo and the other sites the Download tab knows), in the background, and (if asked) put them in a bin: args {"links":["https://…"],"folder":"a full path – leave out for the Download tab’s folder","bin":"the bin to put them in – leave out to only download"}. Only links the editor typed or that a tool returned. They are always warned first: videos from the web usually need the owner’s permission.',
    risk: 'out', title: a => `Download ${US.plural(arr(a.links).length, 'video')} from the web${a.bin ? ` into the bin “${clip(a.bin, 30)}”` : ''}`,
    before: async (a, x) => {
      const links = US.youtube.parseLinks ? US.youtube.parseLinks(arr(a.links).join('\n')) : arr(a.links).filter(l => /^https?:\/\//i.test(l));
      if (!links.length) return { error: 'ERROR: give "links" – web addresses of the videos.' };
      const y = US.settings.get('youtube', {}) || {}, folder = a.folder && path.isAbsolute(String(a.folder)) ? String(a.folder) : (y.folder || (B() ? path.join(path.dirname(B().defaultFolder()), 'Downloads') : ''));
      return { state: { links, folder, bin: String(a.bin || '').trim() }, info: { extra: [{ id: 'licence', text: 'Videos from the web usually belong to someone: you need the owner’s permission to use them in a film.' }], thenCard: false },
        card: { detail: `${links.slice(0, 8).join('\n')}${links.length > 8 ? `\n…and ${links.length - 8} more` : ''}\nInto ${folder || 'the Download tab’s folder'}.${a.bin ? ` Then into the bin “${String(a.bin).trim()}”.` : ''}` } };
    },
    run: async (a, x) => {
      const st = x.state, y = US.settings.get('youtube', {}) || {};
      const r = await US.youtube.run(x.job, { links: st.links, folder: st.folder || undefined, toBin: false, quality: 'premiere', playlist: false, signIn: y.signIn || 'off', browser: y.browser, cookies: y.cookies });
      const files = arr(r && r.done).flatMap(d => arr(d.files));
      if (st.folder) (x.chat._folders = x.chat._folders || []).push(st.folder);
      if (files.length) x.journal({ kind: 'cant', text: `${US.plural(files.length, 'downloaded file')} stay on the disk` });
      let binLine = '';
      if (st.bin && files.length) { const got = arr(await US.host.call('importFiles', { paths: files, binPath: st.bin.replace(/\s*\/\s*/g, '/') })).filter(Boolean); const ids = remember(x.chat, got.map(g => ({ id: g.id, name: g.name, bin: st.bin, path: g.path || '', kind: 'video', duration: g.duration || 0 }))); binLine = `\nIn the bin “${st.bin}”: ${got.map((g, i) => `${ids[i]} ${g.name}`).join('; ')}.`; }
      const sum = `${US.plural(files.length, 'file')} downloaded${arr(r && r.failed).length ? ` · ${r.failed.length} didn’t download` : ''}`;
      x.note(sum);
      return `${sum}.\nFiles: ${files.map(f => path.basename(f)).join('; ') || '(none)'}${files[0] ? `\nFolder: ${path.dirname(files[0])}` : ''}${arr(r && r.failed).length ? `\nDidn’t download: ${r.failed.map(f => `${f.url} – ${f.why}`).join('; ')}` : ''}${binLine}`;
    }
  };

  T.bins = {
    desc: 'The project’s bins with how many clips and bins are directly in each – for a big project, where reading the whole project is too long: args {"filter":"part of a bin’s name or path – leave out for all","page":1}. 200 a page. Free.',
    risk: 'read', title: a => (a.filter ? `Look for bins called “${clip(a.filter, 30)}”` : 'List the bins'),
    run: async (a, x) => {
      const page = Math.max(1, +a.page || 1), r = (await US.host.call('askBins', { filter: String(a.filter || ''), offset: (page - 1) * 200, limit: 200 })) || {};
      const bins = arr(r.bins);
      x.note(`${US.plural(r.total || bins.length, 'bin')}${a.filter ? ` matching “${clip(a.filter, 30)}”` : ''}`);
      if (!bins.length) return a.filter ? `There is no bin with “${a.filter}” in its name. Make one with makebin.` : 'The project has no bins.';
      return `${r.total} bins${a.filter ? ` matching “${a.filter}”` : ''}${r.total > bins.length ? ` – page ${page} of ${Math.ceil(r.total / 200)}` : ''} (path, clips directly in it, bins in it):\n${bins.map(b => `${b.path}\t${b.clips}\t${b.bins}`).join('\n')}`;
    }
  };

  T.find = {
    desc: 'Find clips in the project by part of their name, of their file’s path on disk (a folder name works), or of their bin – for a big project, or to find where something went: args {"name":"boat","file":"big ships at sea","bin":"B-roll","kind":"video|audio|still|sequence","page":1}. Give at least one of name, file or bin. Returns ids (f…) with name, kind, bin and file. Free.',
    risk: 'read', title: a => `Find clips${a.name ? ` named “${clip(a.name, 30)}”` : ''}${a.file ? ` from “${clip(a.file, 30)}”` : ''}${a.bin ? ` in “${clip(a.bin, 30)}”` : ''}`,
    run: async (a, x) => {
      if (!a.name && !a.file && !a.bin) return 'ERROR: give "name", "file" or "bin" (part of it is enough). To see everything, read the project.';
      const page = Math.max(1, +a.page || 1), kinds = ['video', 'audio', 'still', 'sequence'].includes(a.kind) ? [a.kind] : null;
      const r = (await US.host.call('askFind', { name: String(a.name || ''), path: String(a.file || ''), bin: String(a.bin || ''), kinds, offset: (page - 1) * 200, limit: 200 })) || {};
      const items = arr(r.items), ids = remember(x.chat, items);
      x.note(`${US.plural(r.total || 0, 'clip')} found`);
      if (!items.length) return 'Nothing in the project matches. If the files are on the disk but not in the project, look with "files" and bring them in with "import".';
      return `${r.total} clips${r.total > items.length ? ` – page ${page} of ${Math.ceil(r.total / 200)}` : ''} (id, name, kind, bin, file):\n${items.map((it, i) => `${ids[i]}\t${it.name}\t${it.kind}\t${it.bin}\t${it.path ? path.basename(path.dirname(it.path)) + '/' + path.basename(it.path) : ''}`).join('\n')}`;
    }
  };

  T.recent = {
    desc: 'What is new in the project: clips that came in since this chat started (or whose files were made in the last while) – to find what the editor, or you, just imported or downloaded: args {"minutes":60 (leave out for “since this chat started”)}. Returns ids (f…) with name, bin and file. Free.',
    risk: 'read', title: a => (+a.minutes > 0 ? `Look for clips new in the last ${inWords(+a.minutes * 60000)}` : 'Look for clips new since this chat started'),
    run: async (a, x) => {
      const since = +a.minutes > 0 ? Date.now() - +a.minutes * 60000 : x.chat.at || Date.now() - 3600000;
      const r = (await US.host.call('askFind', { limit: 6000 })) || {}, all = arr(r.items), seen = x.chat._seen;
      const fresh = [];
      for (const it of all) {
        if (seen && !seen.has(it.id)) { fresh.push(it); continue; }
        if (!it.path || it.kind === 'sequence') continue;
        try { const st = fs.statSync(it.path); if (Math.max(st.birthtimeMs || 0, st.mtimeMs || 0) >= since) fresh.push(it); } catch (e) { /* not on this disk */ }
      }
      const show = fresh.slice(0, 200), ids = remember(x.chat, show);
      x.note(`${US.plural(fresh.length, 'new clip')}`);
      if (!fresh.length) return `Nothing new in the project ${+a.minutes > 0 ? `in the last ${inWords(+a.minutes * 60000)}` : 'since this chat started'} (${all.length} clips looked at). If files were downloaded but not put in the project, look on the disk with "files" – then "import" them.`;
      return `${fresh.length} new clips${fresh.length > show.length ? ` (the first ${show.length})` : ''} (id, name, kind, bin, file):\n${show.map((it, i) => `${ids[i]}\t${it.name}\t${it.kind}\t${it.bin}\t${it.path ? path.basename(path.dirname(it.path)) + '/' + path.basename(it.path) : ''}`).join('\n')}`;
    }
  };

  T.files = {
    hands: false,
    desc: 'Look on the disk for footage that is not in the project yet – where downloads went: args {"folder":"a full path – leave out to list the places Ultra Studio downloads to and the project’s folder, with what is in each"}. Lists the media files in it and in its folders, newest first. Only those places, or a folder the editor named in this chat. Free.',
    risk: 'read', title: a => (a.folder ? `Look in the folder “${clip(path.basename(String(a.folder)), 40)}”` : 'Look where downloads go'),
    run: async (a, x) => {
      if (!a.folder) {
        const places = knownFolders(x.chat).map(k => { const m = mediaIn(k.path, { deep: true, max: 500 }); return `${k.path}\t${k.what}\t${m.length}${m.length >= 500 ? '+' : ''} media files${m[0] ? `, newest ${new Date(m[0].at).toLocaleString('en-GB')} (${path.relative(k.path, m[0].file)})` : ''}`; });
        x.note(`${US.plural(places.length, 'place')} looked at`);
        return `Places footage is downloaded to (path, what it is, what is in it):\n${places.join('\n') || '(none known)'}\nGive one as "folder" to list its files; "import" brings a folder into a bin.`;
      }
      const dir = String(a.folder);
      if (!mayRead(x.chat, dir)) return `Not looked at: “${dir}” isn’t one of Ultra Studio’s folders and the editor hasn’t named it in this chat. Ask them for the folder.`;
      if (!fs.existsSync(dir)) return `There is no folder “${dir}”.`;
      const m = mediaIn(dir, { deep: true, max: 400 });
      x.note(`${US.plural(m.length, 'media file')} in “${path.basename(dir)}”`);
      if (!m.length) return `No media files in “${dir}”${partsIn(dir) ? ' yet – a download is still being written there' : ''}.`;
      return `${m.length}${m.length >= 400 ? '+' : ''} media files in “${dir}”, newest first (file, size, when)${partsIn(dir) ? ' – a download is still being written there' : ''}:\n${m.slice(0, 120).map(f => `${path.relative(dir, f.file)}\t${mb(f.size)}\t${new Date(f.at).toLocaleString('en-GB')}`).join('\n')}${m.length > 120 ? `\n…and ${m.length - 120} more` : ''}`;
    }
  };

  T.makebin = {
    desc: 'Make a bin – it can be empty: args {"bin":"Big boats" or a path like "B-roll/Big boats"}. If it is already there nothing changes.',
    risk: 'new', title: a => `Make the bin “${clip(a.bin || a.path, 40)}”`, detail: () => 'A new, empty bin. Nothing else changes.',
    run: async (a, x) => {
      const p = String(a.bin || a.path || '').replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '').trim();
      if (!p) return 'ERROR: give the bin’s name in "bin".';
      await US.host.call('ensureBin', { path: p });
      x.note(`The bin “${p}” is there`);
      return `The bin “${p.split('/').join(' / ')}” is there now (empty unless it already existed). Put clips in it with move, import or broll.download.`;
    }
  };

  T.move = {
    desc: 'Move project clips into a bin (made if it isn’t there): args {"clips":["f3","f4"] (ids from find, recent, import or a download),"bin":"Big boats"}. Undo puts them back where they were.',
    risk: 'own', title: a => `Move ${US.plural(arr(a.clips).length, 'clip')} to the bin “${clip(a.bin, 30)}”`,
    hands: true,
    before: async (a, x) => {
      const bin = String(a.bin || '').replace(/\s*\/\s*/g, '/').trim();
      if (!bin) return { error: 'ERROR: give the bin in "bin".' };
      const items = arr(a.clips).map(w => recall(x.chat, w)).filter(Boolean), missing = arr(a.clips).filter(w => !recall(x.chat, w));
      if (!items.length) return { error: `ERROR: none of those are clips you have been shown (${missing.slice(0, 6).join(', ')}). Use f… ids from find, recent or import.` };
      return { state: { items, bin, missing }, info: { extra: items.length > LIMITS.moveMany ? [{ id: 'many', text: `It moves ${items.length} clips in one go.` }] : [] },
        card: { detail: `${items.slice(0, 12).map(i => i.name).join(', ')}${items.length > 12 ? ` and ${items.length - 12} more` : ''}\nInto the bin “${bin.split('/').join(' / ')}”. Undo puts them back.` } };
    },
    run: async (a, x) => {
      const { items, bin, missing } = x.state;
      await US.host.call('moveItems', { ids: items.map(i => i.id), binPath: bin });
      // Undo puts each back in the bin it came from; a clip that was in no bin can't be sent back to “no bin” from a script – said plainly
      const back = items.map(i => ({ id: i.id, bin: i.bin && i.bin !== '(Project root)' ? i.bin : '' })).filter(i => i.bin), loose = items.length - back.length;
      if (back.length) x.journal({ kind: 'items', undo: [{ op: 'move', items: back }] });
      if (loose) x.journal({ kind: 'cant', text: `${US.plural(loose, 'clip')} that ${loose === 1 ? 'was' : 'were'} in no bin ${loose === 1 ? 'stays' : 'stay'} in “${bin.split('/').join(' / ')}” (drag ${loose === 1 ? 'it' : 'them'} out by hand)` });
      for (const i of items) i.bin = bin.split('/').join(' / ');
      x.note(`${US.plural(items.length, 'clip')} moved to “${bin}”`);
      return `${items.length} clips are in the bin “${bin.split('/').join(' / ')}” now.${missing.length ? ` Not known, left out: ${missing.join(', ')}.` : ''}`;
    }
  };

  T.import = {
    desc: 'Bring files on the disk into the project, into a bin (made if it isn’t there): args {"folder":"a full path – every media file in it and its folders","files":["full paths"],"bin":"Big boats"}. Give "folder" or "files". Only Ultra Studio’s own folders, or one the editor named in this chat. A file already in the project isn’t brought in twice. Returns the clips’ ids (f…).',
    risk: 'new', title: a => `Bring ${a.folder ? `the folder “${clip(path.basename(String(a.folder)), 30)}”` : US.plural(arr(a.files).length, 'file')} into the bin “${clip(a.bin || 'JMG Ultra Studio/Imported', 30)}”`,
    before: async (a, x) => {
      const bin = String(a.bin || 'JMG Ultra Studio/Imported').replace(/\s*\/\s*/g, '/').trim();
      let files = [];
      if (a.folder) {
        const dir = String(a.folder);
        if (!mayRead(x.chat, dir)) return { error: `Not done: “${dir}” isn’t one of Ultra Studio’s folders and the editor hasn’t named it in this chat. Ask them for the folder.` };
        if (!fs.existsSync(dir)) return { error: `There is no folder “${dir}”.` };
        files = mediaIn(dir, { deep: true, max: LIMITS.importMax + 1 }).map(f => f.file).sort();
      } else {
        files = arr(a.files).map(String).filter(f => MEDIA.test(f));
        const bad = files.filter(f => !mayRead(x.chat, path.dirname(f)));
        if (bad.length) return { error: `Not done: ${bad.length === 1 ? `“${bad[0]}” isn’t` : `${bad.length} of those files aren’t`} in one of Ultra Studio’s folders or one the editor named in this chat.` };
        files = files.filter(f => fs.existsSync(f));
      }
      if (!files.length) return { error: 'There are no media files there to bring in.' };
      const over = files.length > LIMITS.importMax; if (over) files = files.slice(0, LIMITS.importMax);
      return { state: { files, bin, over }, card: { detail: `${US.plural(files.length, 'file')}${over ? ` (the first ${LIMITS.importMax})` : ''}: ${files.slice(0, 8).map(f => path.basename(f)).join(', ')}${files.length > 8 ? ` and ${files.length - 8} more` : ''}\nInto the bin “${bin.split('/').join(' / ')}”. The files stay where they are on the disk.` } };
    },
    run: async (a, x) => {
      const { files, bin, over } = x.state;
      x.job.set({ who: editor(), msg: `Bringing ${US.plural(files.length, 'file')} into the bin “${bin}”` });
      const got = arr(await US.host.call('importFiles', { paths: files, binPath: bin })).filter(Boolean);
      const ids = remember(x.chat, got.map(g => ({ id: g.id, name: g.name, bin: bin.split('/').join(' / '), path: g.path || '', kind: 'video', duration: g.duration || 0 })));
      const fresh = got.filter(g => !g.existing).length;
      if (fresh) x.journal({ kind: 'cant', text: `${US.plural(fresh, 'clip')} brought into the bin “${bin}” stay in the project (delete them there if you don’t want them)` });
      x.note(`${US.plural(fresh, 'clip')} brought in${got.length - fresh ? ` · ${got.length - fresh} were already in the project` : ''}`);
      return `${fresh} clips brought into the bin “${bin.split('/').join(' / ')}”${got.length - fresh ? `; ${got.length - fresh} were already in the project (shown where they are)` : ''}${over ? `; only the first ${LIMITS.importMax} files were taken – import the rest again` : ''}:\n${got.map((g, i) => `${ids[i]}\t${g.name}${g.duration ? `\t${fmtT(g.duration)}` : ''}`).join('\n')}`;
    }
  };

  T.place = {
    desc: 'Put project clips into a sequence at given times, on a given track – B-roll over a string-out, a cover for each jump cut, a logo, music under a cut. Always on a copy of the sequence (or on the sequence you already made), never the editor’s own – or on a NEW sequence: args {"newSequence":"a name – makes a new sequence from these clips, laid one after another in the order given when a clip has no \"at\" (a select reel: give each a \"length\" so they add up to the length wanted)","sequence":"an s… id or name – leave out for your working sequence or the open one","clips":[{"clip":"f3 (an id from find, recent, import or a download)","at":12.5 (seconds in the sequence),"length":4 (seconds – leave out for the whole clip),"from":0 (where in the clip to start),"track":"V2","sound":false}]}. Picture goes on video tracks (V2 and up lies over V1), a clip with only sound on audio tracks ("A2"); "sound": true brings a video’s own sound too. Read the timeline first for the times; read it again afterwards to check.',
    risk: 'new', title: a => (a.newSequence ? `Build the new sequence “${clip(a.newSequence, 40)}” from ${US.plural(arr(a.clips).length, 'clip')}` : `Put ${US.plural(arr(a.clips).length, 'clip')} into ${a.sequence ? `“${clip(a.sequence, 30)}”` : 'the sequence'}, on a copy`),
    hands: true,
    before: async (a, x) => {
      const want = arr(a.clips).slice(0, LIMITS.placeMax), bad = [];
      if (!want.length) return { error: 'ERROR: give "clips": [{clip, at, length, track}].' };
      const fresh = String(a.newSequence || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60);
      const sq = fresh ? { seqId: '', name: fresh } : await x.seqFor(a.sequence); if (sq.error) return { error: sq.error };
      const list = [];
      for (const w of want) {
        const it = recall(x.chat, w && (w.clip || w.id)), tr = trackOf(w && w.track, fresh ? 'V1' : 'V2');
        if (!it) { bad.push(`${w && (w.clip || w.id)}: not a clip you have been shown`); continue; }
        if (!tr) { bad.push(`${it.name}: “${w.track}” isn’t a track (V1…, A1…)`); continue; }
        if (!fresh && !(+w.at >= 0)) { bad.push(`${it.name}: give "at" in seconds`); continue; }
        list.push({ it, tr, at: w.at != null && w.at !== '' && +w.at >= 0 ? +w.at : null, length: +w.length > 0 ? +w.length : 0, from: Math.max(0, +w.from || 0), sound: !!w.sound });
      }
      if (!list.length) return { error: `ERROR: nothing to place – ${bad.join('; ')}.` };
      const mine = !fresh && !!(x.chat.work && x.chat.work.ours && x.chat.work.seqId === sq.seqId);
      return { state: { list, bad, sq, mine, fresh }, card: { detail: `${list.slice(0, 10).map(c => `${c.it.name}${c.at != null ? ` at ${fmtT(c.at)}` : ''}${c.length ? ` for ${fmtT(c.length)}` : ''} on ${c.tr.kind === 'audio' ? 'A' : 'V'}${c.tr.index + 1}`).join('\n')}${list.length > 10 ? `\n…and ${list.length - 10} more` : ''}\n${fresh ? `In a new sequence “${fresh}”${list.some(c => c.length) ? ` – about ${fmtT(list.reduce((n, c) => n + (c.length || 0), 0))}` : ''}. Your clips and sequences aren’t changed.` : `On ${mine ? `“${sq.name}” (the copy this chat made)` : `a copy of “${sq.name}” (yours stays as it is)`}.`}` } };
    },
    run: async (a, x) => {
      const { list, bad, sq, mine, fresh } = x.state;
      let seqId = sq.seqId, name = sq.name;
      if (fresh) {
        x.job.set({ who: editor(), msg: `Making the sequence “${fresh}”` });
        const c = await US.host.call('newSequence', { name: `Ask – ${fresh}`, binPath: 'JMG Ultra Studio/Ask', likeId: list[0].it.id });
        seqId = c.id; name = c.name || `Ask – ${fresh}`;
        x.chat.work = { seqId, name, ours: true }; x.chat.versions.push({ seqId, name, why: 'built from your clips' });
        x.journal({ kind: 'seq', seqId, name });
      } else if (!mine) {
        x.job.set({ who: editor(), msg: 'Making a copy of the sequence to work on' });
        const c = await US.host.call('cloneSequence', { seqId, name: `${sq.name} – Ask`, binPath: 'JMG Ultra Studio/Ask' });
        seqId = c.id; name = c.name;
        x.chat.work = { seqId, name, ours: true }; x.chat.versions.push({ seqId, name, why: `copy of “${sq.name}”` });
        x.journal({ kind: 'seq', seqId, name });
      }
      const info = arr(await US.host.call('itemsInfo', { ids: list.map(c => c.it.id) })), done = [], failed = bad.slice();
      let cursor = 0;
      for (let i = 0; i < list.length; i++) {
        x.job.check();
        const c = list[i], inf = info[i] || {}, start = (inf.rangeStart || 0) + c.from, whole = (inf.rangeEnd || inf.duration || 0) - start, len = c.length > 0 ? (whole > 0.05 ? Math.min(c.length, whole) : c.length) : (whole > 0.05 ? whole : 5);
        x.job.set({ who: editor(), msg: `Placing “${c.it.name}”` }).progress(i / list.length, `${i + 1} of ${list.length}`);
        const audio = c.tr.kind === 'audio';
        try {
          const r = await US.host.call('placeClips', { seqId, clips: [{ id: c.it.id, in: start, out: start + len, at: c.at != null ? c.at : cursor, v: audio ? 0 : c.tr.index, a: audio ? c.tr.index : 0, video: !audio, audio: audio || c.sound }] });
          const got = r && r.placed && r.placed[0];
          if (got) cursor = Math.max(cursor, got.end);
          if (got) done.push(`${c.it.name}: ${fmtT(got.start)}–${fmtT(got.end)} on ${audio ? 'A' : 'V'}${c.tr.index + 1}`); else failed.push(`${c.it.name}: not placed`);
        } catch (e) { if (e && e.code === 'CANCELLED') throw e; failed.push(`${c.it.name}: ${(e && (e.title || e.message)) || e}`); }
      }
      await US.host.call('openSequence', { seqId }).catch(() => {});
      x.note(`${US.plural(done.length, 'clip')} placed in “${name}”${failed.length ? ` · ${failed.length} not placed` : ''}`);
      return `${done.length} placed in “${name}”${fresh ? ` (a new sequence, ${fmtT(cursor)} long, now your working sequence)` : mine ? '' : ` (a copy of “${sq.name}”, now your working sequence)`}:\n${done.join('\n') || '(none)'}${failed.length ? `\nNOT placed: ${failed.join('; ')}` : ''}\nRead the timeline to check.`;
    }
  };

  T.wait = {
    hands: false,
    desc: 'Wait for something to finish, then carry on – instead of telling the editor to come back: args {"for":"job|files|bin|seconds","job":"part of the running job’s name – leave out for whatever is running","folder":"a full path (for files: until media files are there and no download is still being written)","bin":"a bin’s name (for bin: until it has clips)","atLeast":1,"seconds":30,"timeoutMinutes":10}. It checks every few seconds; the editor sees what you are waiting for and can press Stop. At most 30 minutes – for longer, use "later". Returns what happened.',
    risk: 'read', title: a => ({ job: () => `Wait for ${a.job ? `“${clip(a.job, 30)}”` : 'the running job'} to finish`, files: () => `Wait for files in “${clip(path.basename(String(a.folder || '')), 30)}”`, bin: () => `Wait for clips in the bin “${clip(a.bin, 30)}”`, seconds: () => `Wait ${inWords((+a.seconds || 30) * 1000)}` }[a.for] || (() => 'Wait'))(),
    run: async (a, x) => {
      const kind = ['job', 'files', 'bin', 'seconds'].includes(a.for) ? a.for : 'job';
      const every = US.chat._waitEvery != null ? US.chat._waitEvery : LIMITS.waitEvery * 1000, limit = Math.min(LIMITS.waitMaxMin, Math.max(0.01, +a.timeoutMinutes || LIMITS.waitDefaultMin)) * 60000, need = Math.max(1, +a.atLeast || 1), t0 = Date.now();
      if (kind === 'files' && !(a.folder && mayRead(x.chat, String(a.folder)))) return `Not waited: “${a.folder || ''}” isn’t one of Ultra Studio’s folders or one the editor named in this chat.`;
      if (kind === 'bin' && !a.bin) return 'ERROR: give the bin’s name in "bin".';
      const what = { job: `${a.job ? `“${clip(a.job, 30)}”` : 'the running job'} to finish`, files: `${need > 1 ? `${need} files` : 'files'} in “${path.basename(String(a.folder || ''))}”`, bin: `${need > 1 ? `${need} clips` : 'clips'} in the bin “${a.bin}”`, seconds: inWords((+a.seconds || 30) * 1000) }[kind];
      x.waiting(what, Math.max(1, Math.round(every / 1000)));
      const check = async () => {
        if (kind === 'seconds') return Date.now() - t0 >= Math.min(limit, (+a.seconds || 30) * 1000) ? `${inWords(Date.now() - t0)} have passed.` : '';
        if (kind === 'job') { const j = US.jobs && US.jobs.current; return !j || (a.job && !String(j.title).toLowerCase().includes(String(a.job).toLowerCase())) ? `Nothing ${a.job ? `called “${a.job}” ` : ''}is running now${j ? ` (“${j.title}” is)` : ''}.` : ''; }
        if (kind === 'files') { const dir = String(a.folder), m = fs.existsSync(dir) ? mediaIn(dir, { deep: true, max: 500 }) : []; return m.length >= need && !partsIn(dir) ? `${m.length} media files are in “${dir}” and nothing is still being written: ${m.slice(0, 12).map(f => path.relative(dir, f.file)).join('; ')}${m.length > 12 ? '…' : ''}` : ''; }
        const r = (await US.host.call('askBins', { filter: String(a.bin), limit: 50 })) || {}, hit = arr(r.bins).filter(b => b.clips >= need).sort((p, q) => q.clips - p.clips)[0];
        return hit ? `The bin “${hit.path}” has ${hit.clips} clips.` : '';
      };
      for (;;) {
        x.job.check();
        let got = ''; try { got = await check(); } catch (e) { got = ''; }
        if (got) { x.note(`Waited ${inWords(Date.now() - t0)}`); return `${got} (Waited ${inWords(Date.now() - t0)}.)`; }
        if (Date.now() - t0 >= limit) { x.note(`Still waiting after ${inWords(limit)}`); return `Still not there after ${inWords(limit)} – waited for ${what}. Tell the editor, or set a follow-up with "later" and finish.`; }
        await sleep(Math.min(every, 1000));
        for (let w = 1000; w < every && !x.chat.stop; w += 1000) await sleep(Math.min(1000, every - w));
      }
    }
  };

  T.later = {
    hands: false,
    desc: 'Come back to this by yourself later – “check again in 30 minutes”, “start at 6 pm”: args {"minutes":30 (or "seconds", "hours", or "at":"18:00"),"then":"what you will do then, in full – you will be told exactly this"}. After calling it, call finish and say when you will be back. When the time comes you carry on in this chat by yourself, even if the editor is on another tab; they see a countdown and can cancel. Limits: a few follow-ups a chat, at most a day ahead; while on your own nothing risky runs (it waits for the editor) and spending is capped.',
    risk: 'read', title: a => `Come back ${a.at ? `at ${a.at}` : `in ${inWords(delayOf(a))}`}`,
    run: async (a, x) => {
      const ms = delayOf(a, US.chat.clock.now());
      if (!ms) return 'ERROR: say when – "minutes", "seconds", "hours" or "at":"HH:MM".';
      const f = US.chat.schedule(x.chat, { inMs: ms, text: String(a.then || '') });
      if (f.error) return `Not set: ${f.error}`;
      x.event({ k: 'followup', id: f.id, at: f.at, text: f.text, keep: true });
      x.note(`Set for ${new Date(f.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return `Set: in ${inWords(ms)} (${new Date(f.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}) you will carry on with: “${f.text}”. Now call finish and tell the editor when you will be back and what you will do.`;
    }
  };

  US.chatTools = Object.assign(US.chatTools || {}, T);
  /** For the first request of a chat: which clips the project has now, so “what’s new” can be told later. */
  async function seeProject(chat) {
    if (chat._seen || chat._seeing) return;
    chat._seeing = true;
    try { const r = await US.host.call('askFind', { idsOnly: true }); if (r && Array.isArray(r.ids)) chat._seen = new Set(r.ids); } catch (e) { /* “what’s new” goes by file dates then */ }
    chat._seeing = false;
  }
  US.chatAgent = { LIMITS, MEDIA, licenceWords, sizeOf, brollRow, bestOf, downloadReasons, trackOf, delayOf, inWords, mediaIn, remember, recall, knownFolders, mayRead, seeProject, tools: T };
})();
