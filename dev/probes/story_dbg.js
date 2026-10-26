const st = US.story.loadState();
const clips = await US.host.call('storyClips', {});
return { transcripts: st.transcripts.map(t => ({ name: t.name, path: t.path, key: t.key, item: t.itemId, n: t.lines.length })), clips: clips.filter(c => /I001/.test(c.name) || /I001/.test(c.path)).map(c => [c.id, c.name, c.bin, c.sub, c.path.slice(-40)]) };
