// Stop: one click stops after the current step; three quick clicks stop at once – the job ends while its work is still
// waiting, everything waiting for it is told (AI requests cut off, Premiere calls not yet started dropped), and the next
// job can start straight away.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time']);

test('one click: stops after the current step', async () => {
  let checked = null;
  const p = US.jobs.run({ title: 'steps', tool: 't' }, async job => { await US.sleep(60); try { job.check(); } catch (e) { checked = e.code; throw e; } return { summary: 'all done' }; });
  await US.sleep(10);
  assert.strictEqual(US.jobs.cancel(), 2, 'two more quick clicks to stop at once');
  assert.ok(US.jobs.current, 'still finishing its step');
  assert.strictEqual(await p, undefined);
  assert.strictEqual(checked, 'CANCELLED');
});

test('three quick clicks: stopped at once, the waiting work cut off, the next job free to start', async () => {
  let heard = 0;
  const off = US.bus.on('hard-stop', () => heard++);
  const t0 = Date.now();
  const p = US.jobs.run({ title: 'slow request', tool: 't' }, async job => { await US.sleep(3000); job.check(); return { summary: 'finished' }; });
  await US.sleep(10);
  US.jobs.cancel(); US.jobs.cancel();
  assert.ok(US.jobs.current, 'two clicks: not yet');
  assert.strictEqual(US.jobs.cancel(), 0);
  assert.strictEqual(await p, undefined);
  assert.ok(Date.now() - t0 < 1000, 'ended at once, not after the 3 s wait');
  assert.strictEqual(heard, 1, 'AI requests and Premiere calls were told to stop');
  assert.strictEqual(US.jobs.current, null);
  const next = await US.jobs.run({ title: 'next', tool: 't' }, async () => ({ summary: 'ok' }));
  assert.strictEqual(next.summary, 'ok');
  if (typeof off === 'function') off();
});

test('clicks too far apart don’t stop at once', async () => {
  const p = US.jobs.run({ title: 'slow', tool: 't' }, async job => { await US.sleep(400); job.check(); return { summary: 'x' }; });
  await US.sleep(5);
  US.jobs.cancel();
  const j = US.jobs.current; j._taps = j._taps.map(t => t - 5000);   // the first click, long ago
  assert.strictEqual(US.jobs.cancel(), 2, 'counting starts again');
  await p;
});
