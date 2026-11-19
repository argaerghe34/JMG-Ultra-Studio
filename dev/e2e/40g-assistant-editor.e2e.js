// Ask's general editor commands, in the real editor, on scratch sequences it deletes afterwards (no AI at all: the
// commands and the chat tools are called directly). Each step reads the result back from the editor.
//   a new sequence from clips (place newSequence) · place on V2 over it · trim (length, tail, head) · move in time ·
//   cut (razor) · add a track, name / lock / switch it off · markers: add, list, change, remove · an effect added and
//   one of its settings set and keyframed · opacity keyframes · a transition · volume · sequence name and In/Out ·
//   the selection · the playhead · one frame saved · ranges taken out · bins and finding clips.
// In Resolve the edits its scripting can't do (trim, move in time, effect settings, cuts, selection) must come back
// saying so, with nothing changed.
const C = US.chat, A = US.chatAgent; T.assert(C && A && US.chatTools && US.chatTools.editor && US.chatTools.place, 'the editor tools are loaded');
const RES = US.app.is('resolve'), BIN = 'Test – Ask editor', NAME = 'Test – Ask editor';
const fs = require('fs');
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seqsNamed = async re => (await US.host.call('listSequences')).filter(s => re.test(s.name));
const SCRATCH = /Test . Ask editor/;
for (const s of await seqsNamed(SCRATCH)) await US.host.call('deleteSequence', { seqId: s.id });
const out = { notes: [] }, note = (k, v) => out.notes.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 300));
// a chat with no AI: its tools are run directly, with every card approved
const chat = C.newChat();
A.remember(chat, items.map(it => ({ id: it.id, name: it.name, bin: BIN, path: it.path || '', kind: 'video' })));   // f1, f2, f3
const hooks = { event() {}, status() {}, approve: async () => ({ ok: true }), choose: async () => null, warn: async () => 'continue' };
const run = (tool, args) => C.callTool(chat, { tool, args }, hooks, { mode: 'never' });
const read = async seqId => US.host.call('editRead', { seqId });
const near = (a, b, tol = 0.09) => Math.abs(a - b) <= tol;
const v = (info, t) => (info.video[t] ? info.video[t].clips : []);
const apply = (seqId, op, params, targets) => US.host.call('editApply', { seqId, op, params, targets });
try {
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  /* a new sequence from three clips, 3 s each */
  let r = await run('place', { newSequence: NAME, clips: [{ clip: 'f1', length: 3 }, { clip: 'f2', length: 3 }, { clip: 'f3', length: 3 }] });
  T.assert(chat.work && chat.work.ours, 'place made a new sequence: ' + r);
  const seqId = chat.work.seqId;
  let info = await read(seqId);
  T.assert(v(info, 0).length === 3 && near(info.duration, 9, 0.3) && near(v(info, 0)[1].start, 3), 'three clips end to end, about nine seconds: ' + JSON.stringify(v(info, 0).map(c => [c.start, c.end])));
  /* a clip over it on V2 */
  r = await run('place', { clips: [{ clip: 'f1', at: 4, length: 2, from: 1, track: 'V2' }] });
  info = await read(seqId);
  T.assert(v(info, 1).length === 1 && near(v(info, 1)[0].start, 4) && near(v(info, 1)[0].end, 6), 'placed on V2 at 0:04 for two seconds, on the same sequence: ' + r + ' ' + JSON.stringify(v(info, 1).map(c => [c.start, c.end])));
  T.assert((await seqsNamed(SCRATCH)).length === 1, 'no second copy was made (it is the chat’s own sequence)');
  const c3 = v(info, 0)[2];
  if (RES) {
    for (const op of ['trim', 'shift', 'set', 'razor']) { const x = await apply(seqId, op, { length: 1, seconds: 1, effect: 'Motion', property: 'Scale', value: 110 }, [{ kind: 'video', track: 0, start: c3.start }]); T.assert(x.unsupported && x.why, `Resolve says plainly it can’t ${op}: ` + JSON.stringify(x)); }
    T.assert((await US.host.call('selectClips', { seqId, targets: [{ kind: 'video', track: 0, start: 0 }] })) === 0, 'Resolve can’t select timeline clips');
  } else {
    /* trim: the last clip to 2 s; then half a second back on its end; then half a second off its start */
    let x = await apply(seqId, 'trim', { length: 2 }, [{ kind: 'video', track: 0, start: c3.start }]);
    info = await read(seqId);
    T.assert(x.done === 1 && near(v(info, 0)[2].end - v(info, 0)[2].start, 2), 'trim to a length: ' + JSON.stringify([x, v(info, 0)[2].start, v(info, 0)[2].end]));
    x = await apply(seqId, 'trim', { tail: 0.5 }, [{ kind: 'video', track: 0, start: c3.start }]);
    info = await read(seqId);
    T.assert(x.done === 1 && near(v(info, 0)[2].end - v(info, 0)[2].start, 2.5), 'half a second more on the end: ' + JSON.stringify([x, v(info, 0)[2].start, v(info, 0)[2].end]));
    const in0 = v(info, 0)[2].in;
    x = await apply(seqId, 'trim', { head: -0.5 }, [{ kind: 'video', track: 0, start: c3.start }]);
    info = await read(seqId);
    const t3 = v(info, 0)[2];
    T.assert(x.done === 1 && near(t3.start, c3.start + 0.5) && near(t3.in, in0 + 0.5), 'half a second off the start, the picture in step: ' + JSON.stringify([x, t3.start, t3.end, t3.in, in0]));
    note('trim', [t3.start, t3.end, t3.in]);
    /* move the V2 clip a second later */
    x = await apply(seqId, 'shift', { seconds: 1 }, [{ kind: 'video', track: 1, start: 4 }]);
    info = await read(seqId);
    T.assert(x.done === 1 && near(v(info, 1)[0].start, 5) && near(v(info, 1)[0].end, 7), 'moved a second later on its own track: ' + JSON.stringify([x, v(info, 1).map(c => [c.start, c.end])]));
    /* cut: the first clip in two at 1.5 s (razor at the edges of a target 1.5–3) */
    const n0 = v(info, 0).length;
    x = await apply(seqId, 'razor', {}, [{ kind: 'video', track: 0, start: 1.5, end: 3 }]);
    info = await read(seqId);
    T.assert(v(info, 0).length === n0 + 1 && near(v(info, 0)[1].start, 1.5), 'a cut at 0:01.5: ' + JSON.stringify([x, v(info, 0).map(c => c.start)]));
    /* an effect, one of its settings, and keyframes */
    x = await apply(seqId, 'effect', { name: 'Gaussian Blur' }, [{ kind: 'video', track: 0, start: 0 }]);
    T.assert(x.done === 1, 'Gaussian Blur added: ' + JSON.stringify(x));
    x = await apply(seqId, 'set', { effect: 'Gaussian Blur', property: 'Blurriness', value: 25 }, [{ kind: 'video', track: 0, start: 0 }]);
    T.assert(x.done === 1, 'its Blurriness set: ' + JSON.stringify(x));
    x = await apply(seqId, 'set', { effect: 'Opacity', property: 'Opacity', keys: [{ at: 0, value: 0 }, { at: 1, value: 100 }] }, [{ kind: 'video', track: 0, start: 0 }]);
    T.assert(x.done === 1, 'opacity keyframed over the first second: ' + JSON.stringify(x));
    x = await apply(seqId, 'set', { effect: 'Gaussian Blur', property: 'No such setting', value: 1 }, [{ kind: 'video', track: 0, start: 0 }]);
    T.assert(x.done === 0 && x.skipped.length === 1 && /has no setting called/.test(x.skipped[0].why) && /Blurriness/.test(x.skipped[0].why), 'a setting that isn’t there is said, with the ones that are: ' + JSON.stringify(x));
    note('settings of Gaussian Blur', x.skipped[0].why);
    info = await read(seqId);
    T.assert(v(info, 0)[0].effects.some(e => /Gaussian Blur/i.test(e)), 'the effect reads back: ' + JSON.stringify(v(info, 0)[0].effects));
    /* a transition and volume */
    x = await apply(seqId, 'transition', { name: 'Cross Dissolve', at: 'start', seconds: 0.5 }, [{ kind: 'video', track: 0, start: 3 }]);
    note('transition', x);
    T.assert(x.done === 1, 'a cross dissolve at a cut: ' + JSON.stringify(x));
    if ((info.audio[0] || { clips: [] }).clips.length) { x = await apply(seqId, 'volume', { db: -6 }, [{ kind: 'audio', track: 0, start: info.audio[0].clips[0].start }]); T.assert(x.done === 1, 'volume down 6 dB: ' + JSON.stringify(x)); } else note('volume', 'no sound on A1 in this sequence – not checked');
    /* the selection */
    const sel = await US.host.call('selectClips', { seqId, targets: [{ kind: 'video', track: 0, start: 0 }, { kind: 'video', track: 1, start: 5 }] });
    T.assert(sel === 2, 'two clips selected: ' + sel);
    try { const s2 = await US.host.call('editSelection', { seqId }); note('selection read back', s2); } catch (e) { note('selection read back', String(e.message || e.title || e)); }
  }
  /* tracks: add one, name / lock / switch off V2 */
  r = await run('editor', { do: 'sequence.settings' });
  note('settings', r);
  const tracks0 = /video tracks (\d+)/.exec(r) ? +/video tracks (\d+)/.exec(r)[1] : 0;
  r = await run('editor', { do: 'track.add', kind: 'video', count: 1 });
  T.assert(new RegExp(`there are ${tracks0 + 1} video`).test(r), 'a video track added: ' + r);
  r = await run('editor', { do: 'track.set', track: 'V2', name: 'B-roll', locked: true, off: true });
  note('track.set', r);
  T.assert(/V2: .*off/.test(r), 'V2 switched off (and named / locked where the editor lets a script): ' + r);
  r = await run('editor', { do: 'track.set', track: 'V2', locked: false, off: false });
  T.assert(/V2: .*on/.test(r), 'and on again: ' + r);
  /* markers */
  r = await run('editor', { do: 'marker.add', markers: [{ at: 1, name: 'One', color: 1 }, { at: 4, end: 6, name: 'Two', comment: 'a range' }] });
  T.assert(/2 markers added/.test(r), r);
  r = await run('editor', { do: 'marker.list' });
  const ids = r.split('\n').slice(1).map(l => l.split('\t')), one = ids.find(l => l[4] === 'One'), two = ids.find(l => l[4] === 'Two');
  T.assert(one && two && near(+one[1], 1) && near(+two[1], 4) && near(+two[2], 6), 'listed with their times: ' + r);
  r = await run('editor', { do: 'marker.change', markers: [{ id: one[0], name: 'One changed', comment: 'by Ask' }] });
  const l2 = (await run('editor', { do: 'marker.list' }));
  T.assert(/One changed/.test(l2), 'changed: ' + r + ' / ' + l2);
  const id2 = l2.split('\n').slice(1).map(l => l.split('\t')).find(l => l[4] === 'Two')[0];
  r = await run('editor', { do: 'marker.remove', ids: [id2] });
  T.assert(/1 markers removed/.test(r) && !/\tTwo\t/.test(await run('editor', { do: 'marker.list' })), 'removed: ' + r);
  /* name, In/Out, playhead, a frame */
  r = await run('editor', { do: 'sequence.rename', name: NAME + ' renamed' });
  T.assert(/is now called/.test(r) && (await seqsNamed(/Ask editor renamed$/)).length === 1, 'renamed: ' + r);
  r = await run('editor', { do: 'sequence.inout', in: 1, out: 5 });
  note('in/out', r);
  const s2 = await US.host.call('sequenceInfo', { seqId, clips: false });
  if (!RES) T.assert(near(s2.inPoint, 1) && near(s2.outPoint, 5), 'In 0:01 and Out 0:05: ' + JSON.stringify([s2.inPoint, s2.outPoint]) + ' ' + r);
  r = await run('editor', { do: 'playhead', at: 2 });
  const s3 = await US.host.call('sequenceInfo', { seqId, clips: false });
  T.assert(near(s3.playhead, 2, 0.1), 'the playhead is at 0:02: ' + s3.playhead);
  r = await run('editor', { do: 'frame', at: 2 });
  const file = (/saved: (.+)$/.exec(r) || [])[1];
  T.assert(file && fs.existsSync(file) && fs.statSync(file).size > 1000, 'a frame saved as a picture: ' + r);
  try { fs.unlinkSync(file); } catch (e) { /* left in Frames */ }
  /* ranges taken out (the sequence is the chat's own, so no copy) */
  const d0 = (await read(seqId)).duration;
  r = await run('editor', { do: 'sequence.extract', ranges: [[0.5, 1]] });
  const d1 = (await read(seqId)).duration;
  T.assert(near(d0 - d1, 0.5, 0.15), 'half a second taken out and closed up: ' + JSON.stringify([d0, d1]) + ' ' + r);
  /* Undo all: the scratch sequence goes (and with it everything above) */
  const plan = C.undoPlan(chat);
  note('undo', [plan.can.map(x => x.text), plan.cant.map(x => x.text)]);
  await C.undo(chat, { confirm: async () => 'delete' });
  T.assert((await seqsNamed(SCRATCH)).length === 0, 'Undo all removed the scratch sequence');
  /* the project: bins with counts, clips by name and bin */
  r = await run('bins', { filter: 'Ask editor' });
  T.assert(/Test – Ask editor\t[3-9]\t0/.test(r), 'the bin with its count: ' + r);
  r = await run('find', { bin: 'Ask editor', name: 'C002' });
  T.assert(/C002_blurry/.test(r) && /\tvideo\t/.test(r), 'a clip found by name within a bin: ' + r);
} finally {
  for (const s of await seqsNamed(SCRATCH)) await US.host.call('deleteSequence', { seqId: s.id }).catch(() => {});
  await US.host.call('askRemoveBins', { paths: ['JMG Ultra Studio / Ask'] }).catch(() => {});
}
T.assert(!US.jobs.current, 'the editor is free again');
return out;
