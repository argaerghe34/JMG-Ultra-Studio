(function(){ var out=[]; try {
 var seqs = app.project.sequences, s = null; for (var i=0;i<seqs.numSequences;i++) if (seqs[i].name=='Me Still Test') s=seqs[i];
 var preset = UStudio.findPreset('MediaIO/systempresets/4E49434B_48323634/01 - Match Source - High bitrate.epr');
 out.push('preset=' + preset);
 var lib = new ExternalObject('lib:PlugPlugExternalObject');
 app.encoder.bind('onEncoderJobComplete', function (jobID, outputFilePath) { var ev = new CSXSEvent(); ev.type = 'com.jmgphotography.ultrastudio.encoder'; ev.data = JSON.stringify({ kind: 'complete', job: jobID, path: outputFilePath }); ev.dispatch(); });
 app.encoder.bind('onEncoderJobProgress', function (jobID, progress) { var ev = new CSXSEvent(); ev.type = 'com.jmgphotography.ultrastudio.encoder'; ev.data = JSON.stringify({ kind: 'progress', job: jobID, progress: progress }); ev.dispatch(); });
 app.encoder.bind('onEncoderJobError', function (jobID, errorMessage) { var ev = new CSXSEvent(); ev.type = 'com.jmgphotography.ultrastudio.encoder'; ev.data = JSON.stringify({ kind: 'error', job: jobID, message: errorMessage }); ev.dispatch(); });
 app.encoder.bind('onEncoderJobQueued', function (jobID) { var ev = new CSXSEvent(); ev.type = 'com.jmgphotography.ultrastudio.encoder'; ev.data = JSON.stringify({ kind: 'queued', job: jobID }); ev.dispatch(); });
 app.encoder.launchEncoder();
 var id = app.encoder.encodeSequence(s, '/private/tmp/claude-501/-Users-jgersch--claude-spares-spare-ZV76IQ/dfdca15a-57c0-4de5-9767-1734b1f0ead1/scratchpad/render/me_still_test.mp4', preset, 0, 1);
 out.push('job=' + id);
 app.encoder.startBatch();
 out.push('started');
 } catch(e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
