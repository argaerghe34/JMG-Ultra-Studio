// Story › telling voices apart: pitch, voice prints, voices found per interview, the interviewer joined across
// interviews by the questions, keys kept on a second run, and merging/undo on Story's lines. The “voices” are made
// here: a pulse train at a pitch through a voice's own resonances, so no audio files are needed.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/38-wiki.js', 'js/tools/40-assistant.js']);
const V = US.storyVoices, SR = 16000;

/** A made-up voice: pitch (Hz, with a slow wobble), resonances [[Hz, bandwidth]], loudness; seconds long. */
function voice({ f0, formants, gain = 0.3 }, secs, seed) {
  const n = Math.round(secs * SR), out = new Float32Array(n);
  let ph = 0, s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const src = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = f0 * (1 + 0.06 * Math.sin(2 * Math.PI * i / SR * 0.7 + seed)); ph += f / SR;
    if (ph >= 1) { ph -= 1; src[i] = 1; }
    src[i] += rnd() * 0.02;
  }
  for (const [fc, bw] of formants) { // two-pole resonators in parallel
    const r = Math.exp(-Math.PI * bw / SR), th = 2 * Math.PI * fc / SR, a1 = 2 * r * Math.cos(th), a2 = -r * r;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const y = src[i] + a1 * y1 + a2 * y2; y2 = y1; y1 = y; out[i] += y * (1 - r); }
  }
  // syllables: the level rises and falls ~4 times a second
  for (let i = 0; i < n; i++) out[i] *= gain * (0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * i / SR + seed));
  return out;
}
const ASK = { f0: 118, formants: [[550, 90], [1250, 110], [2450, 160]] };
const RUTH = { f0: 205, formants: [[700, 90], [1850, 120], [2900, 170]] };
const DAVID = { f0: 98, formants: [[480, 80], [1050, 100], [2250, 150]] };
const MIRIAM = { f0: 160, formants: [[820, 100], [1500, 120], [3100, 180]] };
/** An interview: [voice, seconds, text] turns with half a second between -> {data, lines} */
function interview(key, turns, room = x => x) {
  const parts = [], lines = [];
  let t = 0;
  turns.forEach(([v, secs, text], i) => { const d = voice(v, secs, i + key.length * 7); parts.push(d, new Float32Array(SR / 2)); lines.push({ id: `${key}${i}`, start: t, end: t + secs, speaker: '', text, who: v }); t += secs + 0.5; });
  const data = new Float32Array(parts.reduce((k, p) => k + p.length, 0));
  let o = 0; for (const p of parts) { data.set(p, o); o += p.length; }
  return { key, data: room(data), lines };
}
const turnsWith = (who, n = 6) => Array.from({ length: n }, (_, i) => [[ASK, 2 + (i % 3) * 0.5, 'And what happened then?'], [who, 4 + (i % 2), 'We moved to the city and it changed everything for us.']]).flat();
const prep = iv => {
  const st = {}; for (const l of iv.lines) st[l.id] = V.stats(iv.data, l.start, l.end);
  return { key: iv.key, prints: V.prints(st), questions: Object.fromEntries(iv.lines.filter(l => V.isQuestion(l.text)).map(l => [l.id, true])) };
};
const quieter = d => d.map(x => x * 0.3); // another room: a different level (taken off by the per-interview average)

test('pitch: a voice at 205 Hz is heard at about 205 Hz; silence has no pitch', () => {
  const d = voice(RUTH, 1, 1), s = V.stats(d, 0, 1);
  const hz = Math.exp(s.f0.slice().sort((a, b) => a - b)[Math.floor(s.f0.length / 2)]);
  assert.ok(Math.abs(hz - 205) < 20, hz);
  assert.strictEqual(V.stats(new Float32Array(SR), 0, 1), null);
  assert.strictEqual(V.stats(d, 0, 0.01), null, 'too short to hear');
});

