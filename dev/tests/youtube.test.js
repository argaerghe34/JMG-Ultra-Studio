// YouTube: links found in pasted text, yt-dlp's arguments (H.264 for Premiere, 4K converted, sound only), its output
// read, errors in plain words, and a whole run with a pretend yt-dlp: downloaded into the folder, imported into the bin.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { load, test } = require('./harness');
const US = load(['ui', 'app', 'js/tools/44-youtube.js']);
const Y = US.youtube;

test('links: watch, youtu.be, Shorts and playlists, each once, from any pasted text', () => {
  const got = Y.parseLinks('Here: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s\nyoutu.be/dQw4w9WgXcQ (same)\n<https://youtube.com/shorts/abcdefGHIJ1>, https://www.youtube.com/playlist?list=PL123abc and nothing else https://vimeo.com/123');
  assert.deepStrictEqual(got, ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'https://youtube.com/shorts/abcdefGHIJ1', 'https://www.youtube.com/playlist?list=PL123abc']);
  assert.deepStrictEqual(Y.parseLinks('nothing here'), []);
});

test('yt-dlp’s arguments: H.264 MP4 for Premiere, 4K converted to H.264, sound only; the folder, one video or the playlist', () => {
  const a = Y.argsFor('https://youtu.be/x', { folder: '/out', ffmpeg: '/t/ffmpeg' });
  const at = k => a[a.indexOf(k) + 1];
  assert.ok(/avc1/.test(at('-f')) && at('--merge-output-format') === 'mp4' && at('-P') === '/out' && at('--ffmpeg-location') === '/t/ffmpeg');
  assert.ok(a.includes('--no-playlist') && a[a.length - 1] === 'https://youtu.be/x' && a[a.length - 2] === '--');
  const b = Y.argsFor('u', { folder: '/o', quality: 'best', playlist: true });
  assert.ok(b.includes('--yes-playlist') && b[b.indexOf('--recode-video') + 1] === 'mp4' && /libx264/.test(b[b.indexOf('--postprocessor-args') + 1]) && /playlist_index/.test(b[b.indexOf('-o') + 1]));
  const c = Y.argsFor('u', { folder: '/o', quality: 'audio' });
  assert.ok(c.includes('-x') && c[c.indexOf('--audio-format') + 1] === 'm4a');
});

test('its output read: progress, title, the file (also one already there), errors in plain words', () => {
  assert.deepStrictEqual(Y.parseLine('US-PROG 500 1000 NA'), { kind: 'progress', f: 0.5 });
  assert.deepStrictEqual(Y.parseLine('US-PROG 500 NA 2000.0'), { kind: 'progress', f: 0.25 });
  assert.strictEqual(Y.parseLine('US-PROG 500 NA NA'), null);
  assert.deepStrictEqual(Y.parseLine('US-TITLE שלום – Live'), { kind: 'title', title: 'שלום – Live' });
  assert.deepStrictEqual(Y.parseLine('US-FILE C:\out\A [x].mp4'), { kind: 'file', file: 'C:\out\A [x].mp4' });
  assert.strictEqual(Y.parseLine('[download] C:\out\A [x].mp4 has already been downloaded').file, 'C:\out\A [x].mp4');
  assert.strictEqual(Y.parseLine('ERROR: [youtube] abc: Private video. Sign in').text, 'Private video. Sign in');
  assert.ok(/private/.test(Y.plainError('Private video. Sign in if you\'ve been granted access')));
  assert.ok(/Update the downloader/.test(Y.plainError('HTTP Error 403: Forbidden')));
});

test('a run: each link downloaded into the folder and imported into the bin; one that fails is said, the rest go on', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-')), fake = path.join(dir, 'fake-ytdlp.js');
  fs.writeFileSync(fake, `const a = process.argv.slice(2), url = a[a.length - 1], out = a[a.indexOf('-P') + 1];
if (/bad/.test(url)) { console.error('ERROR: [youtube] bad1234: Video unavailable'); process.exit(1); }
const f = require('path').join(out, 'Song [' + url.slice(-6) + '].mp4');
console.log('US-TITLE Song ' + url.slice(-6)); console.log('US-PROG 50 100 NA'); require('fs').writeFileSync(f, 'x'); console.log('US-PROG 100 100 NA'); console.log('US-FILE ' + f);`);
  const host = [], was = US.host.call;
  US.host.call = async (fn, a) => { host.push([fn, a]); return a.paths.map(p => ({ id: 'n' + host.length, name: path.basename(p) })); };
  const job = { cancelled: false, set() {}, progress() {}, check() {} };
  try {
    const r = await Y.run(job, { links: 'https://youtu.be/AAAAAAAA https://youtu.be/badbad12 https://youtu.be/BBBBBBBB', folder: path.join(dir, 'Downloads'), binId: 'b7', binName: 'Concert / YouTube', ytdlp: [process.execPath, fake] });
    assert.deepStrictEqual(host.map(h => [h[0], h[1].binId, path.basename(h[1].paths[0])]), [['importFiles', 'b7', 'Song [AAAAAA].mp4'], ['importFiles', 'b7', 'Song [BBBBBB].mp4']]);
    assert.ok(fs.existsSync(path.join(dir, 'Downloads', 'Song [AAAAAA].mp4')));
    assert.deepStrictEqual(r.failed.map(f => [f.url, /isn’t available/.test(f.why)]), [['https://youtu.be/badbad12', true]]);
    assert.strictEqual(r.summary, '2 videos in “Concert / YouTube” · 1 didn’t download');
    host.length = 0;
    await Y.run(job, { links: 'https://youtu.be/CCCCCCCC', folder: dir, ytdlp: [process.execPath, fake] });
    assert.deepStrictEqual(host[0][1].binPath, 'YouTube', 'no bin chosen: a new bin “YouTube”');
    await assert.rejects(Y.run(job, { links: 'no links', ytdlp: 'x' }), e => e.code === 'BAD_INPUT');
  } finally { US.host.call = was; }
});

