// Auto Sync's screen in the real panel (jsdom, dev/tests/panel-dom.js) with a pretend editor and pretend sound: it is
// in Advanced, nothing is listened to or built before the button, a press builds one NEW sequence, and the report says
// what happened to each clip – the one that shares no sound is named as not synced. Then Ask runs the same job.
// Prints JSON on the last line (autosync.test.js reads it).
const { US, $$, tick, boot, errors, w } = require('./panel-dom');
const problems = [], fail = m => problems.push(m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SR = 16000;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function room(sec, seed) {
  const r = rng(seed), d = new Float32Array(sec * SR); let t = 0;
  while (t < sec) {
    const len = 0.08 + r() * 0.25, gap = 0.03 + r() * (r() < 0.15 ? 1.5 : 0.2), f = 150 + r() * 1500, amp = 0.2 + r() * 0.6;
    for (let i = Math.floor(t * SR), e = Math.min(d.length, Math.floor((t + len) * SR)); i < e; i++) { const x = (i / SR - t) / len; d[i] += amp * Math.sin(Math.PI * x) * (Math.sin(2 * Math.PI * f * i / SR) + 0.5 * (r() - 0.5)); }
    t += len + gap;
  }
  return d;
}
function hear(R, from, to, gain, seed) { const r = rng(seed), out = new Float32Array(Math.round((to - from) * SR)); for (let i = 0; i < out.length; i++) out[i] = gain * (R[Math.round(from * SR) + i] || 0) + 0.02 * (r() - 0.5); return out; }

(async () => {
  await boot();
  const A = US.autoSync, R = room(60, 3);
  const sound = { '/s/A CAM/C0001.MP4': hear(R, 5, 45, 0.3, 1), '/s/B CAM/C0001.MP4': hear(R, 20, 60, 0.3, 2), '/s/ZOOM/T01.WAV': hear(R, 0, 60, 1, 3), '/s/B CAM/C0002.MP4': hear(room(15, 77), 0, 15, 0.5, 4) };
  const items = Object.keys(sound).map((p, i) => ({ id: 'i' + i, name: p.split('/').pop(), path: p, kind: /WAV$/.test(p) ? 'audio' : 'video', hasVideo: !/WAV$/.test(p), hasAudio: true, duration: sound[p].length / SR, rangeStart: 0, rangeEnd: sound[p].length / SR, fps: 25, offline: false }));
  const heard = [], built = [], other = [];
  A.io.sound = async it => { heard.push(it.path); return { data: sound[it.path], sr: SR, offset: 0 }; };
  const real = US.host.call;
  US.host.call = async (fn, a) => {
    if (fn === 'selectionSummary') return { count: items.length, skipped: 0 };
    if (fn === 'selectionList') return items.map(i => ({ id: i.id, name: i.name, kind: i.kind }));
    if (fn === 'selectedItems') return items;
    if (fn === 'itemsInfo') return a.ids.map(id => items.find(i => i.id === id) || null);
    if (fn === 'syncBuild') { built.push(a); return { id: 'new' + built.length, name: a.name, placed: a.layers.length, missing: [], passes: 1 }; }
    if (fn === 'openSequence' || fn === 'setPlayhead') { other.push(fn); return true; }
    return real(fn, a);
  };
  const view = () => w.document.querySelector('.view > :not(.hidden)');
  const one = sel => view().querySelector(sel);

  US.tools.open('advanced'); await tick();
  const tile = one('.tile[data-tool="autosync"]');
  if (!tile) fail('no Auto Sync tile in Advanced'); else tile.click();
  await tick();
  if (!one('[data-as="source"]')) { fail('Auto Sync didn’t open'); console.log(JSON.stringify({ problems, errors })); process.exit(0); }
  if (!/‹ Advanced/.test(view().textContent)) fail('no way back to Advanced');
  if (!/Sound/.test(one('[data-as="mode"]').textContent) || !/Timecode/.test(one('[data-as="mode"]').textContent)) fail('no choice of sound or timecode');
  if (!/aren’t changed/.test(view().textContent)) fail('the screen doesn’t say the clips and sequences aren’t changed');
  await sleep(30);
  if (heard.length || built.length) fail('something was listened to or built before the button');

  const go = $$('button', view()).find(b => /Sync into a new sequence/.test(b.textContent));
  if (!go) fail('no “Sync into a new sequence” button'); else go.click();
  for (let i = 0; i < 400 && !built.length; i++) await sleep(25);
  for (let i = 0; i < 100 && US.jobs.current; i++) await sleep(25);
  await sleep(50);
  if (built.length !== 1) fail('expected one new sequence, got ' + built.length);
  else {
    const b = built[0], L = Object.fromEntries(b.layers.map(l => [l.id, l]));
    if (b.name !== 'Synced' || b.binPath !== 'JMG Ultra Studio/Auto Sync') fail('name or bin: ' + b.name + ' / ' + b.binPath);
    if (b.videoNames.join() !== 'A CAM,B CAM' || b.audioNames.join() !== 'A CAM,B CAM,Recorder 1') fail('tracks: ' + b.videoNames + ' | ' + b.audioNames);
    if (!(Math.abs(L.i0.at - 5) <= 0.04 && Math.abs(L.i1.at - 20) <= 0.04 && L.i2.at === 0)) fail('clips not where they belong: ' + JSON.stringify(b.layers.map(l => [l.id, l.at])));
    if (!(L.i3.at >= 60)) fail('the clip with no shared sound should be at the end: ' + L.i3.at);
    if (!b.markers.some(m => m.name === 'Not synced')) fail('no “Not synced” marker');
  }
  if (heard.slice().sort().join() !== Object.keys(sound).sort().join()) fail('each file should be listened to once: ' + heard.join());
  const res = one('[data-as="results"]');
  if (!/3 of 4/.test(res.textContent) || !/clips lined up/.test(res.textContent)) fail('the result doesn’t say 3 of 4: ' + res.textContent.slice(0, 200));
  if (!/couldn’t be placed/.test(res.textContent)) fail('no note about the clip that couldn’t be placed');
  if ($$('.as-lane', res).length !== 3 || $$('.as-clip', res).length !== 4 || $$('.as-clip.loose', res).length !== 1) fail('the picture: ' + $$('.as-lane', res).length + ' rows, ' + $$('.as-clip', res).length + ' clips');
  const rows = $$('.list-row', res).map(r => r.textContent);
  if (rows.length !== 4 || !rows.some(t => /C0002\.MP4/.test(t) && /not synced: shares no sound with the others/.test(t)) || !rows.some(t => /by sound · a (clear|good) match/.test(t))) fail('the report: ' + rows.join(' | '));
  if (!/Multi-Camera › Enable/.test(res.textContent)) fail('no word on how to switch between the cameras');
  if (/null|undefined|NaN/.test(view().textContent)) fail('“null”, “undefined” or “NaN” on screen');

  // Ask runs the same job on the selected clips
  const a = US.actions.get('autosync.sync');
  if (!a) fail('Ask has no Auto Sync action');
  else {
    const p = a.match('sync the selected clips');
    if (!p) fail('Ask doesn’t understand “sync the selected clips”');
    else { const r = await a.run(p, US.jobs.testJob ? US.jobs.testJob() : { set() { return this; }, progress() {}, check() {} }); if (built.length !== 2 || !/3 of 4 clips lined up/.test(r.summary)) fail('Ask: ' + (r && r.summary)); }
  }
  // the tour's steps point at things that are on the screen
  const def = US.tools.get('autosync');
  for (const s of def.tour || []) if (!/^text:/.test(s.target) && !one(s.target)) fail('tour step points at nothing: ' + s.target);
  console.log(JSON.stringify({ problems, errors: errors.filter(e => /autosync/i.test(e)) }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ problems: ['crash: ' + e.stack], errors: [] })); process.exit(0); });
