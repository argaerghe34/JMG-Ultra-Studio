// What was sent to AI, gathered by what the editor did: one group per job (with what it was about), requests outside a
// job grouped by feature when close together; and the few words on what a request is about.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
const US = load(['ai', 'js/tools/22-story-context.js']);
const m = 60000, T0 = 1e12;
const E = (id, at, feature, job, extra = {}) => Object.assign({ id, at: T0 + at, feature, provider: 'claude', chars: 1000, job }, extra);

test('grouped: an Agent run is one group with its subtitle; a lone request stays alone; nearby requests of one feature join', () => {
  const agent = { id: 'j1', title: 'Agent', about: 'Asking about Ruth’s interview · “a 2-minute film”' };
  const items = [E('a3', 10 * m, 'Agent', agent, { usd: 0.02 }), E('a2', 9 * m, 'Agent', agent, { usd: 0.03, ok: false }), E('a1', 8 * m, 'Agent', agent, { usd: 0.01 }),
    E('w1', 6 * m, 'Wiki', null, { usd: 0.05 }), E('t2', 2 * m, 'Find themes', null), E('t1', 1 * m, 'Find themes', null), E('t0', -20 * m, 'Find themes', null)];
  const g = US.ai.sent.groups(items);
  assert.deepStrictEqual(g.map(x => [x.title, x.items.length]), [['Agent', 3], ['Wiki', 1], ['Find themes', 2], ['Find themes', 1]]);
  assert.strictEqual(g[0].about, agent.about);
  assert.strictEqual(Math.round(g[0].usd * 100), 6); assert.strictEqual(g[0].failed, 1);
  assert.deepStrictEqual([g[0].from, g[0].to], [T0 + 8 * m, T0 + 10 * m]);
});

test('a request remembers the job it was part of', () => {
  const was = Object.getOwnPropertyDescriptor(US.jobs, 'current');
  Object.defineProperty(US.jobs, 'current', { configurable: true, get: () => ({ id: 'job-9', title: 'Looking it up', about: '“who is Max?”' }) });
  try {
    US.settings.set('ai.sentLog', true);
    const hnd = US.ai.sent.begin({ provider: 'claude', model: 'm', feature: 'Wiki', req: { system: 's', user: 'u' }, est: { inputTokens: 1, usd: 0 } });
    const e = US.ai.sent.list(hnd.key).find(x => x.id === hnd.id);
    assert.deepStrictEqual(e.job, { id: 'job-9', title: 'Looking it up', about: '“who is Max?”' });
  } finally { if (was) Object.defineProperty(US.jobs, 'current', was); else delete US.jobs.current; }
});

test('what a request is about: the interviews, people and themes it names; else the request, shortened', () => {
  const names = { interviews: ['Ruth Cohen', 'Sam interview', 'Leeds group'], people: ['Max'], themes: ['Family', 'Faith'] };
  const about = t => US.storyContext.about(t, { names });
  assert.strictEqual(about('Where did Ruth grow up?'), 'Asking about Ruth Cohen’s interview · “Where did Ruth grow up?”');
  assert.strictEqual(about('what does Sam say about faith'), 'Asking about Sam interview on the theme “Faith” · “what does Sam say about faith”');
  assert.strictEqual(about('who is Max?'), 'About Max · “who is Max?”');
  assert.strictEqual(about('Ruth and Sam on family'), 'Asking about Ruth Cohen and Sam interviews on the theme “Family” · “Ruth and Sam on family”');
  assert.strictEqual(about('a two minute film for the donors that ends on a hopeful note about the future of the street and the bakery'), '“a two minute film for the donors that ends on a hopeful note about…”');
  assert.strictEqual(about(''), '');
});
