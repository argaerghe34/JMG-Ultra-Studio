(function(){ var out=[]; try {
 var seqs = app.project.sequences, s = null; for (var i=0;i<seqs.numSequences;i++) if (seqs[i].name=='Probe Seq') s=seqs[i];
 var t0 = new Date().getTime();
 var r = UStudio.run('autoReframe', JSON.stringify({ seqId: s.sequenceID, num: 9, den: 16, motion: 'default', name: 'Probe Seq 9x16', binPath: 'Test – Me' }));
 out.push('reframe: ' + r + ' ms=' + (new Date().getTime() - t0));
 // CSXS event from ExtendScript to the panel
 try { var lib = new ExternalObject('lib:PlugPlugExternalObject'); var ev = new CSXSEvent(); ev.type = 'com.jmgphotography.ultrastudio.test'; ev.data = '{"hello":1}'; ev.dispatch(); out.push('event dispatched'); } catch (e) { out.push('event err ' + e); }
 } catch(e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
