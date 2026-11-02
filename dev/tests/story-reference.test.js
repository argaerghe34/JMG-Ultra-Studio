// Like a reference cut: a finished video's transcript read as beats (AI: role, purpose, times – text only; without AI
// its rhythm), scaled to the length asked for, and the narrative told to follow it.
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-reference.js', 'js/tools/22-story.js']);
const R = US.storyReference, S = US.story;
const REF = [[10, 14, 'A', 'I almost lost everything that winter.'], [14.5, 30, 'A', 'We had the bakery, and then the fire came, and nobody knew what to do next.'],
  [32, 50, 'B', 'The neighbours came with flour and ovens and we baked in their kitchens for months.'], [50.5, 70, 'A', 'Today we bake twice as much bread, and half of it goes to people who need it.'],
  [72, 80, 'A', 'Come and see us on a Friday.']].map(([start, end, speaker, text]) => ({ start, end, speaker, text }));

test('the reference: times from 0; without AI its rhythm – parts at pauses and changes of voice, first and last named', () => {
  const ls = R.normalise(REF);
  assert.deepStrictEqual([ls[0].start, ls[ls.length - 1].end], [0, 70]);
  const b = R.basic(ls);
  assert.strictEqual(b.seconds, 70);
  assert.strictEqual(b.beats[0].role, 'Opening'); assert.strictEqual(b.beats[b.beats.length - 1].role, 'Ending');
  assert.ok(b.beats.length >= 3 && b.beats.every((x, i) => i === 0 || x.from >= b.beats[i - 1].to - 1e-9), JSON.stringify(b.beats));
});

test('the AI’s beats tidied (in order, inside the video, no tiny ones) and scaled into the narrative’s instructions', () => {
  const ls = R.normalise(REF);
  const req = R.request(ls, { name: 'Bakery promo' });
  assert.ok(/REFERENCE “Bakery promo” \(70 s\)/.test(req.user[0]) && /0\.0–4\.0\tA\tI almost lost everything/.test(req.user[0]));
  const r = R.organise({ summary: 'Loss, help, renewal, invitation.', beats: [{ role: 'Ending', purpose: 'Invites the viewer', from: 62, to: 70 }, { role: 'Hook', purpose: 'A personal loss in one line', from: 0, to: 4 }, { role: 'Blip', purpose: '', from: 4, to: 5 }, { role: 'Turn', purpose: 'Help arrives', from: 5, to: 62 }] }, ls);
  assert.deepStrictEqual(r.beats.map(b => [b.role, b.from, b.to]), [['Hook', 0, 4], ['Turn', 5, 62], ['Ending', 62, 70]]);
  const n = R.note(Object.assign({ name: 'Bakery promo' }, r), 35);
  assert.ok(/“Bakery promo”/.test(n) && /1\. Hook – about 2 s: A personal loss/.test(n) && /2\. Turn – about 29 s/.test(n), n);
});

test('a reference from a transcript file is followed by the next narrative: its length when none is given, its beats in the brief', async () => {
  S._useState({ transcripts: [{ key: 't', name: 'Ruth', path: '/m/r.mov', lines: [{ id: 'a1', start: 0, end: 6, speaker: 'Ruth', text: 'The fire took everything we had built.' }, { id: 'a2', start: 6, end: 14, speaker: 'Ruth', text: 'But our neighbours brought flour and opened their kitchens to us.' }, { id: 'a3', start: 14, end: 20, speaker: 'Ruth', text: 'Come and bake with us on Friday.' }] }] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-')), f = path.join(dir, 'Bakery promo.srt');
  fs.writeFileSync(f, REF.map((l, i) => `${i + 1}\n00:00:${String(Math.floor(l.start)).padStart(2, '0')},000 --> 00:00:${String(Math.floor(l.end)).padStart(2, '0')},000\n${l.text}\n`).join('\n'));
  const was = US.ai, sent = [];
  US.ai = { available: () => true, label: () => 'Claude', approveTotal: async () => true,
    json: async req => { sent.push(req); return req.feature === 'Reference cut' ? { summary: 'Loss to renewal.', beats: [{ role: 'Hook', purpose: 'A loss', from: 0, to: 10 }, { role: 'Ending', purpose: 'An invitation', from: 10, to: 70 }] } : { title: 'T', logline: '', beats: [{ lineId: 'a1', purpose: 'Hook', dropStartWords: 0, dropEndWords: 0 }, { lineId: 'a3', purpose: 'End', dropStartWords: 0, dropEndWords: 0 }], alternates: [], lines: [] }; } };
  try {
    const job = { set() { return job; }, progress() {}, check() {}, log() {}, range() { return job; } };
    const r = await S.readReference(job, { file: f });
    assert.ok(/“Bakery promo”: 2 beats over 1:10 – Hook → Ending/.test(r.summary), r.summary);
    assert.ok(!sent[0].user[0].includes('00:00'), 'the transcript’s text with times, nothing else');
    sent.length = 0;
    await S.makeNarrative(job, { brief: 'a video about the fire', useAI: true }).catch(() => {});
    const story = sent.find(x => /Length:/.test(JSON.stringify(x.user)));
    const text = JSON.stringify(story.user);
    assert.ok(/Length: 70 seconds/.test(text), 'the reference’s length');
    assert.ok(/same structure as a reference video/.test(text) && /1\. Hook – about 10 s: A loss/.test(text), 'its beats in the brief');
    S.state().reference.on = false; sent.length = 0;
    await S.makeNarrative(job, { brief: 'a 30 second video about the fire', useAI: true }).catch(() => {});
    assert.ok(!/reference video/.test(JSON.stringify(sent.map(x => x.user))), 'switched off: not followed');
  } finally { US.ai = was; }
});
