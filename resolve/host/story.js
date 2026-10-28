// JMG Ultra Studio – Story (Resolve side). Same commands, arguments and results as jsx/tools/story.jsx.
// Where Resolve differs (see dev/RESOLVE.md):
// - Transcripts: Resolve's own transcription can't be read by script, but its subtitles can. storyTranscribe puts one
//   clip on a scratch timeline, has Resolve make subtitles from its audio, reads them (text + times in media seconds)
//   and deletes the timeline again. Subtitles are per phrase, not per word.
// - storyCue can't drive the Source Viewer: it selects the clip in the Media Pool and says where its media is; the
//   panel plays the line itself (js/core/host.js cue()).
// - Theme names and highlights: Resolve can't make adjustment clips by script, so they are range markers (one per
//   theme or highlighted line, in the theme's colour); the clips themselves get the theme's clip colour.
// - storyProjectFile: a Resolve project lives in a database, not a file. Its Story travels in a "JMG Ultra Studio"
//   folder next to the project's media instead (see storyProjectFile below).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

/** Premiere label colours 0–15 as the nearest of Resolve's 16 marker colours (themes keep their colour on markers). */
const LABEL_MARKER = ['Lavender', 'Blue', 'Cyan', 'Lavender', 'Sky', 'Green', 'Rose', 'Sand', 'Purple', 'Blue', 'Cyan', 'Fuchsia', 'Cream', 'Mint', 'Cocoa', 'Yellow'];
const HL = 'us-hl-', TH = 'us-th-';               // customData of our highlight / theme-name markers
const SCRATCH = 'JMG Ultra Studio/.scratch';      // where scratch timelines live while they exist
const STORY_FOLDER = 'JMG Ultra Studio';
/** Same as 22-story-sync.js: characters Windows doesn't allow in file names. */
const safeName = s => String(s || 'Project').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '') || 'Project';
/** Windows paths are handled the Windows way on any computer (tests run on a Mac). */
const P = p => (/^[A-Za-z]:[\\/]|^\\\\/.test(p) ? path.win32 : path.posix);
const isWinPath = p => P(p) === path.win32;

