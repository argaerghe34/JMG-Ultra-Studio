const bins = await US.host.call('listBins');
const hb = bins.filter(b => /E2E output .* Special \/ Hero shots$/.test(b.path) || /E2E output \/ [^/]+ \/ Special \/ Hero shots$/.test(b.path));
const last = hb[hb.length - 1];
const items = await US.host.call('binItems', { binId: last.id, kinds: [], recursive: false });
const all = await US.host.call('binItems', { binId: last.id, kinds: ['video', 'audio', 'still', 'sequence', 'other'], recursive: false });
return { bin: last.path, n: items.length, names: items.map(i => i.name + ' ' + i.kind), all: all.length };
