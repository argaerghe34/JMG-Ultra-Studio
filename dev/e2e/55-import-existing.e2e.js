// Importing a file that's already in the project, in the real editor: Premiere 2027 doesn't import it twice, so
// importFiles hands back the clip that's there (marked existing) – a whole clip of the file named like it, never one of
// Song Splitter's subclips of the same file – and a new file next to it comes back too, in the order asked.
const fs = require('fs');
const BIN = 'Test – Import twice';
const wav = T.media('audio', 'concert_set.wav'), mp4 = T.media('interview', 'I001_interview.mp4');
await T.importOnce([wav], 'Test – Audio');   // it's in the project somewhere already
const got = await US.host.call('importFiles', { paths: [wav, mp4], binPath: BIN });
const norm = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
T.assert(got.length >= 2, 'both files came back: ' + JSON.stringify(got.map(g => [g.name, g.existing])));
T.assert(norm(got[0].path) === norm(wav) && norm(got[1].path) === norm(mp4), 'in the order asked: ' + got.map(g => g.name).join(', '));
T.assert(!got[0].subclip, 'a whole clip of the file, not a subclip: ' + got[0].name);
T.assert(got[0].name === 'concert_set.wav', 'the clip named like the file: ' + got[0].name);
return got.map(g => `${g.name}${g.existing ? ' (already in the project)' : ' (imported)'}`);
