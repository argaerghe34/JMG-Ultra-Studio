window.__hotFiles = ['js/tools/33-deliver.js'];
const fs = require('fs'), path = require('path'), dir = US.host.extensionDir();
(0, eval)(fs.readFileSync(path.join(dir, 'js/tools/33-deliver.js'), 'utf8'));
const media = path.join(dir, 'dev/test-media/concert');
const imp = await US.host.call('importFiles', { paths: [path.join(media, 'C001_sharp_static.mp4'), path.join(media, 'C009_slow_pan_good.mp4')], binPath: 'Test – Me/Deliver' });
const seq = await US.host.call('newSequence', { name: 'Me Deliver Test', binPath: 'Test – Me', likeId: imp[0].id });
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: imp[0].id, in: 1, out: 6 }, { id: imp[1].id, in: 2, out: 7 }] });
await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: [{ start: 2, name: 'Part one' }, { start: 6, name: 'Part two' }] });
await US.host.call('openSequence', { seqId: seq.id });
await US.refreshContext();
US.tools.open('deliver');
const t0 = Date.now();
const res = await US.jobs.run({ title: 'Exporting the delivery pack (test)', tool: 'deliver' }, async job => {
  const a = US.actions.get('deliver.pack');
  return a.run({ outputs: 'master,v916,wav,thumb' }, job);
});
const files = res && res.dir ? fs.readdirSync(res.dir).map(f => f + ' ' + fs.statSync(path.join(res.dir, f)).size) : [];
return { secs: (Date.now() - t0) / 1000, res, files, log: US.log.entries().slice(-4).map(e => e.level + ': ' + e.text + ' ' + e.detail) };