module.exports = (R) => {
  /* ---------- small helpers ---------- */
  function clipTiming(item) {
    const p = R.props(item), fps = R.clipFps(item, p), tc = String(p['Start TC'] || '');
    const drop = /;/.test(tc) || /^(1|true|yes|on)$/i.test(String(p['Drop frame'] || ''));
    const f = tc ? R.tcToFrames(tc, fps) : 0;
    return { fps, drop, start: isFinite(f) ? f / fps : 0, audioOnly: R.quickKind(item) === 'audio' };
  }
  const span = (tl, ti) => ({ start: R.tlSec(tl, ti.GetStart()), end: R.tlSec(tl, ti.GetEnd()) });
  const trackOf = ti => { try { return R.list(ti.GetTrackTypeAndIndex()); } catch (e) { return []; } };
  /** The timeline item to report for a placement: the picture when there is one. */
  const mainItem = got => got.find(ti => trackOf(ti)[0] === 'video') || got[0] || null;
  function ensureTracks(tl, type, n) { while (tl.GetTrackCount(type) < n) if (!(type === 'audio' ? tl.AddTrack('audio', 'stereo') : tl.AddTrack(type))) throw R.err('HOST_SCRIPT', `Resolve would not add ${type} track ${n}`); }
  /** Lay a media range on a timeline at a time (seconds from its start). extra: trackIndex, mediaType. -> [TimelineItem] */
  function placeRange(tl, item, inSec, outSec, at, extra) {
    if (R.num(at) == null) throw R.err('BAD_INPUT', `No time to place ${item.GetName()} at (${at})`);
    R.open(tl);
    const info = R.clipInfo(item, inSec, outSec, Object.assign({ trackIndex: 1, recordFrame: R.tlFrame(tl, at) }, extra || {}));
    ensureTracks(tl, 'video', info.trackIndex); ensureTracks(tl, 'audio', info.trackIndex);
    return R.list(R.pool().AppendToTimeline([info])).filter(Boolean);
  }
  function colourItems(items, label) {
    const c = R.LABEL_COLORS[label];
    if (label == null || !c) return;
    for (const ti of items) { try { ti.SetClipColor(c); } catch (e) { /* the colour is a nicety */ } }
  }
  /** Run fn with Resolve put back afterwards: the current timeline, the page and the Media Pool folder. */
  function keepPlace(fn) {
    const pr = R.project(), tl = pr.GetCurrentTimeline(), pool = R.pool(), folder = pool.GetCurrentFolder();
    let page = ''; try { page = R.api.GetCurrentPage ? R.api.GetCurrentPage() : ''; } catch (e) { /* older Resolve */ }
    const back = () => {
      try { if (tl && R.timelines().some(t => R.id(t) === R.id(tl))) pr.SetCurrentTimeline(tl); } catch (e) { /* closing */ }
      try { if (folder) pool.SetCurrentFolder(folder); } catch (e) { /* closing */ }
      try { if (page && R.api.GetCurrentPage() !== page) R.api.OpenPage(page); } catch (e) { /* closing */ }
      R.forget();
    };
    let r;
    try { r = fn(); } catch (e) { back(); throw e; }
    if (r && typeof r.then === 'function') return r.then(v => { back(); return v; }, e => { back(); throw e; });
    back();
    return r;
  }
  /** A scratch timeline in JMG Ultra Studio/.scratch; delete it with dropScratch. */
  function scratchTimeline(name) {
    const bin = R.ensureBin(SCRATCH);
    const tl = R.inFolder(bin, () => R.pool().CreateEmptyTimeline(R.uniqueTimelineName(name)));
    if (!tl) throw R.err('HOST_SCRIPT', 'Resolve would not make a scratch timeline');
    return tl;
  }
  function dropScratch(tls) {
    try { if (tls.length) R.pool().DeleteTimelines(tls); } catch (e) { /* left in the .scratch bin */ }
    R.forget();
    // the bin goes too once it's empty
    const e = R.index().folders.find(f => f.parts.join('/') === SCRATCH);
    if (e && !R.list(e.folder.GetClipList()).length && !R.list(e.folder.GetSubFolderList()).length) { try { R.pool().DeleteFolders([e.folder]); } catch (er) { /* harmless */ } R.forget(); }
  }

  const TRANSCRIBE = 'Ultra Studio transcribe';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const subtitleItems = tl => { const out = []; for (let i = 1, n = tl.GetTrackCount('subtitle') || 0; i <= n; i++) out.push(...R.list(tl.GetItemListInTrack('subtitle', i)).filter(Boolean)); return out; };
  /** Resolve's background transcription into tl: its subtitles once they've arrived and stopped changing, else null. */
  async function waitForSubtitles(tl, T, secs) {
    const end = T.now() + T.max(secs);
    let n = 0, since = T.now();
    while (T.now() < end) {
      await sleep(T.poll);
      const k = subtitleItems(tl).length;
      if (k !== n) { n = k; since = T.now(); } else if (n > 0 && T.now() - since >= T.settle) return subtitleItems(tl);
    }
    return null;
  }
  /** Transcribe timelines left behind (Resolve was maybe still writing into them): gone once an hour old. */
  function dropOldTranscribeTimelines(now) {
    const old = R.timelines().filter(t => { const m = new RegExp('^' + TRANSCRIBE + ' (\\d{12,})$').exec(String(t.GetName())); return m && now - Number(m[1]) > 3600e3; });
    if (old.length) dropScratch(old);
  }

  /* ---------- range markers (theme names, highlights) ---------- */
  /** Our markers on a timeline (customData starting with prefix) -> count removed */
  function clearMarkers(tl, prefix) {
    let n = 0;
    for (const [frame, m] of Object.entries(R.markers(tl))) if (m && String(m.customData || '').startsWith(prefix) && R.deleteMarker(tl, frame, m.customData)) n++;
    return n;
  }
  /** One range marker per section, named after it, in its theme's colour. -> {placed, log} */
  function sectionMarkers(tl, sections, prefix, note) {
    const fps = R.fps(tl), taken = new Set(Object.keys(R.markers(tl)).map(Number)), log = [];
    let placed = 0;
    for (const s of sections || []) {
      const start = R.num(s && s.start), end = R.num(s && s.end);
      if (start == null || end == null || !(end > start)) continue;
      // timeline marker frames count from the timeline's first frame (core.js); one marker per frame in Resolve
      const f0 = Math.max(0, Math.round(start * fps));
      let f = f0;
      while (taken.has(f)) f++;
      const dur = Math.max(1, Math.round((end - start) * fps) - (f - f0));
      const colour = s.label != null && LABEL_MARKER[s.label] ? LABEL_MARKER[s.label] : 'Purple';
      let ok = false, why = '';
      try { ok = tl.AddMarker(f, colour, String(s.name || '').slice(0, 120), note, dur, prefix + R.newGuid().slice(3)); } catch (e) { why = ': ' + e.message; }   // Resolve throws its refusals
      if (ok) { taken.add(f); placed++; } else log.push(`marker not added at ${start.toFixed(2)} s${why}`);
    }
    return { placed, log };
  }

  return {
    /** Every clip with media (no timelines). a.paths: only these files; a.selected: only the clips selected in the
        Media Pool (Resolve only – Story transcribes those). -> [{id, name, path, bin, sub}] */
    storyClips(a) {
      let want = null;
      const key = p => (isWinPath(p) ? String(p).replace(/\//g, '\\').toLowerCase() : String(p));
      if (a && a.paths && a.paths.length) want = new Set(a.paths.map(key));
      let list = R.index().clips;
      if (a && a.selected) { const sel = new Set(R.list(R.pool().GetSelectedClips()).map(R.id)); list = list.filter(c => sel.has(c.id)); }
      const out = [];
      for (const c of list) {
        const p = R.props(c.item), file = String(p['File Path'] || '');
        if (!file || /timeline|compound/i.test(String(p['Type'] || ''))) continue;
        if (want && !want.has(key(file))) continue;
        const info = R.itemInfo(c.item, c.parts);
        out.push({ id: c.id, name: info.name, path: file, bin: info.bin, sub: !!info.subclip });
      }
      return out;
    },

    /** Media start (timecode offset in seconds) and frame rate for clips: a.ids -> {id: {fps, drop, start, audioOnly}} */
    storyTiming(a) {
      const out = {};
      for (const id of a.ids || []) { const it = R.itemById(id); if (it) out[id] = clipTiming(it); }
      return out;
    },

    /**
     * Resolve has no way to cue or play its Source Viewer by script: the clip is selected in the Media Pool, and the
     * panel plays the line itself from the media file (or its proxy). -> {position, timing, loaded, path, proxy, name}
     */
    storyCue(a) {
      const it = R.needItem(a.id), info = R.itemInfo(it);
      try { R.pool().SetSelectedClip(it); } catch (e) { /* selecting is a nicety */ }
      return { position: Math.max(0, a.seconds || 0), timing: clipTiming(it), loaded: info.id, path: info.path, proxy: info.proxy, name: info.name, hasVideo: info.hasVideo, offline: info.offline };
    },
    /** Stops the panel's own player (Resolve's viewers can't be stopped by script). */
    storyStop() {
      try { const US = global.US || (global.window && global.window.US); if (US && US.host && US.host.cue && US.host.cue.stop) US.host.cue.stop(); } catch (e) { /* nothing playing */ }
      return true;
    },

    /**
     * Resolve only: transcribe one clip with Resolve's own speech-to-text. The clip goes on a scratch timeline,
     * Timeline.CreateSubtitlesFromAudio makes subtitles, and their text and times (media seconds) come back; the
     * timeline is deleted and Resolve is left as it was.
     * Measured in 21.1.2: Resolve transcribes in the BACKGROUND – the call returns at once (and throws "GetArgument"
     * when given a settings dict, though it starts anyway) and the subtitles arrive all together later (~25 s for a
     * 90 s clip). Deleting the timeline before then crashes Resolve, so this waits for them, and a timeline that may
     * still be in use is left in the .scratch bin (cleared on a later run, once it's an hour old).
     * a: {id, language?} -> {id, name, path, items:[{text, start, end}]}
     */
    async storyTranscribe(a) {
      const it = R.needItem(a.id), info = R.itemInfo(it);
      if (info.offline) throw R.err('OFFLINE', info.path);
      if (!info.hasAudio) throw R.err('NO_AUDIO', info.name, `“${info.name}” has no sound to transcribe.`, 'Pick your interview clips (with sound) in the Media Pool.');
      const T = Object.assign({ poll: 1000, settle: 4000, max: secs => 180e3 + secs * 3000, now: () => Date.now() }, R.transcribeTiming);
      dropOldTranscribeTimelines(T.now());
      return keepPlace(async () => {
        const tl = scratchTimeline(TRANSCRIBE + ' ' + T.now());
        let inUse = false;   // Resolve may be writing into tl: never delete it then
        try {
          const got = placeRange(tl, it, info.rangeStart, info.rangeEnd, 0);
          const placed = got.find(ti => trackOf(ti)[0] === 'audio') || got[0];
          if (!placed) throw R.err('HOST_SCRIPT', 'AppendToTimeline placed nothing for ' + info.name);
          const t = R.itemTimes(tl, placed);
          // settings only by Resolve's own constants (JavaScript has none in 21.1, and an empty dict is refused)
          const api = R.api, set = {};
          if (api.SUBTITLE_CHARS_PER_LINE != null) set[api.SUBTITLE_CHARS_PER_LINE] = 60;
          if (api.SUBTITLE_LINE_BREAK != null && api.AUTO_CAPTION_LINE_DOUBLE != null) set[api.SUBTITLE_LINE_BREAK] = api.AUTO_CAPTION_LINE_DOUBLE;
          const lang = a.language && api['AUTO_CAPTION_' + String(a.language).toUpperCase()];
          if (api.SUBTITLE_LANGUAGE != null && lang != null) set[api.SUBTITLE_LANGUAGE] = lang;
          let started = false, why = '';
          try { started = Object.keys(set).length ? tl.CreateSubtitlesFromAudio(set) : tl.CreateSubtitlesFromAudio(); } catch (e) { why = e.message; started = /GetArgument/i.test(why); }
          if (!started) throw R.err('HOST_SCRIPT', 'CreateSubtitlesFromAudio: ' + (why || 'returned false'), `Resolve couldn’t transcribe “${info.name}”.`, 'Check the clip plays with sound in Resolve, then try again. Transcribing needs DaVinci Resolve Studio.');
          inUse = true;
          const subs = await waitForSubtitles(tl, T, info.rangeEnd - info.rangeStart);
          if (!subs) throw R.err('HOST_SCRIPT', 'No subtitles after waiting ' + Math.round(T.max(info.rangeEnd - info.rangeStart) / 1000) + ' s', `Resolve hasn’t finished transcribing “${info.name}”.`, 'It may still be working, or heard no speech. Wait a minute, then press Transcribe with Resolve again.');
          inUse = false;
          const items = [];
          for (const ti of subs) {
            const text = String(ti.GetName() || '').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            const s = R.tlSec(tl, ti.GetStart()), e = R.tlSec(tl, ti.GetEnd());
            // timeline time -> media time of the clip placed at 0
            items.push({ text, start: +(t.in + s - t.start).toFixed(3), end: +(t.in + e - t.start).toFixed(3) });
          }
          items.sort((x, y) => x.start - y.start);
          return { id: info.id, name: info.name, path: info.path, language: a.language || '', items };
        } finally { if (!inUse) dropScratch([tl]); }
      });
    },

    /**
     * Place lines on a timeline, each with its theme colour as the clip colour (the timeline clip's own colour, so
     * the source clip is untouched – Premiere's "relabel" without the relabelling). method is accepted as in Premiere;
     * Resolve has one way. a: {seqId, clips:[{id, in, out, label?, name?}], cursor} -> {cursor, placed, method}
     */
    storyPlace(a) {
      const tl = R.needSeq(a.seqId);
      let cursor = R.num(a.cursor) != null ? R.num(a.cursor) : R.tlDuration(tl);
      const placed = [];
      for (const c of a.clips || []) {
        const it = R.needItem(c.id);
        // a line without times is skipped (null), never sent to Resolve as NaN
        if (R.num(c.in) == null || R.num(c.out) == null) { placed.push(null); continue; }
        const got = placeRange(tl, it, c.in, c.out, cursor);
        const main = mainItem(got);
        if (!main) { placed.push(null); cursor += R.num(c.out) - R.num(c.in); continue; }
        colourItems(got, c.label);
        const s = span(tl, main);
        placed.push(s); cursor = s.end;
      }
      return { cursor, placed, method: 'clipcolour' };
    },

    /**
     * Theme names over a built timeline. Resolve can't make adjustment clips by script, so each theme gets a range
     * marker the length of its section, named after it, in its colour (the clips carry the colour already).
     * a: {seqId, sections:[{name, start, end, label?}]} -> {kind:'markers', how, track:-1, placed, renamed, log}
     */
    storyThemeLayers(a) {
      const tl = R.needSeq(a.seqId);
      clearMarkers(tl, TH);
      const r = sectionMarkers(tl, a.sections, TH, 'Theme – JMG Ultra Studio Story');
      return { kind: 'markers', how: 'range markers', track: -1, placed: r.placed, renamed: r.placed, log: r.log };
    },

    /**
     * Highlight selected lines on a string-out: a range marker per line, in its theme's colour and named after its
     * themes. Running again replaces the earlier highlights; other markers are left alone.
     * a: {seqId, sections:[{name, start, end, label}]} -> {kind, how, track, named, placed, renamed, removed, log}
     */
    storyHighlights(a) {
      const tl = R.needSeq(a.seqId), removed = clearMarkers(tl, HL);
      const r = sectionMarkers(tl, a.sections, HL, 'Selected line – JMG Ultra Studio Story');
      return { kind: 'markers', how: 'range markers', track: -1, named: true, placed: r.placed, renamed: r.placed, removed, log: r.log };
    },
    /** a: {seqId} -> {removed, track} */
    storyRemoveHighlights(a) {
      const tl = R.needSeq(a.seqId);
      return { removed: clearMarkers(tl, HL), track: -1 };
    },

    /** Timecode of a timeline: its start (seconds), frame rate and drop-frame display. */
    storySequenceTiming(a) {
      const tl = R.needSeq(a.seqId), fps = R.fps(tl);
      // the start timecode as shown (01:00:00:00), else the start frame (the same number in real Resolve)
      let f = NaN; try { f = R.tcToFrames(tl.GetStartTimecode(), fps); } catch (e) { /* older Resolve */ }
      if (!isFinite(f)) f = tl.GetStartFrame();
      return { zero: f / fps, fps, drop: R.dropFrame(tl), displayFormat: 0, name: tl.GetName() };
    },

    /**
     * Where this project's Story travels. A Resolve project lives in a database, not a file, so Story goes next to
     * the project's media (kept on the same drive on the Mac and the PC): a "JMG Ultra Studio" folder in
     *   1. a.prefer – the folder the panel remembered for this project, while it's still there;
     *   2. else the folder where this project's Story file already is (looked for beside every media folder and the
     *      folders above it – it's found again on the other computer, and when media is added elsewhere later);
     *   3. else the deepest folder holding all the media on the drive with the most of it (never the top of the
     *      start-up disk or a home folder).
     * path is "<that folder>/<project name>" – not a real file: 22-story-sync.js puts the copy in
     * "<folder>/JMG Ultra Studio/<project name> – Story.json", as it does beside a .prproj. id is Resolve's project id
     * (this computer's own copy is kept under it). No media yet -> path '' and reason 'nomedia' (kept on this
     * computer only, until there is).
     * a: {save?, prefer?} -> {path, name, id, folder, found, reason}
     */
    storyProjectFile(a) {
      const pr = R.project(), name = String(pr.GetName() || 'Project'), id = R.id(pr) || name;
      if (a && a.save) { try { R.pm().SaveProject(); } catch (e) { /* Resolve saves on its own too */ } }
      const file = folder => P(folder).join(folder, STORY_FOLDER, safeName(name) + ' – Story.json');
      const out = folder => ({ path: folder ? P(folder).join(folder, safeName(name)) : '', name, id, folder: folder || '', found: !!folder && R.exists(file(folder)), reason: folder ? '' : 'nomedia' });
      const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } };
      if (a && a.prefer && isDir(a.prefer)) return out(a.prefer);
      const dirs = new Map();   // media folder -> clips in it
      for (const c of R.index().clips) {
        const p = R.props(c.item), f = String(p['File Path'] || '');
        if (!f || /timeline|compound/i.test(String(p['Type'] || ''))) continue;
        const d = P(f).dirname(f); dirs.set(d, (dirs.get(d) || 0) + 1);
      }
      if (!dirs.size) return out('');
      const k = d => (isWinPath(d) ? d.toLowerCase() : d);
      const under = (d, top) => { const a1 = k(d), t = k(top).replace(/[\\/]+$/, ''); return a1 === t || a1.startsWith(t + P(d).sep); };
      const ancestors = d => { const o = []; for (let x = d, i = 0; i < 64; i++) { o.push(x); const up = P(x).dirname(x); if (up === x) break; x = up; } return o; };
      const count = top => { let n = 0; for (const [d, c] of dirs) if (under(d, top)) n += c; return n; };
      // 2. an existing Story file beside the media
      const seen = new Set(), found = [];
      for (const d of dirs.keys()) for (const x of ancestors(d)) { if (seen.has(k(x)) || seen.size > 2000) continue; seen.add(k(x)); if (R.exists(file(x))) found.push(x); }
      if (found.length) return out(found.sort((x, y) => count(y) - count(x) || y.length - x.length)[0]);
      // 3. the deepest folder holding the media on the busiest drive
      const vol = d => { let m = /^[A-Za-z]:[\\/]/.exec(d); if (m) return d.slice(0, 3).toUpperCase(); m = /^\\\\[^\\]+\\[^\\]+/.exec(d); if (m) return m[0].toLowerCase(); m = /^\/Volumes\/[^/]+/.exec(d); return m ? m[0] : '/'; };
      const byVol = new Map();
      for (const [d, c] of dirs) { const v = vol(d); const e = byVol.get(v) || { n: 0, dirs: [] }; e.n += c; e.dirs.push(d); byVol.set(v, e); }
      const main = Array.from(byVol.values()).sort((x, y) => y.n - x.n)[0];
      let common = main.dirs[0];
      for (const d of main.dirs) while (!under(d, common)) { const up = P(common).dirname(common); if (up === common) break; common = up; }
      const home = os.homedir();
      const shallow = c => {
        const n = k(c).replace(/[\\/]+$/, '');
        if (isWinPath(c)) return /^[a-z]:$/.test(n) && n === String(process.env.SystemDrive || 'c:').toLowerCase() || /^[a-z]:\\users(\\[^\\]+)?$/.test(n);
        return n === '' || /^\/(Users|home)(\/[^/]+)?$/.test(n) || /^\/Volumes$/.test(n) || n === k(home);
      };
      return out(shallow(common) ? '' : common);
    },

    /**
     * Captions for a timeline from an SRT file: imported into the Media Pool's Captions bin; added:false tells the panel
     * to say "drag it to the start of the timeline". a: {seqId, srt, binPath} -> {itemId, added, track}
     */
    storyCaptions(a) {
      const tl = R.needSeq(a.seqId);
      if (!R.exists(a.srt)) throw R.err('NOT_FOUND', a.srt);
      const bin = R.ensureBin(a.binPath || 'JMG Ultra Studio/Captions');
      const item = R.list(R.inFolder(bin, () => R.pool().ImportMedia([a.srt])))[0];
      if (!item) throw R.err('HOST_SCRIPT', 'ImportMedia gave nothing for ' + a.srt, 'Resolve couldn’t read the captions file.', 'Try again. If it keeps happening, send the activity log.');
      const itemId = R.id(item);
      // Not laid on the timeline by script: Resolve 21.1 crashes (an assertion in GetMediaFrameExtentsWithFrameRate)
      // when a script reads a subtitle item's frames or appends one. The file waits in the Captions bin for one drag.
      void tl;
      return { itemId, added: false, track: -1, reason: 'drag' };
    }
  };
};
module.exports.LABEL_MARKER = LABEL_MARKER;
module.exports.safeName = safeName;
