const [c1] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Safe Zones', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: c1.id, in: 0, out: 8 }] });
await T.open(seq.id);
await T.action('safezones.add', { crops: '9x16,4x5', apps: 'tiktok,reels' });
let st = await US.host.call('guideStatus', { seqId: seq.id });
T.assert(st.length === 1 && !st[0].hidden, 'guide visible after adding');
await T.action('safezones.add', { crops: '9x16', apps: 'shorts' }); // replaces, doesn't stack
st = await US.host.call('guideStatus', { seqId: seq.id });
T.assert(st.length === 1, 'second guide reuses the same track');
await T.action('safezones.hide', {});
st = await US.host.call('guideStatus', { seqId: seq.id });
T.assert(st[0].hidden, 'guide hidden');
const info = await US.host.call('sequenceInfo', { seqId: seq.id });
// one clip in Premiere; in Resolve a still is laid 5 s at a time, so several pieces end to end
const g = info.video[st[0].track].clips;
T.near(g[0].start, 0, 0.05, 'guide starts at the start');
T.near(g[g.length - 1].end, info.duration, 0.05, 'guide covers the sequence');
T.assert(g.every((c, i) => !i || Math.abs(c.start - g[i - 1].end) < 0.05), 'no gaps between the pieces');
const n = await US.host.call('removeGuides', { seqId: seq.id });
T.assert(n === 1, 'guide removed');
// plain grey style
await T.action('safezones.add', { crops: '9x16', apps: 'tiktok', style: 'simple' });
let info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(info2.video.some(t => t.clips.some(c => /plain/.test(c.name))), 'plain guide placed');
// letterbox bars: own track, exported (not a guide), not flagged by Final Check
const lb = await T.action('safezones.letterbox', { ratio: 2.39, mode: 'bars' });
info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
const lbTrack = info2.video.find(t => t.name === 'Letterbox');
T.assert(lbTrack && lbTrack.clips.length >= 1 && lbTrack.clips.every(c => /^Ultra Letterbox 2\.39x1/.test(c.name)), 'letterbox on its own track (in Resolve in 5 s pieces): ' + JSON.stringify(info2.video.map(t => [t.name, t.clips.map(c => c.name)])));
await T.action('safezones.hide', {});
info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(!info2.video.find(t => t.name === 'Letterbox').muted, 'bars stay visible when guides are hidden');
const kinds = US.check.scan(info2, { longShot: 0, audioGap: 0.5, repeatMin: 0.5 }).map(i => i.kind);
T.assert(!kinds.includes('guide') && !kinds.includes('gap'), 'bars are not flagged: ' + kinds);
const again = await T.action('safezones.letterbox', { ratio: 1.85, mode: 'bars' });
info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(info2.video.filter(t => t.name === 'Letterbox').length === 1 && /1\.85x1/.test(info2.video.find(t => t.name === 'Letterbox').clips[0].name), 'changing the shape replaces the bars');
const rm = await US.host.call('removeGuides', { seqId: seq.id, prefix: 'Ultra Letterbox' });
T.assert(rm === 1, 'bars removed');
return { guideTrack: 'V' + (st[0].track + 1), letterbox: lb.summary };
