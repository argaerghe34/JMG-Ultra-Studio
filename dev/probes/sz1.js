const seqs = await US.host.call('listSequences');
const s = seqs.find(x => x.name === 'Probe Build') || seqs[0];
await US.host.call('openSequence', { seqId: s.id });
await US.refreshContext();
US.tools.open('safezones');
await new Promise(r => setTimeout(r, 1500));
return { ctx: US.ctx.sequence, log: US.log.entries().slice(-4).map(e => e.level + ': ' + e.text + ' ' + e.detail) };
