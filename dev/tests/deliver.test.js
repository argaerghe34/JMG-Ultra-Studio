const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/33-deliver.js']);
test('parses pasted client notes in many styles', () => {
  const n = US.deliver.parseNotes('0:12 lose the cough\n01:05 – swap the music here\n  and make it quieter\n[1:20-1:32] tighten this bit\n• 00:02:03:12: colour too warm\nGeneral: love it!\n@2:30 end card', 25);
  assert.strictEqual(n.length, 5);
  assert.deepStrictEqual(n.map(x => x.t), [12, 65, 80, 123.48, 150]);
  assert.strictEqual(n[1].text, 'swap the music here and make it quieter');
  assert.strictEqual(n[2].end, 92);
  assert.strictEqual(n[3].text, 'colour too warm General: love it!');
});
test('parses a Frame.io style CSV', () => {
  const n = US.deliver.parseNotes('Comment Number,Timecode,Name,Comment\n1,00:00:05:00,Sarah,"Cut this, please"\n2,00:01:00:12,Tom,Logo bigger', 25);
  assert.strictEqual(n.length, 2);
  assert.strictEqual(n[0].text, 'Sarah: Cut this, please');
  assert.ok(Math.abs(n[1].t - 60.48) < 1e-9);
});
test('detects notes written against a 01:00:00:00 start', () => {
  const n = US.deliver.parseNotes('01:00:12:00 a\n01:02:00:00 b', 25);
  assert.strictEqual(US.deliver.autoOffset(n, 300), -3600);
  assert.strictEqual(US.deliver.autoOffset(n, 7200), 0);
});
test('YouTube chapters start at 0:00 and flag short ones', () => {
  const c = US.deliver.chapters([{ start: 30, name: 'Family' }, { start: 95, name: 'Faith' }, { start: 100, name: '' }, { start: 200, name: 'Thanks' }], 260, 'named');
  assert.strictEqual(c.text, '0:00 Intro\n0:30 Family\n1:35 Faith\n3:20 Thanks');
  assert.strictEqual(c.problems.length, 0);
  const d = US.deliver.chapters([{ start: 0, name: 'A' }, { start: 5, name: 'B' }], 30, 'named');
  assert.ok(d.problems.length >= 2);
});
