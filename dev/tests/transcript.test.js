const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { load, test, MEDIA } = require('./harness');
const US = load(['time', 'transcript']);
const T = US.transcript;
const TR = path.join(MEDIA, 'transcripts');

/* ---------- a tiny FlatBuffer writer that mirrors Premiere's transcript layout ---------- */
function buildBlob({ wrap = true, speakers = [{ name: 'Unknown', g: 1 }], segments }) {
  const b = Buffer.alloc(1 << 18); let n = 0;
  const align = a => { while (n % a) n++; };
  const patches = [];
  function str(s) { align(4); const p = n; const by = Buffer.from(s, 'utf8'); b.writeUInt32LE(by.length, p); by.copy(b, p + 4); b[p + 4 + by.length] = 0; n = p + 5 + by.length; return p; }
  // fields: [[index, kind, value]] kinds: i64 f32 str table vec
  function table(fields) {
    const max = Math.max(...fields.map(f => f[0])) + 1;
    align(4);
    const vt = n, vsz = 4 + 2 * max; n += vsz; align(8);
    const tp = n; let off = 8; const layout = [];
    for (const f of fields) { const w = f[1] === 'i64' ? 8 : 4; while (off % w) off++; layout.push([f, off]); off += w; }
    const tsz = off;
    b.writeUInt16LE(vsz, vt); b.writeUInt16LE(tsz, vt + 2);
    for (let i = 0; i < max; i++) b.writeUInt16LE(0, vt + 4 + 2 * i);
    b.writeInt32LE(tp - vt, tp);
    n = tp + tsz;
    const refs = [];
    for (const [f, o] of layout) {
      b.writeUInt16LE(o, vt + 4 + 2 * f[0]);
      const p = tp + o;
      if (f[1] === 'i64') b.writeBigInt64LE(BigInt(Math.round(f[2])), p);
      else if (f[1] === 'f32') b.writeFloatLE(f[2], p);
      else refs.push([p, f]);
    }
    for (const [p, f] of refs) {
      const target = f[1] === 'str' ? str(f[2]) : f[1] === 'table' ? table(f[2]) : vec(f[2]);
      b.writeUInt32LE(target - p, p);
    }
    return tp;
  }
  function vec(items) {
    align(4); const p = n; b.writeUInt32LE(items.length, p); n = p + 4 + 4 * items.length;
    items.forEach((it, i) => { const e = p + 4 + 4 * i; const t = table(it); b.writeUInt32LE(t - e, e); });
    return p;
  }
  const guid = g => [[0, 'i64', g], [1, 'i64', g * 7]];
  const TK = 254016000000;
  const doc = [
    [0, 'vec', segments.map(s => [[0, 'i64', s.start * TK], [1, 'i64', (s.end - s.start) * TK], [2, 'table', guid(s.g || 1)], [3, 'vec', s.words.map(w => [[0, 'i64', w[0] * TK], [1, 'i64', w[1] * TK], [2, 'str', w[2]], [3, 'f32', 1]])], [4, 'str', 'en-us']])],
    [1, 'str', 'en-us'],
    [5, 'vec', speakers.map(s => [[0, 'str', s.name], [1, 'table', guid(s.g)]])]
  ];
  n = 4;
  const root = wrap ? table([[0, 'table', doc]]) : table(doc);
  b.writeUInt32LE(root, 0);
  return b.subarray(0, n);
}
const W = (t, d, w) => [t, d, w];
const SAMPLE_SEGS = [
  { start: 1, end: 6, g: 1, words: [W(1, .3, 'I'), W(1.3, .4, 'remember'), W(1.7, .3, 'my'), W(2.0, .5, 'grandmother'), W(2.5, .5, 'lighting'), W(3.0, .4, 'candles.'), W(3.6, .3, 'Every'), W(3.9, .4, 'Friday'), W(4.3, .4, 'night.')] },
  { start: 8, end: 12, g: 2, words: [W(8, .3, 'We'), W(8.3, .5, 'volunteered'), W(8.8, .3, 'at'), W(9.1, .3, 'the'), W(9.4, .4, 'food'), W(9.8, .4, 'bank'), W(10.2, .3, 'together.')] }
];

