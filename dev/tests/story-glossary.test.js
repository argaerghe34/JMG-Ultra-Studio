// Story › Names and terms (corrections from the original text, word timings kept, never doubled, undone when removed;
// names kept out of AI as placeholders and put back), and the soundbite rules every build follows.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'ai', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js']);
const G = US.storyGlossary, S = US.story;

test('corrections: whole words, any case, punctuation kept, multi-word names, timings re-shared, applying twice changes nothing, removing puts it back', () => {
  const l = { id: 'a', start: 0, end: 4, speaker: 'Ruth', text: 'I met Jakob Gersh, and jakob said hi. Jakobson came too.', w: [0, 30, 30, 60, 60, 100, 100, 150, 150, 180, 180, 220, 220, 260, 260, 300, 300, 350, 350, 380, 380, 400] };
  const lines = [l], g = [{ right: 'Jacob Gersch', heard: 'Jakob Gersh' }, { right: 'Jacob', heard: ['jakob'] }];
  assert.strictEqual(G.apply(lines, g), 1);
  assert.strictEqual(l.text, 'I met Jacob Gersch, and Jacob said hi. Jakobson came too.', 'the longer name first; “Jakobson” untouched');
  assert.strictEqual(l.w.length, 2 * l.text.split(' ').length, 'word timings still line up');
  assert.deepStrictEqual(l.w.slice(4, 8), [60, 100, 100, 150], 'two heard words became two right ones on the same times');
  assert.strictEqual(G.apply(lines, g), 0, 'applying again changes nothing (from the original text)');
  assert.ok(l.orig.includes('Jakob Gersh'));
  // a longer right spelling shares the heard word's time
  const m = { id: 'b', start: 0, end: 1, text: 'Ask Gersh', w: [0, 40, 40, 100] };
  G.apply([m], [{ right: 'Mr Gersch', heard: 'Gersh' }]);
  assert.deepStrictEqual([m.text, m.w], ['Ask Mr Gersch', [0, 40, 40, 70, 70, 100]]);
  // removing the entries puts the original back
  assert.strictEqual(G.apply(lines, []), 1);
  assert.strictEqual(l.text, 'I met Jakob Gersh, and jakob said hi. Jakobson came too.'); assert.ok(!('orig' in l));
});

test('names kept out of AI: placeholders in what is sent (and logged), the real names back in the answer', async () => {
  const R = G.redactor([{ right: 'Jacob Gersch', heard: 'Jakob', hide: true }, { right: 'Odessa', heard: '', hide: false }]);
  assert.strictEqual(R.redact('Jacob Gersch met jakob in Odessa.'), '[Name 1] met [Name 1] in Odessa.');
  assert.strictEqual(R.restore('{"who":"[Name 1]"}'), '{"who":"Jacob Gersch"}');
  assert.strictEqual(G.redactor([{ right: 'Odessa' }]), null, 'nothing hidden: no change');
  // through the AI layer
  const https = require('https'), was = https.request; let sent = '';
  https.request = (opts, cb) => { const { EventEmitter } = require('events'); const req = new EventEmitter(); req.write = b => { sent += b; }; req.setTimeout = () => {}; req.destroy = () => {};
    req.end = () => { const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; cb(res); res.emit('data', Buffer.from(JSON.stringify({ model: 'claude-opus-5-5', content: [{ type: 'text', text: '{"answer":"[Name 1] talks about Odessa"}' }], usage: { input_tokens: 9, output_tokens: 9 }, stop_reason: 'end_turn' }))); res.emit('end'); }; return req; };
  US.secrets.set('anthropicKey', 'sk-test'); US.settings.set('aiProvider', 'claude'); US.settings.set('aiConfirmAbove', 0);
  US.ai.setRedactions(() => R);
  try {
    const r = await US.ai.json({ system: 'x', user: [{ text: 'Jacob Gersch said: I grew up in Odessa.', cache: '1h' }, 'Who?'], feature: 'Ask', schema: { type: 'object' } });
    assert.ok(!/Jacob|Gersch/.test(sent) && /\[Name 1\] said/.test(sent) && /"cache_control"/.test(sent), 'the name never left; the cache mark kept');
    assert.strictEqual(r.answer, 'Jacob Gersch talks about Odessa');
    assert.ok(!/Jacob/.test(US.ai.sent.text(US.ai.sent.list()[0])), 'the log shows what was really sent');
  } finally { https.request = was; US.ai.setRedactions(null); US.secrets.set('anthropicKey', ''); }
});

