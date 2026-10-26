// Assistant in real Premiere: typical sentences route to the right actions offline (nothing is run that changes the project),
// unknown actions are refused, and one read-only command runs end to end from the chat screen.
if (!US.assistant) throw new Error('Assistant is not loaded in the panel');
const ROUTES = {
  'cut the silences': 'silence.cut',
  'remove pauses longer than 1 second': 'silence.cut',
  'markers on every beat of the music': 'beats.markers',
  'check the cut': 'check.run',
  'compare the two versions': 'check.compare',
  'safe zones for Reels': 'safezones.add',
  'hide the safe zones': 'safezones.hide',
  'make youtube chapters': 'deliver.chapters',
  'split the concert into songs': 'songs.split',
  'check the sound levels': 'sound.check',
  'lines about volunteering': 'story.search',
  'find where they talk about faith': 'story.search',
  'find the themes': 'story.themes',
  'sort the selects into bins by theme': 'story.bins',
  'build a sequence from the themes': 'story.build',
  'read the transcripts': 'story.read'
};
const routed = {}, skipped = [];
for (const [text, want] of Object.entries(ROUTES)) {
  if (!US.actions.get(want)) { skipped.push(want); continue; } // that tool isn't loaded in this build
  const r = US.assistant.matchOffline(text);
  const got = r.steps.length ? r.steps[0].action : (r.alternatives.length ? 'ambiguous:' + r.alternatives.map(a => a.action).join('/') : 'nothing');
  T.assert(got === want, `"${text}" → ${got}, expected ${want}`);
  routed[text] = got;
}
T.assert(US.assistant.matchOffline('make me a cup of tea').steps.length === 0, 'nonsense matches nothing');
T.assert(US.assistant.matchOffline('lines about volunteering').steps[0].params.query === 'volunteering', 'search query extracted');

// a plan with an unknown action is cut down to known ones
const p = US.assistant.validatePlan({ reply: '', steps: [{ action: 'format.drive', paramsJson: '{}' }, { action: 'story.search', paramsJson: '{"query":"family"}' }] });
T.assert(p.steps.length === 1 && p.rejected[0] === 'format.drive', 'unknown action refused');

// run a read-only command from the chat screen: type, see the plan, press Run, see "done"
US.tools.open('assistant');
const view = document.querySelector('.chat').closest('.tool');
const input = view.querySelector('.chat-input');
input.value = 'lines about family';
input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await T.sleep(100);
const plans = view.querySelectorAll('.plan');
const plan = plans[plans.length - 1];
T.assert(plan && /Search the interviews/.test(plan.textContent), 'plan card shows the search step');
for (let i = 0; i < 50 && US.jobs.current; i++) await T.sleep(200);
plan.querySelector('.btn.primary').click();
let done = null;
for (let i = 0; i < 50 && !done; i++) { await T.sleep(100); const d = view.querySelectorAll('.bubble .done'); done = d.length ? d[d.length - 1].textContent : null; }
T.assert(done && /Search the interviews: \d+ lines? about “family”|Nothing found/.test(done), 'done bubble: ' + done);
T.assert(US.tools.current === 'story', 'opened Story › Search');
US.tools.open('assistant');
return { routed: Object.keys(routed).length, skipped, done };
