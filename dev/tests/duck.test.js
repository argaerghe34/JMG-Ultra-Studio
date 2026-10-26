const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/11-audio-kit.js', 'js/tools/31-sound.js']);
const D = US.soundCheck;

test('speech stretches join when the gap is too short for the music to come back up', () => {
  assert.deepStrictEqual(D.speechRegions([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 3.5, end: 4 }, { start: 12, end: 15 }]),
    [{ start: 1, end: 8 }, { start: 12, end: 15 }], 'gaps of 1.5 s or less are bridged');
});

test('duck keyframes: down just before speech, back up after, inside the clip', () => {
  const regions = [{ start: 5, end: 8 }, { start: 12, end: 15 }];
  assert.deepStrictEqual(D.duckKeys(regions, { start: 0, end: 20 }), [
    { t: 4.6, duck: false }, { t: 5, duck: true }, { t: 8, duck: true }, { t: 8.8, duck: false },
    { t: 11.6, duck: false }, { t: 12, duck: true }, { t: 15, duck: true }, { t: 15.8, duck: false }]);
  // a clip that starts during speech starts ducked; one that ends during speech stays down to its end
  assert.deepStrictEqual(D.duckKeys(regions, { start: 6, end: 13 }), [{ t: 6, duck: true }, { t: 8, duck: true }, { t: 8.8, duck: false }, { t: 11.6, duck: false }, { t: 12, duck: true }, { t: 13, duck: true }]);
  assert.deepStrictEqual(D.duckKeys(regions, { start: 16, end: 30 }), [], 'no speech under it: no keys');
});

test('music tracks are the ones with audio-only files', () => {
  const info = { audio: [{ index: 0, clips: [{ path: '/c/I001_interview.mp4' }] }, { index: 1, clips: [{ path: '/m/Theme.wav' }, { path: '/m/Sting.mp3' }] }, { index: 2, clips: [] }] };
  assert.deepStrictEqual(D.musicTracks(info), [1]);
  // separately recorded interview sound is WAV too: a transcript, or a dialogue-like name, rules it out
  const rec = { audio: [{ index: 0, name: 'Audio 1', clips: [{ path: '/rec/ZOOM0001_Tr1.WAV' }] }, { index: 1, name: 'Lav', clips: [{ path: '/rec/lav.wav' }] }, { index: 2, name: 'Music', clips: [{ path: '/m/theme.mp4' }] }] };
  assert.deepStrictEqual(D.guessMusic(rec, new Set([0])), { tracks: [2], sure: true });
  assert.deepStrictEqual(D.guessMusic(rec).tracks, [0, 2], 'without transcripts the WAV is a guess…');
  assert.strictEqual(D.guessMusic(rec).sure, false, '…and not a sure one, so the Assistant asks');
});

test('the Assistant routes ducking and loudness fixes', () => {
  assert.strictEqual(US.actions.get('sound.duck').match('duck the music under the interviews by 15 dB').db, 15);
  assert.strictEqual(US.actions.get('sound.duck').match('check the sound'), null);
  assert.strictEqual(US.actions.get('sound.fix').match('fix the loudness for the podcast').target, 'podcast');
});