/* ---------- parsers ---------- */
test('SRT: 15 timed lines from the I001 sample', () => {
  const r = T.parseFile(path.join(TR, 'I001_interview.srt'));
  assert.strictEqual(r.format, 'srt');
  assert.strictEqual(r.segments.length, 15);
  assert.ok(Math.abs(r.segments[0].start - 0.6) < 1e-6 && Math.abs(r.segments[14].end - 89.4) < 1e-6);
});
test('VTT with voice tags and cue settings', () => {
  const vtt = 'WEBVTT\n\nNOTE made by hand\n\n00:01.000 --> 00:04.500 align:start\n<v Ruth>Hello there, welcome.</v>\n\nintro\n00:00:05.000 --> 00:00:08.000\n<i>Second</i> line &amp; more.\n';
  const s = T.parseText(vtt, 'a.vtt').segments;
  assert.strictEqual(s.length, 2);
  assert.strictEqual(s[0].speaker, 'Ruth');
  assert.strictEqual(s[0].text, 'Hello there, welcome.');
  assert.strictEqual(s[1].text, 'Second line & more.');
  assert.strictEqual(s[1].start, 5);
});
test('CSV with header, quotes and seconds', () => {
  const r = T.parseFile(path.join(TR, 'Interview_Miriam_Levy.csv'));
  assert.strictEqual(r.format, 'csv');
  assert.strictEqual(r.segments.length, 11);
  assert.strictEqual(r.segments[0].speaker, 'Miriam Levy');
  assert.ok(/suitcase/.test(r.segments[0].text));
});
test('TSV without a header, timecodes with frames', () => {
  const s = T.parseText('00:00:01:00\t00:00:03:12\tAnna\tFirst thing I said.\n00:00:04:00\t00:00:06:00\tAnna\tSecond thing.\n', 'x.tsv', 25).segments;
  assert.strictEqual(s.length, 2);
  assert.ok(Math.abs(s[0].end - 3.48) < 1e-6);
  assert.strictEqual(s[1].speaker, 'Anna');
});
test('Premiere-style text export (range line, speaker line, text)', () => {
  const r = T.parseFile(path.join(TR, 'Interview_David_Cohen.txt'));
  assert.strictEqual(r.format, 'text');
  assert.strictEqual(r.segments.length, 16);
  assert.strictEqual(r.segments[0].speaker, 'Interviewer');
  assert.strictEqual(r.segments[1].speaker, 'David Cohen');
  assert.ok(r.segments[1].start > 7 && r.segments[1].start < 7.5);
});
test('Inline stamps: "[00:01:02] Name: text" and Otter "Speaker 1  00:03"', () => {
  const a = T.parseText('[00:00:01] Ruth: Hello.\n[00:00:04] David: Hi Ruth, how are you?\n[00:00:09] Ruth: Fine thanks.', 'a.txt').segments;
  assert.deepStrictEqual(a.map(x => x.speaker), ['Ruth', 'David', 'Ruth']);
  assert.ok(a[0].end <= 4 && a[0].end > 1);
  const b = T.parseText('Speaker 1  00:03\nWe moved here in the spring.\n\nSpeaker 2  00:09\nAnd the school was just round the corner.', 'otter.txt').segments;
  assert.deepStrictEqual(b.map(x => x.speaker), ['Speaker 1', 'Speaker 2']);
  assert.strictEqual(b[1].start, 9);
  assert.ok(/school/.test(b[1].text));
});
test('JSON: segments with words in ticks, and word-only milliseconds', () => {
  const TK = 254016000000;
  const j = { language: 'en-us', speakers: [{ id: 's1', name: 'Ruth' }], segments: [{ startTicks: 1 * TK, durationTicks: 3 * TK, speaker: 's1', text: 'Shabbat was the centre of the week.', words: [] }, { startTicks: 5 * TK, durationTicks: 2 * TK, speaker: 's1', text: 'Everyone came.' }] };
  const s = T.parseText(JSON.stringify(j), 'a.json').segments;
  assert.strictEqual(s.length, 2); assert.strictEqual(s[0].speaker, 'Ruth'); assert.ok(Math.abs(s[1].end - 7) < 1e-6);
  const w = { results: { items: [{ start_ms: 1000, end_ms: 1300, word: 'Hello' }, { start_ms: 1300, end_ms: 1800, word: 'world.' }, { start_ms: 5000, end_ms: 5400, word: 'Next' }, { start_ms: 5400, end_ms: 5900, word: 'one.' }] } };
  const s2 = T.parseText(JSON.stringify(w), 'w.json').segments;
  assert.strictEqual(s2.length, 2); assert.strictEqual(s2[0].text, 'Hello world.'); assert.ok(Math.abs(s2[1].start - 5) < 1e-6);
});
test('Premiere transcript blob (FlatBuffer), wrapped and unwrapped', () => {
  for (const wrap of [true, false]) {
    const buf = buildBlob({ wrap, speakers: [{ name: 'Unknown', g: 1 }, { name: 'Unknown', g: 2 }], segments: SAMPLE_SEGS });
    const d = T.decodePremiereTranscript(buf);
    assert.strictEqual(d.language, 'en-us');
    assert.strictEqual(d.words.length, 16);
    assert.strictEqual(d.words[1].w, 'remember');
    assert.ok(Math.abs(d.words[1].t - 1.3) < 1e-6);
    const s = T.wordsToSentences(d.words);
    assert.deepStrictEqual(s.map(x => x.text), ['I remember my grandmother lighting candles.', 'Every Friday night.', 'We volunteered at the food bank together.']);
    assert.notStrictEqual(s[0].speaker, s[2].speaker, 'two unknown speakers stay apart');
  }
  const named = T.decodePremiereTranscript(buildBlob({ speakers: [{ name: 'Ruth', g: 1 }, { name: 'Anna', g: 2 }], segments: SAMPLE_SEGS }));
  assert.strictEqual(named.words[0].speaker, 'Ruth'); assert.strictEqual(named.words[10].speaker, 'Anna');
});
test('Read transcripts from a saved .prproj (streamed gzip XML)', async () => {
  const blob = buildBlob({ segments: SAMPLE_SEGS }).toString('base64');
  const xml = ['<?xml version="1.0" encoding="UTF-8" ?>', '<PremiereData Version="3">',
    '\t<MasterClip ObjectUID="m1" ClassID="x" Version="12">', '\t\t<Clips Version="1">', '\t\t\t<Clip Index="0" ObjectRef="10"/>', '\t\t\t<Clip Index="1" ObjectRef="11"/>', '\t\t</Clips>', '\t\t<Name>Ruth &amp; Anna.mov</Name>', '\t</MasterClip>',
    '\t<VideoClip ObjectID="10" ClassID="x" Version="11">', '\t\t<Clip Version="18">', '\t\t\t<Source ObjectRef="20"/>', '\t\t</Clip>', '\t</VideoClip>',
    '\t<TranscriptClip ObjectID="11" ClassID="x" Version="2">', '\t\t<TranscriptTextSegments ObjectRef="30"/>', '\t</TranscriptClip>',
    '\t<VideoMediaSource ObjectID="20" ClassID="x" Version="2">', '\t\t<MediaSource Version="4">', '\t\t\t<Media ObjectURef="media-1"/>', '\t\t</MediaSource>', '\t</VideoMediaSource>',
    '\t<Media ObjectUID="media-1" ClassID="x" Version="30">', '\t\t<FilePath>{"fileProperties":{"mFilePath":"/Volumes/Shoot/Ruth &amp; Anna.mov"}}</FilePath>', '\t\t<Title>Ruth &amp; Anna.mov</Title>', '\t</Media>',
    '\t<ExternallyProvidedTranscriptDocument ObjectID="30" ClassID="x" Version="1">', '\t\t<TranscriptData Encoding="base64" BinaryHash="h">' + blob, '\t\t</TranscriptData>', '\t</ExternallyProvidedTranscriptDocument>',
    '</PremiereData>', ''].join('\n');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prproj-')), 'Test.prproj');
  fs.writeFileSync(f, zlib.gzipSync(Buffer.from(xml)));
  let last = 0;
  const r = await T.readProjectTranscripts(f, { onProgress: p => { last = p; } });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].name, 'Ruth & Anna.mov');
  assert.strictEqual(r[0].path, '/Volumes/Shoot/Ruth & Anna.mov');
  assert.strictEqual(r[0].segments.length, 3);
  assert.strictEqual(last, 1);
});