test('voices: interviewer and interviewee told apart in each interview; the interviewer is one voice across them', () => {
  const a = interview('a', turnsWith(RUTH)), b = interview('b', turnsWith(DAVID), quieter);
  const res = V.solve([prep(a), prep(b)]);
  const of = iv => iv.lines.map(l => [l.who, res.lines[l.id] && res.lines[l.id].voice]);
  const wrong = [...of(a), ...of(b)].filter(([who, v]) => !v || (who === ASK) !== (v === res.interviewer));
  assert.deepStrictEqual(wrong.length, 0, JSON.stringify(wrong));
  assert.ok(res.interviewer, 'the one asking questions is found');
  const ask = res.voices.find(v => v.key === res.interviewer);
  assert.deepStrictEqual(ask.interviews.sort(), ['a', 'b']);
  // Ruth and David are different voices, each in their own interview
  const ruth = res.lines.a1.voice, david = res.lines.b1.voice;
  assert.notStrictEqual(ruth, david);
  assert.notStrictEqual(ruth, res.interviewer);
});

test('voices: three people in one interview are three voices; one person talking is one voice', () => {
  const turns = turnsWith(RUTH, 4).concat([[MIRIAM, 4, 'I remember it differently.'], [ASK, 2, 'Why?'], [MIRIAM, 5, 'Because I was there before her.'], [MIRIAM, 4, 'She arrived later.']]);
  const res = V.solve([prep(interview('c', turns))]);
  assert.strictEqual(res.voices.length, 3, JSON.stringify(res.voices.map(v => v.key)));
  const one = V.solve([prep(interview('d', Array.from({ length: 6 }, (_, i) => [RUTH, 4 + (i % 2), 'Just me talking.'])))]);
  assert.strictEqual(one.voices.length, 1);
});

test('voices keep their keys (and so their names) when listened to again', () => {
  const ivs = [prep(interview('a', turnsWith(RUTH))), prep(interview('b', turnsWith(DAVID)))];
  const first = V.solve(ivs), again = V.solve(ivs, { old: first.voices });
  assert.deepStrictEqual(again.voices.map(v => v.key).sort(), first.voices.map(v => v.key).sort());
  assert.strictEqual(again.lines.a1.voice, first.lines.a1.voice);
});

test('a voice of another interview that sounds like this one is offered first (“Same as…?”)', () => {
  const vs = [{ key: 'Voice 1', centre: [1, 0, 0], interviews: ['a'] }, { key: 'Voice 2', centre: [0.98, 0.2, 0], interviews: ['b'] }, { key: 'Voice 3', centre: [0, 1, 0], interviews: ['b'] }, { key: 'Voice 4', centre: [1, 0, 0], interviews: ['a'] }];
  assert.deepStrictEqual(V.soundsLike(vs, 'Voice 1').map(x => x.key), ['Voice 2', 'Voice 3'], 'never a voice from the same interview');
});

test('Story’s lines: voices given (old speakers kept), two voices merged, a line moved, and undo puts it all back', () => {
  const S = US.story;
  S._useState({ transcripts: [{ key: 'a', name: 'Ruth', lines: [{ id: 'x1', start: 0, end: 2, speaker: 'Speaker 1', text: 'Where?' }, { id: 'x2', start: 3, end: 6, speaker: '', text: 'Leeds.' }] }], speakers: {} });
  const st = S.state();
  V.apply(st, st.transcripts, { voices: [{ key: 'Voice 1' }, { key: 'Voice 2' }], lines: { x1: { voice: 'Voice 1', sure: 0.9 }, x2: { voice: 'Voice 2', sure: 0.4 } } });
  st.voiceID = { voices: [{ key: 'Voice 1', interviews: ['a'] }, { key: 'Voice 2', interviews: ['a'] }] };
  assert.deepStrictEqual(st.transcripts[0].lines.map(l => [l.speaker, l.speakerWas]), [['Voice 1', 'Speaker 1'], ['Voice 2', '']]);
  assert.ok(st.speakers['Voice 1'] && st.speakers['Voice 2']);
  assert.strictEqual(V.merge('Voice 2', 'Voice 1'), 1);
  assert.ok(!st.speakers['Voice 2'] && st.voiceID.voices.length === 1);
  V.setLine('x2', 'Voice 9');
  assert.strictEqual(S.lineOf('x2').speaker, 'Voice 9');
  assert.strictEqual(V.undo(), 2);
  assert.deepStrictEqual(st.transcripts[0].lines.map(l => l.speaker), ['Speaker 1', '']);
  assert.ok(!st.voiceID && !('speakerWas' in st.transcripts[0].lines[0]));
});

