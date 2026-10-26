// Selects › Stills of the best frames: full-size PNGs from the source clips, active sequence kept, nothing left behind.
const S = US.selects, fs = T.fs;
const items = await T.importOnce(['C001_sharp_static', 'C007_reveal_pullback', 'C009_slow_pan_good'].map(n => T.media('concert', n + '.mp4')), 'Test – Selects');
const full = await US.host.call('itemsInfo', { ids: items.map(i => i.id) });
Object.assign(S.state.settings, { footage: 'concert', picky: 'normal', overrides: {}, heroCount: 5, autoCopies: true });
await S.analyse(full, 'stills test', US.jobs.testJob('selects'));
const activeBefore = (await US.host.call('context')).sequence;
const r = await S.makeOutputs({ stills: true, stillsMax: 4, tiers: 'all', order: 'score', markBest: false }, US.jobs.testJob('stills'));
T.assert(r.stillsDir && fs.existsSync(r.stillsDir), 'stills folder: ' + r.summary);
const files = fs.readdirSync(r.stillsDir).filter(f => f.endsWith('.png'));
T.assert(files.length >= 2 && files.length <= 4, 'up to 4 stills: ' + files);
for (const f of files) {
  const b = fs.readFileSync(T.path.join(r.stillsDir, f));
  T.assert(b.readUInt32BE(16) === 1920 && b.readUInt32BE(20) === 1080, `${f} is full size: ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`);
  const img = new Image(); img.src = 'data:image/png;base64,' + b.toString('base64'); await img.decode();
  const c = document.createElement('canvas'); c.width = 32; c.height = 18; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 18);
  const d = g.getImageData(0, 0, 32, 18).data; let m = 0; for (let i = 0; i < d.length; i += 4) m += d[i] + d[i + 1] + d[i + 2];
  T.assert(m / (d.length / 4) / 3 > 20, f + ' is a real picture, not black');
}
T.assert(/^001_/.test(files.sort()[0]), 'named best first: ' + files[0]);
const seqs = await US.host.call('listSequences');
T.assert(!seqs.some(s => s.name.startsWith('Ultra Studio stills')), 'the hidden sequences are gone');
T.assert(!(await US.host.call('listBins')).some(b => /\.stills/.test(b.path)), 'and their bin');
const activeAfter = (await US.host.call('context')).sequence;
T.assert(!activeBefore || (activeAfter && activeAfter.id === activeBefore.id), 'the active sequence is back');
fs.rmSync(r.stillsDir, { recursive: true, force: true });
return { summary: r.summary, files };
