// Markers on the clips, in the real editor: a marker put "on the clips" lands on the source clip under it, shows in a
// second sequence that uses the clip (where the clip sits there), moves in the clip's own time, and moves off the
// clip onto the timeline again. The clips' markers are taken off again at the end.
const M = US.markerKit; T.assert(M && M.clipMarkersInSequence, 'Markers is loaded with clip markers');
const BIN = 'Test – Markers', items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4'].map(f => T.media('concert', f)), BIN);
const [X, Y] = items, notes = [];
const clean = async () => { for (const it of items) { const ms = await US.host.call('clipMarkers', { id: it.id }); if (ms.length) await US.host.call('removeClipMarkers', { id: it.id, guids: ms.map(m => m.guid) }); } };
await clean();
// A: X at 0–4 (from 0 s in); B: Y at 0–3, then X at 3–7 – the same part of X, somewhere else
const A = await T.freshSequence('Test – Markers A', X.id, BIN), B = await T.freshSequence('Test – Markers B', X.id, BIN);
await US.host.call('placeClips', { seqId: A.id, cursor: 0, clips: [{ id: X.id, in: 0, out: 4 }] });
await US.host.call('placeClips', { seqId: B.id, cursor: 0, clips: [{ id: Y.id, in: 0, out: 3 }, { id: X.id, in: 0, out: 4 }] });
try {
  // 1. on the clip under the marker
  const g = await US.host.call('addSequenceMarkers', { seqId: A.id, markers: [{ start: 1, end: null, name: 'On X', comment: '', color: 3 }], where: 'clips' });
  T.assert(/^clip:/.test(g[0]), 'put on the clip: ' + JSON.stringify(g));
  const onX = await US.host.call('clipMarkers', { id: X.id });
  T.assert(onX.length === 1 && onX[0].name === 'On X', 'the clip has it: ' + JSON.stringify(onX));
  T.near(onX[0].start, 1, 0.05, 'at 1 s into the clip');
  // 2. the list: on A at 1 s, on B where X sits (3 s later), not on the timeline of either
  const a = await M.readSequence(A.id, { clipMarkers: true }), b = await M.readSequence(B.id, { clipMarkers: true });
  const ra = a.markers.find(m => m.name === 'On X'), rb = b.markers.find(m => m.name === 'On X');
  T.assert(ra && ra.itemId && rb && rb.itemId, 'listed as a clip marker in both: ' + JSON.stringify([a.markers, b.markers]));
  T.near(ra.start, 1, 0.05, 'shows at 1 s in A'); T.near(rb.start, 4, 0.05, 'shows at 4 s in B (X starts at 3 s there)');
  T.assert(!a.info.markers.some(m => m.name === 'On X') && !b.info.markers.some(m => m.name === 'On X'), 'not a timeline marker');
  notes.push(`A ${ra.start.toFixed(2)} s · B ${rb.start.toFixed(2)} s`);
  // 3. renamed, recoloured and moved half a second later from B's list: the clip's marker changes, so A sees it too
  await M.update(b, [{ marker: rb, fields: Object.assign({ name: 'Moved', color: 6 }, M.moveFields(rb, 0.5)) }]);
  const a2 = (await M.readSequence(A.id, { clipMarkers: true })).markers.find(m => m.itemId);
  T.assert(a2 && a2.name === 'Moved' && a2.color === 6, 'renamed and recoloured in A too: ' + JSON.stringify(a2));
  T.near(a2.start, 1.5, 0.05, 'moved in A too');
  // 4. the clip moved in B (X now 5 s later): its marker goes with it
  const b2 = await US.host.call('sequenceInfo', { seqId: B.id }), xb = b2.video[0].clips.find(c => c.itemId === X.id);
  T.near((await M.readSequence(B.id, { clipMarkers: true })).markers.find(m => m.itemId).start, xb.start + 1.5, 0.05, 'where X is in B');
  // 5. off the clip, onto A's timeline
  await US.host.call('addSequenceMarkers', { seqId: A.id, markers: [{ start: a2.start, end: null, name: a2.name, comment: '', color: a2.color }], where: 'sequence' });
  await US.host.call('removeSequenceMarkers', { seqId: A.id, guids: [a2.guid] });
  const a3 = await M.readSequence(A.id, { clipMarkers: true });
  T.assert(!a3.markers.some(m => m.itemId) && a3.markers.some(m => m.name === 'Moved' && !m.itemId), 'on the timeline only now: ' + JSON.stringify(a3.markers));
  T.assert(!(await M.readSequence(B.id, { clipMarkers: true })).markers.some(m => m.name === 'Moved'), 'gone from B');
  notes.push('renamed, moved, onto the timeline: ok');
} finally { await clean(); }
return notes;