/* ---------- lines, quality, search, themes ---------- */
function allLines() {
  const out = [];
  for (const f of ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv']) {
    const lines = T.toLines(T.parseFile(path.join(TR, f)).segments, US.stem(f).slice(0, 8));
    lines.forEach(l => { l.clip = f; out.push(l); });
  }
  return out;
}
test('toLines: sentences, stable unique ids', () => {
  const lines = allLines();
  assert.ok(lines.length >= 35 && lines.length <= 45, 'got ' + lines.length);
  assert.strictEqual(new Set(lines.map(l => l.id)).size, lines.length);
  const again = allLines();
  assert.deepStrictEqual(again.map(l => l.id), lines.map(l => l.id));
  // the two-part SRT sentence "And that changed my life, honestly." stays its own line or joins its neighbour, never splits words
  assert.ok(lines.every(l => l.end > l.start && l.text.length > 3));
});
test('quality: clean heartfelt line beats an um-filled fragment', () => {
  const good = T.quality({ start: 0, end: 9, text: 'I was so proud and so grateful when my mother came to the graduation.' });
  const bad = T.quality({ start: 0, end: 4, text: 'um, you know, um, I suppose, um' });
  assert.ok(good.score > bad.score + 0.3, `${good.score} vs ${bad.score}`);
  assert.ok(bad.reasons.includes('lots of “um”s'));
});
test('search: "lines about volunteering" puts volunteering lines first', () => {
  const lines = allLines();
  const r = T.search('lines about volunteering', lines);
  assert.ok(r.length >= 3);
  assert.ok(/volunteer/i.test(r[0].line.text), r[0].line.text);
  assert.deepStrictEqual(T.parseQuery('find lines where they talk about volunteering').words, ['volunteering']);
});
test('search: near-miss spelling, related words and phrases', () => {
  const lines = allLines();
  const fuzzy = T.search('volenteering', lines);
  assert.ok(fuzzy.length && /volunteer/i.test(fuzzy[0].line.text));
  const related = T.search('charity', lines); // "volunteering", "community" are related
  assert.ok(related.some(x => x.hits.some(h => h.how === 'related')));
  const phrase = T.search('"open door"', lines);
  assert.ok(phrase.length >= 1 && phrase.every(x => /open door/i.test(x.line.text)));
  assert.strictEqual(T.search('the and of', lines).length, 0);
});
test('themes offline: known topics, every line in at most one theme', () => {
  const lines = allLines();
  const th = T.themesOffline(lines, { max: 8 });
  const names = th.map(t => t.name);
  assert.ok(names.includes('Family'), names.join(', '));
  assert.ok(names.includes('Faith & tradition'), names.join(', '));
  assert.ok(names.includes('Community & giving'), names.join(', '));
  const all = th.flatMap(t => t.lineIds);
  assert.strictEqual(new Set(all).size, all.length);
  assert.strictEqual(all.length, lines.length);
});
test('themes with AI: only known ids, no duplicates, text-only request', async () => {
  const lines = allLines();
  let sent = null;
  const saved = US.ai;
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { sent = req; return { themes: [{ name: 'Open door', summary: 's', lineIds: [lines[3].id, lines[11].id, 'bogus', lines[3].id] }, { name: 'Giving time', summary: 's', lineIds: [lines[8].id, lines[3].id] }, { name: 'Empty', summary: '', lineIds: ['nope'] }] }; } };
  try {
    const th = await T.themesAI(lines, { max: 6 });
    assert.deepStrictEqual(th.map(t => t.name), ['Open door', 'Giving time']);
    assert.deepStrictEqual(th[0].lineIds, [lines[3].id, lines[11].id]);
    assert.deepStrictEqual(th[1].lineIds, [lines[8].id]);
    assert.ok(sent.schema.additionalProperties === false && sent.schema.properties.themes.items.additionalProperties === false);
    assert.ok(!/\.mp4|\.srt/.test(sent.user), 'no file names or media sent');
  } finally { US.ai = saved; }
});
test('matchClip: transcript names find their clips', () => {
  const clips = [{ name: 'I001_interview.mp4', path: '/x/I001_interview.mp4' }, { name: 'Interview_David_Cohen.MOV', path: '/x/Interview_David_Cohen.MOV' }, { name: 'B-roll 01.mp4', path: '/x/B-roll 01.mp4' }];
  assert.strictEqual(T.matchClip('I001_interview.srt', clips).name, 'I001_interview.mp4');
  assert.strictEqual(T.matchClip('Interview_David_Cohen transcript.txt', clips).name, 'Interview_David_Cohen.MOV');
  assert.strictEqual(T.matchClip('Interview_Miriam_Levy.csv', clips), null);
});
test('speaker labels: real names yes, sentences with a colon no', () => {
  const s = T.parseSRT('1\n00:00:01,000 --> 00:00:03,000\nI hope they carry it on: the candles.\n\n2\n00:00:04,000 --> 00:00:06,000\nDavid Cohen: Just turn up.\n\n3\n00:00:07,000 --> 00:00:09,000\nEvery Friday night the table was full: neighbours.\n');
  assert.deepStrictEqual(s.map(x => x.speaker), ['', 'David Cohen', '']);
  assert.strictEqual(s[0].text, 'I hope they carry it on: the candles.');
});
test('interviewer questions rank below answers', () => {
  const q = T.quality({ start: 0, end: 6, speaker: 'Interviewer', text: 'What keeps you volunteering after all this time?' });
  const a = T.quality({ start: 0, end: 6, speaker: 'David', text: 'After I retired I started volunteering at the food bank.' });
  assert.ok(a.score > q.score + 0.2, `${a.score} vs ${q.score}`);
});
test('word timings: Premiere words survive into sentences, compactly (centiseconds from the sentence start)', () => {
  const d = T.decodePremiereTranscript(buildBlob({ segments: SAMPLE_SEGS }));
  const s = T.wordsToSentences(d.words);
  assert.deepStrictEqual(s[0].w, [0, 30, 30, 70, 70, 100, 100, 150, 150, 200, 200, 240]);
  assert.deepStrictEqual(s[1].w, [0, 30, 30, 70, 70, 110]);
  assert.strictEqual(s[0].w.length, 2 * T.lineWords(s[0].text).length);
});
test('word timings: punctuation-only words join the word before; a space inside a word stays inside it', () => {
  const s = T.wordsToSentences([W(1, .3, 'Hello'), W(1.3, .1, ','), W(1.5, .4, 'New York'), W(1.9, .1, '.')].map(x => ({ t: x[0], d: x[1], w: x[2], speaker: '' })));
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].text, 'Hello, New York.');
  assert.deepStrictEqual(T.lineWords(s[0].text), ['Hello,', 'New York.']);
  assert.deepStrictEqual(s[0].w, [0, 40, 50, 100]);
});
test('word timings: lines made of several pieces carry them shifted; mismatched timings are dropped', () => {
  const lines = T.toLines([{ start: 0, end: 1, speaker: 'A', text: 'Hello there', w: [0, 40, 50, 100] }, { start: 1.2, end: 2, speaker: 'A', text: 'friend.', w: [0, 80] }, { start: 5, end: 9, speaker: 'A', text: 'Second line here now.', w: [0, 10] }], 'x');
  assert.strictEqual(lines[0].text, 'Hello there friend.');
  assert.deepStrictEqual(lines[0].w, [0, 40, 50, 100, 120, 200]);
  assert.ok(!('w' in lines[1]), 'timings that do not match the words are not kept');
  const wt = T.wordTimes(lines[0]);
  assert.ok(wt.exact); assert.deepStrictEqual(wt.words.map(w => [w.text, w.s, w.e]), [['Hello', 0, 0.4], ['there', 0.5, 1], ['friend.', 1.2, 2]]);
  const est = T.wordTimes({ start: 10, end: 14, text: 'one two three four' });
  assert.ok(!est.exact); assert.deepStrictEqual(est.words.map(w => w.s), [10, 11, 12, 13]);
});
test('word timings come back from a saved .prproj and stay in Story lines', async () => {
  const blob = buildBlob({ segments: SAMPLE_SEGS }).toString('base64');
  const xml = ['<PremiereData Version="3">', '\t<MasterClip ObjectUID="m1" ClassID="x" Version="12">', '\t\t<Clips Version="1">', '\t\t\t<Clip Index="0" ObjectRef="11"/>', '\t\t</Clips>', '\t\t<Name>Ruth.mov</Name>', '\t</MasterClip>',
    '\t<TranscriptClip ObjectID="11" ClassID="x" Version="2">', '\t\t<TranscriptTextSegments ObjectRef="30"/>', '\t</TranscriptClip>',
    '\t<ExternallyProvidedTranscriptDocument ObjectID="30" ClassID="x" Version="1">', '\t\t<TranscriptData Encoding="base64" BinaryHash="h">' + blob, '\t\t</TranscriptData>', '\t</ExternallyProvidedTranscriptDocument>', '</PremiereData>', ''].join('\n');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prproj-')), 'W.prproj');
  fs.writeFileSync(f, zlib.gzipSync(Buffer.from(xml)));
  const r = await T.readProjectTranscripts(f);
  assert.deepStrictEqual(r[0].segments[0].w, [0, 30, 30, 70, 70, 100, 100, 150, 150, 200, 200, 240]);
  const lines = T.toLines(r[0].segments, 'p');
  assert.ok(lines.every(l => Array.isArray(l.w) && l.w.length === 2 * T.lineWords(l.text).length));
});

