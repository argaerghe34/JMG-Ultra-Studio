(function(){ var out=[]; try {
 var seqs = app.project.sequences, r = null; for (var i=0;i<seqs.numSequences;i++) if (seqs[i].name.indexOf('Me Deliver Test –') === 0 && seqs[i].name.indexOf('9') > 0) r = seqs[i];
 out.push('reframed=' + r.name + ' ' + r.frameSizeHorizontal + 'x' + r.frameSizeVertical);
 var bin = UStudio.ensureBin('Test – Me');
 var ns = app.project.createNewSequenceFromClips('Vert 1080x1920 test', [r.projectItem], bin);
 out.push('new=' + ns.frameSizeHorizontal + 'x' + ns.frameSizeVertical + ' clips=' + ns.videoTracks[0].clips.numItems);
 var st = ns.getSettings(); st.videoFrameWidth = 1080; st.videoFrameHeight = 1920; ns.setSettings(st);
 out.push('after settings=' + ns.frameSizeHorizontal + 'x' + ns.frameSizeVertical);
 var ti = ns.videoTracks[0].clips[0];
 var comps = []; for (var c = 0; c < ti.components.numItems; c++) { var cp = ti.components[c]; var props = []; for (var p = 0; p < cp.properties.numItems; p++) props.push(cp.properties[p].displayName); comps.push(cp.displayName + '[' + props.join(',') + ']'); }
 out.push('components: ' + comps.join(' ; '));
 var motion = null; for (var c = 0; c < ti.components.numItems; c++) if (ti.components[c].displayName === 'Motion') motion = ti.components[c];
 var scale = null; for (var p = 0; p < motion.properties.numItems; p++) if (motion.properties[p].displayName === 'Scale') scale = motion.properties[p];
 out.push('scale before=' + scale.getValue());
 scale.setValue(1920 / r.frameSizeVertical * 100, true);
 out.push('scale after=' + scale.getValue());
 out.push('id=' + ns.sequenceID);
 } catch(e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
