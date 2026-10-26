// Colour: camera matching, quick grade, looks, log profile, and finding a LUT in Lumetri's Look menu.
const C = US.colour, path = T.path, fs = T.fs;
const [a, b] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C008_duplicate_of_C001.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Colour', a.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: a.id, in: 0, out: 6, at: 0 }, { id: b.id, in: 0, out: 6, at: 7 }] });   // a gap before clip 2
await T.open(seq.id);
const sel = (idx) => US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(seq.id)}), t=s.videoTracks[0]; for (var i=0;i<t.clips.numItems;i++) t.clips[i].setSelected(${JSON.stringify(idx)}.indexOf(i) >= 0, true); return 'ok'; })()`);
const lumetriValue = (clip, inst, prop) => US.host.rawEval(`(function(){ var ti=UStudio.needSeq(${JSON.stringify(seq.id)}).videoTracks[0].clips[${clip}], n=0; for (var c=0;c<ti.components.numItems;c++) if (ti.components[c].displayName==='Lumetri Color') { if (n++ === ${inst}) return String(ti.components[c].properties[${prop}].getValue()); } return 'none'; })()`);
const frameStats = async t => C.stats((await (async () => { const p = await US.host.call('exportFrame', { seqId: seq.id, seconds: t, outBase: path.join(US.fsx.tempDir(), 'e2e-col-' + Date.now()) }); const img = new Image(); img.src = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); await img.decode(); const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90); fs.unlinkSync(p); return g.getImageData(0, 0, 160, 90).data; })()));
const out = {};

// "camera B": the same scene read as V-Log by Premiere looks like another camera (more colour, a magenta cast);
// the editor's own Lumetri on it (sharpening) must stay untouched
await US.host.call('colourSetSpace', { itemIds: [b.id], space: 'Panasonic V-Log/V-Gamut' });
await US.host.call('colourSet', { seqId: seq.id, clips: [{ track: 0, index: 1 }], values: { sharpen: 30 }, fresh: true });
const before = C.difference(await frameStats(2), await frameStats(9));
T.assert(before > 6, 'camera B starts clearly different: ' + before.toFixed(1));

// match it to the shot at the playhead
await US.host.call('setPlayhead', { seqId: seq.id, seconds: 2 }); await US.refreshContext();
await sel([1]);
const m = await T.action('colour.match', {});
out.match = m.summary;
const after = C.difference(await frameStats(2), await frameStats(9));
T.assert(after < before * 0.35 && after < 4, `matched: ${before.toFixed(1)} → ${after.toFixed(1)}`);
const sharp = [await lumetriValue(1, 0, 41), await lumetriValue(1, 1, 41), await lumetriValue(1, 2, 41)];
T.assert(sharp[2] === 'none' && sharp.filter(x => Math.abs(parseFloat(x) - 30) < 0.01).length === 1, 'the editor’s own Lumetri is untouched and Ultra Studio added one: ' + sharp);
// matching again reuses Ultra Studio's Lumetri
await T.action('colour.match', {});
T.assert(await lumetriValue(1, 2, 41) === 'none', 'matching twice still leaves two Lumetri effects');

// quick grade: black & white on clip 1
await sel([0]);
await T.action('colour.grade', { look: 'bw' });
T.assert((await frameStats(2)).C < 1.5, 'black & white grade has no colour');
// grading again changes the same instance, not a new one
await T.action('colour.grade', { look: 'warm' });
T.assert(await lumetriValue(0, 1, 19) === 'none', 'still one Lumetri on clip 1');
T.assert((await frameStats(2)).C > 5, 'warm grade brings colour back');
// Ultra Studio still finds its Lumetri after the clip is renamed and trimmed
await US.host.rawEval(`(function(){ var ti=UStudio.needSeq(${JSON.stringify(seq.id)}).videoTracks[0].clips[0]; ti.name = 'Renamed clip'; var t=new Time(); t.seconds=5.5; ti.end=t; return ti.name; })()`);
await T.action('colour.grade', { look: 'punchy' });
T.assert(await lumetriValue(0, 1, 19) === 'none', 'renamed + trimmed: still one Lumetri on clip 1');

// looks rendered by Premiere on a still of the playhead frame
const names = await US.host.call('colourPresets');
const g = C.groupLooks(names);
T.assert(g.film.length >= 10 && (g.speed.Universal || []).length >= 20, `looks grouped: film ${g.film.length}, SpeedLooks ${(g.speed.Universal || []).length}`);
await C._ensurePreview();
const cold = C.stats((await C._renderPreviewPixels({ preset: 'SL Blue Cold (Universal)' })).data), plain = C.stats((await C._renderPreviewPixels({})).data);
T.assert(cold.b < plain.b - 1.5, `Blue Cold preview is cooler: b ${plain.b.toFixed(1)} → ${cold.b.toFixed(1)}`);
await C._backToUser();
await US.host.call('colourApplyPreset', { seqId: seq.id, clips: [{ track: 0, index: 0 }], preset: 'SL Blue Cold (Universal)' });
T.assert(await lumetriValue(0, 1, 19) !== 'none', 'the look is its own Lumetri');
const ctx = await US.host.call('context');
T.assert(ctx.sequence && ctx.sequence.id === seq.id, 'the edit is still the active sequence');

// log footage: tell Premiere the first clip is S-Log3, then undo
await sel([0]);
const sp = await US.host.call('colourSpaces', { seqId: seq.id, clips: [{ track: 0, index: 0 }] });
T.assert(sp.clips[0].supported && sp.spaces.some(s => s.name === 'Panasonic V-Log/V-Gamut'), 'Premiere offers V-Log');
const flat = await frameStats(2);
const r = await T.action('colour.log', { space: 'Sony S-Log3/S-Gamut3.Cine' });
T.assert(r.n === 1, 'one clip set');
T.assert((await US.host.call('colourSpaces', { itemIds: [a.id] })).clips[0].current === 'Sony S-Log3/S-Gamut3.Cine', 'clip now read as S-Log3');
T.assert(C.difference(flat, await frameStats(2)) > 3, 'the picture changed');
await T.action('colour.log', { space: 'original' });
const back = (await US.host.call('colourSpaces', { itemIds: [a.id] })).clips[0];
T.assert(back.current === back.original, 'undo puts the clip back: ' + back.current);
T.assert(C.difference(flat, await frameStats(2)) < 1, 'and the picture is as before');
T.assert(US.actions.get('colour.log').match('these clips are s-log3').space === 'Sony S-Log3/S-Gamut3.Cine', 'assistant: s-log3');
await US.host.call('colourSetSpace', { itemIds: [b.id], space: '' });

// a LUT Premiere knows (Adobe's film LUT) is found in Lumetri's Look menu
if (process.platform === 'darwin') {
  const appDir = (await US.host.rawEval('app.path')).replace(/\/$/, '');
  const lutFile = path.join(appDir, 'Contents/Lumetri/LUTs/Creative/Kodak 5218 Kodak 2395 (by Adobe).cube');
  if (fs.existsSync(lutFile)) {
    await US.host.call('setPlayhead', { seqId: seq.id, seconds: 2 }); await US.refreshContext();
    await C._ensurePreview();
    const t0 = Date.now(), idx = await C._findLut(lutFile, US.jobs.testJob('lut'));
    await C._backToUser();
    T.assert(idx != null, 'Kodak 5218 Kodak 2395 found in the Look menu');
    out.lut = `Look menu number ${idx}, found in ${((Date.now() - t0) / 1000).toFixed(0)} s`;
  } else out.lut = 'skipped: ' + lutFile;
}
await US.host.call('colourPreviewCleanup');
out.before = before.toFixed(1); out.after = after.toFixed(1);
return out;
