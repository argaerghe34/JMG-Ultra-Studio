// Ask's general editor commands, in the real editor, on scratch sequences it deletes afterwards (no AI at all: the
// commands and the chat tools are called directly). Each step reads the result back from the editor.
//   a new sequence from clips (place newSequence) · place on V2 over it · trim (length, tail, head) · move in time ·
//   cut (razor) · an effect added, its settings read, one set and keyframed · opacity keyframes · a transition ·
//   volume · the selection · add a track, name / lock / switch it off · markers: add, list, change, remove ·
//   sequence name and In/Out · the playhead · one frame saved · ranges taken out · Undo all · bins and finding clips.
// Only the first step (the scratch sequence) stops the test: every later step is tried whatever happened before, and
// everything that went wrong is reported together at the end – with what the editor actually returned (out.notes).
// In Resolve the edits its scripting can't do (trim, move in time, effect settings, cuts, selection) must come back
// saying so, with nothing changed.
const C = US.chat, A = US.chatAgent; T.assert(C && A && US.chatTools && US.chatTools.editor && US.chatTools.place, 'the editor tools are loaded');
const RES = US.app.is('resolve'), BIN = 'Test – Ask editor', NAME = 'Test – Ask editor';
const fs = require('fs');
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seqsNamed = async re => (await US.host.call('listSequences')).filter(s => re.test(s.name));
const SCRATCH = /Test . Ask editor/;
for (const s of await seqsNamed(SCRATCH)) await US.host.call('deleteSequence', { seqId: s.id });
const out = { passed: [], failed: [], notes: [] }, note = (k, v) => out.notes.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 900));
let now = '';
const check = (ok, msg) => { (ok ? out.passed : out.failed).push(`[${now}] ${msg}`.slice(0, 900)); return !!ok; };
/** One part of the test: tried whatever happened before; a throw is one more thing that went wrong. */
const part = async (name, fn) => { now = name; try { await fn(); } catch (e) { out.failed.push(`[${name}] threw: ${(e && (e.title || e.message)) || e}${e && e.detail ? ' – ' + String(e.detail).slice(0, 300) : ''}`); } };
// a chat with no AI: its tools are run directly, with every card approved
const chat = C.newChat();
A.remember(chat, items.map(it => ({ id: it.id, name: it.name, bin: BIN, path: it.path || '', kind: 'video' })));   // f1, f2, f3
const hooks = { event() {}, status() {}, approve: async () => ({ ok: true }), choose: async () => null, warn: async () => 'continue' };
const run = (tool, args) => C.callTool(chat, { tool, args }, hooks, { mode: 'never' });
const read = async seqId => US.host.call('editRead', { seqId });
const near = (a, b, tol = 0.09) => Math.abs(a - b) <= tol;
const v = (info, t) => (info.video[t] ? info.video[t].clips : []);
const apply = (seqId, op, params, targets) => US.host.call('editApply', { seqId, op, params, targets });
const V1 = start => ({ kind: 'video', track: 0, start });
/** Every effect on a clip as the editor names it: “Name [matchName]: setting = value; …” */
const effectsOf = async (seqId, target) => { try { const r = (await US.host.call('clipEffects', { seqId, targets: [target] }))[0]; return r && r.effects ? r.effects : []; } catch (e) { return [{ name: 'clipEffects threw: ' + (e.title || e.message || e), matchName: '', settings: [] }]; } };
const effectsText = fx => fx.map(e => `${e.name} [${e.matchName}]: ${e.settings.map(s => `${s.name}${s.value != null ? '=' + JSON.stringify(s.value) : ''}`).join('; ')}`).join(' | ');
let seqId = '';
try {
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  /* a new sequence from three clips, 3 s each – the one step everything else needs */
  let r = await run('place', { newSequence: NAME, clips: [{ clip: 'f1', length: 3 }, { clip: 'f2', length: 3 }, { clip: 'f3', length: 3 }] });
  T.assert(chat.work && chat.work.ours, 'place made a new sequence: ' + r);
  seqId = chat.work.seqId;
  let info = await read(seqId);
  T.assert(v(info, 0).length === 3 && near(info.duration, 9, 0.3) && near(v(info, 0)[1].start, 3), 'three clips end to end, about nine seconds: ' + JSON.stringify(v(info, 0).map(c => [c.start, c.end])));
  out.passed.push('[new sequence] three clips end to end');
  const c3 = v(info, 0)[2];

  await part('place on V2', async () => {
    r = await run('place', { clips: [{ clip: 'f1', at: 4, length: 2, from: 1, track: 'V2' }] });
    info = await read(seqId);
    check(v(info, 1).length === 1 && near(v(info, 1)[0].start, 4) && near(v(info, 1)[0].end, 6), 'placed on V2 at 0:04 for two seconds, on the same sequence: ' + r + ' ' + JSON.stringify(v(info, 1).map(c => [c.start, c.end])));
    check((await seqsNamed(SCRATCH)).length === 1, 'no second copy was made (it is the chat’s own sequence)');
  });

  if (RES) {
    await part('Resolve says what it can’t', async () => {
      for (const op of ['trim', 'shift', 'set', 'razor']) { const x = await apply(seqId, op, { length: 1, seconds: 1, effect: 'Motion', property: 'Scale', value: 110 }, [V1(c3.start)]); check(x.unsupported && x.why, `Resolve says plainly it can’t ${op}: ` + JSON.stringify(x)); }
      check((await US.host.call('selectClips', { seqId, targets: [V1(0)] })) === 0, 'Resolve can’t select timeline clips');
      const fx = await US.host.call('clipEffects', { seqId, targets: [V1(0)] });
      check(fx[0] && fx[0].unsupported, 'and can’t read an effect’s settings: ' + JSON.stringify(fx));
    });
  } else {
    await part('trim', async () => {
      let x = await apply(seqId, 'trim', { length: 2 }, [V1(c3.start)]);
      info = await read(seqId);
      check(x.done === 1 && near(v(info, 0)[2].end - v(info, 0)[2].start, 2), 'trim to a length: ' + JSON.stringify([x, v(info, 0)[2].start, v(info, 0)[2].end]));
      x = await apply(seqId, 'trim', { tail: 0.5 }, [V1(c3.start)]);
      info = await read(seqId);
      check(x.done === 1 && near(v(info, 0)[2].end - v(info, 0)[2].start, 2.5), 'half a second more on the end: ' + JSON.stringify([x, v(info, 0)[2].start, v(info, 0)[2].end]));
      const in0 = v(info, 0)[2].in;
      x = await apply(seqId, 'trim', { head: -0.5 }, [V1(c3.start)]);
      info = await read(seqId);
      const t3 = v(info, 0)[2];
      check(x.done === 1 && near(t3.start, c3.start + 0.5) && near(t3.in, in0 + 0.5), 'half a second off the start, the picture in step: ' + JSON.stringify([x, t3.start, t3.end, t3.in, in0]));
    });
    await part('move in time', async () => {
      const x = await apply(seqId, 'shift', { seconds: 1 }, [{ kind: 'video', track: 1, start: 4 }]);
      info = await read(seqId);
      check(x.done === 1 && v(info, 1)[0] && near(v(info, 1)[0].start, 5) && near(v(info, 1)[0].end, 7), 'moved a second later on its own track: ' + JSON.stringify([x, v(info, 1).map(c => [c.start, c.end])]));
    });
    await part('cut', async () => {
      info = await read(seqId);
      const n0 = v(info, 0).length, x = await apply(seqId, 'razor', {}, [{ kind: 'video', track: 0, start: 1.5, end: 3 }]);
      info = await read(seqId);
      check(v(info, 0).length === n0 + 1 && near(v(info, 0)[1].start, 1.5), 'a cut at 0:01.5: ' + JSON.stringify([x, v(info, 0).map(c => c.start)]));
    });
    await part('effect settings', async () => {
      // what is on the clip before anything is added (Motion, Opacity, Time Remapping…), as the editor names it
      const before = await effectsOf(seqId, V1(0));
      note('effects before', effectsText(before));
      check(before.some(e => /^Motion$/i.test(e.name)) && before.some(e => /^Opacity$/i.test(e.name)), 'a clip’s own effects are read with their settings: ' + effectsText(before));
      // a built-in setting, by its real name: Motion › Scale
      let x = await apply(seqId, 'set', { effect: 'Motion', property: 'Scale', value: 120 }, [V1(0)]);
      const scale = ((await effectsOf(seqId, V1(0))).find(e => /^Motion$/i.test(e.name)) || { settings: [] }).settings.find(s => /^Scale$/i.test(s.name));
      check(x.done === 1 && scale && near(scale.value, 120, 0.6), 'Motion › Scale set to 120 and read back: ' + JSON.stringify([x, scale]));
      // keyframes on a built-in setting
      x = await apply(seqId, 'set', { effect: 'Opacity', property: 'Opacity', keys: [{ at: 0, value: 0 }, { at: 1, value: 100 }] }, [V1(0)]);
      check(x.done === 1, 'opacity keyframed over the first second: ' + JSON.stringify(x));
      // an effect added by name: whatever Premiere adds for that name, its real settings are read and one number is set
      x = await apply(seqId, 'effect', { name: 'Gaussian Blur' }, [V1(0)]);
      const after = await effectsOf(seqId, V1(0)), had = new Set(before.map(e => e.name + '|' + e.matchName));
      const added = after.filter(e => !had.has(e.name + '|' + e.matchName));
      note('effects after adding “Gaussian Blur”', effectsText(after));
      check(x.done === 1 && added.length === 1, 'one effect was added for the name “Gaussian Blur”: ' + JSON.stringify(x) + ' · new: ' + effectsText(added) + ' · all: ' + effectsText(after));
      if (added[0] && !/^Gaussian Blur$/i.test(added[0].name)) note('NOTE', `the effect Premiere added for “Gaussian Blur” calls itself “${added[0].name}” [${added[0].matchName}]`);
      const fxNow = added[0] || after.find(e => /blur/i.test(e.name));
      const num = fxNow && fxNow.settings.find(s => typeof s.value === 'number');
      if (check(!!num, 'the added effect has a number a script can set: ' + effectsText(fxNow ? [fxNow] : []))) {
        const want = num.value === 0 ? 25 : Math.round(num.value * 0.5 * 100) / 100 || 1;
        x = await apply(seqId, 'set', { effect: fxNow.name, property: num.name, value: want }, [V1(0)]);
        const back = ((await effectsOf(seqId, V1(0))).filter(e => e.name === fxNow.name).pop() || { settings: [] }).settings.find(s => s.name === num.name);
        check(x.done === 1 && back && near(back.value, want, Math.max(0.6, Math.abs(want) * 0.02)), `“${fxNow.name}” › ${num.name} set to ${want} and read back: ` + JSON.stringify([x, back]));
      }
      if (fxNow) {
        x = await apply(seqId, 'set', { effect: fxNow.name, property: 'No such setting', value: 1 }, [V1(0)]);
        check(x.done === 0 && x.skipped.length === 1 && /has no setting called/.test(x.skipped[0].why) && fxNow.settings.every(s => x.skipped[0].why.includes(s.name)) && !/Error occurred|, _ /.test(x.skipped[0].why), 'a setting that isn’t there is said, with the real ones (no hidden ones): ' + JSON.stringify(x));
      }
      x = await apply(seqId, 'set', { effect: 'No Such Effect', property: 'X', value: 1 }, [V1(0)]);
      check(x.done === 0 && x.skipped[0] && /has no “No Such Effect” \(it has: /.test(x.skipped[0].why), 'an effect that isn’t on the clip is said, with the ones that are: ' + JSON.stringify(x));
      info = await read(seqId);
      note('effects as the timeline reading shows them', v(info, 0)[0].effects);
    });
    await part('transition', async () => {
      info = await read(seqId);
      const at = (v(info, 0)[2] || v(info, 0)[1]).start, x = await apply(seqId, 'transition', { name: 'Cross Dissolve', at: 'start', seconds: 0.5 }, [V1(at)]);
      note('transition', x);
      check(x.done === 1, 'a cross dissolve at a cut: ' + JSON.stringify(x));
    });
    await part('volume', async () => {
      info = await read(seqId);
      const a1 = (info.audio[0] || { clips: [] }).clips[0];
      if (!a1) { note('volume', 'no sound on A1 in this sequence – not checked'); return; }
      const x = await apply(seqId, 'volume', { db: -6 }, [{ kind: 'audio', track: 0, start: a1.start }]);
      check(x.done === 1, 'volume down 6 dB: ' + JSON.stringify(x));
      note('audio clip effects', effectsText(await effectsOf(seqId, { kind: 'audio', track: 0, start: a1.start })));
    });
    await part('selection', async () => {
      info = await read(seqId);
      const t2 = v(info, 1)[0], sel = await US.host.call('selectClips', { seqId, targets: [V1(0)].concat(t2 ? [{ kind: 'video', track: 1, start: t2.start }] : []) });
      check(sel === (t2 ? 2 : 1), `${t2 ? 2 : 1} clips selected: ` + sel);
      try { note('selection read back', await US.host.call('editSelection', { seqId })); } catch (e) { note('selection read back', String(e.message || e.title || e)); }
    });
  }
  await part('clip.effects through the chat tool', async () => {
    r = await run('editor', { do: 'clip.effects', clips: [{ track: 'V1', at: 0 }] });
    note('editor clip.effects', r);
    check(RES ? /Resolve doesn’t let add-ons read/.test(r) : /Motion: /.test(r) && /Set one with the edit tool/.test(r), 'the chat reads a clip’s effects and their settings: ' + r.slice(0, 400));
  });
  await part('tracks', async () => {
    r = await run('editor', { do: 'sequence.settings' });
    note('settings', r);
    const tracks0 = /video tracks (\d+)/.exec(r) ? +/video tracks (\d+)/.exec(r)[1] : 0;
    r = await run('editor', { do: 'track.add', kind: 'video', count: 1 });
    check(new RegExp(`there are ${tracks0 + 1} video`).test(r), 'a video track added: ' + r);
    r = await run('editor', { do: 'track.set', track: 'V2', name: 'B-roll', locked: true, off: true });
    note('track.set name+lock+off', r);
    check(/V2: .*off/.test(r), 'V2 switched off (and named / locked where the editor lets a script): ' + r);
    r = await run('editor', { do: 'track.set', track: 'V2', locked: false, off: false });
    check(/V2: .*on/.test(r), 'and on again: ' + r);
    note('settings after', await run('editor', { do: 'sequence.settings' }));
  });
  await part('markers', async () => {
    r = await run('editor', { do: 'marker.add', markers: [{ at: 1, name: 'One', color: 1 }, { at: 4, end: 6, name: 'Two', comment: 'a range' }] });
    check(/2 markers added/.test(r), r);
    r = await run('editor', { do: 'marker.list' });
    const ids = r.split('\n').slice(1).map(l => l.split('\t')), one = ids.find(l => l[4] === 'One'), two = ids.find(l => l[4] === 'Two');
    if (!check(one && two && near(+one[1], 1) && near(+two[1], 4) && near(+two[2], 6), 'listed with their times: ' + r)) return;
    r = await run('editor', { do: 'marker.change', markers: [{ id: one[0], name: 'One changed', comment: 'by Ask' }] });
    const l2 = await run('editor', { do: 'marker.list' });
    check(/One changed/.test(l2), 'changed: ' + r + ' / ' + l2);
    const row2 = l2.split('\n').slice(1).map(l => l.split('\t')).find(l => l[4] === 'Two');
    r = await run('editor', { do: 'marker.remove', ids: [row2 ? row2[0] : two[0]] });
    check(/1 markers removed/.test(r) && !/\tTwo\t/.test(await run('editor', { do: 'marker.list' })), 'removed: ' + r);
  });
  await part('rename', async () => {
    r = await run('editor', { do: 'sequence.rename', name: NAME + ' renamed' });
    check(/is now called/.test(r) && (await seqsNamed(/Ask editor renamed$/)).length === 1, 'renamed: ' + r);
  });
  await part('In and Out', async () => {
    r = await run('editor', { do: 'sequence.inout', in: 1, out: 5 });
    note('in/out', r);
    const s2 = await US.host.call('sequenceInfo', { seqId, clips: false });
    if (RES) note('Resolve In/Out', [s2.inPoint, s2.outPoint]); else check(near(s2.inPoint, 1) && near(s2.outPoint, 5), 'In 0:01 and Out 0:05: ' + JSON.stringify([s2.inPoint, s2.outPoint]) + ' ' + r);
  });
  await part('playhead', async () => {
    r = await run('editor', { do: 'playhead', at: 2 });
    const s3 = await US.host.call('sequenceInfo', { seqId, clips: false });
    check(near(s3.playhead, 2, 0.1), 'the playhead is at 0:02: ' + s3.playhead + ' ' + r);
  });
  await part('a frame', async () => {
    r = await run('editor', { do: 'frame', at: 2 });
    const file = (/saved: (.+)$/.exec(r) || [])[1];
    check(file && fs.existsSync(file) && fs.statSync(file).size > 1000, 'a frame saved as a picture: ' + r);
    try { fs.unlinkSync(file); } catch (e) { /* left in Frames */ }
  });
  await part('extract', async () => {
    const d0 = (await read(seqId)).duration;
    r = await run('editor', { do: 'sequence.extract', ranges: [[0.5, 1]] });
    const d1 = (await read(seqId)).duration;
    check(near(d0 - d1, 0.5, 0.15), 'half a second taken out and closed up: ' + JSON.stringify([d0, d1]) + ' ' + r);
    check((await seqsNamed(SCRATCH)).length === 1, 'on the chat’s own sequence – no copy made');
  });
  await part('Undo all', async () => {
    const plan = C.undoPlan(chat);
    note('undo', [plan.can.map(x => x.text), plan.cant.map(x => x.text)]);
    const res = await C.undo(chat, { confirm: async () => 'delete' });
    check((await seqsNamed(SCRATCH)).length === 0, 'Undo all removed the scratch sequence: ' + JSON.stringify(res));
  });
  await part('bins and find', async () => {
    r = await run('bins', { filter: 'Ask editor' });
    check(/Test – Ask editor\t[3-9]\t0/.test(r), 'the bin with its count: ' + r);
    r = await run('find', { bin: 'Ask editor', name: 'C002' });
    check(/C002_blurry/.test(r) && /\tvideo\t/.test(r), 'a clip found by name within a bin: ' + r);
  });
} finally {
  for (const s of await seqsNamed(SCRATCH)) await US.host.call('deleteSequence', { seqId: s.id }).catch(() => {});
  await US.host.call('askRemoveBins', { paths: ['JMG Ultra Studio / Ask'] }).catch(() => {});
}
out.passed.push(US.jobs.current ? '' : '[end] the editor is free again');
// everything that went wrong, together – with what the editor returned
T.assert(!out.failed.length, `${out.failed.length} of ${out.failed.length + out.passed.length} checks failed:\n` + out.failed.join('\n') + '\n\nPASSED:\n' + out.passed.join('\n') + '\n\nNOTES:\n' + out.notes.join('\n'));
return out;
