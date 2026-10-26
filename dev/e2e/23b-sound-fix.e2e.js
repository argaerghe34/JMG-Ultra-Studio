// Sound Check › Make a copy at the target loudness: an interview at about −16.6 LUFS brought to broadcast −23 on a copy.
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Loudness', iv.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 30, at: 0 }] });
await T.open(seq.id);
const r = await T.action('sound.fix', { target: 'broadcast' });
T.near(r.after.meter.integrated, -23, 0.6, 'the copy measures at the target');
T.assert(r.gain < -5 && r.gain > -8, 'lowered by about 6.4 dB: ' + r.gain.toFixed(2));
const lvl = JSON.parse(await US.host.rawEval(`(function(){ var o=[]; var ids=${JSON.stringify([seq.id, r.copy.id])}; for (var i=0;i<ids.length;i++){ var ti=UStudio.needSeq(ids[i]).audioTracks[0].clips[0]; for (var k=0;k<ti.components.numItems;k++) if (ti.components[k].displayName==='Volume') for (var p=0;p<ti.components[k].properties.numItems;p++) if (ti.components[k].properties[p].displayName==='Level') o.push(ti.components[k].properties[p].getValue()); } return JSON.stringify(o); })()`));
T.near(lvl[0], 0.1778, 0.001, 'the original is untouched (0 dB)');
T.near(20 * Math.log10(lvl[1] / lvl[0]), r.gain, 0.05, 'the copy’s clip level changed by the gain');
T.assert(US.actions.get('sound.fix').match('make it -14 LUFS for youtube').target === 'social', 'assistant: −14');
return { summary: r.summary };
