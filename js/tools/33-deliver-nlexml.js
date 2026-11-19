/* JMG Ultra Studio – Deliver › Other editors: timelines between Premiere Pro, DaVinci Resolve and Final Cut Pro.
   Pure logic (unit-tested, no editor calls): a small XML reader/writer, and readers and writers for FCPXML (Final Cut
   Pro X / 11, 1.8–1.15 read, 1.10 written), FCP 7 XML ("xmeml", what Premiere reads and writes), CMX 3600 EDL and
   OpenTimelineIO (.otio JSON). Every reader makes the same plain timeline (below), every writer takes it, so any
   format converts to any other. What a format can't carry is listed in plain words (`lost`, `notes`).
   The tab is in 33-deliver-move.js. Research and sources: dev/docs/research-nle-exchange.md.

   The timeline (all times in whole frames of the timeline's rate, unless named Sec):
   { name, rate: {num, den}, drop, width, height, tcStart (frames), duration (frames),
     video: [{name, enabled, clips}], audio: [{name, enabled, clips}],
     markers: [{at, dur, name, note, colour, chapter}],       // timeline markers
     media: {id: {id, name, path, rate, tcStartSec: {n, d}, durationSec: {n, d} | null, hasVideo, hasAudio, channels, width, height}},
     lost: {what: count}, source }
   clip: { media (id), name, at, len, in (frames from the media's first frame), enabled, colour, gainDb, channel,
           link (clips with the same link are one clip's picture and sound), markers: [{at (from the clip's start), dur, name, note, colour}] } */
