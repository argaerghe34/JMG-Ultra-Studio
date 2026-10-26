// Story › Timeline transcript: range mapping, which clips count, who is who, paragraphs, and the four export formats.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), cp = require('child_process');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js']);
const TL = US.storyTimeline, E = US.storyExport, T = US.transcript;

const line = (id, start, end, text, speaker = '') => ({ id, start, end, text, speaker });
const L1 = line('a', 10, 16, 'one two three four five six', 'Speaker 1'); // 1 s per word
const L2 = line('b', 20, 24, 'alpha beta gamma delta', 'Speaker 2');

test('a line fully inside a clip keeps its words and lands at the right sequence time', () => {
  const r = TL.mapLines({ start: 100, end: 120, in: 5, out: 25, speed: 1 }, [L1, L2]);
  assert.deepStrictEqual(r.map(e => [e.text, e.start, e.end, e.partial]), [['one two three four five six', 105, 111, false], ['alpha beta gamma delta', 115, 119, false]]);
  assert.deepStrictEqual([r[0].srcIn, r[0].srcOut], [10, 16]);
});
test('a cut in the middle of a sentence keeps only the words that are heard (…)', () => {
  const head = TL.mapLines({ start: 0, end: 2.6, in: 10, out: 12.6, speed: 1 }, [L1])[0];
  assert.strictEqual(head.text, 'one two three…'); // "three" is mostly in (its middle 12.5 < 12.6)
  assert.strictEqual(head.partial, true);
  assert.strictEqual(head.srcOut, 12.6, 'never past the cut');
  const tail = TL.mapLines({ start: 50, end: 54, in: 13.2, out: 17, speed: 1 }, [L1])[0];
  assert.strictEqual(tail.text, '…four five six');
  assert.ok(Math.abs(tail.start - 50) < 1e-9 && Math.abs(tail.srcIn - 13.2) < 1e-9);
  assert.strictEqual(TL.mapLines({ start: 0, end: 1, in: 16.5, out: 17.5, speed: 1 }, [L1]).length, 0, 'outside the used range');
});
test('speed changes are mapped, reversed clips are left out', () => {
  const fast = TL.mapLines({ start: 0, end: 3, in: 10, out: 16, speed: 2 }, [L1])[0];
  assert.deepStrictEqual([fast.start, fast.end], [0, 3]);
  const slow = TL.mapLines({ start: 0, end: 12, in: 10, out: 16, speed: 0.5 }, [L1])[0];
  assert.deepStrictEqual([slow.start, slow.end], [0, 12]);
  assert.strictEqual(TL.mapLines({ start: 0, end: 6, in: 10, out: 16, speed: -1 }, [L1]).length, 0);
});

