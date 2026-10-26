/* JMG Ultra Studio – Story › Timeline transcript (pure logic, unit-tested): which clips count, mapping their
   transcript lines onto the sequence, who is who, and paragraphs. The screen is in 22-story.js. */
(function () {
  'use strict';
  const US = window.US;
  const GENERIC = /^(|speaker\s*\d+|unknown( speaker)?|spk\s*\d+|s\d+)$/i;

  /**
   * Which clips to transcribe. info: sequenceInfo(). hasTranscript(clip) -> bool.
   * tracks: 'auto' (audio tracks with at least one transcribed clip) or an array of audio track indexes.
   * Returns {clips:[{track, kind, start, end, in, out, speed, itemId, path, name}], audioTracks:[…], nested:[], disabled, muted:[]}
   */
  function collectClips(info, { tracks = 'auto', hasTranscript }) {
    const audioTracks = info.audio.map(t => {
      const real = t.clips.filter(c => !c.disabled && !c.isSequence);
      return { index: t.index, name: t.name, muted: !!t.muted, clips: t.clips.length, transcribed: real.filter(hasTranscript).length };
    });
    const use = new Set(tracks === 'auto' ? audioTracks.filter(t => !t.muted && t.transcribed).map(t => t.index) : tracks);
    const out = [], nested = [], muted = [];
    let disabled = 0;
    for (const t of info.audio) {
      if (!use.has(t.index)) continue;
      if (t.muted) { muted.push(t.name); continue; }
      for (const c of t.clips) {
        if (c.disabled) { disabled++; continue; }
        if (c.isSequence) { nested.push(c.name); continue; }
        out.push(Object.assign({ track: 'A' + (t.index + 1), kind: 'audio' }, pick(c)));
      }
    }
    // automatic mode: a transcribed clip used on V1 with no audio from the same file on any audio track at that time
    const v1 = info.video[0];
    const anyAudio = info.audio.flatMap(t => t.clips);
    if (tracks === 'auto' && v1 && !v1.muted) for (const c of v1.clips) {
      if (c.disabled || c.isSequence || !hasTranscript(c)) continue;
      const covered = anyAudio.some(a => (a.path && a.path === c.path || a.itemId === c.itemId) && a.start < c.end - 0.01 && a.end > c.start + 0.01);
      if (!covered) out.push(Object.assign({ track: 'V1', kind: 'video' }, pick(c)));
    }
    out.sort((a, b) => a.start - b.start);
    return { clips: out, audioTracks, nested: Array.from(new Set(nested)), disabled, muted };
  }
  function pick(c) { return { start: c.start, end: c.end, in: c.in, out: c.out, speed: c.speed, itemId: c.itemId, path: c.path, name: c.name }; }

  /**
   * One clip's transcript lines on the sequence. A line cut by the edit keeps only the words that are heard (marked …):
   * exact when the line has Premiere's word timings, otherwise the words are spread evenly over the line.
   * Speed changes are mapped; reversed clips are skipped.
   * -> [{start, end, srcIn, srcOut, text, speaker, lineId, partial, exact, words:[{start, end, text}]}]
   */
  function mapLines(clip, lines) {
    const speed = Math.abs(clip.speed || 1) || 1;
    if (clip.speed < 0) return [];
    const a = Math.min(clip.in, clip.out), b = Math.max(clip.in, clip.out);
    const out = [];
    for (const l of lines) {
      if (!(l.end > a && l.start < b)) continue;
      const wt = US.transcript.wordTimes(l), words = wt.words, n = words.length;
      const keep = [];
      for (let i = 0; i < n; i++) { const mid = (words[i].s + words[i].e) / 2; if (mid >= a && mid < b) keep.push(i); }
      if (!keep.length) continue;
      const i0 = keep[0], i1 = keep[keep.length - 1];
      const srcIn = Math.max(a, words[i0].s), srcOut = Math.min(b, words[i1].e);
      out.push({
        start: clip.start + (srcIn - a) / speed, end: clip.start + (srcOut - a) / speed, srcIn, srcOut,
        text: (i0 > 0 ? '…' : '') + words.slice(i0, i1 + 1).map(w => w.text).join(' ') + (i1 < n - 1 ? '…' : ''),
        speaker: l.speaker || '', lineId: l.id, partial: i0 > 0 || i1 < n - 1, exact: wt.exact,
        // every heard word on the sequence (for captions)
        words: keep.map(i => ({ start: clip.start + (Math.max(a, words[i].s) - a) / speed, end: clip.start + (Math.min(b, words[i].e) - a) / speed, text: words[i].text }))
      });
    }
    return out;
  }

  /**
   * The whole timeline. transcriptFor(clip) -> transcript {key, name, lines} or null.
   * Returns {entries (time order, each with clipKey/speakerKey/clip), missing:[clip], speakers:[{key, label, clipName, talk, sample, first}]}
   */
  function build(clips, transcriptFor) {
    const entries = [], missing = [], seen = new Set();
    for (const c of clips) {
      const t = transcriptFor(c);
      if (!t) { if (!missing.some(m => (m.path || m.name) === (c.path || c.name))) missing.push(c); continue; }
      for (const e of mapLines(c, t.lines)) {
        // the same line heard twice (e.g. the clip's two mics on A1 and A2) is kept once
        const k = e.lineId + '@' + Math.round(e.start * 10);
        if (seen.has(k)) continue;
        seen.add(k);
        entries.push(Object.assign(e, { clipKey: t.key, clip: c.name, itemId: c.itemId, speakerKey: t.key + '|' + e.speaker }));
      }
    }
    entries.sort((p, q) => p.start - q.start || p.end - q.end);
    const byKey = new Map();
    for (const e of entries) {
      let s = byKey.get(e.speakerKey);
      if (!s) { s = { key: e.speakerKey, label: e.speaker, clipName: e.clip, clipKey: e.clipKey, talk: 0, sample: null, first: e.start }; byKey.set(e.speakerKey, s); }
      s.talk += e.end - e.start;
      if (!s.sample || (!e.partial && e.text.length > s.sample.text.length && e.text.length < 220)) s.sample = e;
    }
    return { entries, missing, speakers: Array.from(byKey.values()).sort((p, q) => p.first - q.first) };
  }

  /**
   * Names for every (clip, speaker): what the editor typed, else a real name Premiere already had, else Speaker A, B, C…
   * in order of first appearance. names: {speakerKey: name}. Returns Map speakerKey -> display name.
   */
  function displayNames(speakers, names = {}) {
    const out = new Map();
    let n = 0;
    const letter = i => 'Speaker ' + (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
    const taken = new Set();
    for (const s of speakers) { const typed = (names[s.key] || '').trim(); const pre = !GENERIC.test(s.label || '') ? s.label : ''; const v = typed || pre; if (v) { out.set(s.key, v); taken.add(v.toLowerCase()); } }
    for (const s of speakers) {
      if (out.has(s.key)) continue;
      let l; do { l = letter(n++); } while (taken.has(l.toLowerCase()));
      out.set(s.key, l);
    }
    // one spelling per person: the first one seen ("ruth" typed later shows as "Ruth")
    const canon = new Map();
    for (const s of speakers) { const v = out.get(s.key), k = v.toLowerCase(); if (!canon.has(k)) canon.set(k, v); out.set(s.key, canon.get(k)); }
    return out;
  }
  /** Same display name = same person (case and spaces ignored): totals per person, in order of first appearance. */
  function people(speakers, display) {
    const map = new Map();
    for (const s of speakers) {
      const name = display.get(s.key), k = name.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { name, talk: 0, keys: [], first: s.first });
      const p = map.get(k); p.talk += s.talk; p.keys.push(s.key); p.first = Math.min(p.first, s.first);
    }
    return Array.from(map.values()).sort((a, b) => a.first - b.first);
  }
  /** Consecutive entries from the same person become one paragraph (a gap over maxGap seconds starts a new one). */
  function paragraphs(entries, display, { maxGap = 5 } = {}) {
    const out = [];
    for (const e of entries) {
      const name = display.get(e.speakerKey);
      const last = out[out.length - 1];
      if (last && last.name.toLowerCase() === name.toLowerCase() && e.start - last.end <= maxGap) { last.text += ' ' + e.text; last.end = Math.max(last.end, e.end); last.entries.push(e); }
      else out.push({ start: e.start, end: e.end, name, text: e.text, entries: [e] });
    }
    for (const p of out) p.text = p.text.replace(/…\s+…/g, ' ').replace(/\s+/g, ' ').trim();
    return out;
  }

  /* ---------- highlights on a string-out (S1) ---------- */
  const firstWords = (t, n = 6) => String(t).replace(/^…/, '').split(/\s+/).slice(0, n).join(' ').replace(/[,;:]$/, '') + (String(t).split(/\s+/).length > n ? '…' : '');
  /**
   * Highlight clips for the selected lines heard in a sequence. sel: Map lineId -> {label, names:[theme names]}.
   * -> [{name: "Family + Faith · My name is Ruth…", start, end, label, lineId}] in timeline order.
   */
  function highlightSections(entries, sel) {
    const out = [];
    for (const e of entries) {
      const s = sel.get(e.lineId); if (!s) continue;
      out.push({ name: `${s.names.join(' + ')} · ${firstWords(e.text)}`, start: e.start, end: e.end, label: s.label, lineId: e.lineId });
    }
    return out.sort((a, b) => a.start - b.start);
  }
  /**
   * Per interview: how much of what's on the string-out has been selected, and where the gaps are.
   * -> [{key, name, total, selected, pct, start, end, ranges:[{start, end, selected, label}], gaps:[{start, end}]}]
   */
  function coverage(entries, sel) {
    const by = new Map();
    for (const e of entries) {
      if (!by.has(e.clipKey)) by.set(e.clipKey, { key: e.clipKey, name: e.clip, total: 0, selected: 0, start: e.start, end: e.end, ranges: [] });
      const c = by.get(e.clipKey), s = sel.get(e.lineId), d = e.end - e.start;
      c.total += d; if (s) c.selected += d;
      c.start = Math.min(c.start, e.start); c.end = Math.max(c.end, e.end);
      c.ranges.push({ start: e.start, end: e.end, selected: !!s, label: s ? s.label : null, lineId: e.lineId });
    }
    return Array.from(by.values()).map(c => {
      c.ranges.sort((a, b) => a.start - b.start);
      c.pct = c.total ? c.selected / c.total : 0;
      // unselected stretches (joining neighbours closer than 2 s), longest first
      const gaps = [];
      for (const r of c.ranges) { if (r.selected) continue; const g = gaps[gaps.length - 1]; if (g && r.start - g.end < 2) g.end = Math.max(g.end, r.end); else gaps.push({ start: r.start, end: r.end }); }
      c.gaps = gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      return c;
    }).sort((a, b) => a.start - b.start);
  }

  US.storyTimeline = { collectClips, mapLines, build, displayNames, people, paragraphs, GENERIC, highlightSections, coverage, firstWords };
})();
