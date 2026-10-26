const bins = await US.host.call('listBins');
const bin = bins.find(b => b.path === 'Test – Selects');
const items = await US.host.call('binItems', { binId: bin.id, kinds: [], recursive: false });
const c6 = items.find(i => i.name === 'C006_whip_pan.mp4');
const r = await US.host.call('createSubclips', { binPath: 'Test – Selects/probe', items: [{ id: c6.id, start: 0, end: 3, name: 'PROBE_START0', label: 11 }, { id: c6.id, start: 0.001, end: 3, name: 'PROBE_START0001', label: 11 }, { id: c6.id, start: 5.9, end: 8, name: 'PROBE_59', label: 11 }] });
return r;
