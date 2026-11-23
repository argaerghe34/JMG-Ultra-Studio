// The Premiere MCP features of 1.3.44: Story reading Premiere's transcript from the MCP's answer, and the MCP's checks
// on Ask › Edit (which steps move clips, Ask's cuts as the MCP's exact operations, and the result told to Ask's check).
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/core/mcp.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/40-assistant-mcp.js', 'js/tools/41-edit.js']);

const DOC = { language: 'en-us', speakers: [{ id: 'a', name: 'Jo Tester' }], segments: [
  { start: 0.5, duration: 2.4, speaker: 'a', words: [{ start: 0.5, duration: 0.4, text: 'Hello', type: 'word' }, { start: 1.0, duration: 0.5, text: 'from', type: 'word' }, { start: 1.6, duration: 1.3, text: 'Premiere.', type: 'word' }] }] };

test('Story: the MCP’s answers – whether a clip has a transcript, and the transcript itself (an object, or JSON text inside the answer)', () => {
  const S = US.story;
  assert.strictEqual(S.mcpHasTranscript({ backend: 'uxp', result: { hasTranscript: true, projectItemId: 'x' } }), true);
  assert.strictEqual(S.mcpHasTranscript({ backend: 'uxp', result: { hasTranscript: false } }), false);
  assert.strictEqual(S.mcpHasTranscript(null), false);
  for (const answer of [{ backend: 'uxp', result: { transcript: DOC, revision: 'r1' } }, { backend: 'uxp', result: { json: JSON.stringify(DOC), revision: 'r1' } }]) {
    const doc = S.mcpTranscriptDoc(answer), seg = US.transcript.premiereJSON(doc);
    assert.ok(doc && seg && seg.length === 1, JSON.stringify(answer).slice(0, 80));
    assert.strictEqual(seg[0].speaker, 'Jo Tester');
    assert.ok(/Hello from Premiere/.test(seg[0].text) && Math.abs(seg[0].start - 0.5) < 0.01);
  }
  assert.strictEqual(S.mcpTranscriptDoc({ result: { segments: [] } }), null);
});

test('Story: switched off, or no MCP set up – the project file is read as before', async () => {
  const was = US.mcp.configured;
  US.mcp.configured = () => false;
  try { assert.strictEqual(await US.story.premiereTranscriptsViaMcp({ set() { return this; }, progress() { return this; }, check() {} }), null); }
  finally { US.mcp.configured = was; }
});

test('Ask › Edit checks: which steps move clips, and Ask’s cuts as the MCP’s exact operations', () => {
  const C = US.mcpCheck;
  assert.ok(C.MOVES.test('remove') && C.MOVES.test('razor') && C.MOVES.test('speed') && !C.MOVES.test('transition') && !C.MOVES.test('effect') && !C.MOVES.test('volume') && !C.MOVES.test('rename'));
  const tps = 254016000000, t = s => String(s * tps);
  const snap = { tracks: [{ id: 'video:0', type: 'video', index: 0 }, { id: 'audio:0', type: 'audio', index: 0 }],
    clips: [{ id: 'v1', track_id: 'video:0', start_ticks: t(0), end_ticks: t(4) }, { id: 'v2', track_id: 'video:0', start_ticks: t(4), end_ticks: t(7) }, { id: 'a2', track_id: 'audio:0', start_ticks: t(4), end_ticks: t(7) }] };
  assert.deepStrictEqual(C.operationsFor(snap, [{ op: 'remove', params: { ripple: true }, targets: [{ kind: 'video', track: 0, start: 4, end: 7 }, { kind: 'audio', track: 0, start: 4, end: 7 }] }]),
    [{ type: 'remove', clip_id: 'v2', ripple: true, scope: 'track' }, { type: 'remove', clip_id: 'a2', ripple: true, scope: 'track' }]);
  const cut = C.operationsFor(snap, [{ op: 'razor', targets: [{ kind: 'video', track: 0, start: 2, end: 2 }] }]);
  assert.strictEqual(cut[0].type, 'split'); assert.strictEqual(cut[0].clip_id, 'v1'); assert.strictEqual(cut[0].at_ticks, t(2));
  assert.strictEqual(C.operationsFor(snap, [{ op: 'transition', targets: [] }]), null, 'nothing to predict for a transition');
  assert.strictEqual(C.operationsFor(snap, [{ op: 'remove', params: {}, targets: [{ kind: 'video', track: 5, start: 0, end: 1 }] }]), null, 'a track it doesn’t know: no prediction');
});

test('Ask › Edit checks: without the MCP nothing is checked, and Ask runs as before', async () => {
  const was = US.mcp.configured;
  US.mcp.configured = () => false;
  try { assert.strictEqual(await US.mcpCheck.before('s1', [{ op: 'transition', targets: [] }]), null); assert.strictEqual(await US.mcpCheck.after(null), null); }
  finally { US.mcp.configured = was; }
});