test('age-restricted: signed in only for the videos that need it; with no sign-in set they’re handed back to ask, not an error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-age-')), fake = path.join(dir, 'fake.js'), seen = path.join(dir, 'seen.txt');
  fs.writeFileSync(fake, `const a = process.argv.slice(2), url = a[a.length - 1], out = a[a.indexOf('-P') + 1], fs = require('fs');
const signed = a.includes('--cookies-from-browser') || a.includes('--cookies');
fs.appendFileSync(${JSON.stringify(seen)}, url.slice(-8) + (signed ? ' signed ' + a[a.indexOf(a.includes('--cookies') ? '--cookies' : '--cookies-from-browser') + 1] : ' plain') + String.fromCharCode(10));
if (/AGE/.test(url) && !signed) { console.error('ERROR: [youtube] AGEAGE12: Sign in to confirm your age. This video may be inappropriate for some users.'); process.exit(1); }
const f = require('path').join(out, url.slice(-8) + '.mp4'); fs.writeFileSync(f, 'x'); console.log('US-TITLE ' + url.slice(-8)); console.log('US-FILE ' + f);`);
  const host = [], was = US.host.call;
  US.host.call = async (fn, a) => { host.push(path.basename(a.paths[0])); return [{ id: 'n' }]; };
  const job = { cancelled: false, set() {}, progress() {}, check() {} }, links = 'https://youtu.be/OKOKOK12 https://youtu.be/AGEAGE12';
  try {
    // no sign-in set: the ordinary one downloads; the age-restricted one comes back marked, nothing thrown
    let r = await Y.run(job, { links, folder: dir, ytdlp: [process.execPath, fake] });
    assert.deepStrictEqual(host, ['OKOKOK12.mp4']);
    assert.deepStrictEqual(r.failed.map(f => [f.url.slice(-8), f.signIn, /age-restricted/.test(f.why)]), [['AGEAGE12', true, true]]);
    const r2 = await Y.run(job, { links: 'https://youtu.be/AGEAGE12', folder: dir, ytdlp: [process.execPath, fake] });
    assert.strictEqual(r2.done.length, 0, 'only blocked ones: handed back to ask, not thrown');
    // signed in with a browser: tried plainly first, then signed in for the one that needs it
    fs.writeFileSync(seen, ''); host.length = 0;
    r = await Y.run(job, { links, folder: dir, ytdlp: [process.execPath, fake], signIn: 'browser', browser: 'firefox' });
    assert.deepStrictEqual(fs.readFileSync(seen, 'utf8').trim().split('\n'), ['OKOKOK12 plain', 'AGEAGE12 plain', 'AGEAGE12 signed firefox']);
    assert.deepStrictEqual(host, ['OKOKOK12.mp4', 'AGEAGE12.mp4']); assert.strictEqual(r.failed.length, 0);
    // a cookies file
    fs.writeFileSync(seen, '');
    await Y.run(job, { links: 'https://youtu.be/AGEAGE12', folder: dir, ytdlp: [process.execPath, fake], signIn: 'file', cookies: path.join(dir, 'cookies.txt'), signedIn: true });
    assert.deepStrictEqual(fs.readFileSync(seen, 'utf8').trim().split('\n'), ['AGEAGE12 signed ' + path.join(dir, 'cookies.txt')], 'asked for the sign-in just now: signed in straight away');
    assert.deepStrictEqual(Y.signInArgs({ signIn: 'off', browser: 'firefox' }), []);
    assert.deepStrictEqual(Y.signInArgs({ signIn: 'browser', browser: 'evil; rm' }), [], 'only known browsers');
    assert.ok(/Close that browser/.test(Y.plainError('ERROR: Could not copy Chrome cookie database. See …')));
  } finally { US.host.call = was; }
});
