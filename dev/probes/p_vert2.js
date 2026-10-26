const pos = await US.host.rawEval(`(function(){ var s=null, q=app.project.sequences; for (var i=0;i<q.numSequences;i++) if (q[i].name=='Vert 1080x1920 test') s=q[i]; var m=s.videoTracks[0].clips[0].components[1]; return String(m.properties[0].getValue()); })()`);
const seqs = await US.host.call('listSequences');
const s = seqs.find(x => x.name === 'Vert 1080x1920 test');
const p = await US.host.call('exportFrame', { seqId: s.id, seconds: 3, outBase: require('path').join(US.fsx.tempDir(), 'vert-test') });
return { pos, p };