test('interviewer questions without speaker names: put to “you”, whole / starts / ends; tag questions and musing don’t count', () => {
  const k = T.askedQuestion;
  for (const q of ['Having seen these experiences, what would you say gives you hope for the future of the Jewish people?', 'Do you think you would leave the program feeling worried?',
    'That’s very nice. What do you hope they take away from that experience with your family?', 'Great. And how long have you been involved?', 'Is there anything else you feel we missed?', 'Tell me about your internship?'])
    assert.strictEqual(k(q), 'whole', q);
  assert.strictEqual(k('Where are you studying? Studying currently at Queen Mary University.'), 'starts');
  assert.strictEqual(k('I think it’s a really good thing for them. What would you say about the attitude of the students?'), 'ends');
  for (const q of ['First of all, when you’re not with them, you’re kind of wondering, how’s the next generation doing?', 'How can I start that again? I think I’ll take that with me.',
    'There’s pretty irrelevant, you know? But he cares so much about me.', 'Oh, that could be me, right? I grew up in a similar community.', 'And what did I learn there? That family comes first, always.', 'We all get along incredibly well.'])
    assert.strictEqual(k(q), null, q);
  const line = (text, speaker = '') => ({ start: 0, end: 8, speaker, text });
  assert.ok(T.quality(line('What would you say makes the program special for the students?')).reasons.includes('interviewer'), 'treated as the interviewer');
  assert.ok(T.quality(line('Where are you studying? Studying currently at Queen Mary University in London.')).reasons.includes('starts with a question'));
  const plain = T.quality(line('Studying currently at Queen Mary University in London, and I love it.')).score;
  assert.ok(T.quality(line('Where are you studying? Studying currently at Queen Mary University in London, and I love it.')).score < plain, 'ranked lower than the answer alone');
});

