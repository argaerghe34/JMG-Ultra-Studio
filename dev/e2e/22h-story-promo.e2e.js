// Story › Make it a promo: a basic narrative → built → B-roll over its cuts → social captions → 9:16 version with captions.
const S = US.story, fs = require('fs'), zlib = require('zlib');
const BIN = 'Test – Story';
const prev = { base: US.settings.get('story.binBase') };
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, builds: st.builds || [] }));
const captionTracks = () => T.captionTracks();
try {
  await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – B-roll');
  const brollBin = (await US.host.call('listBins')).find(b => b.path === 'Test – B-roll');
  const nar = await T.action('story.narrative', { brief: 'a 60-second video about family, community and growing up', useAI: false });
  const before = await captionTracks();
  const r = await T.action('story.promo', { bin: 'Test – B-roll', captions: 'social', vertical: true });
  T.assert(/– B-roll$/.test(r.seq.name), 'the promo is the B-roll copy: ' + r.seq.name);
  const info = await US.host.call('sequenceInfo', { seqId: r.seq.id });
  T.assert(info.video.some(t => t.name === 'B-roll' && t.clips.length > 0), 'B-roll laid over the cuts');
  const v = await US.host.call('sequenceInfo', { seqId: r.vertical.id });
  T.assert(v.width === 1080 && v.height === 1920, `vertical is full size: ${v.width}×${v.height}`);
  T.assert(await captionTracks() === before + 2, 'captions on the promo and on the vertical version');
  const ctx = await US.host.call('context');
  T.assert(ctx.sequence && ctx.sequence.id === r.vertical.id, 'the vertical version is open at the end');
  T.assert(US.actions.get('story.promo').match('turn the narrative into a promo with b-roll from the B-roll bin and subtitles').captions === 'subtitles', 'assistant: subtitles');
  return { narrative: nar.summary, summary: r.summary, vertical: `${v.width}×${v.height}` };
} finally {
  Object.assign(st, saved); S.save();
  US.settings.set('story.binBase', prev.base);
}
