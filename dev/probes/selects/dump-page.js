// Re-records dev/tests/fixtures/vision-clips.json using only the panel (no Premiere calls): item info comes from the old fixture.
const fs = require('fs');
const ROOT = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/';
eval(fs.readFileSync(ROOT + 'js/core/vision.js', 'utf8'));
const old = JSON.parse(fs.readFileSync(ROOT + 'dev/tests/fixtures/vision-clips.json', 'utf8'));
const out = [];
for (const b of old) {
  const items = b.clips.map(c => Object.assign({ proxy: '' }, c.item));
  const res = await US.vision.analyseMany(items, { job: US.jobs.testJob(), parallel: 3 });
  out.push({ bin: b.bin, seconds: res.seconds, footage: res.footage, failed: res.failed.length, clips: res.results.map(r => ({ item: r.item, data: r.data })) });
}
fs.writeFileSync(ROOT + 'dev/tests/fixtures/vision-clips.json', JSON.stringify(out));
return out.map(a => `${a.bin}: ${a.clips.length} clips, ${a.footage.toFixed(0)} s in ${a.seconds.toFixed(1)} s = ${(a.footage / a.seconds).toFixed(1)}× (3 at once), failed ${a.failed}`);