test('theme keywords skip contractions and filler words (curly or straight apostrophes); a spoken restart weakens a line', () => {
  const said = ['It’s about family, really, it’s about my family and my grandmother.', "It's about family dinners every Friday, because my grandmother cooked.", 'Family is everything to me, it’s about being together.',
    "My grandmother taught me that family comes first, it's about love.", 'We talk about family all the time, my grandmother especially.', 'Family dinners with my grandmother were the best part.'];
  const lines = said.map((text, i) => ({ id: 'f' + i, start: i * 10, end: i * 10 + 8, speaker: '', text }));
  const themes = T.themesOffline(lines, { minSize: 2 });
  const words = themes.flatMap(t => t.keywords);
  assert.ok(words.length && !words.some(w => /'|’/.test(w) || w === 'about' || w === 'because'), JSON.stringify(themes.map(t => [t.name, t.keywords])));
  const q = T.quality({ start: 0, end: 12, speaker: '', text: 'How can I start that again? I think I will always remember how strong I feel in Israel.' });
  assert.ok(q.reasons.includes('starts again') && q.score < 0.7, JSON.stringify(q));
});

test('review fixes: rhetorical questions, “start that again”, “do you know”, role labels, contractions, no text', () => {
  const line = (text, speaker = '') => ({ start: 0, end: 10, speaker, text });
  for (const t of ['Can you imagine what it was like for a nine-year-old girl, alone, on a train to Poland?', 'I was nine. Can you imagine?', 'Would you believe it?'])
    assert.strictEqual(T.askedQuestion(t), null, t);
  assert.strictEqual(T.askedQuestion('What would you say about your childhood?'), 'whole', 'a real question still counts');
  for (const t of ['I’ll start that again.', 'Let’s start that over.', 'I need to start this over.']) assert.ok(T.quality(line(t)).reasons.includes('starts again'), t);
  assert.ok(!T.quality(line('Do you know how hard that was for my mother? She never stopped.')).reasons.includes('lots of “um”s'));
  assert.ok(T.isInterviewerLabel('Interviewer') && T.isInterviewerLabel('Q') && T.isInterviewerLabel('Sarah (producer)'));
  assert.ok(!T.isInterviewerLabel('Jane Smith, Museum Director') && !T.isInterviewerLabel('') && !T.isInterviewerLabel(undefined));
  assert.ok(!T.quality(line('I grew up in the museum, it was my second home.', 'Jane Smith, Museum Director')).reasons.includes('interviewer'));
  const said = ['They’ve always said she’s the reason we haven’t moved.', 'She’s the reason they’ve stayed and haven’t left.', 'We haven’t forgotten, they’ve kept the reason alive.',
    'She’s kept us here, haven’t we always said so.', 'They’ve never left, she’s the heart of it.', 'We haven’t changed, they’ve stayed the same.'];
  const themes = T.themesOffline(said.map((text, i) => ({ id: 'c' + i, start: i * 10, end: i * 10 + 8, speaker: '', text })), { minSize: 2 });
  assert.ok(!themes.some(t => /'|’/.test(t.name) || t.keywords.some(w => /'|’/.test(w))), JSON.stringify(themes.map(t => [t.name, t.keywords])));
  assert.deepStrictEqual(T.parseQuery('they’ve moved house').words.includes('ve'), false);
  assert.doesNotThrow(() => T.quality({ start: 0, end: 1 }));
});
