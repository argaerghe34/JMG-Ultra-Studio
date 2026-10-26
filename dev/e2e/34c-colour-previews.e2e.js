// Colour previews without "Preview on this frame": the frame under the playhead is taken from the user's own sequence
// (no switching to a preview sequence), Premiere's looks are captured once as colour tables, and a look applied here
// from its table matches Premiere's own render of it. The screen shows a preview by itself when the playhead rests.
const C = US.colour, path = T.path, fs = T.fs;
const [a] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Colour previews', a.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: a.id, in: 0, out: 6, at: 0 }] });
await T.open(seq.id);
const out = {};
// 1. the frame, from the user's sequence – the active sequence never changes
let t0 = Date.now();
const f = await C._grabFrame(seq.id, 2);
out.frameMs = Date.now() - t0;
T.assert(f.base.data.length === 320 * 180 * 4 && (await US.host.call('context')).sequence.id === seq.id, 'frame taken, still on the edit');
// 2. two looks captured once as colour tables
const g = C.groupLooks(await US.host.call('colourPresets'));
const looks = [{ name: 'SL Blue Cold (Universal)', label: 'Blue Cold' }, g.film[0]];
for (const l of looks) { try { fs.unlinkSync(path.join(C._tablesDir(), US.fsx.hash(l.name) + '.json')); } catch (e) { /* none */ } C._tables.delete(l.name); }
t0 = Date.now();
const made = await C._captureTables(US.jobs.testJob('colour'), looks);
out.capture = `${made} looks in ${((Date.now() - t0) / 1000).toFixed(1)} s`;
T.assert(made === 2 && (await US.host.call('context')).sequence.id === seq.id, 'tables captured and the edit is active again: ' + out.capture);
T.assert(!(await US.host.call('listSequences')).some(s => s.name === 'Ultra Studio colour preview'), 'the hidden preview sequence is gone afterwards');
// 3. read back from disk (as on the next start)
C._tables.clear();
const cold = C.lookTable(looks[0].name), film = C.lookTable(looks[1].name);
T.assert(cold && film && cold.size === 32, 'tables kept on disk');
// 4. a look applied here matches Premiere's own render of it on the same frame
await C._ensurePreview();
const P = C._preview(), toRGB = C._toRGB;
const diff = async l => { const exact = (await C._renderPreviewPixels({ preset: l.name })).data; const mine = C.applyLut(C.lookTable(l.name), P.base.data, 4); return C.pixelDistance(toRGB(mine), toRGB(exact)); };
out.match = [];
// a colour-only look (the film emulation) matches exactly; SpeedLooks also sharpen/soften a little, which a colour
// table can't show – measured 4.1 of 255 for Blue Cold, evenly across the frame (not a vignette)
const d = []; for (const l of looks) { d.push(await diff(l)); out.match.push(`${l.label}: ${d[d.length - 1].toFixed(2)}`); }
T.assert(d[1] < 1.5, 'the film look matches Premiere’s render: ' + out.match.join(', '));
T.assert(d[0] < 6, 'Blue Cold is close to Premiere’s render: ' + out.match.join(', '));
await C._backToUser();
// 5. fast: a grid of thumbnails from tables takes a moment, not Premiere renders
t0 = performance.now();
for (let i = 0; i < 30; i++) C.applyLut(cold, f.base.data, 4);
out.thirtyThumbsMs = Math.round(performance.now() - t0);
T.assert(out.thirtyThumbsMs < 2500, '30 thumbnails in ' + out.thirtyThumbsMs + ' ms');
// 6. the screen: open Colour, rest the playhead – a preview appears by itself, no button, no sequence switch
US.tools.open('colour'); await T.sleep(300);
await US.host.call('setPlayhead', { seqId: seq.id, seconds: 3 }); await US.refreshContext();
let img = null;
for (let i = 0; i < 20 && !(img && img.getAttribute('src')); i++) { await T.sleep(300); img = document.querySelector('.tool:not(.hidden) .colour-viewer img'); }
T.assert(img && /^data:image/.test(img.getAttribute('src') || ''), 'a preview appeared by itself');
T.assert(!document.querySelector('.tool:not(.hidden) .colour-pane:not(.hidden) button') || ![...document.querySelectorAll('.tool:not(.hidden) button')].some(b => /Preview on this frame/.test(b.textContent)), 'no “Preview on this frame” button');
T.assert((await US.host.call('context')).sequence.id === seq.id, 'still on the edit');
US.tools.open('home');
return out;
