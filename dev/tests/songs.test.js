const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/11-audio-kit.js', 'js/tools/12-songs.js']);
const S = US.songSplitter;

test('song layers: songs numbered 1, 2, 3 (with their title once named), talk and applause too, quiet left out, colour by kind', () => {
  const res = { segments: [
    { type: 'talk', start: 0, end: 10, name: 'Talk' }, { type: 'song', start: 10, end: 200, name: 'Song 1' },
    { type: 'applause', start: 200, end: 210, name: 'Applause' }, { type: 'silence', start: 210, end: 220, name: 'Quiet' },
    { type: 'song', start: 220, end: 400, name: 'Hallelujah', named: true }, { type: 'song', start: 400, end: 600, name: 'Song 3' }
  ] };
  const L = S.layerSections(res, 5);
  assert.deepStrictEqual(L.map(x => [x.name, x.start, x.end, x.label]), [
    ['Talk', 5, 15, S.LAYER_LABEL.talk], ['1', 15, 205, S.LAYER_LABEL.song], ['Applause', 205, 215, S.LAYER_LABEL.applause],
    ['2 Hallelujah', 225, 405, S.LAYER_LABEL.song], ['3', 405, 605, S.LAYER_LABEL.song]]);
  assert.strictEqual(new Set(Object.values(S.LAYER_LABEL)).size, 3, 'three different colours');
});
