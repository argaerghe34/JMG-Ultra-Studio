// Measure the extra Selects test clips (dev/test-media/selects) in the panel and save them as a fixture.
const fs = require('fs'), path = require('path');
const ROOT = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/';
eval(fs.readFileSync(ROOT + 'js/core/vision.js', 'utf8'));
const dir = ROOT + 'dev/test-media/selects/';
const items = fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).sort().map((f, i) => ({ id: 'S' + i, name: f, path: dir + f, proxy: '', duration: 10, fps: 25, width: 1920, height: 1080 }));
const res = await US.vision.analyseMany(items, { job: US.jobs.testJob(), parallel: 3 });
const out = { bin: 'Selects checks', seconds: res.seconds, failed: res.failed.length, clips: res.results.map(r => ({ item: r.item, data: r.data })) };
fs.writeFileSync(ROOT + 'dev/tests/fixtures/vision-checks.json', JSON.stringify(out));
return `${out.clips.length} clips in ${res.seconds.toFixed(1)} s, failed ${res.failed.length}`;
