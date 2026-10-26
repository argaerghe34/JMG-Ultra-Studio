// Opens FJL Summer 2026 (no dialogs, nothing saved), renders one timeline's sound to MP3, then closes it
// without saving and goes back to the test project.
const FJL = '/Volumes/JGX10/FJL_Summer2026_Israel_24_7_26/Edit/FJL Summer 2026_1.prproj';
const TEST = require('path').join(require('fs').realpathSync(US.host.extensionDir()), 'dev/test-project/UltraStudioTest.prproj');
const SEQ = 'Internship lines1';
const out = require('path').join(require('os').homedir(), 'Documents', 'JMG Ultra Studio', 'Transcripts', 'Internship lines1 – sound for Descript.mp3');
require('fs').mkdirSync(require('path').dirname(out), { recursive: true });
const q = s => JSON.stringify(s);
const log = [];
const t0 = Date.now();
log.push(await US.host.rawEval(`(function(){ var r = app.openDocument(${q(FJL)}, true, true, true, true); return 'open=' + r + ' active=' + app.project.name + ' seqs=' + app.project.sequences.numSequences; })()`, 300000));
log.push(await US.host.rawEval(`(function(){ try {
  var s = null; for (var i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].name === ${q(SEQ)}) s = app.project.sequences[i];
  if (!s) return 'no sequence';
  var preset = UStudio.findPreset('Settings/EncoderPresets/MP3_mono_96kbps_nometadata.epr');
  var f = new File(${q(out)}); if (f.exists) f.remove();
  var r = ''; try { r = s.exportAsMediaDirect(${q(out)}, preset, 0); } catch (e) { r = 'threw ' + e; }
  return 'seq=' + s.name + ' dur=' + (Number(s.end) / 254016000000).toFixed(1) + 's tc=' + s.zeroPoint + ' export=' + r + ' size=' + new File(${q(out)}).length + ' preset=' + preset;
} catch (e) { return 'ERR ' + e + ' line ' + e.line; } })()`, 600000));
log.push(await US.host.rawEval(`(function(){ var n = app.project.name; app.project.closeDocument(0, 0); var now = app.project ? app.project.name : 'none'; if (!app.project || String(app.project.path).indexOf('UltraStudioTest') < 0) { app.openDocument(${q(TEST)}, true, true, true, true); } return 'closed ' + n + ' (not saved), active now ' + app.project.name; })()`, 120000));
return { secs: Math.round((Date.now() - t0) / 1000), log, out, bytes: require('fs').existsSync(out) ? require('fs').statSync(out).size : 0 };
