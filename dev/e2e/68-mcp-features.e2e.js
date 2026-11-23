// premiere-only
// The Premiere Pro MCP features of 1.3.44 (23 Nov 2026), in real Premiere with both halves of the MCP (UXP plugin and
// CEP panel). No AI is used, nothing costs money.
//  A. Settings › Premiere MCP shows what is found and connected; "look only" stops changes through the MCP.
//  B. The CEP half answers (it reads commands from the shared folder), so more tools can run than with UXP alone.
//  C. Ask › Edit gets the MCP's second opinion: a transition is checked as "no clip moved" (exact, through CEP); a delete
//     shows in the MCP's diff; a delete that leaves a hole is flagged as a new gap.
//  D. Story asks Premiere for its own transcripts live through the MCP – without saving the project.
// Skips when the MCP isn't set up on this computer (it is the editor's own install).
const BIN = 'Test – MCP', SEQ = 'Test – MCP checks', info = {};
if (!US.mcp || !US.mcpCheck) throw new Error('The MCP features are not loaded in the panel');
if (!US.mcp.config()) return 'skipped: no Premiere MCP set up on this computer';
const S = US.settings, had = k => k in S.all(), keep = ['mcp.enabled', 'mcp.level', 'mcp.checkEdits', 'mcp.storyTranscripts'].map(k => [k, had(k), S.get(k)]);
const job = { set() { return job; }, progress() { return job; }, check() {}, log() {} };
let seqId = '', copyId = '';
try {
  for (const k of ['mcp.enabled', 'mcp.level', 'mcp.checkEdits', 'mcp.storyTranscripts']) delete S.all()[k];
  US.mcp.stop();

  /* ---------- A: Settings ---------- */
  US.tools.open('settings', { section: 'mcp' });
  let box = null;
  for (let i = 0; i < 60; i++) { await T.sleep(500); box = document.querySelector('[data-section="mcp"]'); if (box && /can run here/.test(box.textContent)) break; }
  T.assert(box, 'Settings has a Premiere MCP section');
  const text = box.textContent.replace(/\s+/g, ' ');
  info.settings = (text.match(/UXP plugin: [^•✓]*|CEP panel: [^•✓]*|Tools: [^•✓]*/g) || []).map(s => s.trim());
  T.assert(/UXP plugin: connected/.test(text) && /CEP panel: connected/.test(text) && /\d+ of \d+ can run here/.test(text), 'it shows both halves connected and the tools: ' + text.slice(0, 600));
  T.assert(box.querySelector('button') && /Test/.test(box.textContent), 'and a Test button');
  // look only: the server's own copy can't change anything, and Ask refuses a change
  S.set('mcp.level', 'look'); US.mcp.stop(); US.chatMcp.known.clear();
  const toolsLook = await US.mcp.tools();
  const K = US.chatTools['mcp.call'];
  T.assert(!toolsLook.some(t => /^(ripple_delete|add_marker|set_clip_volume)$/.test(t.name)), 'look only: the editing tools aren’t there at all');
  T.assert(/look only/.test((await K.before({ tool: 'manage_markers_uxp', args: {} })).error || ''), 'and a tool that can both read and change (markers) is refused by Ask');
  info.look = { tools: toolsLook.length };
  delete S.all()['mcp.level']; US.mcp.stop(); US.chatMcp.known.clear();

  /* ---------- B: the CEP half ---------- */
  T.assert(US.mcp.cepInstalled(), 'the MCP’s CEP panel is installed');
  const r = await US.mcp.reachable(true), usable = await US.mcp.usable(), all = await US.mcp.tools();
  info.bridges = { live: r.live, usable: usable.length, tools: all.length };
  T.assert(r.live.uxp && r.live.cep, 'both halves answer: ' + JSON.stringify(r.live));
  T.assert(usable.length > 300, 'far more tools can run with the CEP panel than the 109 with UXP alone: ' + usable.length);

  /* ---------- C: Ask › Edit, checked by the MCP ---------- */
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  for (const n of [SEQ, SEQ + ' – Ask']) { const old = await T.seqByName(n); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id }); seqId = seq.id;
  await US.host.call('placeClips', { seqId, cursor: 0, clips: [{ id: ruth.id, in: 2, out: 6 }, { id: ruth.id, in: 20, out: 23 }, { id: ruth.id, in: 30, out: 34 }] });
  await T.open(seqId); await T.sleep(500);
  const E = US.editAsk, model = E.timelineModel(await US.host.call('editRead', { seqId }));
  const conv = { model };
  const tg = (start, end) => [{ kind: 'video', track: 0, start, end }, { kind: 'audio', track: 0, start, end }];
  // 1. a transition – nothing should move
  const t0 = performance.now();
  const o1 = await E.run(job, conv, [{ op: 'transition', params: { name: 'Cross Dissolve', at: 'end', seconds: 0.5 }, targets: [{ kind: 'video', track: 0, start: 0, end: 4 }] }], { copy: true });
  copyId = o1.seqId;
  info.transition = { seconds: +((performance.now() - t0) / 1000).toFixed(1), summary: o1.summary, mcp: o1.mcp && o1.mcp.text };
  T.assert(o1.mcp && o1.mcp.verified === true && /no clip moved/.test(o1.mcp.text) && !o1.mcp.problems.length, 'a transition: the MCP checks exactly that no clip moved – ' + JSON.stringify(info.transition));
  // 2. a ripple delete of the middle clip: the diff shows it, no new gap, the exact prediction says why it can't
  const o2 = await E.run(job, conv, [{ op: 'remove', params: { ripple: true }, targets: tg(4, 7) }], { copy: true });
  info.rippleDelete = { summary: o2.summary, mcp: o2.mcp && o2.mcp.text, changes: o2.mcp && o2.mcp.changes };
  T.assert(o2.mcp && o2.mcp.changes && o2.mcp.changes.removed === 2 && !o2.mcp.problems.length, 'a ripple delete: the MCP saw 2 clips removed and no new problem – ' + JSON.stringify(info.rippleDelete));
  // 3. a delete that leaves a hole: flagged as a new gap, and Ask's own check is told
  const now = E.timelineModel(await US.host.call('editRead', { seqId: copyId }));
  const last = now.clips.filter(c => c.kind === 'video').sort((a, b) => a.start - b.start)[0];
  const o3 = await E.run(job, conv, [{ op: 'remove', params: { ripple: false }, targets: tg(last.start, last.end) }], { copy: true });
  info.holeDelete = { summary: o3.summary, problems: o3.mcp && o3.mcp.problems };
  T.assert(o3.mcp && o3.mcp.problems.some(p => /gap|black/i.test(p)) && /flagged/.test(o3.summary), 'a delete that leaves a hole is flagged (a gap, or black at the start) – ' + JSON.stringify(info.holeDelete));
  // switched off: no check
  S.set('mcp.checkEdits', false);
  const o4 = await E.run(job, conv, [{ op: 'transition', params: { name: 'Cross Dissolve', at: 'start', seconds: 0.5 }, targets: [{ kind: 'video', track: 0, start: 0, end: 1 }] }], { copy: true });
  T.assert(!o4.mcp, 'switched off in Settings: no MCP check');
  delete S.all()['mcp.checkEdits'];

  /* ---------- D: Story reads Premiere's own transcripts through the MCP ----------
     Premiere transcribes clips itself (Text panel); the MCP can't be used to give the test project one (its import
     looks through at most 512 project items), so this reads whatever Premiere has. When a clip has a transcript, its
     words and speaker are checked; when none has, the live read still has to finish without saving the project. */
  const projFile = (await US.host.call('storyProjectFile', { save: false })).path;
  const savedBefore = T.fs.statSync(projFile).mtimeMs;
  const t1 = performance.now();
  const got = await US.story.premiereTranscriptsViaMcp(job);
  info.story = { seconds: +((performance.now() - t1) / 1000).toFixed(1), found: got && got.found.map(f => `${f.name}: ${f.segments.length} lines, speaker ${f.segments[0] && f.segments[0].speaker || '–'}`), unsure: got && got.unsure.length };
  T.assert(got && Array.isArray(got.found) && Array.isArray(got.unsure), 'Story asked Premiere through the MCP: ' + JSON.stringify(info.story));
  T.assert(got.unsure.every(n => /\.(mp4|mov|mxf|m4v|wav|aiff?|mp3|m4a)$/i.test(n)), 'only audio and video clips are asked about: ' + got.unsure.join(', '));
  for (const f of got.found) T.assert(f.segments.length && f.segments.every(sg => sg.text && sg.end > sg.start), 'a transcript read through the MCP has timed lines: ' + f.name);
  if (!got.found.length) info.story.note = 'no clip in the test project has a Premiere transcript, so reading one was not tried here';
  T.assert(T.fs.statSync(projFile).mtimeMs === savedBefore, 'the project wasn’t saved for it');
  S.set('mcp.storyTranscripts', false);
  T.assert((await US.story.premiereTranscriptsViaMcp(job)) === null, 'switched off in Settings: Story reads the project file as before');
  delete S.all()['mcp.storyTranscripts'];
  return info;
} finally {
  for (const [k, was, v] of keep) { if (was) S.set(k, v); else delete S.all()[k]; }
  S.flush(); US.mcp.stop();
  for (const id of [copyId, seqId]) if (id) await US.host.call('deleteSequence', { seqId: id }).catch(() => {});
}
