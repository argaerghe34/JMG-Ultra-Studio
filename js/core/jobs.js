/* JMG Ultra Studio – jobs: one long task at a time, always visible in the status bar with
   who is working, what is happening, progress, time left and a Stop button. Everything is logged. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path');

  /* ---------- activity log ---------- */
  const log = [];
  function logFile() { const d = new Date(); return path.join(US.fsx.logDir(), `activity-${d.toISOString().slice(0, 10)}.log`); }
  US.log = function (level, text, detail, tool) {
    const entry = { t: Date.now(), level, text: String(text), detail: detail ? String(detail) : '', tool: tool || (current && current.tool) || '' };
    log.push(entry); if (log.length > 800) log.shift();
    try { fs.appendFileSync(logFile(), `${new Date(entry.t).toISOString()} [${level}] ${entry.tool ? entry.tool + ': ' : ''}${entry.text}${entry.detail ? '\n    ' + entry.detail.replace(/\n/g, '\n    ') : ''}\n`); } catch (e) { /* disk full etc. */ }
    US.bus.emit('log', entry);
    return entry;
  };
  US.log.entries = () => log.slice();
  US.log.file = logFile;

  /* ---------- jobs ---------- */
  let current = null;
  const WHO = { studio: 'Ultra Studio', premiere: 'Premiere', encoder: 'Media Encoder', ai: 'AI', computer: 'Your computer' };

  class Job {
    constructor(opts) {
      this.id = US.uid('job-');
      this.title = opts.title;
      this.tool = opts.tool || '';
      this.who = opts.who || WHO.studio;
      this.msg = opts.msg || 'Starting…';
      this.frac = 0;
      this.indeterminate = true;
      this.started = performance.now();
      this.cancelled = false;
      this._eta = NaN;
      this._range = [0, 1];
    }
    /** Update who/what without changing progress. */
    set(o) { if (o.who) this.who = WHO[o.who] || o.who; if (o.msg != null) this.msg = o.msg; this._emit(); return this; }
    /** progress(0..1, message?) – fraction of the whole job (or of the current sub-range). */
    progress(f, msg) {
      const [a, b] = this._range;
      const v = US.clamp(a + (b - a) * US.clamp(+f || 0, 0, 1), 0, 1);
      if (v >= this.frac) this.frac = v;
      this.indeterminate = false;
      if (msg != null) this.msg = msg;
      const el = (performance.now() - this.started) / 1000;
      if (this.frac > 0.03 && el > 2) {
        const est = el / this.frac * (1 - this.frac);
        this._eta = isFinite(this._eta) ? this._eta * 0.7 + est * 0.3 : est;
      }
      this._emit();
      return this;
    }
    /** Restrict following progress() calls to [a,b] of the bar: job.range(0.2, 0.8) */
    range(a, b) { this._range = [a, b]; return this; }
    busy(msg, who) { this.indeterminate = true; if (msg != null) this.msg = msg; if (who) this.who = WHO[who] || who; this._emit(); return this; }
    /** Throw if the user pressed Stop. Call often inside loops. */
    check() { if (this.cancelled) throw new US.UserError('CANCELLED'); }
    get elapsed() { return (performance.now() - this.started) / 1000; }
    get eta() { return this._eta; }
    log(text, detail) { return US.log('info', text, detail, this.tool); }
    _emit() { if (!this.ended) US.bus.emit('job', this); }   // a job stopped at once may still be finishing in the background
  }

  /**
   * Run a job: US.jobs.run({title, tool}, async job => {...}).
   * Shows progress, logs start/finish, turns errors into plain toasts, returns the result (or undefined on failure).
   */
  async function run(opts, fn) {
    if (current) {
      US.ui && US.ui.toast({ type: 'warn', title: US.errors.CATALOG.BUSY[0], text: `“${current.title}” is still running. ` + US.errors.CATALOG.BUSY[1] });
      return undefined;
    }
    const job = (current = new Job(opts));
    US.log('info', `Started: ${job.title}`, '', job.tool);
    US.bus.emit('jobstart', job);
    job._emit();
    try {
      // three quick clicks on Stop end the job at once (hardStop): the work left behind stops at its next check, AI requests in
      // flight are cut off, and Premiere calls still waiting their turn are dropped
      const work = Promise.resolve().then(() => fn(job));
      work.catch(() => {});
      const result = await Promise.race([work, new Promise((_, reject) => { job._hard = () => reject(new US.UserError('CANCELLED')); })]);
      const secs = job.elapsed;
      const summary = (result && result.summary) || opts.doneText || 'Done';
      US.log('ok', `${job.title}: ${summary} (${US.fmtDur(secs)})`, '', job.tool);
      US.bus.emit('jobend', job, { ok: true, summary, secs });
      if (secs > 20) notify(`${job.title} – done`, summary);
      return result;
    } catch (err) {
      const x = US.errors.explain(err);
      if (x.code === 'CANCELLED') {
        US.log('info', `${job.title}: ${job.hard ? 'stopped at once by you (three clicks on Stop)' : 'stopped by you'}`, '', job.tool);
        US.bus.emit('jobend', job, { ok: false, cancelled: true, summary: 'Stopped' });
      } else {
        US.log('error', `${job.title}: ${x.title}`, x.detail, job.tool);
        US.bus.emit('jobend', job, { ok: false, summary: x.title });
        US.ui && US.ui.showError(err, { context: job.title });
        if (job.elapsed > 20) notify(`${job.title} – didn’t finish`, x.title);
      }
      return undefined;
    } finally {
      job.ended = true;
      current = null;
    }
  }
  const QUICK = 2000;   // three clicks on Stop within this many ms stop at once
  /** Stop now: end the job straight away and cut off whatever it's waiting for (AI requests, Premiere calls not yet started). */
  function hardStop() {
    const j = current;
    if (!j) return;
    j.cancelled = true; j.hard = true;
    US.log('info', `Stopping at once: ${j.title}`);
    US.bus.emit('hard-stop', j);
    if (j._hard) j._hard();
  }

  /* Premiere stops answering scripts while one of its own message boxes is open (an export error, a missing-media
     dialog…). Say so in the status bar and once as a toast, and put the message back when it answers again. */
  let slowToast = null;
  US.bus.on('host-slow', fn => {
    const j = current;
    if (!j || j._slow) return;
    j._slow = { msg: j.msg, who: j.who };
    j.set({ who: 'premiere', msg: 'Premiere hasn’t answered for a minute – if it’s showing a message box, answer it there' });
    US.log('info', `Premiere is taking a long time (${fn})`, '', j.tool);
    if (US.ui && !slowToast) slowToast = US.ui.toast({ type: 'warn', title: 'Premiere isn’t answering', text: 'It may be busy, or waiting for you to click OK in a message box in Premiere. Ultra Studio carries on as soon as it answers.', timeout: 0 });
  });
  US.bus.on('host-answered', () => {
    const j = current;
    if (slowToast) { slowToast(); slowToast = null; }
    if (j && j._slow) { j.set({ who: j._slow.who, msg: j._slow.msg }); j._slow = null; }
  });

  function notify(title, body) {
    if (!US.settings.get('notifyDesktop', true)) return;
    try { if (document.hasFocus && document.hasFocus()) return; new Notification(title, { body, silent: !US.settings.get('notifySound', true) }); } catch (e) { /* not available */ }
  }

  US.jobs = {
    run, WHO,
    get current() { return current; },
    /** A job object for tests and nested work that shouldn't take over the status bar. */
    testJob(title = 'test') { const j = new Job({ title, tool: 'test' }); j._emit = () => {}; return j; },
    /** Stop: the first click stops after the current step; three quick clicks (within 2 s) stop at once (hardStop).
        -> how many more quick clicks stop it at once (0 when it has) */
    cancel() {
      const j = current;
      if (!j) return 0;
      const now = Date.now();
      j._taps = (j._taps || []).filter(t => now - t < QUICK).concat(now);
      if (j._taps.length >= 3) { hardStop(); return 0; }
      if (!j.cancelled) { j.cancelled = true; j.msg = 'Stopping after this step… (three quick clicks on Stop stop it at once)'; j._emit(); US.log('info', `Stop requested: ${j.title}`); }
      return 3 - j._taps.length;
    },
    hardStop
  };
})();
