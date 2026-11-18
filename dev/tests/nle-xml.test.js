// Deliver › Other editors: FCPXML, FCP 7 XML (xmeml), EDL and OTIO readers and writers (js/tools/33-deliver-nlexml.js).
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { load, test, ROOT } = require('./harness');
const US = load(['js/tools/33-deliver-nlexml.js']);
const N = US.nleXml;
const FIX = path.join(ROOT, 'dev', 'tests', 'fixtures', 'nle');
const fixture = f => fs.readFileSync(path.join(FIX, f), 'utf8');
const clips = (tl, kind, i) => tl[kind][i].clips.map(c => [c.name, c.at, c.len, c.in]);
const ALL = tl => tl.video.concat(tl.audio).flatMap(t => t.clips);

/** Final Cut Pro's DTDs ship inside the app; when it's on this Mac (and xmllint is), our FCPXML is checked against them. */
const DTD_DIR = '/Applications/Final Cut Pro.app/Contents/Frameworks/Interchange.framework/Versions/A/Resources';
function dtdCheck(text, version = '1.10') {
  const dtd = path.join(DTD_DIR, `FCPXMLv${version.replace('.', '_')}.dtd`);
  if (!fs.existsSync(dtd)) return 'skipped';
  try { cp.execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch (e) { return 'skipped'; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-fcpxml-'));   // xmllint can't open a DTD path with spaces
  fs.copyFileSync(dtd, path.join(dir, 'f.dtd')); fs.writeFileSync(path.join(dir, 'x.fcpxml'), text);
  try { cp.execFileSync('xmllint', ['--noout', '--dtdvalid', path.join(dir, 'f.dtd'), path.join(dir, 'x.fcpxml')], { stdio: 'pipe' }); return 'valid'; }
  catch (e) { throw new Error('FCPXML not valid against Final Cut Pro’s DTD ' + version + ':\n' + String(e.stderr || e.message).slice(0, 1500)); }
}
/** The rules Final Cut Pro checks on import that a DTD can't: references resolve, times sit on frames, the main storyline doesn't overlap. */
function structureCheck(text) {
  const doc = N.parseXml(text);
  assert.strictEqual(doc.name, 'fcpxml');
  assert.ok(/^1\.(8|9|1\d)$/.test(doc.attrs.version), 'version ' + doc.attrs.version);
  const all = []; (function walk(n) { for (const k of n.kids) { all.push(k); walk(k); } })(doc);
  const ids = new Set(all.filter(n => n.attrs.id).map(n => n.attrs.id));
  for (const n of all) for (const a of ['ref', 'format']) if (n.attrs[a]) assert.ok(ids.has(n.attrs[a]), `${n.name} ${a}="${n.attrs[a]}" points nowhere`);
  const seq = all.find(n => n.name === 'sequence'), fmt = all.find(n => n.name === 'format' && n.attrs.id === seq.attrs.format);
  const fd = N.parseTime(fmt.attrs.frameDuration);
  const onFrame = t => { const q = N.parseTime(t); return (q.n * fd.d) % (q.d * fd.n) === 0; };
  for (const n of all) if (/^(asset-clip|gap|marker|chapter-marker)$/.test(n.name)) for (const a of ['offset', 'duration']) if (n.attrs[a]) assert.ok(onFrame(n.attrs[a]), `${n.name} ${a}=${n.attrs[a]} is not on a frame`);
  for (const a of all.filter(n => n.name === 'asset')) assert.ok(a.kids.some(k => k.name === 'media-rep' && /^file:\/\//.test(k.attrs.src)), 'asset has a file URL');
  const spine = all.find(n => n.name === 'spine'); let end = null;
  for (const k of spine.kids) { const off = N.parseTime(k.attrs.offset); if (end) assert.strictEqual(off.n * end.d, end.n * off.d, 'storyline items follow each other'); const d = N.parseTime(k.attrs.duration); end = N.Q(off.n * d.d + d.n * off.d, off.d * d.d); }
}

test('nle-xml: XML reader – entities, CDATA, comments, attributes in either quotes, self-closing elements', () => {
  const d = N.parseXml('<?xml version="1.0"?>\n<!DOCTYPE x>\n<!-- c --><a x="1 &amp; 2" y=\'q"\'><b/><c>Tom &lt;&gt; “Jerry” &#233;&#x41;</c><d><![CDATA[<raw> & stuff]]></d></a>');
  assert.strictEqual(d.attrs.x, '1 & 2'); assert.strictEqual(d.attrs.y, 'q"');
  assert.deepStrictEqual(d.kids.map(k => k.name), ['b', 'c', 'd']);
  assert.strictEqual(d.kids[1].text, 'Tom <> “Jerry” éA');
  assert.strictEqual(d.kids[2].text, '<raw> & stuff');
  assert.strictEqual(N.parseXml(N.toXml(N.el('z', { q: 'a"<b' }, ['x & y']))).text, 'x & y');
});

test('nle-xml: frame rates and timecode – 23.976, 29.97 drop frame, fractions that never drift', () => {
  assert.deepStrictEqual(N.rateOf(23.976), { num: 24000, den: 1001 });
  assert.deepStrictEqual(N.rateOf(29.97), { num: 30000, den: 1001 });
  assert.deepStrictEqual(N.rateOf(25), { num: 25, den: 1 });
  assert.deepStrictEqual(N.parseTime('1001/24000s'), { n: 1001, d: 24000 });
  assert.strictEqual(N.fmtTime(N.parseTime('3600/1s')), '3600s');
  assert.strictEqual(N.secToFrames(N.parseTime('86486400/24000s'), N.rateOf(23.976)), 86400);
  assert.strictEqual(N.framesToTC(107892, N.rateOf(29.97), true), '01:00:00;00');
  assert.strictEqual(N.tcToFrames('01:00:00;00', N.rateOf(29.97)), 107892);
  assert.strictEqual(N.framesToTC(90000, N.rateOf(25)), '01:00:00:00');
  assert.strictEqual(N.urlToPath('file://localhost/C%3a/Wedding/B%20cam/x.mov'), 'C:/Wedding/B cam/x.mov');
  assert.strictEqual(N.urlToPath(N.pathToUrl('/Volumes/Shoot Day 1/A#1 (best).mov')), '/Volumes/Shoot Day 1/A#1 (best).mov');
  assert.strictEqual(N.pathToUrl('C:\\Media\\a b.mov'), 'file:///C:/Media/a%20b.mov');
});

test('nle-xml: reads Final Cut Pro 11 FCPXML – storyline, connected clips, multicam angle, markers, colour keyword, levels', () => {
  const tl = N.read(fixture('fcp11-interview.fcpxml'), 'fcpxml');
  assert.strictEqual(tl.name, 'Interview cut');
  assert.deepStrictEqual(tl.rate, { num: 24000, den: 1001 });
  assert.strictEqual(tl.tcStart, 86400, '01:00:00:00 at 23.976');
  assert.strictEqual(tl.duration, 360);
  assert.deepStrictEqual(clips(tl, 'video', 0), [['Anna – intro', 0, 120, 600], ['C002_close', 168, 72, 24]], 'main storyline, multicam shows the Close angle');
  assert.deepStrictEqual(clips(tl, 'video', 1), [['Hands', 48, 48, 48]], 'connected clip on lane 1 is video track 2');
  assert.deepStrictEqual(clips(tl, 'audio', 0), [['Anna – intro', 0, 120, 600], ['C001_wide', 168, 72, 24]], 'storyline sound, multicam sound from the Wide angle');
  assert.deepStrictEqual(clips(tl, 'audio', 1), [['Music bed', 0, 240, 0]], 'lane -1 is audio track 2');
  assert.strictEqual(tl.audio[0].clips[0].gainDb, -3); assert.strictEqual(tl.audio[1].clips[0].gainDb, -12);
  assert.strictEqual(tl.video[0].clips[0].colour, 'Iris');
  assert.strictEqual(tl.video[0].clips[0].link, tl.audio[0].clips[0].link, 'picture and sound of one clip stay linked');
  assert.deepStrictEqual(tl.markers.map(m => [m.at, m.name, m.colour]).sort((a, b) => a[0] - b[0]), [[0, 'Intro', 'Purple'], [24, 'Good line', ''], [192, 'Laugh', 'Red']]);
  assert.strictEqual(tl.markers.find(m => m.name === 'Good line').note, 'use in trailer');
  assert.strictEqual(tl.media[tl.video[0].clips[0].media].path, '/Volumes/Shoot Day 1/A001_interview.mov');
  const lost = N.lostLines(tl).join(' | ');
  for (const w of ['transitions', 'titles (left out: “Anna Smith”)', 'Gaussian Blur', 'multicam']) assert.ok(lost.includes(w), 'reports ' + w + ' in ' + lost);
  assert.strictEqual(dtdCheck(fixture('fcp11-interview.fcpxml'), '1.13') !== 'invalid', true);
});

test('nle-xml: reads Premiere’s FCP 7 XML – transitions’ -1 starts, linked stereo, levels, labels, markers, switched-off clips, Windows paths', () => {
  const tl = N.read(fixture('premiere-wedding.xml'), 'xmeml');
  assert.strictEqual(tl.name, 'Wedding – first look');
  assert.strictEqual(tl.tcStart, 90000); assert.strictEqual(tl.width, 3840);
  assert.deepStrictEqual(clips(tl, 'video', 0), [['C0012.MP4', 0, 150, 250], ['Bride walks in', 150, 150, 1000]]);
  assert.deepStrictEqual(clips(tl, 'video', 1), [['Rings close-up', 50, 50, 10]]);
  assert.strictEqual(tl.video[1].clips[0].enabled, false);
  assert.deepStrictEqual(tl.audio.map(t => t.clips.map(c => c.channel)), [[1, 1], [2]]);
  assert.strictEqual(tl.audio[0].clips[0].gainDb, -6);
  assert.deepStrictEqual(tl.video[0].clips.map(c => c.colour), ['Iris', 'Mango']);
  assert.deepStrictEqual(tl.video[0].clips[0].markers.map(m => [m.at, m.name, m.note]), [[50, 'Dad', 'tears here']], 'clip marker from the start of the clip');
  assert.deepStrictEqual(tl.markers.map(m => [m.at, m.dur, m.name]), [[75, 25, 'Music'], [370, 0, 'End']]);
  assert.strictEqual(new Set([tl.video[0].clips[0].link, tl.audio[0].clips[0].link, tl.audio[1].clips[0].link]).size, 1);
  assert.strictEqual(tl.media[tl.video[1].clips[0].media].path, 'C:/Wedding/B cam/B_rings.mov');
  assert.deepStrictEqual(tl.media[tl.video[0].clips[0].media].tcStartSec, N.Q(1263255, 25), 'the file’s own timecode');
  const lost = N.lostLines(tl).join(' | ');
  for (const w of ['transitions', 'Lumetri Color', 'Color Matte', 'Gaussian Blur']) assert.ok(lost.includes(w), 'reports ' + w);
  assert.ok(!/speed/.test(lost), 'a 100% Time Remap is not a speed change');
});

test('nle-xml: reads a Resolve EDL – clip names, source files, Resolve’s marker lines, dissolves reported', () => {
  const tl = N.read(fixture('resolve-promo.edl'), 'edl', { fps: 25 });
  assert.strictEqual(tl.name, 'Promo v3'); assert.strictEqual(tl.tcStart, 90000);
  assert.deepStrictEqual(clips(tl, 'video', 0).map(c => c.slice(0, 3)), [['A001_C003.mov', 0, 100], ['drone_02.mp4', 100, 50], ['drone_03.mp4', 150, 75]]);
  assert.deepStrictEqual(clips(tl, 'audio', 0).map(c => c[0]), ['A001_C003.mov'], 'AA/V brings the sound');
  assert.strictEqual(tl.media[tl.video[0].clips[2].media].path, '/Volumes/Media/drone_03.mp4');
  assert.deepStrictEqual(tl.markers.map(m => [m.at, m.name, m.colour]), [[100, 'Logo here', 'Blue']]);
  assert.ok(N.lostLines(tl).some(l => /transitions/.test(l)));
  assert.strictEqual(N.read(fixture('resolve-promo.edl'), 'edl').rate.num, 25, 'without a rate: 25 unless frame numbers say more');
});

test('nle-xml: reads OpenTimelineIO – Clip.1 and Clip.2, gaps, transitions and speed reported, markers', () => {
  const tl = N.read(fixture('resolve-short.otio'));
  assert.strictEqual(tl.name, 'Short 9x16'); assert.strictEqual(tl.tcStart, 108000);
  assert.deepStrictEqual(clips(tl, 'video', 0), [['talk.mp4', 0, 90, 300], ['broll speed', 120, 60, 30]]);
  assert.deepStrictEqual(clips(tl, 'audio', 0), [['talk.mp4', 0, 90, 300]]);
  assert.deepStrictEqual(tl.markers.map(m => [m.at, m.name, m.colour]), [[45, 'Hook', 'Blue']], 'timeline marker from the start (written as timecode)');
  assert.deepStrictEqual(tl.video[0].clips[1].markers.map(m => [m.at, m.name]), [[10, 'Cut early']]);
  const lost = N.lostLines(tl).join(' | ');
  assert.ok(/transitions/.test(lost) && /speed/.test(lost), lost);
});

test('nle-xml: round trip FCPXML → FCP 7 XML → FCPXML keeps every clip, in point, colour, level and marker', () => {
  const a = N.read(fixture('fcp11-interview.fcpxml'), 'fcpxml');
  const x = N.write(a, 'xmeml');
  const b = N.read(x.text, 'xmeml');
  const f = N.write(b, 'fcpxml');
  structureCheck(f.text); dtdCheck(f.text);
  const c = N.read(f.text, 'fcpxml');
  for (const tl of [b, c]) {
    assert.deepStrictEqual(clips(tl, 'video', 0), clips(a, 'video', 0));
    assert.deepStrictEqual(clips(tl, 'video', 1), clips(a, 'video', 1));
    assert.deepStrictEqual(tl.audio.flatMap(t => t.clips.filter(c => c.channel !== 2).map(c => [c.name, c.at, c.len, c.in, c.gainDb == null ? null : c.gainDb])).sort(), a.audio.flatMap(t => t.clips.map(c => [c.name, c.at, c.len, c.in, c.gainDb == null ? null : c.gainDb])).sort());
    assert.deepStrictEqual(tl.markers.map(m => [m.at, m.name]).sort(), a.markers.map(m => [m.at, m.name]).sort());
    assert.strictEqual(tl.tcStart, a.tcStart); assert.deepStrictEqual(tl.rate, a.rate); assert.strictEqual(tl.duration, a.duration);
    assert.strictEqual(tl.video[0].clips[0].colour, 'Iris');
    assert.deepStrictEqual(Object.values(tl.media).map(m => m.path).sort(), Object.values(a.media).map(m => m.path).sort());
  }
  assert.ok(N.read(N.write(a, 'fcpxml').text, 'fcpxml').markers.find(m => m.name === 'Intro').chapter, 'a chapter marker stays one in FCPXML');
});

test('nle-xml: round trip FCP 7 XML → FCPXML → FCP 7 XML (Premiere to Final Cut Pro and back)', () => {
  const a = N.read(fixture('premiere-wedding.xml'), 'xmeml');
  const f = N.write(a, 'fcpxml');
  structureCheck(f.text); dtdCheck(f.text);
  assert.ok(f.notes.some(n => /keywords/.test(n)) && f.notes.some(n => /connected clips/.test(n)), 'says how colours and other tracks arrive');
  const b = N.read(f.text, 'fcpxml');
  const c = N.read(N.write(b, 'xmeml').text, 'xmeml');
  assert.deepStrictEqual(clips(c, 'video', 0), clips(a, 'video', 0));
  assert.deepStrictEqual(clips(c, 'video', 1), clips(a, 'video', 1));
  assert.strictEqual(c.video[1].clips[0].enabled, false, 'a switched-off clip stays off');
  assert.deepStrictEqual(c.audio[0].clips.map(x => [x.name, x.at, x.len, x.in]), a.audio[0].clips.map(x => [x.name, x.at, x.len, x.in]));
  assert.deepStrictEqual(c.audio.map(t => t.clips.map(x => x.channel)), [[1, 1], [2, 2]], 'stereo files have both channels for Premiere');
  assert.strictEqual(c.audio[0].clips[0].gainDb, -6);
  assert.deepStrictEqual(c.video[0].clips.map(x => x.colour), ['Iris', 'Mango']);
  assert.deepStrictEqual(c.markers.map(m => [m.at, m.name]).sort((x, y) => x[0] - y[0]), [[50, 'Dad'], [75, 'Music'], [370, 'End']], 'the clip marker on track 1 arrives as a timeline marker (FCPXML keeps both on the clip)');
  assert.strictEqual(c.media[c.video[0].clips[0].media].path, '/Volumes/Wedding SSD/Cam A/C0012.MP4');
  assert.deepStrictEqual(c.media[c.video[0].clips[0].media].tcStartSec, N.Q(1263255, 25));
});

test('nle-xml: every format writes and reads back the same edit (EDL and OTIO too)', () => {
  for (const f of ['fcp11-interview.fcpxml', 'premiere-wedding.xml', 'resolve-promo.edl', 'resolve-short.otio']) {
    const a = N.read(fixture(f), N.sniff(f, fixture(f)), { fps: 25 });
    const fps = a.rate.num / a.rate.den;
    for (const k of ['fcpxml', 'xmeml', 'otio', 'edl']) {
      const w = N.write(a, k), b = N.read(w.text, k, { fps });
      assert.strictEqual(N.sniff('x' + w.ext, w.text), k, `${f} → ${k} is recognised`);
      if (k === 'fcpxml') { structureCheck(w.text); dtdCheck(w.text); }
      // an EDL has source timecode, not the file's start: in points are compared elsewhere
      const v1 = t => t.video[0].clips.map(c => (k === 'edl' ? [c.at, c.len, c.name] : [c.at, c.len, c.in, c.name]));
      assert.deepStrictEqual(v1(b), v1(a), `${f} → ${k}: video track 1`);
      // every clip (a stereo pair of Premiere's is one clip in FCPXML and OTIO, and two again in Premiere's XML)
      const keys = t => [...new Set(t.video.flatMap(x => x.clips.map(c => 'v' + c.at + '|' + c.len)).concat(t.audio.flatMap(x => x.clips.map(c => 'a' + c.at + '|' + c.len + '|' + t.media[c.media].path))))].sort();
      if (k !== 'edl') assert.deepStrictEqual(keys(b), keys(a), `${f} → ${k}: every clip`);
    }
  }
});

test('nle-xml: FCP 7 XML for Premiere – one file definition, links between picture and sound, labels, Windows and Mac paths', () => {
  const tl = N.blank({ name: 'Linked', rate: { num: 25, den: 1 }, tcStart: 90000 });
  const m = N.addMedia(tl, { name: 'a b.mov', path: 'D:\\Shoot\\a b.mov', tcStartSec: N.Q(10), durationSec: N.Q(60) });
  tl.video.push({ clips: [{ media: m, name: 'A', at: 0, len: 50, in: 100, colour: 'Navy', link: 'x', markers: [] }] });
  tl.audio.push({ clips: [{ media: m, name: 'A', at: 0, len: 50, in: 100, link: 'x', gainDb: -6.02, channel: 1 }] });
  const x = N.write(N.finish(tl), 'xmeml').text;
  assert.ok(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>'));
  assert.strictEqual((x.match(/<pathurl>/g) || []).length, 1, 'the file is described once, then referred to');
  assert.ok(x.includes('<pathurl>file://localhost/D:/Shoot/a%20b.mov</pathurl>'));
  assert.strictEqual((x.match(/<link>/g) || []).length, 9, 'picture, left and right each name all three (a stereo file gets both channels)');
  assert.ok(x.includes('<trackindex>2</trackindex></sourcetrack>') || /<trackindex>2<\/trackindex>\s*<\/sourcetrack>/.test(x), 'channel 2 from the file');
  assert.ok(x.includes('<label2>Iris</label2>'), 'Resolve’s Navy is Premiere’s Iris');
  assert.ok(/<value>0\.5\d*<\/value>/.test(x), '-6 dB as Premiere’s level');
  const back = N.read(x, 'xmeml');
  assert.strictEqual(back.media[back.video[0].clips[0].media].path, 'D:/Shoot/a b.mov');
  assert.strictEqual(Math.round(back.audio[0].clips[0].gainDb), -6);
});

test('nle-xml: FCPXML for Final Cut Pro – gaps fill the storyline, a timeline with only sound still has a storyline, and it’s valid', () => {
  const tl = N.blank({ name: 'Sound only', rate: { num: 30000, den: 1001 }, drop: true, tcStart: 107892 });
  const m = N.addMedia(tl, { name: 'vo.wav', path: '/Audio/vo.wav', hasVideo: false, hasAudio: true, durationSec: N.Q(30) });
  tl.audio.push({ clips: [{ media: m, name: 'VO', at: 30, len: 300, in: 0 }] });
  tl.markers.push({ at: 10, dur: 0, name: 'Start', note: '' });
  const f = N.write(N.finish(tl), 'fcpxml');
  structureCheck(f.text); dtdCheck(f.text);
  assert.ok(/tcFormat="DF"/.test(f.text), 'drop frame kept');
  const back = N.read(f.text, 'fcpxml');
  assert.deepStrictEqual(back.audio[0].clips.map(c => [c.at, c.len, c.in]), [[30, 300, 0]]);
  assert.deepStrictEqual(back.markers.map(m => [m.at, m.name]), [[10, 'Start']]);
  assert.strictEqual(back.tcStart, 107892);
});

test('nle-xml: EDL – CMX 3600 lines Resolve and Premiere read, one picture track noted', () => {
  const tl = N.read(fixture('premiere-wedding.xml'), 'xmeml');
  const e = N.write(tl, 'edl');
  const lines = e.text.split('\r\n');
  assert.strictEqual(lines[0], 'TITLE: Wedding – first look'); assert.strictEqual(lines[1], 'FCM: NON-DROP FRAME');
  assert.strictEqual(lines[3], '001  AX       AA/V  C        14:02:20:05 14:02:26:05 01:00:00:00 01:00:06:00');
  assert.ok(lines.includes('* FROM CLIP NAME: Bride walks in'));
  assert.ok(lines.includes('* SOURCE FILE: /Volumes/Wedding SSD/Cam A/C0015.MP4'));
  assert.ok(e.notes.some(n => /one picture track/.test(n)));
});

test('nle-xml: relink – files that moved are found by name in the folder picked; the rest are listed', () => {
  const tl = N.read(fixture('premiere-wedding.xml'), 'xmeml');
  const r = N.relink(tl, p => p.startsWith('/New/'), ['/New/Cam A/C0012.MP4', '/New/b/c0015.mp4', '/New/other.mov']);
  assert.strictEqual(r.found, 2); assert.deepStrictEqual(r.missing, ['B_rings.mov']);
  assert.strictEqual(tl.media[tl.video[0].clips[1].media].path, '/New/b/c0015.mp4', 'names match whatever the case');
});

test('nle-xml: sniff – what a file is from its name or first lines', () => {
  assert.strictEqual(N.sniff('a.fcpxmld'), 'fcpxml');
  assert.strictEqual(N.sniff('a.xml', fixture('premiere-wedding.xml')), 'xmeml');
  assert.strictEqual(N.sniff('a.xml', fixture('fcp11-interview.fcpxml')), 'fcpxml');
  assert.strictEqual(N.sniff('a.edl'), 'edl'); assert.strictEqual(N.sniff('a.otio'), 'otio'); assert.strictEqual(N.sniff('a.aaf'), 'aaf');
  assert.strictEqual(N.sniff('notes.txt', 'hello'), '');
  assert.throws(() => N.read('<html/>', 'xmeml'), /Not an FCP 7 XML/);
});
