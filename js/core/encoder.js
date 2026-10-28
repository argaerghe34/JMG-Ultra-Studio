/* JMG Ultra Studio – Media Encoder: queue several renders, follow their real progress in the status bar,
   honour Stop (we stop following; Media Encoder carries on) and report each result plainly.
   In Resolve the same run() uses Resolve's Render Queue: the renders are added there, started, and followed by asking
   Resolve how each one is getting on (renderJobStatus) every second; Stop stops Resolve's render. */
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
    if (!tasks.length) return [];
    if (US.app.is('resolve')) return runResolve(tasks, job, opts);
    const label = opts.label || 'Exporting', from = opts.from || 0, to = opts.to == null ? 1 : opts.to;
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
        const id = await queue(t);
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

  /** Add one task to the queue (Media Encoder or Resolve's Render Queue). → job id */
  async function queue(t) {
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
    return id;
  }

  /**
   * Resolve: the same as run(), through Resolve's Render Queue. Only our renders are started, and finished ones are taken
   * off the queue again; failed ones stay there so the Deliver page can show why. Stop stops the render and takes our
   * unfinished renders off the queue (files already finished are kept).
   */
  async function runResolve(tasks, job, opts) {
    const label = opts.label || 'Exporting', from = opts.from || 0, to = opts.to == null ? 1 : opts.to;
    const byJob = new Map(), state = { done: 0, last: Date.now(), sig: '' };
    const progress = () => {
      const all = Array.from(byJob.values());
      const frac = all.reduce((s, x) => s + (x.progress || 0), 0) / tasks.length;
      const cur = all.find(x => !x.done);
      job.set({ who: 'encoder' }).progress(from + (to - from) * frac, cur ? `${label} ${state.done + 1} of ${tasks.length} · ${cur.name || path.basename(cur.out)}` : 'Finishing');
    };
    job.set({ who: 'encoder', msg: 'Adding the renders to Resolve’s Render Queue' });
    const stopAll = () => US.host.call('renderStop', { ids: Array.from(byJob.keys()) }).catch(() => 0);
    try {
      for (const t of tasks) {
        job.check();
        const id = await queue(t);
        if (!id) throw new US.UserError('RENDER_FAILED', { title: 'Resolve didn’t add the render to its queue.', action: 'Open the Deliver page, check the render settings there, then try again.', detail: `queue returned ${id} for ${t.out}` });
        t.id = String(id); t.progress = 0; t.done = false; byJob.set(t.id, t);
      }
    } catch (e) {
      // a render that couldn't be queued (or Stop): the ones already queued come off the queue again
      if (byJob.size) await stopAll();
      throw e;
    }
    // queue only: the renders wait in the Render Queue until Render All is pressed on the Deliver page
    if (opts.queueOnly) { tasks.forEach(t => { t.queued = true; }); return tasks; }
    try { await US.host.call('startEncoderBatch', { ids: Array.from(byJob.keys()) }); }
    catch (e) { await stopAll(); throw e; }
    progress();
    const quiet = (opts.quietMinutes || 20) * 60000;
    while (state.done < tasks.length) {
      await US.sleep(US.encoder.pollMs);
      if (job.cancelled) {
        await stopAll();
        throw new US.UserError('CANCELLED', { title: 'Stopped rendering.', action: 'Files that had finished are kept; the rest were taken off Resolve’s Render Queue.' });
      }
      const ids = tasks.filter(t => !t.done).map(t => t.id);
      const list = await US.host.call('renderJobStatus', { ids });
      for (const s of list || []) {
        const t = byJob.get(String(s.id)); if (!t || t.done) continue;
        t.progress = Math.max(t.progress || 0, +s.progress || 0);
        if (s.status === 'complete') { t.progress = 1; t.done = true; t.ok = true; if (s.file) t.out = s.file; state.done++; }
        else if (/failed|cancelled|missing/.test(s.status)) { t.done = true; t.ok = false; t.error = s.error || (s.status === 'failed' ? 'Resolve couldn’t render it' : 'cancelled in Resolve'); state.done++; }
      }
      const sig = tasks.map(t => `${t.done ? 1 : 0}:${(t.progress || 0).toFixed(3)}`).join(',');
      if (sig !== state.sig) { state.sig = sig; state.last = Date.now(); }
      progress();
      if (state.done < tasks.length && Date.now() - state.last > quiet) {
        await stopAll();
        throw new US.UserError('RENDER_FAILED', { title: 'Resolve’s render has gone quiet.', action: 'Check Resolve isn’t showing a message, then try again.', detail: `${state.done}/${tasks.length} done` });
      }
    }
    for (const t of tasks) if (t.ok && !US.fsx.exists(t.out)) { t.ok = false; t.error = 'Resolve said it finished, but the file isn’t there'; }
    return tasks;
  }

  US.encoder = { run, unique, queue, pollMs: 1000, presets: () => US.host.call('encoderPresets') };
})();
