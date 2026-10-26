const fs = require('fs');
eval(fs.readFileSync('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/js/core/vision.js', 'utf8'));
const old = JSON.parse(fs.readFileSync('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/dev/tests/fixtures/vision-clips.json', 'utf8'));
const out = {};
for (const n of ['C007', 'C001', 'C005', 'C009', 'C006']) {
  const c = old[0].clips.find(x => x.item.name.startsWith(n));
  const t0 = performance.now();
  const d = await US.vision.analyseClip(Object.assign({ proxy: '' }, c.item), { job: US.jobs.testJob() });
  out[n] = { ms: Math.round(performance.now() - t0), n: d.samples.length, zm: d.samples.map(s => s.zm).join(' ') };
}
return out;
