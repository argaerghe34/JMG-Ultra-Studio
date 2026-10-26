window.__hotFiles = ['jsx/tools/finish.jsx'];
await US.host.call('removeGuides', { seqId: US.ctx.sequence.id });
const r = await US.actions.run('safezones.add', { crops: '9x16', apps: 'shorts' });
const info = await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id });
return { dur: info.duration, guides: info.video.filter(t => t.name === 'Guides').map(t => t.clips.map(c => c.start + '-' + c.end)) };