test('the Assistant: “tell the voices apart”, “who is speaking”', () => {
  const m = t => (US.assistant.matchOffline(t).steps[0] || {}).action;
  assert.strictEqual(m('tell the voices apart'), 'story.voices');
  assert.strictEqual(m('who is speaking in each line?'), 'story.voices');
  assert.strictEqual(m('identify the speakers'), 'story.voices');
});

test('the names into Premiere’s transcripts: Premiere’s own format (as its Text panel exports it), word times kept, one id per name', () => {
  const t = { key: 'a', name: 'Ruth', language: 'en-US', lines: [
    { id: 'x2', start: 3, end: 5, speaker: 'Voice 2', text: 'In Leeds. We moved.', w: [0, 50, 50, 100, 100, 150, 150, 200] },
    { id: 'x1', start: 0, end: 2, speaker: 'Voice 1', text: 'Where did you grow up?' }] };
  const names = { 'Voice 1': 'Jacob', 'Voice 2': 'Ruth' };
  const j = V.premiereTranscript(t, l => names[l.speaker]);
  assert.deepStrictEqual(Object.keys(j), ['language', 'segments', 'speakers']);
  assert.deepStrictEqual(j.speakers.map(s => s.name), ['Jacob', 'Ruth']);
  assert.ok(j.speakers.every(s => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(s.id)));
  assert.strictEqual(V.speakerId('Ruth'), j.speakers[1].id, 'the same name always gets the same id');
  const [q, a] = j.segments;
  assert.deepStrictEqual(Object.keys(q).sort(), ['duration', 'language', 'speaker', 'start', 'words']);
  assert.deepStrictEqual([q.speaker, q.start, q.duration, q.language], [j.speakers[0].id, 0, 2, 'en-us']);
  assert.deepStrictEqual(Object.keys(q.words[0]).sort(), ['confidence', 'duration', 'eos', 'start', 'tags', 'text', 'type']);
  assert.deepStrictEqual(a.words.map(w => [w.text, w.start, w.duration, w.eos]), [['In', 3, 0.5, false], ['Leeds.', 3.5, 0.5, true], ['We', 4, 0.5, false], ['moved.', 4.5, 0.5, true]], 'Premiere’s own word times');
  assert.strictEqual(q.words[q.words.length - 1].eos, true);
  const srt = V.namedSRT(t, l => names[l.speaker]);
  assert.strictEqual(srt.split('\n\n')[0], '1\n00:00:00,000 --> 00:00:02,000\nJACOB: Where did you grow up?');
});

test('the names saved for every interview; asking for it in the Assistant', () => {
  const S = US.story, fs = require('fs'), os = require('os'), path = require('path');
  S._useState({ transcripts: [{ key: 'a', name: 'Ruth / take 2', lines: [{ id: 'y1', start: 0, end: 2, speaker: 'Voice 1', text: 'Hello there.' }] }, { key: 'b', name: 'Empty', lines: [] }], speakers: { 'Voice 1': { name: 'Ruth' } } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-named-'));
  const r = V.exportNamed({ dir, resolve: false });
  assert.deepStrictEqual(r.files.map(f => path.basename(f.file)), ['Ruth  take 2 – speakers.json']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(r.files[0].file, 'utf8')).speakers.map(s => s.name), ['Ruth']);
  const rs = V.exportNamed({ dir, resolve: true });
  assert.ok(/RUTH: Hello there\./.test(fs.readFileSync(rs.files[0].file, 'utf8')));
  const m = t => (US.assistant.matchOffline(t).steps[0] || {}).action;
  assert.strictEqual(m('Yes, then can you add speaker names to the transcript in premiere'), 'story.speakerNames');
  assert.strictEqual(m('put the speakers names into Premiere’s transcripts'), 'story.speakerNames');
  assert.strictEqual(m('tell the voices apart'), 'story.voices');
  assert.strictEqual(m('identify the speakers'), 'story.voices');
});
