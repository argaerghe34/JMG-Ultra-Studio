const r = US.selects.state.result;
return r.selects.filter(s => s.flags.hero).map(s => [s.clipName, s.start, s.end, s.tier, s.score, s.flags.reveal]);
