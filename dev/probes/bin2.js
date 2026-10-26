const bins = await US.host.call('listBins'); const root = bins[0];
const list = await US.host.call('binList', { binId: root.id, kinds: ['video'], recursive: true });
const info = list.length ? await US.host.call('itemsInfo', { ids: list.slice(0, 3).map(x => x.id) }) : [];
return { root, list: list.length, sample: list.slice(0, 3), info: info.map(i => i && { kind: i.kind, name: i.name, hasVideo: i.hasVideo }) };
