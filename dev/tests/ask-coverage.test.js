// Ask can use every tool by itself: walks the registered tools in the real panel (ask-coverage-ui.js) and fails when a
// tool on the rail or in Advanced has nothing Ask can run – only an action that opens its tab, or nothing at all –
// unless it is on the list below, with the reason. Paused tools are left out here exactly as US.actions.list() leaves
// them out of Ask; they join by themselves when un-paused (their actions are already registered).
const assert = require('assert');
const cp = require('child_process'), path = require('path');
const { test } = require('./harness');

// Tools with no panel action of their own, and why that is right. A tool listed with chat tools is run through those.
const ALLOW = {
  storylines: 'Pro View is a table for the editor to look at and sort Story’s lines; Ask reads the same lines with search, lines, themes and interviews, and builds from them with build.',
  advanced: 'A menu of the tools in Advanced – nothing of its own to run.',
  quickfx: 'Quick effects are the edit planner’s own operations (effect, transition, motion, speed, volume…): Ask runs them with its edit tool, on a copy.',
  brollfinder: 'Run by the chat tools broll.search and broll.download (the finder’s own search and download code, in the background); the brollfinder.find action that opens the tab stays for the no-AI command.',
  youtube: 'Run by the chat tool download (the Download tab’s own downloader, in the background); youtube.open stays for the no-AI command.',
  settings: 'Settings are the editor’s own choices; Ask doesn’t change them. (Seeing-and-hearing has understand.run and understand.search.)'
};

test('every tool on the rail or in Advanced has something Ask can run by itself (or is on the list with a reason); the table of what it can run', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'ask-coverage-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let out; try { out = JSON.parse(last); } catch (e) { throw new Error('ask-coverage-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.ok(!out.crash, out.crash);
  assert.ok(out.table.length > 20, 'the tools were listed');
  const gaps = [], stale = [];
  for (const t of out.table) {
    if (t.where === 'paused') { assert.ok(out.paused.includes(t.tool)); continue; }
    const can = t.runs.length > 0 || t.chat.length > 0;
    if (!can && !ALLOW[t.tool]) gaps.push(`${t.name} (${t.tool}, ${t.where}): ${t.opensOnly.length ? 'only opens its tab – ' + t.opensOnly.join(', ') : 'no action at all'}`);
    if (ALLOW[t.tool] && t.runs.length > 0 && !t.chat.length && !['settings'].includes(t.tool)) stale.push(`${t.tool} is on the allow-list but now has actions that run: ${t.runs.join(', ')}`);
  }
  assert.deepStrictEqual(gaps, [], 'Ask can only open these, not run them:\n' + gaps.join('\n'));
  assert.deepStrictEqual(stale, [], stale.join('\n'));
  // the ones this round added
  const by = Object.fromEntries(out.table.map(t => [t.tool, t]));
  assert.ok(by.subclips.runs.includes('subclips.make') && by.mvfx.runs.includes('mvfx.add'), 'Subclip Maker and mVFX can be run');
  assert.deepStrictEqual([by.brollfinder.chat, by.youtube.chat], [['broll.search', 'broll.download'], ['download']]);
  for (const id of Object.keys(ALLOW)) assert.ok(by[id], `${id} (on the allow-list) is still a tool`);
});
