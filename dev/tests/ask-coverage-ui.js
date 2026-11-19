// What Ask can run by itself, tool by tool, in the real panel (jsdom, dev/tests/panel-dom.js): every registered tool
// that isn't paused, the actions it gives Ask (US.actions.list()), and whether each really runs something or only
// opens its tab. Prints one JSON line: {table: [{tool, name, where, actions, runs, opensOnly, chat}], problems}.
// ask-coverage.test.js fails when a tool on the rail or in Advanced has nothing Ask can run and isn't on the
// commented allow-list there.
const { US, boot, errors } = require('./panel-dom');
(async () => {
  await boot();
  // an action that only opens its tab: its run is “open the tool, return a sentence” and nothing else
  const opensOnly = a => { const src = String(a.run || '').replace(/\s+/g, ' '); return /^(async\s*)?(\(?[\w\s,={}]*\)?)\s*=>\s*\{?\s*(US\.tools\.open|openStory|S\(\)\.open)\([^;]*\);?\s*return\s*\{\s*summary:/.test(src) || /^(async\s*)?\(?[\w\s,]*\)?\s*=>\s*\(\{\s*summary:/.test(src); };
  // the chat's own tools (US.chatTools, the edit planner, Story's readers) that do a tool's job without a panel action
  const CHAT = { assistant: ['edit', 'build', 'place', 'bins', 'find', 'recent', 'files', 'import', 'makebin', 'move', 'wait', 'later'], brollfinder: ['broll.search', 'broll.download'], youtube: ['download'], story: ['search', 'lines', 'themes', 'interviews', 'build'], footage: ['footage', 'look'], producer: ['notes', 'pickups', 'marknotes'], quickfx: ['edit'], markers: ['edit'] };
  const have = Object.assign({}, US.chat.TOOLS, US.chatTools || {}, (US.chatPersonas.producer || {}).tools || {});
  const table = US.tools.list().map(d => {
    const acts = US.actions.list().filter(a => a.tool === d.id);
    return { tool: d.id, name: d.name, where: US.PAUSED_TOOLS.includes(d.id) ? 'paused' : d.hidden ? 'hidden' : US.ADVANCED_TOOLS.includes(d.id) ? 'advanced' : 'rail',
      actions: acts.map(a => a.id), runs: acts.filter(a => !opensOnly(a)).map(a => a.id), opensOnly: acts.filter(opensOnly).map(a => a.id), chat: (CHAT[d.id] || []).filter(t => have[t]) };
  });
  console.log(JSON.stringify({ table, paused: US.PAUSED_TOOLS, errors: errors.slice(0, 5) }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ table: [], crash: String(e.stack || e) })); process.exit(0); });
