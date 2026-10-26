window.__hotFiles = ['js/tools/30-safezones.js'];
US.tools.open('safezones');
const before = await US.host.call('guideStatus', { seqId: US.ctx.sequence.id });
const r = await US.actions.run('safezones.add', { crops: '9x16,1x1', apps: 'tiktok,reels' });
const after = await US.host.call('guideStatus', { seqId: US.ctx.sequence.id });
const hid = await US.host.call('showGuides', { seqId: US.ctx.sequence.id, show: false });
const afterHide = await US.host.call('guideStatus', { seqId: US.ctx.sequence.id });
const info = await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id });
return { before, r, after, hid, afterHide, tracks: info.video.map(t => ({ name: t.name, muted: t.muted, clips: t.clips.map(c => c.name + ' ' + c.start + '-' + c.end) })), dur: info.duration, log: US.log.entries().slice(-3).map(e => e.level + ': ' + e.text) };
