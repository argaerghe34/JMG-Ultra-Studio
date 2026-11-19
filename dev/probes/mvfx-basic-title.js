// Probe (Premiere, test project only): what a Basic Title placed by script looks like to ExtendScript in this Premiere –
// for mVFX's text setter (jsx/tools/mvfx.jsx › setText), which found no Source Text in Premiere 27.0.
// Run: node dev/cep.js 8890 js dev/probes/mvfx-basic-title.js   -> a text report
// It makes a scratch sequence "Probe – Basic Title" from a test clip, puts Basic Title.mogrt on V2 with importMGT (the
// route mvfxApply uses), dumps every component and property – as returned by importMGT, from the track straight after,
// and from the track again after a second – then deletes the scratch sequence and reopens the sequence that was open.
const fs = require('fs'), path = require('path');
if (US.app.is('resolve')) return 'Premiere only.';
const media = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-media', 'concert', 'C001_sharp_static.mp4');
const items = await US.host.call('importFiles', { paths: [media], binPath: 'Test – probe' });
if (!items.length) return 'Could not import ' + media;
await US.refreshContext();
const was = US.ctx.sequence && US.ctx.sequence.id;
const seq = await US.host.call('newSequence', { name: 'Probe – Basic Title', likeId: items[0].id, binPath: 'Test – probe' });
const script = `(function () {
  var out = [], seqId = ${JSON.stringify(seq.id)}, s = null, ss = app.project.sequences;
  for (var i = 0; i < ss.numSequences; i++) if (ss[i].sequenceID == seqId) s = ss[i];
  if (!s) return 'scratch sequence not found';
  app.project.openSequence(seqId);
  function esc(x) { var r = ''; x = String(x); for (var k = 0; k < x.length && k < 120; k++) { var c = x.charCodeAt(k); r += (c < 32 || c > 126) ? '\\\\u' + ('000' + c.toString(16)).slice(-4) : x.charAt(k); } return r; }
  function val(p) {
    var parts = [];
    try { var v = p.getValue(); parts.push('getValue: ' + (typeof v) + (v === null ? ' (null)' : '') + ' ' + esc(v instanceof Array ? '[' + v.join(',') + ']' : v) + (typeof v === 'string' ? ' (length ' + v.length + ', textEditValue ' + (v.indexOf('textEditValue') >= 0) + ', mTextParam ' + (v.indexOf('mTextParam') >= 0) + ')' : '')); } catch (e) { parts.push('getValue threw ' + e); }
    try { var v2 = p.getValue(true); if (typeof v2 !== 'undefined') parts.push('getValue(true): ' + (typeof v2) + ' ' + esc(v2)); } catch (e) { parts.push('getValue(true) threw ' + e); }
    try { if (typeof p.getValueAtTime === 'function') { var t = new Time(); t.seconds = 1; var v3 = p.getValueAtTime(t); parts.push('getValueAtTime(1 s): ' + (typeof v3) + ' ' + esc(v3)); } else parts.push('no getValueAtTime'); } catch (e) { parts.push('getValueAtTime threw ' + e); }
    try { parts.push('timeVarying ' + p.isTimeVarying()); } catch (e) { }
    try { if (typeof p.getColorValue === 'function') parts.push('has getColorValue'); } catch (e) { }
    return parts.join(' | ');
  }
  function dump(ti, label) {
    out.push('== ' + label);
    if (!ti) { out.push('  (no clip)'); return; }
    try { out.push('  name ' + esc(ti.name) + ' · start ' + ti.start.seconds + ' · end ' + ti.end.seconds + ' · type ' + ti.type + ' · mediaType ' + ti.mediaType); } catch (e) { out.push('  basics threw ' + e); }
    try { out.push('  isMGT ' + (typeof ti.isMGT === 'function' ? ti.isMGT() : 'no isMGT')); } catch (e) { out.push('  isMGT threw ' + e); }
    try { var pi = ti.projectItem; out.push('  projectItem ' + (pi ? esc(pi.name) + ' · type ' + pi.type : 'none')); } catch (e) { out.push('  projectItem threw ' + e); }
    var mgt = null;
    try { mgt = ti.getMGTComponent(); out.push('  getMGTComponent: ' + (mgt ? esc(mgt.displayName) + ' [' + esc(mgt.matchName) + '] with ' + mgt.properties.numItems + ' properties' : 'null')); } catch (e) { out.push('  getMGTComponent threw ' + e); }
    if (mgt) { try { for (var q = 0; q < mgt.properties.numItems; q++) out.push('    MGT · ' + esc(mgt.properties[q].displayName) + ': ' + val(mgt.properties[q])); } catch (e) { out.push('    MGT properties threw ' + e); } }
    try {
      out.push('  components: ' + ti.components.numItems);
      for (var k = 0; k < ti.components.numItems; k++) {
        var c = ti.components[k]; out.push('  [' + k + '] ' + esc(c.displayName) + ' [' + esc(c.matchName) + '] · ' + c.properties.numItems + ' properties');
        for (var j = 0; j < c.properties.numItems; j++) out.push('      ' + esc(c.properties[j].displayName) + ': ' + val(c.properties[j]));
      }
    } catch (e) { out.push('  components threw ' + e); }
  }
  var base = String(app.path || ''), tries = [base + '/Contents/Essential Graphics/Basic Title.mogrt', base + '/Essential Graphics/Basic Title.mogrt', base + '\\\\Essential Graphics\\\\Basic Title.mogrt'], f = null;
  for (var n = 0; n < tries.length && !f; n++) { var x = new File(tries[n]); if (x.exists) f = x.fsName; }
  out.push('Premiere ' + app.version + ' (' + app.build + ') · app.path ' + esc(app.path) + ' · mogrt ' + (f || 'NOT FOUND'));
  if (!f) return out.join('\\n');
  while (s.videoTracks.numTracks < 2) { try { app.enableQE(); qe.project.getActiveSequence().addTracks(1, s.videoTracks.numTracks, 0); } catch (e) { out.push('addTracks threw ' + e); break; } }
  var ti = null;
  try { ti = s.importMGT(f, String(Math.round(1 * 254016000000)), 1, 0); } catch (e) { out.push('importMGT threw ' + e); }
  out.push('importMGT returned ' + (ti ? typeof ti : String(ti)));
  dump(ti, 'as returned by importMGT');
  function fromTrack() { var tr = s.videoTracks[1]; for (var c = 0; c < tr.clips.numItems; c++) return tr.clips[c]; return null; }
  out.push('V2 clips: ' + s.videoTracks[1].clips.numItems);
  dump(fromTrack(), 'from V2 straight after');
  $.sleep(1000);
  dump(fromTrack(), 'from V2 after a second');
  return out.join('\\n');
})()`;
let report = '';
try { report = await US.host.rawEval(script, 60000); }
catch (e) { report = 'rawEval failed: ' + (e.message || e); }
finally {
  try { await US.host.call('deleteSequence', { seqId: seq.id }); } catch (e) { report += '\n(scratch sequence not deleted: ' + (e.message || e) + ')'; }
  if (was) { try { await US.host.call('openSequence', { seqId: was }); } catch (e) { /* stays */ } }
}
return report;
