const st = US.selects.state;
const c = st.clips.find(x => x.item.name.startsWith('C007'));
const T = US.vision._internal.thresholds(st.settings);
const P = US.vision._internal.prepare(c.data);
return {
  sel: st.result.selects.filter(s => s.clipName.startsWith('C007')).map(s => [s.start, s.end, s.flags.reveal, s.reasons.join('|')]),
  rej: st.result.rejected.filter(s => s.clipName.startsWith('C007')).map(s => [s.start, s.end, s.why]),
  cands: P.cands.map(x => [x.start, x.end, x.type, +x.shake.toFixed(4)]), sHi: T.sHi,
  n: c.data.samples.length, mode: c.data.mode,
  zm: c.data.samples.map(s => s.t.toFixed(2) + ':' + s.zm + '/' + s.err).join(' ')
};
