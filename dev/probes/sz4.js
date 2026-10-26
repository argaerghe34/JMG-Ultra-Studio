const info = await US.host.call('sequenceInfo', { seqId: US.ctx.sequence.id });
return { dur: info.duration, tracks: info.video.map(t => t.name + ' muted=' + t.muted + ' ' + t.clips.map(c => c.name.slice(0, 30) + ' ' + c.start.toFixed(3) + '-' + c.end.toFixed(3)).join(' | ')), log: US.log.entries().slice(-2).map(e => e.text) };
