const shot = async () => { await new Promise(r => setTimeout(r, 250)); return 1; };
const st = US.story.loadState();
if (!st.themes.some(t => t.custom)) await US.story.addCustomTheme(US.jobs.testJob('story'), 'gratitude');
US.story.ensureColours(); US.story.save();
US.tools.open('story', { tab: arguments_tab });
document.querySelector('.view').scrollTop = arguments_scroll;
await shot();
return { cols: st.wall.columns.map(c => c.name + ':' + c.label), themes: st.themes.map(t => t.name + ':' + t.label) };
