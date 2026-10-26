const st = US.selects.state;
const c = st.clips.find(x => x.item.name.startsWith('C006'));
const P = US.vision._internal.prepare(c.data);
return {
  sel: st.result.selects.filter(s => s.clipName.startsWith('C006')).map(s => [s.start, s.end, s.reasons.join('|')]),
  rej: st.result.rejected.filter(s => s.clipName.startsWith('C006')).map(s => [s.start, s.end, s.why]),
  mode: c.data.mode, n: c.data.samples.length,
  s: c.data.samples.map((s, i) => `${s.t.toFixed(2)}:v${Math.hypot(s.vx, s.vy).toFixed(2)}/e${s.err}/sh${s.sh.toFixed(1)}${P.fast[i] ? 'F' : ''}`).join(' ')
};
