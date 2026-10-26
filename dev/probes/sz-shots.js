const seqs = await US.host.call('listSequences'); const s = seqs.find(x => x.name === 'E2E Safe Zones');
await US.host.call('openSequence', { seqId: s.id }); await US.host.call('setPlayhead', { seqId: s.id, seconds: 3 }); await US.refreshContext();
US.settings.set('safezones', Object.assign({}, US.settings.get('safezones', {}), { style: 'simple', crops: ['9x16', '1x1'], apps: ['tiktok', 'reels'] }));
US.settings.set('safezones.mode', 'social');
// re-create the screen so it picks up the settings
(0, eval)(require('fs').readFileSync(require('path').join(US.host.extensionDir(), 'js/tools/30-safezones.js'), 'utf8'));
US.tools.open('safezones');
await new Promise(r => setTimeout(r, 2500));
return 1;
