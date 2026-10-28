// Story › Captions in real Premiere: a caption track on a transcribed cut, timed to the words, in each style.
const S = US.story, fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const BIN = 'Test – Story', SEQ = 'Test – Story captions';
const prevBase = US.settings.get('story.binBase'), prevDir = US.settings.get('story.exportDir');
const outDir = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports'); fs.mkdirSync(outDir, { recursive: true });   // imported into the test project, so not a temp folder
US.settings.set('story.binBase', BIN); US.settings.set('story.exportDir', outDir);
const captionTracks = () => T.captionTracks();
try {
  S.loadState();
  const [ruth, c001] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('concert', 'C001_sharp_static.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt'), T.media('transcripts', 'C001_sharp_static.json')]);
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 2, out: 9 }, { id: c001.id, in: 0, out: 10 }] });
  await T.open(seq.id);
  const before = await captionTracks();
  const r = await T.action('story.captions', { style: 'social', upper: true });
  T.assert(r.count > 5 && fs.existsSync(r.file), 'captions written: ' + r.summary);
  T.assert(await captionTracks() === before + 1, 'a caption track was added to the sequence');
  const srt = fs.readFileSync(r.file, 'utf8');
  const cues = srt.trim().split(/\n\n/).map(b => b.split('\n')).map(l => ({ t: l[1], text: l.slice(2).join(' ') }));
  T.assert(cues.every(c => c.text === c.text.toUpperCase() && c.text.split(' ').length <= 3), 'social style: capitals, up to 3 words');
  // C001's transcript has word times: “Welcome everyone” starts 0.5 s into the clip, which sits at 7 s on the sequence
  const welcome = cues.find(c => /^WELCOME/.test(c.text));
  T.assert(welcome && /^00:00:07,5\d\d/.test(welcome.t), 'word-timed: ' + (welcome && welcome.t));
  const sub = await T.action('story.captions', { style: 'subtitles', names: true });
  const subText = fs.readFileSync(sub.file, 'utf8');
  T.assert(/: /.test(subText) && subText.split(/\n\n/).every(b => b.split('\n').slice(2).every(l => l.length <= 46)), 'subtitles: names and lines of up to ~42 characters');
  T.assert(US.actions.get('story.captions').match('social captions in caps for reels').style === 'social', 'assistant routes social captions');
  return { social: r.summary, subtitles: sub.summary, first: cues.slice(0, 3).map(c => c.text) };
} finally {
  US.settings.set('story.binBase', prevBase); US.settings.set('story.exportDir', prevDir);
}
