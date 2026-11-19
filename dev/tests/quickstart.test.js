// The quick start guide (QUICKSTART.md – GitHub, and Settings › Quick start in the panel) can't silently go out of date:
// the file is there and shipped, the Settings button opens it, and every name it puts in **bold** – a tab, a button, a
// Settings section, an installer file – still exists. When this fails after renaming or moving something, update
// QUICKSTART.md. A bold phrase ending in a full stop is a step's title, not a name, and isn't checked.
const { test } = require('./harness');
const cp = require('child_process'), fs = require('fs'), path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const GUIDE = path.join(ROOT, 'QUICKSTART.md');

let result = null;
function panel() {
  if (result) return result;
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'quickstart-ui.js')], { encoding: 'utf8', timeout: 180000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  try { result = JSON.parse(last); } catch (e) { throw new Error('quickstart-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  if (result.crash) throw new Error(result.crash);
  return result;
}
const norm = s => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const guide = () => fs.readFileSync(GUIDE, 'utf8');
const boldPhrases = () => Array.from(new Set((guide().match(/\*\*([^*]+)\*\*/g) || []).map(b => b.slice(2, -2).trim().replace(/:$/, ''))));
/** Every text the panel and the installers could show: js/, index.html, and the installers' names and contents. */
function corpus() {
  const out = [];
  const walk = d => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(n)) out.push(fs.readFileSync(p, 'utf8')); } };
  walk(path.join(ROOT, 'js'));
  out.push(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  for (const d of ['dev/installer', 'dev/resolve/installer']) for (const n of fs.readdirSync(path.join(ROOT, d))) { out.push(n); out.push(fs.readFileSync(path.join(ROOT, d, n), 'utf8')); }
  return norm(out.join('\n'));
}
// what the editors, the operating system and GitHub show – not ours to check
const OUTSIDE = ['Releases', 'Premiere Pro', 'DaVinci Resolve Studio', 'Resolve', 'Mac', 'Windows', 'Done', 'System Settings', 'Privacy & Security', 'Open Anyway', 'Extract All', 'More info', 'Run anyway', 'Yes', 'Window', 'Extensions', 'Workspace', 'Workflow Integrations', 'JMG Ultra Studio'];

test('the quick start guide is at the repository root, near the top of the README, and in every package', () => {
  assert.ok(fs.existsSync(GUIDE), 'QUICKSTART.md is missing');
  const md = guide();
  assert.ok(md.length < 8000, 'the quick start should stay short (one page), it is ' + md.length + ' characters');
  assert.ok(!/what's new|whats-new|\b1\.\d+\.\d+/i.test(md), 'no version history in the quick start');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), heads = readme.split('\n').filter(l => /^## /.test(l));
  assert.strictEqual(heads[0], '## Quick start', 'README.md should open with “## Quick start”');
  assert.ok(readme.includes('(QUICKSTART.md)'), 'README.md should link to QUICKSTART.md');
  for (const f of ['dev/build.sh', 'dev/win/build.js', 'dev/resolve/build.js']) assert.ok(/QUICKSTART\.md/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' doesn’t copy QUICKSTART.md into the package');
});

test('Settings › Quick start opens the guide in the panel, near the top; Search lists it; it’s found in packages and Resolve’s link', () => {
  const r = panel();
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.button, 'Settings has no “Open the quick start” button');
  assert.ok(r.cardIndex >= 0 && r.cardIndex <= 2, 'the Quick start card should be near the top of Settings, it is card ' + r.cardIndex);
  assert.strictEqual(r.modalTitle, 'Quick start');
  assert.ok(r.headings.length >= 5 && r.items >= 10, 'the guide didn’t render: ' + JSON.stringify(r.headings));
  assert.ok(!r.rawMarkdown, 'Markdown (** or ](…)) shows as text in the panel');
  assert.ok(r.closed, 'Close didn’t close it');
  assert.ok(r.inSearch, 'Search (⌘K) doesn’t list “Quick start”');
  assert.ok(r.foundDev && r.foundPackage && r.foundResolveLink, `not found: ${['foundDev', 'foundPackage', 'foundResolveLink'].filter(k => !r[k]).join(', ')}`);
});

test('every tab, button and Settings section the quick start names still exists', () => {
  const r = panel(), text = corpus(), settings = norm(r.settingsText);
  const placeByName = new Map(r.places.map(p => [p.name, p]));
  const toolNames = new Set(r.tools.flatMap(d => [d.name, d.short]).filter(Boolean));
  const bad = [];
  for (const phrase of boldPhrases()) {
    if (/\.$/.test(phrase)) continue;   // a step's title
    const parts = phrase.split(' › ').map(s => s.trim());
    const place = placeByName.get(parts[0]);
    if (place && parts.length > 1) {
      // “Edit › Silence Cut”: a tab of that place on the rail
      for (const p of parts.slice(1)) if (!place.tools.some(d => d.name === p || d.short === p)) bad.push(`“${phrase}”: ${p} isn’t a tab in ${place.name}`);
      continue;
    }
    if (parts[0] === 'Settings' && parts.length > 1) {
      for (const p of parts.slice(1)) if (!settings.includes(norm(p))) bad.push(`“${phrase}”: Settings has no “${p}”`);
      continue;
    }
    for (const p of parts) {
      if (placeByName.has(p) || toolNames.has(p) || OUTSIDE.includes(p)) continue;
      if (!text.includes(norm(p))) bad.push(`“${phrase}”: “${p}” isn’t anywhere in the panel or the installers`);
    }
  }
  assert.deepStrictEqual(bad, [], 'update QUICKSTART.md:\n  ' + bad.join('\n  '));
});

test('the quick start names every place on the rail, and every Story and Edit tab it names is where it says', () => {
  const r = panel(), md = guide();
  const missing = r.places.filter(p => !md.includes('**' + p.name + '**')).map(p => p.name);
  assert.deepStrictEqual(missing, [], 'QUICKSTART.md doesn’t mention these places on the rail: ' + missing.join(', '));
  // “Pro View is a tab inside Story” – the guide says so, so the rail must agree
  const story = r.places.find(p => p.id === 'story');
  assert.ok(story.tools.some(d => d.name === 'Pro View'), 'Pro View is no longer a tab in Story – update QUICKSTART.md');
  // the Settings sections it sends people to
  for (const s of ['Updates', 'AI (optional)', 'Vision & listening models', 'Take the tour', 'Full guide', 'Quick start', 'What was sent to AI']) assert.ok(norm(r.settingsText).includes(norm(s)), 'Settings has no “' + s + '”');
});
