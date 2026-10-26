// Final Check › Check the project: unused clips, imported twice, and moving unused clips into a bin and back.
// a file no sequence ever uses (kept next to the test project, so it never goes offline)
const fresh = T.path.join(T.fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'tidy', 'C002_unused_copy.mp4');
const [mixed] = await T.importOnce([fresh], 'Test – Tidy');
const dup = (await US.host.call('importFiles', { paths: [T.media('concert', 'C001_sharp_static.mp4')], binPath: 'Test – Tidy' }))[0];
const a = US.check.audit((await US.host.call('tidyAudit')).items);
const inTidy = a.unused.filter(x => x.bin === 'Test – Tidy');
T.assert(inTidy.some(x => x.id === mixed.id), 'a clip in no sequence is listed as unused');
T.assert(a.duplicates.some(d => d.list.some(x => x.id === dup.id)), 'C001 is listed as imported twice');
T.assert(!a.unused.some(x => /^JMG Ultra Studio/.test(x.bin)), 'Ultra Studio’s own bins are left out');
T.assert(!a.unused.some(x => /C001_sharp_static/.test(x.name) && x.id !== dup.id && x.bin !== 'Test – Tidy' && x.used), 'used clips are not unused');
// move the unused clip and put it back
const n = await US.host.call('tidyMove', { ids: [mixed.id], binPath: 'Unused E2E' });
let b = US.check.audit((await US.host.call('tidyAudit')).items).unused.find(x => x.id === mixed.id);
T.assert(n === 1 && b.bin === 'Unused E2E', 'moved into the Unused bin: ' + b.bin);
await US.host.call('tidyMove', { ids: [mixed.id], binPath: 'Test – Tidy' });
b = US.check.audit((await US.host.call('tidyAudit')).items).unused.find(x => x.id === mixed.id);
T.assert(b.bin === 'Test – Tidy', 'and back: ' + b.bin);
return { clips: a.clips, sequences: a.sequences, unused: a.unused.length, offline: a.offline.length, twice: a.duplicates.length };
