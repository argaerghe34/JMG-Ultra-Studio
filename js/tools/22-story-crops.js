/* JMG Ultra Studio – Story › Clips for social › Same crop per person: instead of the host's automatic reframe (which
   can drift from clip to clip), each person – a camera file, or one speaker in a shared wide shot – gets a crop set
   once (left–right and zoom) and every vertical clip of them uses it. The copy is made at the new shape with nothing
   reframed, then each clip is moved with the hosts' own Motion (Premiere) or Pan/Zoom (Resolve). Nothing is looked at:
   the positions are the editor's. Pure logic (unit-tested); the card and the build are in 22-story.js. */
(function () {
  'use strict';
  const US = window.US;

  const keyOf = (path, speaker) => `${String(path || '')}|${String(speaker || '')}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /**
   * The people in a set of lines: one row per camera file and speaker. transcriptOf(lineId) -> {path, name}.
   * -> [{key, path, speaker, file, lines}] most lines first
   */
  function people(lineIds, { lineOf, transcriptOf, speakerName = s => s } = {}) {
    const by = new Map();
    for (const id of lineIds || []) {
      const l = lineOf(id), t = l && transcriptOf(id);
      if (!l || !t || !t.path) continue;
      const k = keyOf(t.path, l.speaker);
      if (!by.has(k)) by.set(k, { key: k, path: t.path, speaker: l.speaker || '', who: speakerName(l.speaker), file: US.basename ? US.basename(t.path) : String(t.path).split(/[\\/]/).pop(), lines: 0 });
      by.get(k).lines++;
    }
    return [...by.values()].sort((a, b) => b.lines - a.lines);
  }

  /**
   * Where a clip goes in the narrower frame so the crop centred on source fraction f (0 left – 1 right) fills it.
   * srcW: the clip's width in the original frame (the original sequence's width when it filled it), newW: the new
   * frame's width, zoom: 1 = as it was. -> {x (0–1 across the new frame, as Premiere's Position), f (clamped)}
   */
  function position(f, { srcW, newW, zoom = 1 }) {
    const w = srcW * Math.max(1, zoom), half = Math.min(0.5, newW / (2 * w));
    const fc = clamp(Number.isFinite(+f) ? +f : 0.5, half, 1 - half);
    return { x: 0.5 + (0.5 - fc) * w / newW, f: fc };
  }

  /**
   * The person in each timeline clip: the speaker of the lines it holds (from the same file, in its source range).
   * clip: {path, in, out}; linesOf(path) -> lines in media time. -> speaker or ''
   */
  function speakerIn(clip, linesOf) {
    const n = new Map();
    for (const l of linesOf(clip.path) || []) {
      const o = Math.min(l.end, clip.out) - Math.max(l.start, clip.in);
      if (o > 0) n.set(l.speaker || '', (n.get(l.speaker || '') || 0) + o);
    }
    let best = '', most = 0;
    for (const [s, v] of n) if (v > most) { best = s; most = v; }
    return best;
  }

  /**
   * The moves for a copy at the new shape: one editApply per person (same position and scale), clips without a crop
   * set left centred. info: sequenceInfo/editRead of the copy; crops: {key: {x, zoom}}; srcW: the original width.
   * -> [{key, params: {x, scale?}, targets: [{kind, track, start}]}]
   */
  function plan(info, crops, { srcW, linesOf = () => [] } = {}) {
    const newW = info.width, groups = new Map();
    for (const tr of info.video || []) for (const c of tr.clips || []) {
      if (!c.path || c.isSequence || c.disabled) continue;
      const sp = speakerIn(c, linesOf), key = crops[keyOf(c.path, sp)] ? keyOf(c.path, sp) : crops[keyOf(c.path, '')] ? keyOf(c.path, '') : null;
      if (!key) continue;
      const cr = crops[key], zoom = clamp(+cr.zoom || 1, 1, 3), base = Number.isFinite(+c.scale) && +c.scale > 0 ? +c.scale : 100;
      const p = position(cr.x, { srcW, newW, zoom });
      const params = { x: Math.round(p.x * 10000) / 10000 };
      if (zoom !== 1) params.scale = Math.round(base * zoom * 10) / 10;
      const g = `${key}#${params.x}#${params.scale || ''}`;
      if (!groups.has(g)) groups.set(g, { key, params, targets: [] });
      groups.get(g).targets.push({ kind: 'video', track: tr.index, start: c.start });
    }
    return [...groups.values()];
  }

  US.storyCrops = { keyOf, people, position, speakerIn, plan };
})();
