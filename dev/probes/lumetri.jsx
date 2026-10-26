(function(){ var out=[]; try {
 function args(o,name){ try{ var f=o.reflect.find(name); var r=[]; for(var i=0;i<f.arguments.length;i++) r.push(f.arguments[i].name+':'+f.arguments[i].dataType); return name+'('+r.join(', ')+') -> '+f.dataType; }catch(e){ return name+' ERR '+e; } }
 var P = app.project;
 out.push(args(P,'applyLumetriPreset')); out.push(args(P,'getAllLumetriPresetsList')); out.push(args(P,'getLumetriPresetsForFolderList'));
 try { var lst = P.getAllLumetriPresetsList(); out.push('presets: ' + (lst ? String(lst).substring(0, 600) : lst)); } catch (e) { out.push('getAll err ' + e); }
 // a scratch sequence with one clip
 var bin = UStudio.ensureBin('Test – Colour'), item = null;
 UStudio.walk(app.project.rootItem, function (c) { if (!item && c.type === 1 && /C001_sharp_static/.test(c.name)) item = c; });
 if (!item) return out.join('\n') + '\nno C001 clip in project';
 var seqs = app.project.sequences, s = null; for (var i = 0; i < seqs.numSequences; i++) if (seqs[i].name === 'Colour probe') s = seqs[i];
 if (!s) { var r = JSON.parse(UStudio.run('newSequence', JSON.stringify({ name: 'Colour probe', binPath: 'Test – Colour', likeId: item.nodeId }))).data; s = UStudio.needSeq(r.id); UStudio.run('placeClips', JSON.stringify({ seqId: s.sequenceID, clips: [{ id: item.nodeId, 'in': 0, out: 5 }] })); }
 app.project.openSequence(s.sequenceID); app.enableQE();
 var q = qe.project.getActiveSequence(), qi = q.getVideoTrackAt(0).getItemAt(0);
 var fx = qe.project.getVideoEffectByName('Lumetri Color'); out.push('effect=' + fx);
 var ti = s.videoTracks[0].clips[0], had = false;
 for (var c = 0; c < ti.components.numItems; c++) if (ti.components[c].displayName === 'Lumetri Color') had = true;
 if (!had) out.push('addVideoEffect=' + qi.addVideoEffect(fx));
 ti = s.videoTracks[0].clips[0];
 for (var c = 0; c < ti.components.numItems; c++) {
   var cp = ti.components[c]; if (cp.displayName !== 'Lumetri Color') continue;
   out.push('Lumetri matchName=' + cp.matchName + ' props=' + cp.properties.numItems);
   for (var p = 0; p < cp.properties.numItems; p++) { var pr = cp.properties[p], v = ''; try { v = pr.getValue(); } catch (e) { v = 'ERR'; } out.push('  [' + p + '] ' + pr.displayName + ' = ' + String(v).substring(0, 60)); }
 }
 } catch(e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