test('suggestions: names spelt more than one way', () => {
  const lines = [{ text: 'We asked Gersch about it.' }, { text: 'Then Gersch and Gersh left.' }, { text: 'And Gersch again, with Monday.' }, { text: 'Talk to Ruth.' }];
  assert.deepStrictEqual(G.suggest(lines).map(x => [x.right, x.heard]), [['Gersch', ['Gersh']]]);
});

test('soundbites: interviewer out, sentences finished (same speaker only), short bites lengthened, trims kept, nothing used twice', () => {
  const mk = (id, start, end, speaker, text) => ({ id, start, end, speaker, text });
  const t = { key: 't', name: 'Ruth', path: '/m/r.mov', lines: [
    mk('q1', 0, 2, 'Interviewer', 'What do you remember?'), mk('r1', 2.2, 4, 'Ruth', 'My grandmother baked'), mk('r2', 4.1, 6, 'Ruth', 'every single Friday.'),
    mk('r3', 6.5, 7, 'Ruth', 'Yes.'), mk('r4', 7.1, 9, 'Ruth', 'It smelled wonderful.'), mk('s1', 9.5, 12, 'Sam', 'and I loved it'), mk('r5', 12.5, 14, 'Ruth', 'We moved in 1962.')] };
  S._useState({ transcripts: [t] });
  const g = [{ name: 'G', label: 1, lineIds: ['q1', 'r1', 'r2', 'r3', 's1', 'r5'], pinned: new Set(), trims: { r5: { start: 12.8, end: 13.6 } } }];
  const r = S.applyBites(g, { sentences: true, noInterviewer: true, minSeconds: 1.5, tight: false, why: true });
  assert.deepStrictEqual(r.groups[0].lineIds, ['r1', 'r3', 's1', 'r5'], 'q1 left out; r2 is part of r1’s bite; r4 part of r3’s');
  assert.deepStrictEqual(r.groups[0].trims.r1, { start: 2.2, end: 6 }, 'runs on to the end of the sentence');
  assert.deepStrictEqual(r.groups[0].trims.r3, { start: 6.5, end: 9 }, 'too short: takes in the next line');
  assert.ok(!r.groups[0].trims.s1, 'Sam’s line is never joined to Ruth’s');
  assert.deepStrictEqual(r.groups[0].trims.r5, { start: 12.8, end: 13.6 }, 'a deliberate trim is kept');
  assert.strictEqual(r.dropped, 1); assert.strictEqual(r.joined, 2);
  const off = S.applyBites(g, { sentences: false, noInterviewer: false, minSeconds: 0, tight: false });
  assert.deepStrictEqual(off.groups[0].lineIds, g[0].lineIds, 'all off: as before');
  const plan = S.planBuild(r.groups, { handles: 0, itemFor: () => 'item' });
  assert.deepStrictEqual(plan.clips.map(c => [c.lineId, c.in, c.out]), [['r1', 2.2, 6], ['r3', 6.5, 9], ['s1', 9.5, 12], ['r5', 12.8, 13.6]]);
});

test('the glossary applies when transcripts load and is kept with the project', () => {
  const st = S._useState({ transcripts: [{ key: 't', name: 'T', lines: [{ id: 'x', start: 0, end: 1, speaker: 'A', text: 'Hello Jakob.' }] }], glossary: [{ right: 'Jacob', heard: ['Jakob'], hide: false }] });
  S.reindex();
  assert.strictEqual(st.transcripts[0].lines[0].text, 'Hello Jacob.');
  assert.deepStrictEqual(S.glossary().map(e => e.right), ['Jacob']);
});
