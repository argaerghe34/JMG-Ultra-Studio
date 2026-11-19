// Probe (Premiere, test project only): which way of WRITING a Basic Title's Source Text does Premiere 27 actually show?
// (27.0 reads Source Text back as one character, so mVFX writes it from scratch – jsx/tools/mvfx.jsx › writeBlob.)
// Needs the panel running this branch's jsx (UStudio.mvfxText.ROUTES) – reload the panel after merging.
// Run: node dev/cep.js 8890 js dev/probes/mvfx-settext.js   -> a text report
// A scratch sequence "Probe – Source Text" (empty, black): one Basic Title untouched (the control) and one per route,
// 6 s apart on V2, each given the words "WWWWWWWW" in pure red at 150 px (the fb routes can't carry a colour: theirs is
// white); a frame of each is exported and its red and bright pixels and their extent measured. A route that works shows
// thousands of red pixels – or, for fb, a wide bright block of W's (not "Your Title Here", 597 px wide in 27.0). The
// control shows white "Your Title Here". First, a round trip on a spare title: what a string with characters from
// 0x80 up, and one with a NUL in it, read back as (whether a script's characters reach Premiere as UTF-16 units). Then the scratch sequence is deleted and the sequence that was open reopened.
const fs = require('fs'), path = require('path');
if (US.app.is('resolve')) return 'Premiere only.';
const routes = JSON.parse(await US.host.rawEval('JSON.stringify(UStudio.mvfxText && UStudio.mvfxText.ROUTES || null)'));
if (!routes) return 'This panel’s Premiere scripts are older than the probe: reload the panel with the claude/n-mvfx (or merged) jsx first.';
const media = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-media', 'concert', 'C001_sharp_static.mp4');
const items = await US.host.call('importFiles', { paths: [media], binPath: 'Test – probe' });
await US.refreshContext();
const was = US.ctx.sequence && US.ctx.sequence.id;
const seq = await US.host.call('newSequence', { name: 'Probe – Source Text', likeId: items[0].id, binPath: 'Test – probe' });
const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false }), W = info.width, H = info.height;
// the newest routes first (legacy-utf16, fb-utf16, fb-bytes: the formats read from a saved 27.0 project), then the old
const cases = ['control'].concat(routes.filter(r => !/^(json|len32)/.test(r)), routes.filter(r => /^(json|len32)/.test(r)));
const L = { text: 'WWWWWWWW', font: 'Arial-BoldMT', size: 150, colour: '#ff0000', bold: true, tracking: 0 };
if (US.mvfxPack.sourceTextFB) L.fb = US.mvfxPack.sourceTextFB({ text: L.text, font: L.font, size: L.size });   // the FlatBuffer has no colour: white, not red
const lines = [`Premiere ${(await US.host.rawEval('app.version + " (" + app.build + ")"'))} · ${W}×${H} · routes ${routes.join(', ')}`];
const outDir = path.join(US.mvfx.artDir(), 'probe-settext'); fs.mkdirSync(outDir, { recursive: true });
try {
  const placed = JSON.parse(await US.host.rawEval(`(function () {
    var s = null, ss = app.project.sequences, out = [], L = ${JSON.stringify(L)}, cases = ${JSON.stringify(cases)};
    for (var i = 0; i < ss.numSequences; i++) if (ss[i].sequenceID == ${JSON.stringify(seq.id)}) s = ss[i];
    app.project.openSequence(s.sequenceID);
    var base = String(app.path || ''), tries = [base + '/Contents/Essential Graphics/Basic Title.mogrt', base + '/Essential Graphics/Basic Title.mogrt', base + '\\\\Essential Graphics\\\\Basic Title.mogrt'], f = null;
    for (var n = 0; n < tries.length && !f; n++) { var x = new File(tries[n]); if (x.exists) f = x.fsName; }
    if (!f) return JSON.stringify([{ error: 'Basic Title.mogrt not found under ' + app.path }]);
    UStudio.labelParts.ensureVideoTracks(s, 2);
    var spare = null, trips = [];
    try { spare = s.importMGT(f, String(Math.round(100 * 254016000000)), 1, 0); } catch (e) { trips.push('spare importMGT: ' + e); }
    var stp = spare && UStudio.mvfxText.sourceTextProperty(spare);
    var samples = ['plain', 'A\u00e9\u0080\u00ffB', 'A\u20ac\uabcd\u017cB', 'AB\u0000CD'];
    for (var q = 0; q < samples.length && stp; q++) {
      var want = samples[q] === 'plain' ? 'Hello' : samples[q], got = '';
      try { stp.setValue(want, true); got = String(stp.getValue()); } catch (e) { got = 'threw ' + e; }
      var codes = function (x) { var a = []; for (var c = 0; c < x.length; c++) a.push(x.charCodeAt(c).toString(16)); return a.join(' '); };
      trips.push('wrote [' + codes(want) + '] read back [' + codes(got) + ']');
    }
    out.push({ name: 'round trip', trips: trips });
    if (spare) { try { spare.remove(false, false); } catch (e) { } }
    for (var k = 0; k < cases.length; k++) {
      var at = 0.5 + k * 6, ti = null, r = { name: cases[k], at: at };
      try { ti = s.importMGT(f, String(Math.round(at * 254016000000)), 1, 0); } catch (e) { r.error = 'importMGT: ' + e; }
      if (ti && cases[k] !== 'control') { var log = []; try { var res = UStudio.mvfxText.setText(ti, L, log, { route: cases[k] }); r.words = res.words; r.tries = res.tries; } catch (e2) { r.error = 'setText: ' + e2; } r.log = log; }
      out.push(r);
    }
    return JSON.stringify(out);
  })()`, 60000));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
  for (const p of placed) {
    if (p.trips) { lines.push('round trip (UTF-16 units in hex): ' + p.trips.join(' · ')); continue; }
    if (p.error && !p.at) { lines.push(p.error); continue; }
    let report = `${p.name.padEnd(12)} ${p.error ? 'ERROR ' + p.error + ' · ' : ''}`;
    if (p.tries) report += `wrote: ${p.tries.map(t => t.error ? 'threw ' + t.error : 'reads back “' + t.read + '”').join('; ')} · `;
    try {
      const file = await US.host.call('exportFrame', { seqId: seq.id, seconds: p.at + 2.5, outBase: path.join(outDir, `${p.name}-${Date.now().toString(36)}`) });
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('not readable: ' + file)); img.src = require('url').pathToFileURL(file).href + '?' + Date.now(); });
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data; let red = 0, bright = 0, minX = W, maxX = 0, minY = H, maxY = 0;
      for (let i = 0; i < d.length; i += 4) {
        const isRed = d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80, isBright = (d[i] + d[i + 1] + d[i + 2]) / 3 > 100;
        if (isRed) red++; if (isBright) bright++;
        if (isRed || isBright) { const px = (i / 4) % W, py = Math.floor(i / 4 / W); if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
      }
      report += `frame: ${red} red px, ${bright} bright px${red + bright ? `, in x ${minX}–${maxX}, y ${minY}–${maxY}` : ''} · ${file}`;
      if (p.name !== 'control') report += red > 2000 ? '  ← SHOWS OUR WORDS (in red)' : bright > 2000 && maxX - minX > 800 ? '  ← SHOWS A WIDE WHITE TEXT – probably OUR WORDS (fb has no colour)' : bright > 2000 ? '  ← text the size of the template’s' : '  ← shows nothing';
    } catch (e) { report += 'frame failed: ' + (e.message || e); }
    if (p.log && p.log.length) report += '\n             log: ' + p.log.join(' | ');
    lines.push(report);
  }
} catch (e) { lines.push('probe failed: ' + (e.stack || e.message || e)); }
finally {
  try { await US.host.call('deleteSequence', { seqId: seq.id }); } catch (e) { lines.push('(scratch sequence not deleted: ' + (e.message || e) + ')'); }
  if (was) { try { await US.host.call('openSequence', { seqId: was }); } catch (e) { /* stays */ } }
}
return lines.join('\n');
