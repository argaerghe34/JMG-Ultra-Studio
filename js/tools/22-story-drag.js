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
  const seconds = lines => lines.reduce((k, l) => k + (l.end - l.start), 0);
  /** The ranges to place, once each line's project item is known: [{id, in, out}] (lines without one left out). */
  function ranges(lines, itemOf) {
    return lines.map(l => ({ id: itemOf(l), in: l.start, out: l.end })).filter(r => r.id);
  }

  let pending = null;
  function tidy(p) { try { require('fs').unlinkSync(p.file); } catch (e) { /* already gone */ } }

  /**
   * Start a drag from a row. lines: what it carries; itemsFor(lines) -> Promise<[{id, in, out}]> (the clips to place);
   * name: what the stand-in is called while it's dragged.
   */
  function begin(e, { lines, itemsFor, name = 'Ultra Studio line' }) {
    if (!lines.length) { e.preventDefault(); return; }
    const fs = require('fs'), path = require('path'), os = require('os');
    const dir = path.join(os.tmpdir(), 'JMG Ultra Studio', 'drag');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (er) { /* exists */ }
    const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 60).trim() || 'Ultra Studio line';
    const file = path.join(dir, `${safe} ${Date.now().toString(36)}.wav`);
    fs.writeFileSync(file, wav(seconds(lines)));
    if (pending) { clearTimeout(pending.timer); tidy(pending); }
    const p = pending = { file, lines, clips: itemsFor(lines), timer: null, tries: 0 };
    p.clips.catch(() => {});
    if (US.app.is('resolve')) {
      // a real file drag from Electron; the page gets no dragend, so watch for the drop straight away
      e.preventDefault();
      try { require('electron').ipcRenderer.send('ultra-studio:start-drag', file); } catch (er) { /* no drag */ }
      watch(p, 50);
    } else {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('com.adobe.cep.dnd.file.0', file);
      e.dataTransfer.setData('text/plain', lines.map(l => l.text).join(' '));
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

  US.storyDrag = { wav, linesFor, seconds, ranges, begin };
})();
