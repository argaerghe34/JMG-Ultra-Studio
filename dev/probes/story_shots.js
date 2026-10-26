// Prepare Story for screenshots: import the two extra sample transcripts, find themes, fill the wall.
const st = US.story.loadState();
const base = require('path').join(US.host.extensionDir(), 'dev', 'test-media', 'transcripts');
const job = US.jobs.testJob('story');
if (st.transcripts.length < 3) await US.story.importFiles(job, ['Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map(f => require('path').join(base, f)));
await US.actions.get('story.themes').run({ useAI: false }, job);
US.story.fillWallFromThemes(4);
US.tools.open('story', { tab: 'transcripts' });
return { transcripts: st.transcripts.map(t => t.name + ' ' + t.lines.length), themes: st.themes.map(t => t.name + ':' + t.lineIds.length), wall: st.wall.columns.map(c => c.name + ':' + c.cards.length) };
