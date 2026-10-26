window.__hotFiles = ['jsx/tools/finish.jsx'];
const a = await US.actions.run('safezones.add', { crops: '9x16', apps: 'shorts' });
const b = await US.actions.run('safezones.add', { crops: '9x16,4x5', apps: 'tiktok' });
const info = await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id });
return { tracks: info.video.map(t => t.name + ' muted=' + t.muted + ' ' + t.clips.map(c => c.name.slice(0, 40)).join(' | ')) };