const clip = (o) => Object.assign({ disabled: false, isSequence: false, speed: 1 }, o);
const INFO = {
  name: 'Cut', fps: 25,
  video: [{ index: 0, name: 'Video 1', muted: false, clips: [clip({ name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', start: 0, end: 10, in: 0, out: 10 }), clip({ name: 'broll.mov', path: '/m/broll.mov', itemId: 'b', start: 10, end: 14, in: 0, out: 4 }), clip({ name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', start: 14, end: 20, in: 30, out: 36 })] }],
  audio: [
    { index: 0, name: 'Audio 1', muted: false, clips: [clip({ name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', start: 0, end: 10, in: 0, out: 10 }), clip({ name: 'david.wav', path: '/m/david.wav', itemId: 'd', start: 10, end: 14, in: 2, out: 6 }), clip({ name: 'Nest', isSequence: true, start: 20, end: 25, in: 0, out: 5 })] },
    { index: 1, name: 'Audio 2', muted: false, clips: [clip({ name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', start: 0, end: 10, in: 0, out: 10 }), clip({ name: 'off.wav', path: '/m/off.wav', itemId: 'o', start: 3, end: 5, in: 0, out: 2, disabled: true })] },
    { index: 2, name: 'Music', muted: false, clips: [clip({ name: 'song.mp3', path: '/m/song.mp3', itemId: 's', start: 0, end: 20, in: 0, out: 20 })] },
    { index: 3, name: 'Audio 4', muted: true, clips: [clip({ name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', start: 0, end: 10, in: 0, out: 10 })] }
  ]
};
const TRANS = {
  '/m/ruth.mov': { key: '/m/ruth.mov', name: 'ruth.mov', lines: [line('r1', 1, 4, 'My name is Ruth.', 'Speaker 1'), line('r2', 5, 9, 'I grew up in London.', 'Speaker 1'), line('r3', 31, 35, 'We lit the candles.', 'Speaker 2')] },
  '/m/david.wav': { key: '/m/david.wav', name: 'david.wav', lines: [line('d1', 2, 6, 'I volunteer on Sundays.', 'Speaker 1')] }
};
const has = c => !!TRANS[c.path];
test('which clips count: dialogue tracks only, muted/disabled/nested left out, picture-only uses of V1 added', () => {
  const r = TL.collectClips(INFO, { hasTranscript: has });
  assert.deepStrictEqual(r.audioTracks.map(t => [t.name, t.transcribed]), [['Audio 1', 2], ['Audio 2', 1], ['Music', 0], ['Audio 4', 1]]);
  assert.deepStrictEqual(r.clips.map(c => `${c.track}:${c.name}@${c.start}`), ['A1:ruth.mov@0', 'A2:ruth.mov@0', 'A1:david.wav@10', 'V1:ruth.mov@14']);
  assert.deepStrictEqual(r.nested, ['Nest']); assert.strictEqual(r.disabled, 1);
  const music = TL.collectClips(INFO, { tracks: [2], hasTranscript: has });
  assert.deepStrictEqual(music.clips.map(c => c.name), ['song.mp3'], 'the editor can still pick a track by hand');
});
test('build: the same line on two mics counts once; untranscribed clips are listed; voices are per clip', () => {
  const find = c => TRANS[c.path] || null;
  const clips = TL.collectClips(INFO, { tracks: [0, 1, 2], hasTranscript: has }).clips;
  const r = TL.build(clips, find);
  assert.deepStrictEqual(r.entries.map(e => e.text), ['My name is Ruth.', 'I grew up in London.', 'I volunteer on Sundays.'], 'tracks picked by hand: no picture-only V1 additions');
  assert.deepStrictEqual(r.entries.map(e => e.start), [1, 5, 10]);
  assert.deepStrictEqual(r.missing.map(m => m.name), ['song.mp3']);
  assert.deepStrictEqual(r.speakers.map(s => [s.clipName, s.label]), [['ruth.mov', 'Speaker 1'], ['david.wav', 'Speaker 1']]);
  assert.strictEqual(r.speakers[0].talk, 7);
  const auto = TL.build(TL.collectClips(INFO, { hasTranscript: has }).clips, find);
  assert.deepStrictEqual(auto.entries.map(e => [e.text, e.start]), [['My name is Ruth.', 1], ['I grew up in London.', 5], ['I volunteer on Sundays.', 10], ['We lit the candles.', 15]]);
  assert.deepStrictEqual(auto.speakers.map(s => [s.clipName, s.label]), [['ruth.mov', 'Speaker 1'], ['david.wav', 'Speaker 1'], ['ruth.mov', 'Speaker 2']]);
  assert.strictEqual(auto.missing.length, 0, 'music track not used automatically');
});
test('who is who: letters across the timeline, typed names, Premiere names, merging, paragraphs', () => {
  const find = c => TRANS[c.path] || null;
  const r = TL.build(TL.collectClips(INFO, { hasTranscript: has }).clips, find);
  let d = TL.displayNames(r.speakers, {});
  assert.deepStrictEqual(r.speakers.map(s => d.get(s.key)), ['Speaker A', 'Speaker B', 'Speaker C'], '“Speaker 1” in two clips are two different letters');
  d = TL.displayNames(r.speakers, { [r.speakers[0].key]: 'Ruth', [r.speakers[2].key]: ' ruth ' });
  const people = TL.people(r.speakers, d);
  assert.deepStrictEqual(people.map(p => [p.name, p.talk]), [['Ruth', 11], ['Speaker A', 4]]);
  const named = TL.displayNames([{ key: 'k1', label: 'Grandma Ruth', first: 0 }, { key: 'k2', label: 'Speaker 3', first: 1 }], {});
  assert.deepStrictEqual([named.get('k1'), named.get('k2')], ['Grandma Ruth', 'Speaker A'], 'a name given in Premiere is used');
  const paras = TL.paragraphs(r.entries, d);
  assert.deepStrictEqual(paras.map(p => [p.name, p.text]), [['Ruth', 'My name is Ruth. I grew up in London.'], ['Speaker A', 'I volunteer on Sundays.'], ['Ruth', 'We lit the candles.']]);
  const gap = TL.paragraphs([{ start: 0, end: 2, text: 'a', speakerKey: 'x' }, { start: 9, end: 10, text: 'b', speakerKey: 'x' }], new Map([['x', 'Ann']]));
  assert.strictEqual(gap.length, 2, 'a long pause starts a new paragraph');
});

/* ---------- export formats ---------- */
test('timecodes: frames, drop-frame and subtitle times', () => {
  assert.strictEqual(E.tc(3725.5, { fps: 25 }), '01:02:05:12');
  assert.strictEqual(E.tc(0.5, { fps: 25 }), '00:00:00:12');
  assert.strictEqual(E.tc(600, { fps: 29.97, drop: true }), '00;10;00;00', 'drop-frame written the way Premiere shows it');
  assert.strictEqual(E.tc(60, { fps: 29.97, drop: true }), '00;00;59;28');
  assert.strictEqual(E.tc(3600, { fps: 23.976 }), '00:59:56:09');
  assert.strictEqual(E.srtTime(3725.5), '01:02:05,500');
  assert.strictEqual(E.crc32(Buffer.from('123456789')), 0xcbf43926);
});
function unzip(buf) { // tiny reader: central directory → entries
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = {};
  for (let i = 0; i < n; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28);
    const raw = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.strictEqual(E.crc32(data), crc, 'crc of ' + name);
    out[name] = data.toString('utf8'); p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}
function sampleDoc() {
  const d = new Map([['k1', 'Ruth'], ['k2', 'David “Dave” Cohen & co']]);
  const entries = [{ start: 1, end: 4, text: 'My name is Ruth.', speakerKey: 'k1', clip: 'ruth.mov', itemId: 'r', srcIn: 11, srcOut: 14 },
    { start: 5, end: 21, text: 'I grew up in London, in a small flat with six children, and every Friday the table was full of neighbours and cousins.', speakerKey: 'k1', clip: 'ruth.mov', itemId: 'r', srcIn: 15, srcOut: 31 },
    { start: 22, end: 25, text: 'I volunteer on "Sundays", with friends.', speakerKey: 'k2', clip: 'david.wav', itemId: 'd', srcIn: 2, srcOut: 5 }];
  return {
    title: 'Transcript – Rough cut', sequence: 'Rough cut', project: 'Legacy', date: '23 October 2026',
    speakers: [{ name: 'Ruth', talk: 19 }, { name: 'David “Dave” Cohen & co', talk: 3 }],
    paragraphs: TL.paragraphs(entries, d), entries: entries.map(e => Object.assign({}, e, { name: d.get(e.speakerKey) })),
    seqTC: s => E.tc(3600 + s, { fps: 25 }), srcTC: (e, s) => E.tc(s, { fps: 25 })
  };
}
test('Word: a valid .docx (zip, crc, XML) that macOS can read', () => {
  const buf = E.toDocx(sampleDoc());
  const files = unzip(buf);
  assert.deepStrictEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']);
  assert.ok(/<w:b\/><\/w:rPr><w:t xml:space="preserve">Ruth: <\/w:t>/.test(files['word/document.xml']), 'bold speaker name');
  assert.ok(files['word/document.xml'].includes('David “Dave” Cohen &amp; co'), 'escaped');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'docx-')), 'Rough cut.docx');
  fs.writeFileSync(f, buf);
  try { assert.ok(/No errors detected/.test(cp.execFileSync('unzip', ['-t', f]).toString())); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (process.platform === 'darwin') {
    const txt = cp.execFileSync('textutil', ['-convert', 'txt', '-stdout', f]).toString();
    for (const want of ['Transcript – Rough cut', 'Rough cut · Legacy · 23 October 2026', 'Speakers', '01:00:01:00', 'Ruth: My name is Ruth. I grew up in London', 'David “Dave” Cohen & co: I volunteer on "Sundays", with friends.']) assert.ok(txt.includes(want), 'Word text has: ' + want + '\n' + txt);
  }
});
test('Subtitles, spreadsheet and text', () => {
  const t = sampleDoc();
  const srt = E.toSRT(t);
  const cues = T.parseSRT(srt);
  assert.strictEqual(cues.length, 5, 'the 16-second line is split into 3 cues: ' + srt);
  assert.strictEqual(cues[0].speaker, 'Ruth'); assert.strictEqual(cues[0].text, 'My name is Ruth.');
  assert.ok(Math.abs(cues[1].start - 5) < 0.01 && Math.abs(cues[3].end - 21) < 0.01);
  assert.ok(!/^Ruth:/.test(srt.split('\n\n')[2].split('\n')[2]), 'continuation cues are not re-labelled');
  const csv = E.toCSV(t);
  const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.strictEqual(rows[0], 'Timecode in,Timecode out,Speaker,Text,Source clip,Source timecode in,Source timecode out');
  assert.strictEqual(rows[3], '01:00:22:00,01:00:25:00,David “Dave” Cohen & co,"I volunteer on ""Sundays"", with friends.",david.wav,00:00:02:00,00:00:05:00');
  const txt = E.toText(t);
  assert.ok(txt.includes('01:00:01:00  Ruth: My name is Ruth. I grew up in London') && txt.includes('Speakers:\n  Ruth – 0:19'));
});
test('with Premiere word timings the cut is exact (not an even guess)', () => {
  // "one" 10.0–10.5, "two" 11.0–11.5, then a pause, "three" 16.0–16.5, "four" 19.0–20.0
  const w = { id: 'w', start: 10, end: 20, text: 'one two three four', speaker: '', w: [0, 50, 100, 150, 600, 650, 900, 1000] };
  const exact = TL.mapLines({ start: 0, end: 8, in: 12, out: 20, speed: 1 }, [w])[0];
  assert.strictEqual(exact.text, '…three four'); assert.strictEqual(exact.exact, true);
  assert.deepStrictEqual([exact.srcIn, exact.start, exact.srcOut, exact.end], [16, 4, 20, 8]);
  const guess = TL.mapLines({ start: 0, end: 8, in: 12, out: 20, speed: 1 }, [Object.assign({}, w, { w: undefined })])[0];
  assert.strictEqual(guess.text, '…two three four'); assert.strictEqual(guess.exact, false);
  const head = TL.mapLines({ start: 0, end: 5, in: 10, out: 15, speed: 1 }, [w])[0];
  assert.strictEqual(head.text, 'one two…'); assert.strictEqual(head.srcOut, 11.5, 'ends with the last word heard, not at the cut');
});

function samplePaper() {
  return { title: 'Paper edit', project: 'Legacy', date: '24 October 2026', groups: [
    { name: 'Family', colour: 'Yellow', hex: '#E5C547', cards: [
      { speaker: 'Ruth', interview: 'Interview 1', clip: 'ruth.mp4', srcIn: '00:00:01:00', srcOut: '00:00:08:12', dur: 7.5, text: 'I was the first in our family to go to university.', strong: true, note: 'Opening?' },
      { idea: 'B-roll of the graduation photo' },
      { speaker: 'David “Dave” Cohen & co', interview: 'Interview 2', clip: 'david.wav', srcIn: '00:00:02:00', srcOut: '00:00:05:00', dur: 3, text: 'I volunteer on "Sundays", with friends.', strong: false, note: '' }] },
    { name: 'Not in a group', colour: '', hex: '', cards: [{ speaker: '', interview: 'Interview 3', clip: 'P1000278.MOV', srcIn: '19:52:47:20', srcOut: '19:52:51:20', dur: 4, text: 'Thank you.', strong: false }] }] };
}
test('paper edit: the board as Word, spreadsheet and text, groups in order with ideas and notes', () => {
  const p = samplePaper();
  assert.strictEqual(E.paperSummary(p), '2 groups · 3 lines · 0:14 of talk');
  const files = unzip(E.paperDocx(p)), xml = files['word/document.xml'];
  assert.ok(xml.includes('<w:color w:val="E5C547"/>'), 'the group’s colour swatch');
  assert.ok(xml.includes('David “Dave” Cohen &amp; co') && xml.includes('Idea: '));
  if (process.platform === 'darwin') {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paper-')), 'Paper edit.docx'); fs.writeFileSync(f, E.paperDocx(p));
    const txt = cp.execFileSync('textutil', ['-convert', 'txt', '-stdout', f]).toString();
    for (const want of ['Paper edit', 'Legacy · 24 October 2026 · 2 groups', 'Family   2 lines · 0:10', '00:00:01:00–00:00:08:12', '“I was the first in our family to go to university.”', 'Note: Opening?', 'B-roll of the graduation photo', 'Not in a group']) assert.ok(txt.includes(want), 'Word text has: ' + want + '\n' + txt);
    assert.ok(txt.indexOf('Family') < txt.indexOf('Not in a group'));
  }
  const rows = E.paperCSV(p).replace(/^﻿/, '').trim().split('\r\n');
  assert.strictEqual(rows[0], 'Group,Order,Speaker,Interview,Clip,Source timecode in,Source timecode out,Seconds,Text,Strongest,Note');
  assert.strictEqual(rows[1], 'Family,1,Ruth,Interview 1,ruth.mp4,00:00:01:00,00:00:08:12,7.5,I was the first in our family to go to university.,yes,Opening?');
  assert.strictEqual(rows[2], 'Family,,,,,,,,[Idea] B-roll of the graduation photo,,');
  assert.strictEqual(rows[3].split(',')[1], '2', 'ideas don’t take a number');
  const txt = E.paperText(p);
  assert.ok(txt.includes('1. P1000278.MOV (Interview 3) · 19:52:47:20–19:52:51:20 (0:04)'), 'no speaker names: the clip leads');
  assert.ok(txt.includes('Family – 2 lines · 0:10 (Yellow)') && txt.includes('1. Ruth (Interview 1) · ruth.mp4 · 00:00:01:00–00:00:08:12 (0:07) ★') && txt.includes('   [Idea] B-roll of the graduation photo'), txt);
});

function sampleLog(full) {
  return { title: 'Interview log', project: 'Legacy', date: '24 October 2026', interviews: [
    { name: 'ruth.mp4', speakers: 'Ruth, Interviewer', length: 312, summary: 'Ruth talks about growing up in Stamford Hill.', summaryBy: 'Gemini',
      topics: [{ name: 'Family', hex: '#E5C547', count: 5, at: '00:00:12:00' }, { name: 'Faith', hex: '#6B8BD6', count: 2, at: '00:03:01:10' }],
      best: [{ at: '00:01:00:00', dur: 7, speaker: 'Ruth', text: 'A home is only as warm as the door is open.' }],
      moments: [{ type: 'Funny', at: '00:02:00:00', text: 'And then the cake fell over!', why: 'laughter' }],
      transcript: full ? [{ at: '00:00:00:00', speaker: 'Interviewer', text: 'Tell me about your family?' }, { at: '00:00:03:00', speaker: 'Ruth', text: 'We were six "kids" & a dog.' }] : null },
    { name: 'david.wav', speakers: '', length: 95, summary: '', topics: [], best: [], moments: [], transcript: full ? [{ at: '00:00:01:00', speaker: '', text: 'No names here.' }] : null }] };
}
test('interview log: a section per interview – summary, themes, strongest lines, moments, transcript', () => {
  const g = sampleLog(true);
  assert.strictEqual(E.logSummary(g), '2 interviews · 6:47');
  const xml = unzip(E.logDocx(g))['word/document.xml'];
  assert.strictEqual((xml.match(/<w:pageBreakBefore\/>/g) || []).length, 1, 'with transcripts, each interview after the first starts a page');
  assert.ok(!unzip(E.logDocx(sampleLog(false)))['word/document.xml'].includes('pageBreakBefore'), 'no page breaks in a short log');
  assert.ok(xml.includes('<w:color w:val="E5C547"/>') && xml.includes('six &quot;kids&quot; &amp; a dog'));
  if (process.platform === 'darwin') {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'log-')), 'Interview log.docx'); fs.writeFileSync(f, E.logDocx(g));
    const txt = cp.execFileSync('textutil', ['-convert', 'txt', '-stdout', f]).toString();
    for (const want of ['Interview log', 'Legacy · 24 October 2026 · 2 interviews · 6:47', '1. ruth.mp4', 'Ruth, Interviewer · 5:12', 'Ruth talks about growing up in Stamford Hill.', '(summary by Gemini)', 'Talks about:', 'Family 5 · 00:00:12:00', '★ Strongest lines', '00:01:00:00', '“A home is only as warm as the door is open.”', 'Funny: “And then the cake fell over!”  laughter', 'Interviewer: Tell me about your family?', '2. david.wav   1:35', '00:00:01:00   No names here.']) assert.ok(txt.includes(want), 'Word text has: ' + want + '\n' + txt);
    assert.ok(!/2\. david\.wav[\s\S]*(Strongest|Moments|Talks about)/.test(txt), 'empty sections are left out');
  }
  const rows = E.logCSV(g).replace(/^﻿/, '').trim().split('\r\n');
  assert.strictEqual(rows[0], 'Interview,Section,Timecode,Speaker,Text,Detail');
  assert.deepStrictEqual(rows.slice(1).map(r => r.split(',')[1]), ['About', 'Theme', 'Theme', 'Strongest', 'Funny', 'Transcript', 'Transcript', 'About', 'Transcript']);
  assert.ok(rows.includes('ruth.mp4,Transcript,00:00:03:00,Ruth,"We were six ""kids"" & a dog.",'));
  const txt = E.logText(sampleLog(false));
  assert.ok(txt.includes('1. ruth.mp4 – Ruth, Interviewer · 5:12') && txt.includes('Talks about: Family (5, from 00:00:12:00) · Faith (2, from 00:03:01:10)') && !txt.includes('Transcript:'), txt);
});
