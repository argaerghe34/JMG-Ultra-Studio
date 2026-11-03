/* JMG Ultra Studio – Story › Find: drag a line (or the ticked lines) straight onto the timeline. A panel can only hand
   Premiere or Resolve a file to drop, and dropping the interview file itself would lay the whole interview down (and
   overwrite whatever follows). So the drag carries a silent stand-in exactly as long as the line(s); once it lands,
   the host swaps it for the interview clip – video and audio, cut to each line's In and Out – at the same time on the
   matching tracks (storyDropSwap). The WAV and the order of lines are pure (unit-tested); the drag itself is below. */
(function () {
  'use strict';
  const US = window.US;

  /** A silent mono 16-bit WAV of the given length. -> Buffer */
  function wav(seconds, rate = 16000) {
    const n = Math.max(1, Math.round(Math.max(0, +seconds || 0) * rate)), data = n * 2, b = Buffer.alloc(44 + data);
    b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(data, 40);
    return b;
  }

  /**
   * The lines a drag carries: the ticked lines (in the order ticked) when the dragged line is one of several ticked,
   * otherwise just the dragged line. Lines without times are left out.
   */
  function linesFor(line, picked = [], lineOf = () => null) {
    const ids = picked.includes(line.id) && picked.length > 1 ? picked : [line.id];
    return ids.map(id => (id === line.id ? line : lineOf(id))).filter(l => l && Number.isFinite(+l.start) && Number.isFinite(+l.end) && l.end > l.start);
  }
  /**
   * What gets placed for some lines: each line's range with a little extra either side (handles, never before the
   * media's start) and the colour it's placed in (labelOf(line) -> label 0–15 or null).
   * -> [{lineId, start, end, label}]
   */
  function spans(lines, { handles = 0, labelOf = () => null } = {}) {
    const hd = Math.max(0, +handles || 0);
    return lines.map(l => { const lb = labelOf(l); return { lineId: l.id, start: Math.max(0, l.start - hd), end: l.end + hd, label: lb == null ? null : lb }; });
  }
  const seconds = ps => ps.reduce((k, p) => k + (p.end - p.start), 0);
  /**
   * The ranges to place, once each line's project item (and its length) is known: [{id, in, out, label?}] – lines
   * without a clip left out, never past the end of the media.
   */
  function ranges(ps, itemOf, durOf = () => Infinity) {
    return ps.map(p => {
      const id = itemOf(p);
      if (!id) return null;
      const d = durOf(id), out = d > 0 ? Math.min(d, p.end) : p.end, r = { id, in: p.start, out };
      if (p.label != null) r.label = p.label;
      return r.out > r.in ? r : null;
    }).filter(Boolean);
  }
  // icons for the line buttons: the Source Monitor with In/Out, and "at the playhead"
  if (US.addIcon) {
    US.addIcon('source', 'M3 4.5h14v9H3zM7 16.5h6M7.5 7v4M7.5 7h1.2M7.5 11h1.2M12.5 7v4M12.5 7h-1.2M12.5 11h-1.2');
    US.addIcon('playhead', 'M10 2.5v15M7 2.5h6l-3 3.5zM3 12h4M13 12h4M4.5 10.5 3 12l1.5 1.5M15.5 10.5 17 12l-1.5 1.5');
    US.addIcon('grip', 'M7.5 5h.01M12.5 5h.01M7.5 10h.01M12.5 10h.01M7.5 15h.01M12.5 15h.01');
  }

  let pending = null;
  function tidy(p) { try { require('fs').unlinkSync(p.file); } catch (e) { /* already gone */ } }

  /**
   * Start a drag from a row. pieces: what it carries (spans()); itemsFor(pieces) -> Promise<[{id, in, out, label?}]>
   * (the clips to place); name: what the stand-in is called while it's dragged.
   */
  function begin(e, { pieces, itemsFor, name = 'Ultra Studio line' }) {
    e.stopPropagation();
    if (!pieces.length) { e.preventDefault(); return; }
    const fs = require('fs'), path = require('path'), os = require('os');
    const dir = path.join(os.tmpdir(), 'JMG Ultra Studio', 'drag');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (er) { /* exists */ }
    const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 60).trim() || 'Ultra Studio line';
    const file = path.join(dir, `${safe} ${Date.now().toString(36)}.wav`);
    fs.writeFileSync(file, wav(seconds(pieces)));
    if (pending) { clearTimeout(pending.timer); tidy(pending); }
    const p = pending = { file, clips: itemsFor(pieces), timer: null, tries: 0 };
    p.clips.catch(() => {});
    if (US.app.is('resolve')) {
      // a real file drag from Electron; the page gets no dragend, so watch for the drop straight away
      e.preventDefault();
      try { require('electron').ipcRenderer.send('ultra-studio:start-drag', file); } catch (er) { /* no drag */ }
      watch(p, 50);
    } else {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('com.adobe.cep.dnd.file.0', file);
      e.target.addEventListener('dragend', () => watch(p, 15), { once: true });
    }
  }
  /** Look for the stand-in on the timeline every ¾ s (for up to `times` looks); swap it when it's there. */
  function watch(p, times) {
    const look = async () => {
      if (pending !== p) return;
      p.tries++;
      try {
        const clips = await p.clips;
        if (!clips.length) throw new US.UserError('NOT_FOUND', { title: 'This interview isn’t linked to a clip in the project.', action: 'Link it in Story › 1 Interviews › Interviews and speakers, then drag again.' });
        const r = await US.host.call('storyDropSwap', { path: p.file, clips });
        if (r && r.found) {
          pending = null; tidy(p);
          US.ui.toast({ type: 'ok', title: `${US.plural(clips.length, 'line')} placed at ${US.fmtDur(r.start)}`, text: 'Video and audio, cut to the line’s In and Out.', timeout: 3000 });
          return;
        }
      } catch (err) { pending = null; tidy(p); US.ui.showError(err); return; }
      if (p.tries < times) p.timer = setTimeout(look, 750);
      else if (pending === p) { pending = null; tidy(p); }
    };
    p.timer = setTimeout(look, 500);
  }

  US.storyDrag = { wav, linesFor, spans, seconds, ranges, begin };
})();
