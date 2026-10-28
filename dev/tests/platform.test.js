// js/core/platform.js: which editor the panel is in (US.app) and Resolve's words (US.say). The shared harness is
// always Premiere, so each editor gets its own fresh vm context here. Also runs dev/tests/home-ui.js (Home's
// "Check my setup" in Resolve, jsdom) in its own process.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const { test, ROOT } = require('./harness');

function platform(resolve) {
  const ctx = vm.createContext({ require, process, console, location: { pathname: '/Library/Plugins/com.x/index.html' }, document: { createTextNode: t => ({ nodeType: 3, textContent: t }) } });
  ctx.window = ctx; ctx.US = {};
  if (resolve) ctx.__ULTRA_RESOLVE__ = true;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'core', 'platform.js'), 'utf8'), ctx, { filename: 'platform.js' });
  return ctx.US;
}
const P = platform(false), R = platform(true);

test('US.app knows which editor it is in', () => {
  assert.strictEqual(P.app.id, 'premiere'); assert.ok(P.app.is('premiere') && !P.app.is('resolve'));
  assert.strictEqual(P.app.name, 'Premiere'); assert.strictEqual(P.app.full, 'Premiere Pro');
  assert.strictEqual(R.app.id, 'resolve'); assert.ok(R.app.is('resolve') && !R.app.is('premiere'));
  assert.strictEqual(R.app.name, 'Resolve'); assert.strictEqual(R.app.full, 'DaVinci Resolve Studio');
  assert.strictEqual(R.app.pluginDir(), '/Library/Plugins/com.x');
  for (const U of [P, R]) for (const f of ['pickFiles', 'openUrl', 'reveal']) assert.strictEqual(typeof U.app[f], 'function', f);
});

test('US.say changes nothing in Premiere', () => {
  for (const t of ['Pick a sequence.', 'Select clips in the Project panel.', 'Read Premiere’s transcripts', 'Media Encoder', '']) assert.strictEqual(P.say(t), t);
  assert.strictEqual(P.say(null), null); assert.strictEqual(P.say(3), 3);
});

test('US.say puts Premiere words into Resolve’s', () => {
  const cases = {
    'Pick a sequence.': 'Pick a timeline.',
    'Sequences': 'Timelines',
    'Make a new sequence from these clips': 'Make a new timeline from these clips',
    'NO SEQUENCE': 'NO TIMELINE',
    'Select clips in the Project panel or pick a bin, then try again.': 'Select clips in the Media Pool or pick a bin, then try again.',
    'Click into a sequence in the Timeline, then try again.': 'Open a timeline on the Edit page, then try again.',
    'Open or create a project in Premiere, then try again.': 'Open or create a project in Resolve, then try again.',
    'Reinstall or update Premiere Pro, then try again.': 'Reinstall or update Resolve, then try again.',
    'A Premiere export preset is missing.': 'A Resolve render preset is missing.',
    'Export presets': 'Render presets',
    'Premiere’s Auto Reframe': 'Resolve’s Smart Reframe',
    "Premiere's panel": 'Resolve’s panel',
    'Read Premiere’s transcripts': 'Read the transcripts',
    'Premiere’s transcripts are read on this computer.': 'The transcripts are read on this computer.',
    'Needs Premiere’s transcripts of these clips.': 'Needs the transcripts of these clips.',
    'Create H.264 proxies for it in Premiere (right-click › Proxy › Create Proxies), then try again.': 'Create H.264 proxies for it in Resolve (right-click it in the Media Pool › Generate Proxy Media), then try again.',
    'Relink them in Premiere: select › right-click › Link Media.': 'Relink them in Resolve: select › right-click in the Media Pool › Relink Selected Clips.',
    'Choose Window › Extensions › JMG Ultra Studio.': 'Choose Workspace › Workflow Integrations › JMG Ultra Studio.',
    'Add one with File › New › Adjustment Layer.': 'Add one with Effects › Toolbox › Effects › Adjustment Clip.',
    'Put adjustment layers on a track': 'Put adjustment clips on a track',
    'Send the renders to Media Encoder': 'Send the renders to Resolve’s render queue',
    '3 renders queued in Media Encoder – press its green Start button': '3 renders queued in Resolve’s render queue – press Render All on the Deliver page',
    'Off: the renders wait in Media Encoder’s queue.': 'Off: the renders wait in Resolve’s render queue.',
    'Open Media Encoder to see why.': 'Open the Deliver page to see why.',
    'Selects makes copies with Adobe Media Encoder': 'Selects makes copies with Resolve',
    'Presets you save in Media Encoder or Premiere’s Export screen are listed.': 'Presets you save in Resolve’s Deliver page are listed.',
    'You’ll see them in the Source Monitor and the Program Monitor.': 'You’ll see them in the Source Viewer and the Timeline Viewer.',
    'Skipped: 2 nested sequences, 1 sub-sequence': 'Skipped: 2 compound clips, 1 compound clip',
    'Premiere label colour': 'Resolve clip colour',
    'Label colours': 'Clip colours'
  };
  for (const [from, to] of Object.entries(cases)) assert.strictEqual(R.say(from), to, from);
});

test('US.say leaves other words alone', () => {
  for (const t of ['As a consequence', 'a sequencer', 'sequenced', 'Story › 2 Themes', 'premiere night', 'Timeline', 'Media Pool', 'adjustment', 'V1 and A1', 'In and Out'])
    assert.strictEqual(R.say(t), t, t);
  assert.strictEqual(R.say(null), null); assert.strictEqual(R.say(''), '');
});

test('US.say is stable when text passes through it twice (errors are translated, then shown)', () => {
  // every string literal in the panel's code: saying it twice is the same as once
  const files = ['js/core', 'js/tools'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, d, f)));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.){3,300})'|`((?:[^`\\]|\\.){3,300})`/g)) {
      const s = m[1] || m[2]; n++;
      const once = R.say(s);
      assert.strictEqual(R.say(once), once, `${path.basename(f)}: ${s}`);
      assert.ok(!/\bPremiere\b|\bMedia Encoder\b|\bProject panel\b|\b[Ss]equences?\b/.test(once), `${path.basename(f)} still has a Premiere word: ${once}`);
    }
  }
  assert.ok(n > 1000, 'read the panel’s strings (' + n + ')');
});

test('US.keep: names are shown as they are, in either editor', () => {
  const k = R.keep('Sequence 01 – Premiere night');
  assert.strictEqual(k.textContent, 'Sequence 01 – Premiere night');
  assert.strictEqual(R.keep(null).textContent, '');
});

test('Home’s “Check my setup” and the shell in Resolve (jsdom)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'home-ui.js')], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
