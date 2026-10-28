/* JMG Ultra Studio – Media Encoder: queue several renders, follow their real progress in the status bar,
   honour Stop (we stop following; Media Encoder carries on) and report each result plainly. */
(function () {
  'use strict';
  const US = window.US;
  const path = require('path');

  const listeners = new Set();
  let bound = false;
  function bind() {
    if (bound) return;
    window.__adobe_cep__.addEventListener('com.jmgphotography.ultrastudio.encoder', e => {
      let d = e.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
      listeners.forEach(fn => fn(d));
    });
    bound = true;
  }

  /** "Name.mp4" → "Name (2).mp4" if it exists, so earlier files are never overwritten. */
  function unique(file) {
    if (!US.fsx.exists(file)) return file;
    const ext = path.extname(file), base = file.slice(0, -ext.length);
    for (let i = 2; i < 1000; i++) { const f = `${base} (${i})${ext}`; if (!US.fsx.exists(f)) return f; }
    return file;
  }

  /**
   * Render through Media Encoder.
   * tasks: [{seqId | itemId, out, preset, name, overwrite?, range?: {start, end}}]  (overwrite: replace an existing file, e.g. a cache copy;
   *        range: only that part of the sequence)
   * opts: {label: 'Exporting', from: 0, to: 1, quietMinutes: 20, queueOnly: false}
   * Returns the tasks with {ok, out, error}. Throws CANCELLED if Stop is pressed (renders already queued carry on).
   */
  async function run(tasks, job, opts = {}) {
    const label = opts.label || 'Exporting', from = opts.from || 0, to = opts.to == null ? 1 : opts.to;
    if (!tasks.length) return [];
    bind();
    await US.host.call('encoderListen');
    const byJob = new Map(), state = { done: 0, last: Date.now() };
    let resolveAll; const finished = new Promise(r => { resolveAll = r; });
    const progress = () => {
      const all = Array.from(byJob.values());
      const frac = all.reduce((s, x) => s + (x.progress || 0), 0) / tasks.length;
      const cur = all.find(x => !x.done);
      job.set({ who: 'encoder' }).progress(from + (to - from) * frac, cur ? `${label} ${state.done + 1} of ${tasks.length} · ${cur.name || path.basename(cur.out)}` : 'Finishing');
    };
    const onEvent = d => {
      const t = byJob.get(String(d.job)); if (!t) return;
      state.last = Date.now();
      if (d.kind === 'progress') t.progress = Math.max(t.progress || 0, +d.progress || 0);
      if (d.kind === 'complete' && !t.done) { t.progress = 1; t.done = true; t.ok = true; if (d.path) t.out = d.path; state.done++; }
      if ((d.kind === 'error' || d.kind === 'cancelled') && !t.done) { t.done = true; t.ok = false; t.error = d.message || 'cancelled in Media Encoder'; state.done++; }
      progress();
      if (state.done >= tasks.length) resolveAll();
    };
    listeners.add(onEvent);
    try {
      job.set({ who: 'encoder', msg: 'Starting Media Encoder (it opens in its own window)' });
      for (const t of tasks) {
        job.check();
        if (!t.overwrite) t.out = unique(t.out);
        else { try { require('fs').unlinkSync(t.out); } catch (e) { /* not there */ } }
        US.fsx.ensureDir(path.dirname(t.out));
        let id = t.range
          ? await US.host.call('queueRangeExport', { seqId: t.seqId, out: t.out, preset: t.preset, start: t.range.start, end: t.range.end })
          : t.seqId
            ? await US.host.call('queueExport', { seqId: t.seqId, out: t.out, preset: t.preset, workArea: 0 })
            : await US.host.call('queueItemExport', { id: t.itemId, out: t.out, preset: t.preset });
        // a range comes back as {id, restored}: whether the sequence's own In/Out were put back
        if (id && typeof id === 'object') { if (id.restored === false) t.inOutNotRestored = { in: id.hadIn, out: id.hadOut }; id = id.id; }
        if (!id || id === '0') throw new US.UserError('RENDER_FAILED', { title: 'Media Encoder didn’t accept the job.', action: 'Open Media Encoder once by hand, then try again.', detail: `queue returned ${id} for ${t.out}` });
        t.id = String(id); t.progress = 0; t.done = false; byJob.set(t.id, t);
      }
      // queue only: the renders wait in Media Encoder until its green Start button is pressed
      if (opts.queueOnly) { tasks.forEach(t => { t.queued = true; }); return tasks; }
      await US.host.call('startEncoderBatch');
      progress();
      const quiet = (opts.quietMinutes || 20) * 60000;
      while (state.done < tasks.length) {
        await Promise.race([finished, US.sleep(1000)]);
        if (job.cancelled) throw new US.UserError('CANCELLED', { title: 'Stopped following Media Encoder.', action: 'Renders already queued carry on there; cancel them in Media Encoder if you want them gone.' });
        if (Date.now() - state.last > quiet) throw new US.UserError('RENDER_FAILED', { title: 'Media Encoder has gone quiet.', action: 'Check its window – it may be waiting for you.', detail: `${state.done}/${tasks.length} done` });
      }
      for (const t of tasks) if (t.ok && !US.fsx.exists(t.out)) { t.ok = false; t.error = 'Media Encoder said it finished, but the file isn’t there'; }
      return tasks;
    } finally { listeners.delete(onEvent); }
  }

  US.encoder = { run, unique, presets: () => US.host.call('encoderPresets') };
})();
