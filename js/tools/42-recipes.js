/* JMG Ultra Studio – Recipes: a chain of steps saved under a name and run again on another project in one go –
   "transcripts → themes → moments → interview log", "check the cut → hide guides → delivery pack", or an Ask › Edit
   request. Steps are the same actions the Assistant runs ({action, params}) or an edit request ({edit, where}).
   Kept in Settings (not per project). The Assistant shows, saves and runs them (40-assistant.js). */
(function () {
  'use strict';
  const US = window.US;

  // ready-made recipes: copied when changed, never edited in place
  const STARTERS = [
    { id: 'starter-interviews', name: 'Get interviews ready', starter: true, steps: [{ action: 'story.read', params: {} }, { action: 'story.themes', params: {} }, { action: 'story.moments', params: {} }, { action: 'story.interviewLog', params: {} }] },
    { id: 'starter-stringout', name: 'Themes into a string-out', starter: true, steps: [{ action: 'story.themes', params: {} }, { action: 'story.build', params: { source: 'themes' } }] },
    { id: 'starter-deliver', name: 'Check and deliver', starter: true, steps: [{ action: 'check.run', params: {} }, { action: 'safezones.hide', params: {} }, { action: 'deliver.pack', params: {} }] }
  ];
  const mine = () => { const r = US.settings.get('recipes', []); return Array.isArray(r) ? r : []; };
  /** Every recipe: yours (newest first), then the starters whose actions exist here. */
  function list() {
    const ok = r => r.steps.every(s => s.edit != null || US.actions.get(s.action));
    return mine().slice().sort((a, b) => (b.at || 0) - (a.at || 0)).concat(STARTERS.filter(ok));
  }
  /** Only the parts a step needs, so a recipe saved from a plan doesn't carry anything else. */
  function cleanStep(s) {
    if (s && s.edit != null) return { edit: String(s.edit).trim(), where: s.where || 'sequence' };
    const a = s && US.actions.get(s.action);
    if (!a) return null;
    const params = {};
    for (const k of Object.keys(a.params || {})) if (s.params && s.params[k] != null && s.params[k] !== a.params[k].default) params[k] = s.params[k];
    return { action: a.id, params };
  }
  /** Save (or replace by name) a recipe. -> the recipe */
  function save({ name, steps }) {
    const clean = (steps || []).map(cleanStep).filter(Boolean);
    if (!clean.length) throw new US.UserError('BAD_INPUT', { title: 'There are no steps to save.' });
    const nm = String(name || '').trim() || `Recipe ${mine().length + 1}`;
    const r = { id: US.uid('r'), name: nm.slice(0, 60), steps: clean, at: Date.now() };
    US.settings.set('recipes', mine().filter(x => x.name.toLowerCase() !== r.name.toLowerCase()).concat([r]));
    return r;
  }
  function remove(id) { US.settings.set('recipes', mine().filter(r => r.id !== id)); }
  function rename(id, name) { US.settings.set('recipes', mine().map(r => (r.id === id ? Object.assign({}, r, { name: String(name).trim().slice(0, 60) || r.name }) : r))); }
  /** "Read transcripts → Find themes → …" */
  function describe(r) {
    const say = US.say || (x => x);
    return r.steps.map(s => (s.edit != null ? `Edit: “${s.edit.length > 40 ? s.edit.slice(0, 40) + '…' : s.edit}”` : say((US.actions.get(s.action) || {}).title || s.action))).join(' → ');
  }
  /**
   * Run a recipe's action steps one after another; an edit step is handed to onEdit (which shows the plan for checking
   * and resolves when it has run, or false to stop). Inside a running job (job given), each step runs in that job; otherwise
   * each step is its own job with its own status. -> {done, of, stoppedAt}
   */
  async function run(r, { onStep = () => {}, onEdit = null, job = null } = {}) {
    for (let i = 0; i < r.steps.length; i++) {
      const s = r.steps[i];
      onStep(i, s, 'start');
      if (s.edit != null) {
        if (!onEdit) return { done: i, of: r.steps.length, stoppedAt: i };
        const ok = await onEdit(s);
        if (ok === false) return { done: i, of: r.steps.length, stoppedAt: i };
        onStep(i, s, 'done', { summary: 'Edit done' });
        continue;
      }
      let out;
      if (job) { const a = US.actions.get(s.action); job.set({ msg: `${i + 1} of ${r.steps.length}: ${a.title}` }); out = await a.run(US.actions.normalize(a, s.params || {}), job); }
      else out = await US.actions.run(s.action, s.params || {});
      if (out === undefined) return { done: i, of: r.steps.length, stoppedAt: i };
      onStep(i, s, 'done', out);
    }
    return { done: r.steps.length, of: r.steps.length, stoppedAt: -1 };
  }

  US.actions.register({
    id: 'recipes.run', tool: 'assistant', title: 'Run a saved recipe', changes: true,
    describe: 'Runs a saved chain of steps (a recipe) by name.',
    params: { name: { type: 'string', default: '', desc: 'The recipe’s name' } },
    examples: ['run my interview prep recipe'],
    match: t => (/\brecipe\b/i.test(t) ? { name: t.replace(/.*\b(run|start|do|use)\s+(the|my)?\s*/i, '').replace(/\s*recipe\b.*/i, '').trim(), _score: 2.5 } : null),
    run: async (p, job) => {
      const q = String(p.name || '').toLowerCase(), r = list().find(x => x.name.toLowerCase() === q) || list().find(x => q && x.name.toLowerCase().includes(q));
      if (!r) throw new US.UserError('NOTHING_FOUND', { title: `There’s no recipe called “${p.name}”.`, action: 'Open Ask › Recipes to see them.' });
      const out = await run(r, { job });
      return { summary: out.stoppedAt < 0 ? `Recipe “${r.name}”: all ${US.plural(out.of, 'step')} done` : `Recipe “${r.name}” stopped at step ${out.stoppedAt + 1} of ${out.of}${r.steps[out.stoppedAt].edit != null ? ' – an edit step: run it from Ask › Recipes' : ''}` };
    }
  });

  US.recipes = { STARTERS, list, save, remove, rename, describe, run, cleanStep };
})();
