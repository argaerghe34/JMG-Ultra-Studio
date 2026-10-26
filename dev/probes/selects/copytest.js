// Make an analysis copy of the ProRes test clip directly and report what Media Encoder did.
const bins = await US.host.call('listBins');
const bin = bins.find(b => b.path === 'Test – Selects');
const items = await US.host.call('binItems', { binId: bin.id, kinds: [], recursive: false });
const it = items.find(i => /prores/.test(i.name));
if (!it) return 'no prores item';
const job = US.jobs.testJob('copy');
const t0 = performance.now();
let res, err;
try { res = await US.vision.makeAnalysisCopies([it], job, {}); } catch (e) { err = (e.title || e.message) + ' | ' + (e.detail || ''); }
return { ms: Math.round(performance.now() - t0), err, made: res && res.made.length, failed: res && res.failed, want: US.vision.analysisCopyPath(it), exists: require('fs').existsSync(US.vision.analysisCopyPath(it)), dir: require('fs').readdirSync(require('path').dirname(US.vision.analysisCopyPath(it))), presets: await US.host.call('encoderPresets'), log: US.log.entries().slice(-6).map(e => e.level + ': ' + e.text + ' ' + e.detail) };
