const S = ['cut the silences', 'remove pauses longer than 1 second', 'markers on every beat of the music', 'cut my selects to the beat', 'find the best shots in Concert',
  'check the cut', 'compare the two versions', 'safe zones for Reels', 'hide the safe zones', 'export pack for social', 'turn the client notes into markers', 'make youtube chapters',
  'split the concert into songs', 'check the sound levels', 'lines about volunteering', 'find the themes', 'sort the selects into bins by theme', 'build the sequence from the wall',
  'make a stringout of the family theme', 'read the transcripts', 'find where they talk about faith', 'make me a cup of tea'];
const out = {};
for (const s of S) { const r = US.assistant.matchOffline(s); out[s] = r.steps.length ? r.steps.map(x => x.action + ' ' + JSON.stringify(x.params)).join(' + ') : (r.alternatives.length ? 'AMBIGUOUS: ' + r.alternatives.map(a => a.action).join('/') : '—'); }
return out;
