const fs = require('fs');
eval(fs.readFileSync('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/js/core/vision.js', 'utf8'));
require('fs').rmSync(require('path').join(US.fsx.dataDir, 'cache', 'vision'), { recursive: true, force: true });
const bins = await US.host.call('listBins');
const out = [];
for (const name of ['Test – Selects / Real', 'Test – Selects']) {
  const bin = bins.find(b => b.path === name);
  const items = await US.host.call('binItems', { binId: bin.id, kinds: ['video'], recursive: false });
  for (const it of items.filter(i => /WA0022|WA0001|C001|C010/.test(i.name))) {
    const t0 = performance.now();
    const d = await US.vision.analyseClip(it, { job: US.jobs.testJob() });
    const secs = (performance.now() - t0) / 1000;
    out.push(`${it.name} ${d.width}x${d.height} ${d.duration.toFixed(0)}s n=${d.samples.length} mode=${d.mode} wall=${secs.toFixed(1)}s speed=${(d.duration / secs).toFixed(1)}x`);
  }
}
return out;
