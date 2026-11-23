// The Premiere Pro MCP inside Ultra Studio (prototype, 23 Nov 2026), in real Premiere with the MCP's UXP plugin:
//  A. (no AI) Ultra Studio starts its own copy of the MCP server, lists its tools, and reads the open sequence through
//     it – the same clips Ultra Studio's own commands see. Ask's mcp.find / mcp.call: reading runs at once, changing
//     asks first, the footage tools are refused.
//  B. (real Claude, a few cents) an Ask chat answers a question about the open sequence using only MCP tools.
//  C. (real Claude) an Ask chat adds a marker through the MCP: the approval card is shown first, and the marker is there.
// Skips when the MCP isn't set up on this computer (it is the editor's own install).
const BIN = 'Test – MCP', SEQ = 'Test – MCP', info = {};
if (!US.mcp || !US.chatTools || !US.chatTools['mcp.find']) throw new Error('The MCP bridge is not loaded in the panel');
if (!US.mcp.configured()) return 'skipped: no Premiere MCP set up on this computer';
const C = US.chat, F = US.chatTools['mcp.find'], K = US.chatTools['mcp.call'];
const x = { notes: [], note(t) { this.notes.push(t); }, journal() {} };
let seqId = '';
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id }); seqId = seq.id;
  await US.host.call('placeClips', { seqId, cursor: 0, clips: [{ id: ruth.id, in: 2, out: 6 }, { id: ruth.id, in: 20, out: 23 }] });
  await T.open(seqId); await T.sleep(500);

  /* ---------- A: the bridge itself ---------- */
  const t0 = performance.now();
  const tools = await US.mcp.tools();
  info.start = { tools: tools.length, readOnly: tools.filter(US.mcp.readsOnly).length, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
  T.assert(tools.length > 100, 'the MCP lists its tools: ' + tools.length);
  const st = await US.mcp.call('inspect_sequence_structure_uxp', {});
  T.assert(!st.isError && st.text.includes(SEQ), 'the MCP reads the open sequence: ' + st.text.slice(0, 200));
  const parsed = JSON.parse(st.text), v1 = parsed.result.tracks.find(t => t.mediaType === 'video' && t.trackIndex === 0);
  const ours = await US.host.call('sequenceInfo', { seqId });
  T.assert(v1 && v1.itemCount === ours.video[0].clips.length && v1.itemCount === 2, `the same clips on V1 as Ultra Studio sees (${v1 && v1.itemCount} / ${ours.video[0].clips.length})`);
  T.near(v1.items[1].startSeconds, ours.video[0].clips[1].start, 0.05, 'and in the same place');
  info.read = { ms: st.ms, v1: v1.items.map(i => `${i.name} ${i.startSeconds}–${i.endSeconds}`) };
  // Ask's tools
  const found = await F.run({ query: 'sequence markers add' }, x);
  T.assert(/add_marker|manage_markers_uxp/.test(found), 'mcp.find finds the marker tools: ' + found.slice(0, 300));
  T.assert(K.risk({ tool: 'inspect_sequence_structure_uxp' }) === 'read' && K.risk({ tool: 'manage_markers_uxp' }) !== 'read', 'reading runs at once, changing markers asks first');
  T.assert(/doesn’t run “capture_frame”/.test((await K.before({ tool: 'capture_frame' })).error) && /doesn’t run “transcribe_audio”/.test((await K.before({ tool: 'transcribe_audio' })).error), 'the footage tools are refused');
  T.assert(/no tool “made_up”/.test((await K.before({ tool: 'made_up' })).error), 'an unknown tool is refused');

  /* ---------- B and C: Claude in Ask, working through the MCP ---------- */
  if (!US.ai.available()) { info.ai = 'skipped: no AI set up'; return info; }
  const run = async (text, approve) => {
    const chat = C.newChat(); chat.model = 'claude:claude-sonnet-5-5';
    const cards = [], limits = [];
    const t1 = performance.now();
    await C.send(chat, text, { event() {}, status() {}, approve: async card => { cards.push(card); return approve ? { ok: true } : { ok: false }; }, choose: async () => null, limit: async l => { limits.push(l); return 'stop'; } }, { mode: 'ask', maxSteps: 12, budget: 1.5 });
    const steps = (chat.trace || []).filter(e => /call|tool/i.test(e.kind)).map(e => e.text);
    const end = chat.items.filter(i => i.k === 'end').pop() || {}, reply = [end.reply].concat(end.done || []).filter(Boolean).join(' · ');
    const mcpSteps = chat.items.filter(i => i.k === 'step' && /^mcp\./.test(i.tool)).map(i => `${i.tool}: ${i.text} → ${i.result || ''}`);
    return { chat, cards, limits, mcpSteps, kinds: chat.items.filter(i => /step|end|error/.test(i.k)).map(i => JSON.stringify(i).slice(0, 400)), trace: (chat.trace || []).map(e => e.kind + ':' + e.text.slice(0, 120) + ' | ' + String(e.detail || '').slice(0, 200)), status: chat.status, steps, reply: String(reply), usd: +chat.spent.toFixed(3), seconds: +((performance.now() - t1) / 1000).toFixed(0) };
  };
  const b = await run('Test of the Premiere MCP: using ONLY the Premiere MCP tools (mcp.find, then mcp.call), tell me how many clips are on video track 1 of the sequence that is open, and the start time of each. Do not change anything.', false);
  const usedMcp = b.mcpSteps.some(x => /^mcp\.call/.test(x));
  info.B = { usd: b.usd, seconds: b.seconds, usedMcp, cards: b.cards.length, steps: b.mcpSteps, reply: b.reply.slice(0, 400) };
  T.assert(usedMcp, 'Claude used the MCP: ' + JSON.stringify(info.B).slice(0, 600));
  T.assert(b.cards.length === 0, 'reading only: nothing to approve');
  T.assert(/\b(2|two)\b/i.test(b.reply), 'and answered: two clips – ' + b.reply.slice(0, 300));

  const before = (await US.host.call('sequenceInfo', { seqId })).markers.length;
  const c = await run('Test of the Premiere MCP: using the Premiere MCP (mcp.find, then mcp.call) – not your own marker tool – add one sequence marker named "MCP test" at 3 seconds in the open sequence. Then check it is there.', true);
  const marks = (await US.host.call('sequenceInfo', { seqId })).markers;
  const m = marks.find(k => /MCP test/.test(k.name));
  info.C = { usd: c.usd, seconds: c.seconds, cards: c.cards.map(k => k.detail || k.title || '').map(s => String(s).slice(0, 160)), marker: m ? { name: m.name, at: m.start } : null, steps: c.mcpSteps, reply: c.reply.slice(0, 400) };
  T.assert(c.cards.length >= 1 && c.cards.some(k => /Premiere MCP|MCP/.test(JSON.stringify(k))), 'the change was shown to approve first: ' + JSON.stringify(info.C.cards));
  T.assert(m && Math.abs(m.start - 3) < 0.1 && marks.length === before + 1, 'the marker is there at 3 s: ' + JSON.stringify(marks.map(k => [k.name, k.start])));
  return info;
} finally {
  if (seqId) await US.host.call('deleteSequence', { seqId }).catch(() => {});
}
