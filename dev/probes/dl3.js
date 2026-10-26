window.__hotFiles = ['jsx/tools/finish.jsx', 'js/tools/33-deliver.js'];
const fs = require('fs'), path = require('path');
const seqs = await US.host.call('listSequences'); const s = seqs.find(x => x.name === 'Me Deliver Test');
await US.host.call('openSequence', { seqId: s.id }); await US.refreshContext();
const res = await US.jobs.run({ title: 'Exporting the delivery pack (test 2)', tool: 'deliver' }, job => US.actions.get('deliver.pack').run({ outputs: 'v916,s11,p45' }, job));
return { res, files: res && res.dir ? fs.readdirSync(res.dir) : [], log: US.log.entries().slice(-2).map(e => e.text + ' ' + e.detail) };
