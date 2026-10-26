// Loads vision.js into the running panel and measures every clip in "Test – Selects". Prints per-clip summaries.
const fs = require('fs');
const ROOT = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/';
eval(fs.readFileSync(ROOT + 'js/core/vision.js', 'utf8'));
if (window.__clearVisionCache) require('fs').rmSync(require('path').join(US.fsx.dataDir, 'cache', 'vision'), { recursive: true, force: true });
const bins = await US.host.call('listBins');
const bin = bins.find(b => b.path === 'Test – Selects');
const items = await US.host.call('binItems', { binId: bin.id, kinds: ['video'], recursive: true });
const job = US.jobs.testJob('vision test');
const t0 = performance.now();
const res = await US.vision.analyseMany(items.filter(i => !/C011/.test(i.name)), { job });
const secs = (performance.now() - t0) / 1000;
const med = (arr) => US.median(arr);
const out = res.results.sort((a, b) => a.item.name.localeCompare(b.item.name)).map(({ item, data }) => {
  const S = data.samples, f = k => +med(S.map(s => s[k] || 0)).toFixed(3), mx = k => +Math.max(...S.map(s => Math.abs(s[k] || 0))).toFixed(3);
  const jit = S.map(s => Math.hypot(s.vx - s.lx, s.vy - s.ly));
  return `${item.name.slice(0, 4)} n=${S.length} sh=${f('sh')} shr=${f('shr')} mean=${f('mean')} p90=${f('p90')} hi=${f('hi')} lo=${f('lo')} jit=${(+med(jit)).toFixed(3)} maxV=${mx('vx')} zm=${f('zm')} minZm=${(+Math.min(...S.map(s => s.zm))).toFixed(3)} err=${f('err')} cx=${f('cx')} fc=${S.filter(s => s.fc > 0).length}`;
});
return { secs: +secs.toFixed(1), footage: res.footage, speed: +(res.footage / secs).toFixed(1), failed: res.failed.map(f => f.item.name + ': ' + f.error.detail), out };
