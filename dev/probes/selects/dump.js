const fs = require('fs');
eval(fs.readFileSync('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/js/core/vision.js', 'utf8'));
const bins = await US.host.call('listBins');
const all = [];
for (const name of ['Test – Selects', 'Test – Selects / Real']) {
  const bin = bins.find(b => b.path === name);
  const items = await US.host.call('binItems', { binId: bin.id, kinds: ['video'], recursive: false });
  const res = await US.vision.analyseMany(items, { job: US.jobs.testJob(), parallel: 3 });
  all.push({ bin: name, seconds: res.seconds, footage: res.footage, failed: res.failed.length, clips: res.results.map(r => ({ item: { id: r.item.id, name: r.item.name, duration: r.item.duration, fps: r.item.fps, width: r.item.width, height: r.item.height, path: r.item.path }, data: r.data })) });
}
fs.writeFileSync('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/dev/tests/fixtures/vision-clips.json', JSON.stringify(all));
return all.map(a => `${a.bin}: ${a.clips.length} clips, ${a.footage.toFixed(0)} s footage in ${a.seconds.toFixed(1)} s = ${(a.footage / a.seconds).toFixed(1)}x (3 at once), failed ${a.failed}`);