(function () {
  'use strict';
  const US = window.US = window.US || {};

  /* ---------- numbers: whole-number fractions, so 23.976 and 29.97 never drift ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const Q = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
  const qAdd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
  const qSub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
  const qNum = a => a.n / a.d;
  /** "1001/24000s", "3600s", "0s", "2.5s" → {n, d} */
  function parseTime(s) {
    s = String(s == null ? '0s' : s).trim().replace(/s$/, '');
    if (!s) return Q(0);
    if (s.includes('/')) { const [n, d] = s.split('/').map(Number); return Q(Math.round(n), Math.round(d) || 1); }
    if (s.includes('.')) { const dec = s.split('.')[1].length, d = Math.pow(10, dec); return Q(Math.round(Number(s) * d), d); }
    return Q(Number(s) || 0);
  }
  const fmtTime = q => (q.n === 0 ? '0s' : q.d === 1 ? `${q.n}s` : `${q.n}/${q.d}s`);
  /** a frame rate as a fraction: 25 → 25/1, 23.976 → 24000/1001, 29.97 → 30000/1001 */
  function rateOf(fps) {
    if (fps && typeof fps === 'object') return Q(fps.num || fps.n, fps.den || fps.d || 1);
    fps = Number(fps) || 25;
    const up = Math.round(fps * 1.001);
    if (Math.abs(fps - up * 1000 / 1001) < 0.005 && Math.abs(fps - Math.round(fps)) > 0.005) return { num: up * 1000, den: 1001 };
    if (Math.abs(fps - Math.round(fps)) < 0.005) return { num: Math.round(fps), den: 1 };
    const q = Q(Math.round(fps * 1000), 1000); return { num: q.n, den: q.d };
  }
  const R = r => (r.num !== undefined ? r : { num: r.n, den: r.d });
  const fpsOf = r => R(r).num / R(r).den;
  const timebase = r => Math.round(fpsOf(r));
  const isNtsc = r => R(r).den === 1001;
  /** seconds (fraction) → whole frames at rate r, and back */
  const secToFrames = (q, r) => Math.round(q.n * R(r).num / (q.d * R(r).den));
  const framesToSec = (f, r) => Q(f * R(r).den, R(r).num);
  /** frames → "hh:mm:ss:ff" (";" when drop frame) and back */
  function framesToTC(frames, r, drop) {
    const base = timebase(r);
    frames = Math.max(0, Math.round(frames));
    if (drop && (base === 30 || base === 60)) {
      const d = base === 60 ? 4 : 2, perMin = base * 60 - d, per10 = base * 600 - d * 9;
      const tens = Math.floor(frames / per10), rem = frames % per10;
      frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
    }
    const p2 = n => String(n).padStart(2, '0'), ff = frames % base, s = Math.floor(frames / base), sep = drop ? ';' : ':';
    return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor((s % 3600) / 60)) + ':' + p2(s % 60) + sep + p2(ff);
  }
  function tcToFrames(tc, r) {
    const p = String(tc || '').trim().split(/[:;.]/).map(Number);
    if (p.length < 4 || p.some(isNaN)) return NaN;
    const base = timebase(r);
    let f = (p[0] * 3600 + p[1] * 60 + p[2]) * base + p[3];
    if (/;/.test(tc) && (base === 30 || base === 60)) { const d = base === 60 ? 4 : 2, mins = p[0] * 60 + p[1]; f -= d * (mins - Math.floor(mins / 10)); }
    return f;
  }

  /* ---------- XML: a small reader and writer (no DOM needed, so it runs in both editors' panels and in Node) ---------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] != null ? ENT[e] : m));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** XML text → {name, attrs, kids, text} (text = the element's own text, joined) */
  function parseXml(src) {
    src = String(src || '').replace(/^\uFEFF/, '');
    const root = { name: '#doc', attrs: {}, kids: [], text: '' }, stack = [root];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(src))) {
      const top = stack[stack.length - 1];
      if (m[1] != null) top.text += m[1];
      else if (m[2]) { if (stack.length > 1 && top.name === m[2]) stack.pop(); else { const i = stack.map(x => x.name).lastIndexOf(m[2]); if (i > 0) stack.length = i; } }
      else if (m[3]) {
        const el = { name: m[3], attrs: {}, kids: [], text: '' };
        const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
        while ((a = ar.exec(m[4] || ''))) el.attrs[a[1]] = unesc(a[2] != null ? a[2] : a[3]);
        top.kids.push(el);
        if (!m[5]) stack.push(el);
      } else if (m[6] != null && !/^\s*$/.test(m[6])) top.text += unesc(m[6]);
      else if (m[0][0] === '<' && !/^<(!|\?)/.test(m[0])) throw new Error('Not valid XML near: ' + m[0].slice(0, 40));
    }
    const doc = root.kids.find(k => k.name);
    if (!doc) throw new Error('No XML element found.');
    return doc;
  }
  const kid = (n, name) => (n && n.kids.find(k => k.name === name)) || null;
  const kidsOf = (n, name) => (n ? n.kids.filter(k => !name || k.name === name) : []);
  const txt = (n, name) => { const k = name ? kid(n, name) : n; return k ? String(k.text || '').trim() : ''; };
  const path = (n, ...names) => names.reduce((x, nm) => kid(x, nm), n);
  function find(n, name, out = []) { for (const k of n.kids) { if (k.name === name) out.push(k); find(k, name, out); } return out; }
  /** element builder for the writers: el('a', {x: 1}, [kids or text]) – attrs with undefined/null are left out */
  const withAttrs = (n, a) => Object.assign({}, n, { attrs: Object.assign({}, n.attrs, a) });
  const el = (name, attrs, kids) => ({ name, attrs: attrs || {}, kids: kids == null ? [] : Array.isArray(kids) ? kids.filter(k => k != null && k !== false) : [String(kids)] });
  function toXml(node, ind = '') {
    if (typeof node === 'string') return ind + esc(node);
    const at = Object.entries(node.attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    if (!node.kids.length) return `${ind}<${node.name}${at}/>`;
    if (node.kids.length === 1 && typeof node.kids[0] === 'string') return `${ind}<${node.name}${at}>${esc(node.kids[0])}</${node.name}>`;
    return `${ind}<${node.name}${at}>\n${node.kids.map(k => toXml(k, ind + '    ')).join('\n')}\n${ind}</${node.name}>`;
  }

  /* ---------- file paths ↔ URLs ---------- */
  function pathToUrl(p, localhost) {
    p = String(p || '').replace(/\\/g, '/');
    if (/^[a-z]:\//i.test(p)) p = '/' + p;
    const enc = p.split('/').map((s, i) => (i === 1 && /^[a-z]:$/i.test(s) ? s : encodeURIComponent(s).replace(/%2C/g, ',').replace(/%40/g, '@').replace(/%2B/g, '+').replace(/%3D/g, '=').replace(/%26/g, '&'))).join('/');
    return (localhost ? 'file://localhost' : 'file://') + enc;
  }
  function urlToPath(u) {
    u = String(u || '').trim();
    if (!/^file:/i.test(u)) return u;
    let p = u.replace(/^file:\/\/(localhost)?/i, '');
    try { p = decodeURIComponent(p); } catch (e) { /* as it is */ }
    if (/^\/[a-z]:[/\\]/i.test(p)) p = p.slice(1);   // /C:/… → C:/…
    return p;
  }
  const baseName = p => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();

  /* ---------- colours ---------- */
  const PREMIERE_LABELS = ['Violet', 'Iris', 'Caribbean', 'Lavender', 'Cerulean', 'Forest', 'Rose', 'Mango', 'Purple', 'Blue', 'Teal', 'Magenta', 'Tan', 'Green', 'Brown', 'Yellow'];
  const RESOLVE_TO_LABEL = { Violet: 'Violet', Navy: 'Iris', Teal: 'Teal', Purple: 'Purple', Blue: 'Blue', Olive: 'Forest', Pink: 'Rose', Orange: 'Mango', Apricot: 'Mango', Tan: 'Tan', Beige: 'Tan', Green: 'Green', Lime: 'Green', Brown: 'Brown', Chocolate: 'Brown', Yellow: 'Yellow' };
  const toLabel = c => { if (!c) return ''; const k = String(c).trim(), t = k[0].toUpperCase() + k.slice(1).toLowerCase(); return PREMIERE_LABELS.includes(t) ? t : RESOLVE_TO_LABEL[t] || ''; };
  // markers: Resolve's colour names are the shared ones; OpenTimelineIO has its own short list
  const OTIO_COL = { Red: 'RED', Rose: 'PINK', Pink: 'PINK', Fuchsia: 'MAGENTA', Sand: 'ORANGE', Cocoa: 'ORANGE', Orange: 'ORANGE', Yellow: 'YELLOW', Lemon: 'YELLOW', Green: 'GREEN', Mint: 'GREEN', Cyan: 'CYAN', Sky: 'CYAN', Blue: 'BLUE', Purple: 'PURPLE', Lavender: 'PURPLE', Cream: 'WHITE', White: 'WHITE' };
  const OTIO_BACK = { RED: 'Red', PINK: 'Pink', MAGENTA: 'Fuchsia', ORANGE: 'Sand', YELLOW: 'Yellow', GREEN: 'Green', CYAN: 'Cyan', BLUE: 'Blue', PURPLE: 'Purple', WHITE: 'Cream', BLACK: 'Cocoa' };

  /* ---------- the plain timeline ---------- */
  function blank(o = {}) {
    return Object.assign({ name: 'Timeline', rate: { num: 25, den: 1 }, drop: false, width: 1920, height: 1080, tcStart: 0, duration: 0, video: [], audio: [], markers: [], media: {}, lost: {}, source: '' }, o);
  }
  const lose = (tl, what, n = 1) => { tl.lost[what] = (tl.lost[what] || 0) + n; };
  function track(list, i) { while (list.length <= i) list.push({ name: '', enabled: true, clips: [] }); return list[i]; }
  function finish(tl) {
    for (const t of tl.video.concat(tl.audio)) t.clips.sort((a, b) => a.at - b.at);
    const end = Math.max(0, ...tl.video.concat(tl.audio).flatMap(t => t.clips.map(c => c.at + c.len)), ...tl.markers.map(m => m.at + (m.dur || 0)));
    tl.duration = Math.max(tl.duration || 0, end);
    return tl;
  }
  /** a short count of what's in it */
  function stats(tl) {
    const clips = tl.video.concat(tl.audio).reduce((n, t) => n + t.clips.length, 0);
    const markers = tl.markers.length + tl.video.concat(tl.audio).reduce((n, t) => n + t.clips.reduce((m, c) => m + (c.markers || []).length, 0), 0);
    return { clips, videoClips: tl.video.reduce((n, t) => n + t.clips.length, 0), audioClips: tl.audio.reduce((n, t) => n + t.clips.length, 0), videoTracks: tl.video.length, audioTracks: tl.audio.length, markers, media: Object.keys(tl.media).length, seconds: tl.duration * R(tl.rate).den / R(tl.rate).num };
  }
  /** what didn't come across, in plain words, most first */
  function lostLines(tl) { return Object.entries(tl.lost).sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${n} × ${k}` : k)); }
  function addMedia(tl, m) {
    const key = m.path ? 'p:' + String(m.path).toLowerCase() : 'n:' + m.name;
    const have = Object.values(tl.media).find(x => x._key === key);
    if (have) { for (const k of ['hasVideo', 'hasAudio']) have[k] = have[k] || m[k]; if (!have.durationSec && m.durationSec) have.durationSec = m.durationSec; return have.id; }
    const id = 'm' + (Object.keys(tl.media).length + 1);
    tl.media[id] = Object.assign({ id, name: baseName(m.path) || 'Clip', path: '', rate: null, tcStartSec: Q(0), durationSec: null, hasVideo: true, hasAudio: true, channels: 2, width: 0, height: 0 }, m, { id, _key: key });
    return id;
  }

  /* ================= FCP 7 XML (xmeml) – what Premiere reads and writes, and Resolve reads ================= */
  const xRate = n => { const r = kid(n, 'rate'); if (!r) return null; const tb = Number(txt(r, 'timebase')) || 25, ntsc = /true/i.test(txt(r, 'ntsc')); return ntsc ? { num: tb * 1000, den: 1001 } : { num: tb, den: 1 }; };
  const xNum = (n, name, dflt) => { const v = Number(txt(n, name)); return txt(n, name) !== '' && isFinite(v) ? v : dflt; };
  function readXmeml(text) {
    const doc = typeof text === 'string' ? parseXml(text) : text;
    if (doc.name !== 'xmeml') throw new Error('Not an FCP 7 XML file (xmeml).');
    const seqs = find(doc, 'sequence').filter(s => kid(s, 'media'));
    // the outermost sequence (nested ones sit inside clip items)
    const seq = seqs.find(s => !seqs.some(o => o !== s && find(o, 'sequence').includes(s))) || seqs[0];
    if (!seq) throw new Error('No sequence in this XML file.');
    const rate = xRate(seq) || { num: 25, den: 1 };
    const sc = path(seq, 'media', 'video', 'format', 'samplecharacteristics');
    const tc = kid(seq, 'timecode');
    const tl = blank({ name: txt(seq, 'name') || 'Sequence', rate, width: xNum(sc, 'width', 1920), height: xNum(sc, 'height', 1080), tcStart: tc ? xNum(tc, 'frame', 0) : 0, drop: tc ? txt(tc, 'displayformat') === 'DF' : false, duration: xNum(seq, 'duration', 0), source: 'xmeml' });
    const files = {};
    for (const f of find(doc, 'file')) if (f.attrs.id && f.kids.length) files[f.attrs.id] = f;
    const mediaFor = f => {
      if (!f) return null;
      const full = f.kids.length ? f : files[f.attrs.id];
      if (!full) return null;
      if (full._mid) return full._mid;
      const fr = xRate(full) || rate, ftc = kid(full, 'timecode'), ftr = (ftc && xRate(ftc)) || fr;
      const v = path(full, 'media', 'video'), a = path(full, 'media', 'audio'), vs = kid(v, 'samplecharacteristics');
      const dur = xNum(full, 'duration', 0);
      full._mid = addMedia(tl, { name: txt(full, 'name'), path: urlToPath(txt(full, 'pathurl')), rate: fr, tcStartSec: ftc ? framesToSec(xNum(ftc, 'frame', 0), ftr) : Q(0), durationSec: dur ? framesToSec(dur, fr) : null, hasVideo: !!v, hasAudio: !!a, channels: a ? xNum(a, 'channelcount', 2) : 0, width: xNum(vs, 'width', 0), height: xNum(vs, 'height', 0) });
      return full._mid;
    };
    const markersOf = (n, rel) => kidsOf(n, 'marker').map(m => { const i = xNum(m, 'in', 0), o = xNum(m, 'out', -1); return { at: i - rel, dur: o > i ? o - i : 0, name: txt(m, 'name'), note: txt(m, 'comment'), colour: '' }; });
    tl.markers = markersOf(seq, 0);
    const kinds = [['video', tl.video], ['audio', tl.audio]];
    for (const [kind, list] of kinds) {
      kidsOf(path(seq, 'media', kind), 'track').forEach((t, ti) => {
        const tr = track(list, ti);
        tr.enabled = !/false/i.test(txt(t, 'enabled'));
        for (const it of t.kids) {
          if (it.name === 'transitionitem') { lose(tl, 'transitions (they became cuts)'); continue; }
          if (it.name === 'generatoritem') { lose(tl, kind === 'video' ? 'titles and generated clips (left out: ' + (txt(it, 'name') || 'generator') + ')' : 'generated sound'); continue; }
          if (it.name !== 'clipitem') continue;
          const cr = xRate(it) || rate, scale = fpsOf(rate) / fpsOf(cr);
          let s = xNum(it, 'start', -1), e = xNum(it, 'end', -1), i = xNum(it, 'in', 0), o = xNum(it, 'out', 0);
          i = Math.round(i * scale); o = Math.round(o * scale);
          if (s < 0 && e >= 0) s = e - (o - i); if (e < 0 && s >= 0) e = s + (o - i);
          if (s < 0 || e <= s) continue;
          let file = kid(it, 'file'), mid = null;
          const mc = kid(it, 'multiclip');
          if (mc) {
            const angles = find(mc, 'clip').filter(c => find(c, 'file').length);
            const act = Math.max(1, xNum(it, 'activevideoangle', xNum(mc, 'activevideoangle', 1)));
            const ang = angles[act - 1] || angles[0];
            file = ang ? find(ang, 'file')[0] : null;
            lose(tl, 'multicam clips (flattened to the angle shown)');
          }
          if (!file && find(it, 'sequence').length) { lose(tl, 'nested sequences (left out – open them and send them on their own)'); continue; }
          mid = mediaFor(file);
          if (!mid) { lose(tl, 'clips without a media file (left out)'); continue; }
          const c = { media: mid, name: txt(it, 'name') || tl.media[mid].name, at: s, len: e - s, in: i, enabled: !/false/i.test(txt(it, 'enabled')), colour: txt(path(it, 'labels'), 'label2'), markers: markersOf(it, i), channel: kind === 'audio' ? xNum(path(it, 'sourcetrack'), 'trackindex', 1) : 1, link: '' };
          const links = kidsOf(it, 'link').map(l => txt(l, 'linkclipref')).filter(Boolean).sort();
          c.link = links.length ? links[0] : it.attrs.id || '';
          for (const f of find(it, 'effect')) {
            const id = txt(f, 'effectid'), nm = txt(f, 'name');
            if (/audiolevels/i.test(id) || /^audio levels$/i.test(nm)) { const p = kidsOf(f, 'parameter').find(p => /level/i.test(txt(p, 'parameterid'))); const v = p && Number(txt(p, 'value')); if (p && kid(p, 'keyframe')) lose(tl, 'volume changes over time (kept at one level)'); if (v > 0) c.gainDb = Math.round(2000 * Math.log10(v)) / 100; continue; }
            if (/timeremap/i.test(id) || /^time remap$/i.test(nm)) { const p = kidsOf(f, 'parameter').find(p => /speed/i.test(txt(p, 'parameterid'))); const v = p ? Number(txt(p, 'value')) : 100; if (v && Math.abs(v - 100) > 0.01) lose(tl, 'speed changes (clips play at normal speed – check their length)'); continue; }
            if (/^(basic motion|opacity|crop|audio pan|pan)$/i.test(nm) || /^(basic|opacity|crop|audiopan)$/i.test(id)) continue;
            lose(tl, `effects (${nm || id || 'effect'})`);
          }
          track(list, ti).clips.push(c);
        }
      });
    }
    return finish(tl);
  }

  /**
   * Premiere's own XML has a stereo file's sound as two clips (channel 1 and 2, on tracks next to each other); FCPXML,
   * OTIO and EDL have one. A lone channel-1 clip of a two-channel file gets its channel 2 on a track below, so Premiere
   * plays both sides.
   */
  function pairStereo(tl) {
    const audio = [];
    for (const t of tl.audio) {
      audio.push(t);
      const want = t.clips.filter(c => (c.channel || 1) === 1 && (tl.media[c.media].channels || 0) === 2 &&
        !tl.audio.some(o => o.clips.some(x => x !== c && x.media === c.media && x.at === c.at && x.in === c.in && x.channel === 2)));
      if (want.length) audio.push({ name: '', enabled: t.enabled, clips: want.map(c => Object.assign({}, c, { channel: 2, markers: [], link: c.link || (c.link = 'S' + Math.random().toString(36).slice(2, 8)) })) });
    }
    return Object.assign({}, tl, { audio });
  }
  /** …and the other way: FCPXML and OTIO carry a file's channels in one clip, so a channel-2 twin is left out. */
  function unpairStereo(tl) {
    const all = tl.audio.flatMap(t => t.clips);
    const twin = c => (c.channel || 1) > 1 && all.some(x => x !== c && (x.channel || 1) === 1 && x.media === c.media && x.at === c.at && x.in === c.in && x.len === c.len);
    return Object.assign({}, tl, { audio: tl.audio.map(t => Object.assign({}, t, { clips: t.clips.filter(c => !twin(c)) })).filter(t => t.clips.length) });
  }
  function writeXmeml(tl) {
    tl = pairStereo(finish(tl));
    const r = R(tl.rate), rateEl = () => el('rate', {}, [el('timebase', {}, String(timebase(r))), el('ntsc', {}, isNtsc(r) ? 'TRUE' : 'FALSE')]);
    const tcEl = f => el('timecode', {}, [rateEl(), el('string', {}, framesToTC(f, r, tl.drop)), el('frame', {}, String(f)), el('displayformat', {}, tl.drop ? 'DF' : 'NDF')]);
    const notes = [];
    // ids first, so picture and sound of one clip can name each other (Premiere links them)
    let n = 0; const where = new Map(), groups = {};
    [['video', tl.video], ['audio', tl.audio]].forEach(([kind, list]) => list.forEach((t, ti) => t.clips.forEach((c, ci) => { const id = 'clipitem-' + (++n); where.set(c, { id, kind, ti: ti + 1, ci: ci + 1 }); if (c.link) (groups[c.link] = groups[c.link] || []).push(c); })));
    const fileDone = {};
    const fileEl = m => {
      const id = 'file-' + m.id.replace(/\W/g, '');
      if (fileDone[id]) return el('file', { id });
      fileDone[id] = true;
      const mr = m.rate ? R(m.rate) : r, mrEl = el('rate', {}, [el('timebase', {}, String(timebase(mr))), el('ntsc', {}, isNtsc(mr) ? 'TRUE' : 'FALSE')]);
      const tcf = secToFrames(m.tcStartSec || Q(0), mr);
      return el('file', { id }, [
        el('name', {}, m.name || baseName(m.path)), el('pathurl', {}, pathToUrl(m.path, true)), mrEl,
        m.durationSec ? el('duration', {}, String(secToFrames(m.durationSec, mr))) : null,
        el('timecode', {}, [el('rate', {}, [el('timebase', {}, String(timebase(mr))), el('ntsc', {}, isNtsc(mr) ? 'TRUE' : 'FALSE')]), el('string', {}, framesToTC(tcf, mr, false)), el('frame', {}, String(tcf)), el('displayformat', {}, 'NDF')]),
        el('media', {}, [
          m.hasVideo ? el('video', {}, [el('samplecharacteristics', {}, [rateEl(), el('width', {}, String(m.width || tl.width)), el('height', {}, String(m.height || tl.height)), el('anamorphic', {}, 'FALSE'), el('pixelaspectratio', {}, 'square'), el('fielddominance', {}, 'none')])]) : null,
          m.hasAudio ? el('audio', {}, [el('samplecharacteristics', {}, [el('depth', {}, '16'), el('samplerate', {}, '48000')]), el('channelcount', {}, String(m.channels || 2))]) : null
        ])
      ]);
    };
    const markerEl = (m, base) => el('marker', {}, [el('comment', {}, m.note || ''), el('name', {}, m.name || ''), el('in', {}, String(base + m.at)), el('out', {}, String(m.dur ? base + m.at + m.dur : -1))]);
    const clipEl = c => {
      const m = tl.media[c.media], w = where.get(c), mdur = m.durationSec ? secToFrames(m.durationSec, r) : c.in + c.len;
      const kids = [el('masterclipid', {}, 'masterclip-' + m.id.replace(/\W/g, '')), el('name', {}, c.name || m.name), el('enabled', {}, c.enabled === false ? 'FALSE' : 'TRUE'), el('duration', {}, String(Math.max(mdur, c.in + c.len))), rateEl(),
        el('start', {}, String(c.at)), el('end', {}, String(c.at + c.len)), el('in', {}, String(c.in)), el('out', {}, String(c.in + c.len)), fileEl(m)];
      if (w.kind === 'audio') kids.push(el('sourcetrack', {}, [el('mediatype', {}, 'audio'), el('trackindex', {}, String(c.channel || 1))]));
      if (w.kind === 'audio' && c.gainDb != null && c.gainDb !== 0) kids.push(el('filter', {}, [el('effect', {}, [el('name', {}, 'Audio Levels'), el('effectid', {}, 'audiolevels'), el('effectcategory', {}, 'audiolevels'), el('effecttype', {}, 'audiolevels'), el('mediatype', {}, 'audio'), el('parameter', {}, [el('parameterid', {}, 'level'), el('name', {}, 'Level'), el('valuemin', {}, '0'), el('valuemax', {}, '3.98109'), el('value', {}, String(Math.round(Math.pow(10, c.gainDb / 20) * 1e5) / 1e5))])])]));
      const g = c.link && groups[c.link];
      if (g && g.length > 1) for (const o of g) { const ow = where.get(o); kids.push(el('link', {}, [el('linkclipref', {}, ow.id), el('mediatype', {}, ow.kind), el('trackindex', {}, String(ow.ti)), el('clipindex', {}, String(ow.ci)), ow.kind === 'audio' ? el('groupindex', {}, '1') : null])); }
      const lab = toLabel(c.colour);
      if (lab) kids.push(el('labels', {}, [el('label2', {}, lab)]));
      else if (c.colour) notes.push('Some clip colours have no Premiere label of the same name.');
      for (const mk of c.markers || []) kids.push(markerEl(mk, c.in));
      return el('clipitem', { id: w.id }, kids);
    };
    const trackEl = t => el('track', {}, [...t.clips.map(clipEl), el('enabled', {}, t.enabled === false ? 'FALSE' : 'TRUE'), el('locked', {}, 'FALSE')]);
    const seq = el('sequence', { id: 'sequence-1' }, [
      el('name', {}, tl.name), el('duration', {}, String(tl.duration)), rateEl(), tcEl(tl.tcStart),
      el('media', {}, [
        el('video', {}, [el('format', {}, [el('samplecharacteristics', {}, [rateEl(), el('width', {}, String(tl.width)), el('height', {}, String(tl.height)), el('anamorphic', {}, 'FALSE'), el('pixelaspectratio', {}, 'square'), el('fielddominance', {}, 'none')])]), ...(tl.video.length ? tl.video : [{ clips: [] }]).map(trackEl)]),
        el('audio', {}, [el('numOutputChannels', {}, '2'), el('format', {}, [el('samplecharacteristics', {}, [el('depth', {}, '16'), el('samplerate', {}, '48000')])]), ...(tl.audio.length ? tl.audio : [{ clips: [] }]).map(trackEl)])
      ]),
      ...tl.markers.map(m => markerEl(m, 0))
    ]);
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + toXml(el('xmeml', { version: '4' }, [seq])) + '\n', notes: [...new Set(notes)] };
  }

  /* ================= FCPXML – Final Cut Pro X / 11 (and Resolve) ================= */
  function readFcpxml(text) {
    const doc = typeof text === 'string' ? parseXml(text) : text;
    if (doc.name !== 'fcpxml') throw new Error('Not an FCPXML file.');
    const res = kid(doc, 'resources') || { kids: [] }, byId = {};
    for (const k of res.kids) if (k.attrs.id) byId[k.attrs.id] = k;
    const project = find(doc, 'project')[0];
    const seq = project ? kid(project, 'sequence') : find(doc, 'sequence')[0];
    if (!seq) throw new Error('No project (timeline) in this FCPXML file.');
    const fmt = byId[seq.attrs.format] || {}, fa = fmt.attrs || {};
    const fd = parseTime(fa.frameDuration || '1/25s'), rate = { num: fd.d, den: fd.n };
    const tcStartSec = parseTime(seq.attrs.tcStart || '0s');
    const tl = blank({ name: (project && project.attrs.name) || 'Timeline', rate, width: Number(fa.width) || 1920, height: Number(fa.height) || 1080, tcStart: secToFrames(tcStartSec, rate), drop: seq.attrs.tcFormat === 'DF', duration: secToFrames(parseTime(seq.attrs.duration), rate), source: 'fcpxml ' + (doc.attrs.version || '') });
    const assetMedia = a => {
      if (a._mid) return a._mid;
      const rep = kid(a, 'media-rep'), af = byId[a.attrs.format], afd = af && af.attrs.frameDuration ? parseTime(af.attrs.frameDuration) : null;
      a._mid = addMedia(tl, { name: a.attrs.name || '', path: urlToPath((rep && rep.attrs.src) || a.attrs.src || ''), rate: afd ? { num: afd.d, den: afd.n } : null, tcStartSec: parseTime(a.attrs.start || '0s'), durationSec: a.attrs.duration ? parseTime(a.attrs.duration) : null, hasVideo: a.attrs.hasVideo === '1', hasAudio: a.attrs.hasAudio === '1', channels: Number(a.attrs.audioChannels) || (a.attrs.hasAudio === '1' ? 2 : 0), width: Number(af && af.attrs.width) || 0, height: Number(af && af.attrs.height) || 0 });
      if (!a.attrs.name) tl.media[a._mid].name = baseName(tl.media[a._mid].path);
      return a._mid;
    };
    // audio tracks: the primary storyline's sound first, then lanes below (-1, -2 …), then the sound of clips above
    const audioKeys = [];
    const audioTrack = lane => { const key = lane === 0 ? 'p' : lane < 0 ? 'n' + String(-lane).padStart(3, '0') : 'v' + String(lane).padStart(3, '0'); if (!audioKeys.includes(key)) audioKeys.push(key); return key; };
    const audioBy = {};
    const keyword = n => { const k = kidsOf(n, 'keyword').map(x => x.attrs.value || '').find(v => /^(label|colour|color):/i.test(v)); return k ? k.split(':')[1].trim() : ''; };
    // Final Cut's markers are one frame long: that is a marker without a length
    const markersIn = (n, toTl) => kidsOf(n).filter(k => k.name === 'marker' || k.name === 'chapter-marker').map(k => ({ atSec: toTl(parseTime(k.attrs.start)), dur: k.attrs.duration && secToFrames(parseTime(k.attrs.duration), rate) > 1 ? secToFrames(parseTime(k.attrs.duration), rate) : 0, name: k.attrs.value || '', note: k.attrs.note || '', colour: k.name === 'chapter-marker' ? 'Purple' : k.attrs.completed === '0' ? 'Red' : k.attrs.completed === '1' ? 'Green' : '', chapter: k.name === 'chapter-marker' }));
    const effectNames = n => kidsOf(n).filter(k => /^filter-(video|audio)/.test(k.name)).map(k => (byId[k.attrs.ref] && byId[k.attrs.ref].attrs.name) || k.attrs.name || 'effect');
    /** one picture or sound, clipped to the window its containers allow */
    function emit(kind, lane, mid, n, atSec, inSec, durSec, win, extra) {
      let a = atSec, b = qAdd(atSec, durSec), i = inSec;
      if (win) { if (qNum(qSub(win[0], a)) > 0) { i = qAdd(i, qSub(win[0], a)); a = win[0]; } if (qNum(qSub(b, win[1])) > 0) b = win[1]; }
      const at = secToFrames(qSub(a, tcStartSec), rate), len = secToFrames(b, rate) - secToFrames(a, rate);
      if (len <= 0) return null;
      const m = tl.media[mid];
      const c = Object.assign({ media: mid, name: n.attrs.name || m.name, at, len, in: secToFrames(qSub(i, m.tcStartSec || Q(0)), rate), enabled: n.attrs.enabled !== '0', colour: keyword(n), markers: [], channel: 1, link: '' }, extra);
      if (kind === 'video') track(tl.video, lane).clips.push(c);
      else (audioBy[audioTrack(lane)] = audioBy[audioTrack(lane)] || []).push(c);
      return c;
    }
    let linkN = 0;
    /** place one story element starting at atSec (timeline seconds, sequence clock); lane: 0 = primary storyline */
    function place(n, atSec, lane, depth, win, inAudioOnly) {
      const S = parseTime(n.attrs.start || '0s'), D = n.attrs.duration ? parseTime(n.attrs.duration) : null;
      const toTl = t => qAdd(atSec, qSub(t, S));
      const myWin = D ? [atSec, qAdd(atSec, D)] : win;
      const w = win && myWin ? [qNum(qSub(win[0], myWin[0])) > 0 ? win[0] : myWin[0], qNum(qSub(myWin[1], win[1])) > 0 ? win[1] : myWin[1]] : myWin;
      const kidsAnchored = () => { for (const k of n.kids) if (/^(asset-clip|clip|video|audio|title|mc-clip|ref-clip|sync-clip|audition|spine|gap|caption)$/.test(k.name)) placeChild(k); };
      const placeChild = k => {
        const kl = k.attrs.lane != null ? Number(k.attrs.lane) : 0;
        const at = toTl(parseTime(k.attrs.offset || '0s'));
        if (k.name === 'spine') return placeSpine(k, at, lane + kl, depth + 1, null);
        // contained items (no lane) stay inside this clip's window; anchored ones may hang outside it
        place(k, at, lane + kl, depth + 1, kl === 0 ? w : null, inAudioOnly);
      };
      const ownMarkers = made => {
        const ms = markersIn(n, toTl);
        if (!ms.length) return;
        if (lane === 0 && depth === 0) for (const m of ms) tl.markers.push({ at: secToFrames(qSub(m.atSec, tcStartSec), rate), dur: m.dur, name: m.name, note: m.note, colour: m.colour, chapter: m.chapter });
        else if (made) for (const m of ms) made.markers.push({ at: secToFrames(qSub(m.atSec, tcStartSec), rate) - made.at, dur: m.dur, name: m.name, note: m.note, colour: m.colour });
      };
      const fx = effectNames(n); for (const f of fx) lose(tl, `effects (${f})`);
      if (kid(n, 'timeMap')) lose(tl, 'speed changes (clips play at normal speed – check their length)');
      const vol = kid(n, 'adjust-volume'), gainDb = vol && vol.attrs.amount ? parseFloat(vol.attrs.amount) : null;
      if (vol && kid(vol, 'param')) lose(tl, 'volume changes over time (kept at one level)');
      switch (n.name) {
        case 'asset-clip': {
          const a = byId[n.attrs.ref]; if (!a) { lose(tl, 'clips whose media is missing from the file (left out)'); return; }
          const mid = assetMedia(a), m = tl.media[mid], dur = D || m.durationSec || Q(0), link = 'L' + (++linkN);
          const en = n.attrs.srcEnable || 'all';
          let first = null;
          if (m.hasVideo && en !== 'audio' && !inAudioOnly) first = emit('video', lane, mid, n, atSec, S, dur, win, { link });
          if (m.hasAudio && en !== 'video') { const c = emit('audio', lane, mid, n, atSec, S, dur, win, { link, gainDb: gainDb != null && isFinite(gainDb) ? gainDb : undefined }); first = first || c; }
          ownMarkers(first);
          kidsAnchored();
          return;
        }
        case 'video': case 'audio': {
          if (n.name === 'audio' && n._noAudio) return;
          const a = byId[n.attrs.ref];
          if (!a || a.name !== 'asset') { if (n.name === 'video') lose(tl, 'titles and generated clips (left out: ' + ((a && a.attrs.name) || 'generator') + ')'); ownMarkers(null); kidsAnchored(); return; }
          const mid = assetMedia(a), dur = D || tl.media[mid].durationSec || Q(0);
          const c = (n.name === 'audio' || !inAudioOnly) ? emit(n.name, lane, mid, n, atSec, S, dur, win, { link: n._link || '', gainDb: n.name === 'audio' && gainDb != null && isFinite(gainDb) ? gainDb : undefined, channel: Number(n.attrs.srcCh && n.attrs.srcCh.split(',')[0]) || 1 }) : null;
          ownMarkers(c); kidsAnchored(); return;
        }
        case 'clip': case 'sync-clip': {
          const link = 'L' + (++linkN);
          for (const k of n.kids) if (k.name === 'video' || k.name === 'audio') { k._link = link; k._noAudio = n.attrs.srcEnable === 'video'; }
          const before = tl.video.reduce((x, t) => x + t.clips.length, 0) + Object.values(audioBy).reduce((x, l) => x + l.length, 0);
          kidsAnchored();
          // the clip's own markers go on the first thing it placed
          const all = tl.video.flatMap(t => t.clips).concat(Object.values(audioBy).flat());
          const made = all.length > before ? all[all.length - 1] : null;
          for (const c of all) if (c.link === link) { if (n.attrs.name) c.name = n.attrs.name; if (keyword(n)) c.colour = keyword(n); if (n.attrs.enabled === '0') c.enabled = false; }
          ownMarkers(made);
          return;
        }
        case 'mc-clip': {
          const mc = byId[n.attrs.ref], multi = mc && kid(mc, 'multicam');
          const srcs = kidsOf(n, 'mc-source'), vSrc = srcs.find(s => /^(all|video)$/.test(s.attrs.srcEnable || 'all')), aSrc = srcs.find(s => /^(all|audio)$/.test(s.attrs.srcEnable || 'all'));
          const angleOf = src => (src && multi && kidsOf(multi, 'mc-angle').find(a => a.attrs.angleID === src.attrs.angleID)) || null;
          lose(tl, 'multicam clips (flattened to the angle shown)');
          // the angles' items are on the multicam's own clock; this clip shows S…S+D of it
          const wnd = D ? [atSec, qAdd(atSec, D)] : win;
          const lay = (ang, enable, audioOnly) => { for (const k of ang.kids) if (/^(asset-clip|clip|video|audio)$/.test(k.name)) place(withAttrs(k, { srcEnable: enable }), qAdd(atSec, qSub(parseTime(k.attrs.offset || '0s'), S)), lane, depth + 1, wnd, audioOnly); };
          const vA = angleOf(vSrc), aA = angleOf(aSrc);
          if (vA && vA === aA) lay(vA, 'all', false);
          else { if (vA) lay(vA, 'video', false); if (aA) lay(aA, 'audio', true); }
          ownMarkers(null);
          kidsAnchored();
          return;
        }
        case 'ref-clip': {
          const r = byId[n.attrs.ref], inner = r && kid(r, 'sequence');
          if (!inner) { lose(tl, 'compound clips (left out)'); return; }
          lose(tl, 'compound clips (flattened into the timeline)');
          const sp = kid(inner, 'spine');
          if (sp) placeSpine(sp, qSub(atSec, qSub(S, parseTime(inner.attrs.tcStart || '0s'))), lane, depth + 1, D ? [atSec, qAdd(atSec, D)] : win, true);
          ownMarkers(null); kidsAnchored(); return;
        }
        case 'audition': { const first = n.kids.find(k => /^(asset-clip|clip|video|audio|title|mc-clip|ref-clip|sync-clip)$/.test(k.name)); if (first) place(first, atSec, lane, depth, win, inAudioOnly); lose(tl, 'auditions (the chosen take is used)'); return; }
        case 'title': lose(tl, 'titles (left out' + (find(n, 'text-style').length ? ': “' + find(n, 'text-style').map(t => t.text).join('').trim().slice(0, 40) + '”' : '') + ')'); ownMarkers(null); kidsAnchored(); return;
        case 'caption': lose(tl, 'captions (left out – export them as SRT)'); return;
        case 'gap': ownMarkers(null); kidsAnchored(); return;
        default: return;
      }
    }
    /** a storyline: its items one after another (offsets in the primary storyline, else in order) */
    function placeSpine(sp, atSec, lane, depth, win, useOffsets) {
      let cur = atSec;
      const base = useOffsets ? atSec : null;
      for (const k of sp.kids) {
        if (k.name === 'transition') { lose(tl, 'transitions (they became cuts)'); continue; }
        if (!/^(asset-clip|clip|video|audio|title|mc-clip|ref-clip|sync-clip|audition|gap|caption)$/.test(k.name)) continue;
        const at = base && k.attrs.offset != null ? qAdd(base, parseTime(k.attrs.offset)) : cur;
        place(k, at, lane, depth, win);
        const d = k.attrs.duration ? parseTime(k.attrs.duration) : Q(0);
        cur = qAdd(at, d);
      }
    }
    const spine = kid(seq, 'spine');
    // the primary storyline's offsets are on the sequence clock (which starts at tcStart)
    if (spine) placeSpine(spine, Q(0), 0, 0, null, true);
    audioKeys.sort((a, b) => 'pnv'.indexOf(a[0]) - 'pnv'.indexOf(b[0]) || a.localeCompare(b)).forEach(k => { const t = track(tl.audio, tl.audio.length); t.clips = audioBy[k] || []; });
    tl.video = tl.video.filter(t => t.clips.length);
    return finish(tl);
  }

  function writeFcpxml(tl, opts = {}) {
    tl = unpairStereo(finish(tl));
    const version = opts.version || '1.10', r = R(tl.rate), notes = [];
    const T = f => fmtTime(framesToSec(f, r));
    const tc0 = tl.tcStart;
    const formats = [], fmtId = (rate, w, h) => { const fd = Q(R(rate).den, R(rate).num), key = `${fd.n}/${fd.d}|${w}|${h}`; let f = formats.find(x => x.key === key); if (!f) { f = { key, id: 'r' + (formats.length + 1), fd, w, h }; formats.push(f); } return f.id; };
    const seqFmt = fmtId(r, tl.width, tl.height);
    const assets = {}; let nextId = 100;
    const assetId = mid => { if (!assets[mid]) { const m = tl.media[mid]; assets[mid] = { id: 'r' + (nextId++), m, fmt: m.hasVideo ? fmtId(m.rate || r, m.width || tl.width, m.height || tl.height) : null, maxEnd: Q(0) }; } return assets[mid]; };
    const startOf = c => { const m = tl.media[c.media]; return qAdd(m.tcStartSec || Q(0), framesToSec(c.in, r)); };
    // which sound is already inside a picture clip (same media, same place, same in point)
    const v1 = (tl.video[0] && tl.video[0].clips.filter(c => c.len > 0)) || [];
    const absorbed = new Set(), hasOwnAudio = new Map();
    for (const t of tl.video) for (const c of t.clips) {
      let any = false;
      for (const at of tl.audio) for (const a of at.clips) if (!absorbed.has(a) && a.media === c.media && a.at === c.at && a.len === c.len && a.in === c.in) { absorbed.add(a); any = true; if (a.gainDb != null && c.gainDb == null) c._gain = a.gainDb; }
      hasOwnAudio.set(c, any);
    }
    const kw = c => (c.colour ? [el('keyword', { start: fmtTime(startOf(c)), duration: T(c.len), value: 'Label: ' + c.colour })] : []);
    const markerEls = (list, toLocal) => list.map(m => el(m.chapter ? 'chapter-marker' : 'marker', { start: fmtTime(toLocal(m.at)), duration: T(Math.max(1, m.dur || 1)), value: m.name || 'Marker', note: m.note || undefined }));
    const clipEl = (c, kind, attrs, anchored, extraMarkers) => {
      const a = assetId(c.media), m = tl.media[c.media], st = startOf(c);
      const end = qAdd(qSub(st, m.tcStartSec || Q(0)), framesToSec(c.len, r)); if (qNum(qSub(end, a.maxEnd)) > 0) a.maxEnd = end;
      const srcEnable = kind === 'audio' && m.hasVideo ? 'audio' : kind === 'video' && m.hasAudio && !hasOwnAudio.get(c) ? 'video' : undefined;
      const gain = kind === 'audio' ? c.gainDb : c._gain;
      const local = f => qAdd(st, framesToSec(f, r));
      const kids = [gain != null && gain !== 0 ? el('adjust-volume', { amount: `${Math.round(gain * 100) / 100}dB` }) : null, ...anchored, ...markerEls(c.markers || [], f => local(f)), ...(extraMarkers || []).map(x => x(local, c)), ...kw(c)];
      return el('asset-clip', Object.assign({ ref: a.id }, attrs, { name: c.name || m.name, start: fmtTime(st), duration: T(c.len), enabled: c.enabled === false ? '0' : undefined, srcEnable, tcFormat: tl.drop ? 'DF' : 'NDF' }), kids);
    };
    // the primary storyline: track 1's pictures with gaps between; everything else hangs from what's under it
    const prim = [];
    let cur = 0;
    const pushGap = (a, b) => { if (b > a) prim.push({ gap: true, at: a, len: b - a }); };
    for (const c of v1.slice().sort((x, y) => x.at - y.at)) { if (c.at < cur) { notes.push('Overlapping clips on video track 1 were put on a lane above.'); continue; } pushGap(cur, c.at); prim.push({ clip: c, at: c.at, len: c.len }); cur = c.at + c.len; }
    pushGap(cur, Math.max(tl.duration, cur));
    if (!prim.length) prim.push({ gap: true, at: 0, len: Math.max(1, tl.duration) });
    const inPrim = new Set(prim.filter(p => p.clip).map(p => p.clip));
    const holder = at => prim.find(p => at >= p.at && at < p.at + p.len) || prim[prim.length - 1];
    for (const p of prim) p.anch = [];
    const hang = (c, kind, lane) => { const p = holder(c.at); p.anch.push({ c, kind, lane }); };
    tl.video.forEach((t, i) => t.clips.forEach(c => { if (!inPrim.has(c)) hang(c, 'video', Math.max(1, i)); }));
    tl.audio.forEach((t, i) => t.clips.forEach(c => { if (!absorbed.has(c)) hang(c, 'audio', -(i + 1)); }));
    const tlMarkers = tl.markers.map(m => ({ m, p: holder(m.at) }));
    const localOf = (p, f) => (p.gap ? framesToSec(tc0 + f, r) : qAdd(startOf(p.clip), framesToSec(f - p.at, r)));
    const spineKids = prim.map(p => {
      const anchored = p.anch.map(({ c, kind, lane }) => clipEl(c, kind, { lane: String(lane), offset: fmtTime(localOf(p, c.at)) }, []));
      const ms = tlMarkers.filter(x => x.p === p).map(x => x.m);
      // a gap's own clock starts where it sits on the sequence clock (always on a frame)
      if (p.gap) return el('gap', { name: 'Gap', offset: T(tc0 + p.at), start: T(tc0 + p.at), duration: T(p.len) }, [...anchored, ...markerEls(ms, f => framesToSec(tc0 + f, r))]);
      return clipEl(p.clip, 'video', { offset: T(tc0 + p.at) }, anchored, ms.map(m => (local) => markerEls([m], f => local(f - p.at))[0]));
    });
    if (tl.video.some((t, i) => i > 0 && t.clips.length) || tl.audio.some(t => t.clips.some(c => !absorbed.has(c)))) notes.push('Other tracks are connected clips in Final Cut Pro (lanes above and below the main storyline).');
    if (tl.video.concat(tl.audio).some(t => t.clips.some(c => c.colour))) notes.push('Clip colours are keywords (“Label: …”) – Final Cut Pro has no clip colours.');
    const res = el('resources', {}, [
      ...formats.map(f => el('format', { id: f.id, frameDuration: fmtTime(f.fd), width: String(f.w), height: String(f.h) })),
      ...Object.values(assets).map(a => el('asset', { id: a.id, name: a.m.name || baseName(a.m.path), start: fmtTime(a.m.tcStartSec || Q(0)), duration: fmtTime(a.m.durationSec || a.maxEnd), hasVideo: a.m.hasVideo ? '1' : '0', format: a.fmt || undefined, hasAudio: a.m.hasAudio ? '1' : '0', audioSources: a.m.hasAudio ? '1' : undefined, audioChannels: a.m.hasAudio ? String(a.m.channels || 2) : undefined, audioRate: a.m.hasAudio ? '48000' : undefined }, [el('media-rep', { kind: 'original-media', src: pathToUrl(a.m.path) })]))
    ]);
    const seq = el('sequence', { format: seqFmt, duration: T(tl.duration), tcStart: T(tc0), tcFormat: tl.drop ? 'DF' : 'NDF', audioLayout: 'stereo', audioRate: '48k' }, [el('spine', {}, spineKids)]);
    const doc = el('fcpxml', { version }, [res, el('library', {}, [el('event', { name: opts.event || 'JMG Ultra Studio' }, [el('project', { name: tl.name }, [seq])])])]);
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + toXml(doc) + '\n', notes: [...new Set(notes)] };
  }

  /* ================= CMX 3600 EDL – one picture track, the oldest common format ================= */
  function writeEdl(tl) {
    tl = finish(tl);
    const r = R(tl.rate), notes = [];
    const v1 = (tl.video[0] && tl.video[0].clips) || [], base = v1.length ? v1 : ((tl.audio[0] && tl.audio[0].clips) || []);
    const audioAt = new Set(tl.audio.flatMap(t => t.clips).map(a => `${a.media}|${a.at}|${a.in}`));
    const out = [`TITLE: ${tl.name.replace(/[\r\n]/g, ' ').slice(0, 70)}`, `FCM: ${tl.drop ? 'DROP FRAME' : 'NON-DROP FRAME'}`, ''];
    const tc = f => framesToTC(f, r, tl.drop);
    base.slice().sort((a, b) => a.at - b.at).forEach((c, i) => {
      const m = tl.media[c.media], src = secToFrames(m.tcStartSec || Q(0), r) + c.in;
      const ch = !v1.length ? 'A' : audioAt.has(`${c.media}|${c.at}|${c.in}`) ? 'AA/V' : 'V';
      out.push(`${String(i + 1).padStart(3, '0')}  AX       ${ch.padEnd(5)} C        ${tc(src)} ${tc(src + c.len)} ${tc(tl.tcStart + c.at)} ${tc(tl.tcStart + c.at + c.len)}`);
      out.push(`* FROM CLIP NAME: ${c.name || m.name}`);
      if (m.path) out.push(`* SOURCE FILE: ${m.path}`);
      for (const mk of tl.markers.filter(x => x.at >= c.at && x.at < c.at + c.len)) out.push(`* LOC: ${tc(tl.tcStart + mk.at)} ${(OTIO_COL[mk.colour] || 'BLUE').padEnd(7)} ${String(mk.name || mk.note || 'Marker').replace(/[\r\n]/g, ' ')}`);
      out.push('');
    });
    if (tl.video.length > 1 || tl.audio.length > 1) notes.push('An EDL holds one picture track: only video track 1 is in it.');
    notes.push('EDLs don’t carry clip colours or effects; markers are written as notes (LOC lines).');
    return { text: out.join('\r\n'), notes };
  }
  function readEdl(text, opts = {}) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const title = (lines.find(l => /^TITLE:/i.test(l)) || '').replace(/^TITLE:\s*/i, '').trim();
    const drop = /^FCM:\s*DROP/im.test(text);
    const evRe = /^(\d{3,6})\s+(\S+)\s+(\S+)\s+(C|D|W\d*|K\S*)\s*(\d*)\s+(\d\d[:;.]\d\d[:;.]\d\d[:;.]\d\d)\s+(\d\d[:;.]\d\d[:;.]\d\d[:;.]\d\d)\s+(\d\d[:;.]\d\d[:;.]\d\d[:;.]\d\d)\s+(\d\d[:;.]\d\d[:;.]\d\d[:;.]\d\d)/;
    // the frame rate isn't in an EDL: given, or the highest frame number seen
    let rate = opts.fps ? rateOf(opts.fps) : null;
    if (!rate) { const ff = Math.max(0, ...[...String(text).matchAll(/\d\d[:;.]\d\d[:;.]\d\d[:;.](\d\d)/g)].map(m => Number(m[1]))); rate = ff >= 30 ? { num: 60, den: 1 } : ff >= 25 || drop ? (drop ? { num: 30000, den: 1001 } : { num: 30, den: 1 }) : { num: 25, den: 1 }; }
    const tl = blank({ name: title || 'EDL', rate, drop, source: 'edl' });
    const evs = [];
    for (const l of lines) {
      const m = evRe.exec(l.trim());
      if (m) { evs.push({ reel: m[2], ch: m[3], how: m[4], src: [tcToFrames(m[6], rate), tcToFrames(m[7], rate)], rec: [tcToFrames(m[8], rate), tcToFrames(m[9], rate)], name: '', file: '', locs: [] }); continue; }
      const e = evs[evs.length - 1]; if (!e) continue;
      let k;
      if ((k = /^\*\s*FROM CLIP NAME:\s*(.*)$/i.exec(l.trim()))) e.name = k[1].trim();
      else if ((k = /^\*\s*SOURCE FILE:\s*(.*)$/i.exec(l.trim()))) e.file = k[1].trim();
      else if ((k = /^\*\s*LOC:\s*(\S+)\s+(\S+)\s+(.*)$/i.exec(l.trim()))) e.locs.push({ at: tcToFrames(k[1], rate), colour: OTIO_BACK[k[2].toUpperCase()] || '', name: k[3].trim() });
      else if (/^M2\s/i.test(l.trim())) lose(tl, 'speed changes (clips play at normal speed – check their length)');
      else if (/^\|C:.*\|M:/.test(l.trim())) { const mm = /\|C:ResolveColor(\w+)\s*\|M:(.*?)\s*\|D:(\d+)/.exec(l.trim()); if (mm) e.locs.push({ at: e.rec[0], colour: mm[1], name: mm[2], dur: Number(mm[3]) > 1 ? Number(mm[3]) : 0 }); }
    }
    if (!evs.length) throw new Error('No edit events in this EDL.');
    tl.tcStart = Math.min(...evs.map(e => e.rec[0]));
    for (const e of evs) {
      if (/^(BL|BLK|BLACK)$/i.test(e.reel)) continue;
      if (e.how !== 'C') lose(tl, 'transitions (they became cuts)');
      const mid = addMedia(tl, { name: e.name || e.reel, path: e.file, tcStartSec: Q(0), hasVideo: /V/i.test(e.ch) || /^B$/i.test(e.ch), hasAudio: /A|B/i.test(e.ch) });
      const len = e.rec[1] - e.rec[0], at = e.rec[0] - tl.tcStart, link = 'E' + evs.indexOf(e);
      // an EDL's source times are timecode: the media is taken to start at 00:00:00:00 unless the files say otherwise
      const c = { media: mid, name: e.name || e.reel, at, len, in: e.src[0], enabled: true, colour: '', markers: [], channel: 1, link };
      if (/V|B/i.test(e.ch)) track(tl.video, 0).clips.push(Object.assign({}, c, { markers: [] }));
      if (/A|B/i.test(e.ch)) track(tl.audio, 0).clips.push(Object.assign({}, c, { markers: [] }));
      for (const l of e.locs) tl.markers.push({ at: l.at - tl.tcStart, dur: l.dur || 0, name: l.name, note: '', colour: l.colour });
    }
    if (evs.some(e => !e.file)) lose(tl, 'clips named only by reel or clip name (pick the media folder to find them)');
    return finish(tl);
  }

  /* ================= OpenTimelineIO (.otio JSON) ================= */
  const RT = (v, r) => ({ OTIO_SCHEMA: 'RationalTime.1', rate: fpsOf(r), value: v });
  const TR = (s, d, r) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: RT(s, r), duration: RT(d, r) });
  function writeOtio(tl) {
    tl = unpairStereo(finish(tl));
    const r = R(tl.rate), notes = [];
    const markerJ = (m, base) => ({ OTIO_SCHEMA: 'Marker.2', name: m.name || '', color: OTIO_COL[m.colour] || 'GREEN', comment: m.note || '', marked_range: TR(base + m.at, m.dur || 0, r), metadata: m.note ? { note: m.note } : {} });
    const trackJ = (t, kind, i) => {
      const kids = []; let cur = 0;
      for (const c of t.clips.slice().sort((a, b) => a.at - b.at)) {
        if (c.at < cur) { notes.push('Overlapping clips on one track were left out of the OTIO file.'); continue; }
        if (c.at > cur) kids.push({ OTIO_SCHEMA: 'Gap.1', name: '', source_range: TR(0, c.at - cur, r), effects: [], markers: [], metadata: {} });
        const m = tl.media[c.media], tcf = secToFrames(m.tcStartSec || Q(0), r);
        kids.push({ OTIO_SCHEMA: 'Clip.1', name: c.name || m.name, source_range: TR(tcf + c.in, c.len, r), enabled: c.enabled !== false, effects: [], markers: (c.markers || []).map(mk => markerJ(mk, tcf + c.in)),
          media_reference: { OTIO_SCHEMA: 'ExternalReference.1', name: m.name, target_url: pathToUrl(m.path), available_range: m.durationSec ? TR(tcf, secToFrames(m.durationSec, r), r) : null, metadata: {} },
          metadata: { jmg_ultra_studio: Object.assign({ link: c.link || '' }, c.colour ? { colour: c.colour } : {}, c.gainDb != null ? { gain_db: c.gainDb } : {}, kind === 'Audio' ? { channel: c.channel || 1 } : {}) } });
        cur = c.at + c.len;
      }
      return { OTIO_SCHEMA: 'Track.1', name: t.name || (kind === 'Video' ? 'V' : 'A') + (i + 1), kind, enabled: t.enabled !== false, source_range: null, effects: [], markers: [], children: kids, metadata: {} };
    };
    const doc = { OTIO_SCHEMA: 'Timeline.1', name: tl.name, global_start_time: RT(tl.tcStart, r), metadata: { jmg_ultra_studio: { width: tl.width, height: tl.height, drop_frame: !!tl.drop } },
      tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', source_range: null, effects: [], markers: tl.markers.map(m => markerJ(m, 0)), metadata: {}, children: [...tl.video.map((t, i) => trackJ(t, 'Video', i)), ...tl.audio.map((t, i) => trackJ(t, 'Audio', i))] } };
    return { text: JSON.stringify(doc, null, 2) + '\n', notes: [...new Set(notes)] };
  }
  function readOtio(text) {
    const doc = typeof text === 'string' ? JSON.parse(String(text).replace(/^\uFEFF/, '')) : text;
    const tlj = /^Timeline\./.test(doc.OTIO_SCHEMA || '') ? doc : null;
    if (!tlj) throw new Error('Not an OpenTimelineIO timeline.');
    const gst = tlj.global_start_time || { rate: 25, value: 0 };
    const stack = tlj.tracks || { children: [] };
    const firstRate = (() => { for (const t of stack.children || []) for (const c of t.children || []) if (c.source_range) return c.source_range.duration.rate; return gst.rate || 25; })();
    const rate = rateOf(gst.rate || firstRate);
    const fr = rt => (rt ? Math.round(rt.value * fpsOf(rate) / (rt.rate || fpsOf(rate))) : 0);
    const meta = (tlj.metadata && tlj.metadata.jmg_ultra_studio) || {};
    const tl = blank({ name: tlj.name || 'Timeline', rate, tcStart: fr(gst), width: meta.width || 1920, height: meta.height || 1080, drop: !!meta.drop_frame, source: 'otio' });
    const markerOf = (m, base) => { const mr = m.marked_range || { start_time: { value: 0, rate: 25 }, duration: { value: 0, rate: 25 } }; return { at: fr(mr.start_time) - base, dur: fr(mr.duration), name: m.name || '', note: m.comment || (m.metadata && m.metadata.note) || '', colour: OTIO_BACK[m.color] || '' }; };
    // timeline markers: from the start of the timeline (some writers count from its first timecode)
    const tlBase = (stack.markers || []).length && tl.tcStart > 0 && (stack.markers || []).every(m => fr(m.marked_range && m.marked_range.start_time) >= tl.tcStart) ? tl.tcStart : 0;
    tl.markers = (stack.markers || []).map(m => markerOf(m, tlBase));
    for (const t of stack.children || []) {
      if (!/^Track\./.test(t.OTIO_SCHEMA || '')) { lose(tl, 'nested stacks (left out)'); continue; }
      const audio = t.kind === 'Audio', list = audio ? tl.audio : tl.video, tr = track(list, list.length);
      tr.name = t.name || ''; tr.enabled = t.enabled !== false;
      for (const m of t.markers || []) tl.markers.push(markerOf(m, 0));
      let cur = 0;
      for (const c of t.children || []) {
        const sch = c.OTIO_SCHEMA || '';
        if (/^Transition\./.test(sch)) { lose(tl, 'transitions (they became cuts)'); continue; }
        const len = c.source_range ? fr(c.source_range.duration) : 0;
        if (/^Gap\./.test(sch)) { cur += len; continue; }
        if (/^(Stack|Track)\./.test(sch)) { lose(tl, 'nested stacks (left out)'); cur += len; continue; }
        if (!/^Clip\./.test(sch)) { cur += len; continue; }
        const ref = c.media_reference || (c.media_references && c.media_references[c.active_media_reference_key || 'DEFAULT_MEDIA']) || {};
        if (!/^ExternalReference\./.test(ref.OTIO_SCHEMA || '')) { lose(tl, /Generator/.test(ref.OTIO_SCHEMA || '') ? 'titles and generated clips (left out)' : 'clips without a media file (left out)'); cur += len; continue; }
        const avail = ref.available_range, tcf = avail ? fr(avail.start_time) : 0;
        for (const e of c.effects || []) lose(tl, /TimeEffect|LinearTimeWarp|FreezeFrame/.test(e.OTIO_SCHEMA || '') ? 'speed changes (clips play at normal speed – check their length)' : `effects (${e.effect_name || e.name || 'effect'})`);
        const jm = (c.metadata && c.metadata.jmg_ultra_studio) || {};
        const p = urlToPath(ref.target_url);
        const mid = addMedia(tl, { name: ref.name || baseName(p), path: p, rate, tcStartSec: framesToSec(tcf, rate), durationSec: avail ? framesToSec(fr(avail.duration), rate) : null, hasVideo: !audio, hasAudio: audio });
        const start = c.source_range ? fr(c.source_range.start_time) : tcf;
        tr.clips.push({ media: mid, name: c.name || tl.media[mid].name, at: cur, len, in: start - tcf, enabled: c.enabled !== false, colour: jm.colour || '', gainDb: jm.gain_db, channel: jm.channel || 1, link: jm.link || '', markers: (c.markers || []).map(m => markerOf(m, start)) });
        cur += len;
      }
    }
    // the same file on picture and sound tracks: it has both
    for (const m of Object.values(tl.media)) { const inV = tl.video.some(t => t.clips.some(c => c.media === m.id)), inA = tl.audio.some(t => t.clips.some(c => c.media === m.id)); if (inV && inA) m.hasVideo = m.hasAudio = true; }
    return finish(tl);
  }

  /* ---------- which format, read and write ---------- */
  /** what a file is, from its name and first bytes */
  function sniff(name, text) {
    const n = String(name || '').toLowerCase(), t = String(text || '').slice(0, 2000);
    if (/\.fcpxmld\/?$/.test(n) || /<fcpxml/.test(t)) return 'fcpxml';
    if (/<xmeml/.test(t)) return 'xmeml';
    if (/\.otio$/.test(n) || /"OTIO_SCHEMA"/.test(t)) return 'otio';
    if (/\.edl$/.test(n) || /^\s*TITLE:/m.test(t) && /^\d{3}\s/m.test(String(text))) return 'edl';
    if (/\.aaf$/.test(n)) return 'aaf';
    return '';
  }
  function read(text, kind, opts) {
    kind = kind || sniff('', text);
    if (kind === 'fcpxml') return readFcpxml(text);
    if (kind === 'xmeml') return readXmeml(text);
    if (kind === 'otio') return readOtio(text);
    if (kind === 'edl') return readEdl(text, opts);
    throw new Error('Not a timeline file this panel can read (FCPXML, FCP 7 XML, EDL or OTIO).');
  }
  const WRITERS = { fcpxml: writeFcpxml, xmeml: writeXmeml, edl: writeEdl, otio: writeOtio };
  const EXT = { fcpxml: '.fcpxml', xmeml: '.xml', edl: '.edl', otio: '.otio' };
  /** the best format for each editor */
  const TARGETS = {
    premiere: { name: 'Premiere Pro', format: 'xmeml', how: 'In Premiere: File › Import, and pick the .xml file.' },
    resolve: { name: 'DaVinci Resolve', format: 'fcpxml', how: 'In Resolve: File › Import › Timeline, and pick the .fcpxml file.' },
    fcp: { name: 'Final Cut Pro', format: 'fcpxml', how: 'In Final Cut Pro: File › Import › XML, and pick the .fcpxml file.' }
  };
  function write(tl, kind, opts) { if (!WRITERS[kind]) throw new Error('Unknown format ' + kind); return Object.assign({ ext: EXT[kind], kind }, WRITERS[kind](tl, opts)); }

  /**
   * Relink: media whose file isn't where the timeline says, found by name in the files given (a folder's listing).
   * exists(path) → bool; files: [paths]. Returns {found, missing: [names]}.
   */
  function relink(tl, exists, files = []) {
    const byName = {};
    for (const f of files) { const k = baseName(f).toLowerCase(); (byName[k] = byName[k] || []).push(f); }
    const stem = s => baseName(s).toLowerCase().replace(/\.[^.]+$/, '');
    let found = 0; const missing = [];
    for (const m of Object.values(tl.media)) {
      if (m.path && exists(m.path)) continue;
      const k = baseName(m.path || m.name).toLowerCase();
      const hit = (byName[k] || [])[0] || files.find(f => stem(f) === stem(m.path || m.name));
      if (hit) { m.path = hit; found++; } else missing.push(m.name || baseName(m.path));
    }
    return { found, missing };
  }
  /** a copy with a new name */
  function renamed(tl, name) { return Object.assign({}, tl, { name }); }

  US.nleXml = { parseXml, toXml, el, parseTime, fmtTime, rateOf, framesToTC, tcToFrames, pathToUrl, urlToPath, toLabel, PREMIERE_LABELS,
    readXmeml, writeXmeml, readFcpxml, writeFcpxml, readEdl, writeEdl, readOtio, writeOtio, read, write, sniff, relink, renamed, stats, lostLines, blank, addMedia, finish, TARGETS, EXT, Q, secToFrames, framesToSec };
})();
