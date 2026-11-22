/* JMG Ultra Studio – Selects › Check with a vision model on this computer: is each select usable B-roll?

   Selects grades footage by measuring it (focus, exposure, steadiness, faces, moves). This adds a second opinion from a
   vision model running on this computer – the one chosen in Settings › Vision & listening models (Gemma 4, SmolVLM,
   or the editor's own in Ollama / LM Studio). It is shown two or three small frames of each select and asked only
   about USABILITY and QUALITY as B-roll – sharp or soft, well or badly exposed, steady, well framed, something in the
   way, the camera still adjusting, anything happening – not to label what is in the shot.

   - Only on this computer: never the cloud, whatever the project's footage choice is. A model is never downloaded
     from here – with none installed, the card says where to get one.
   - What it says is kept per media file (on this computer), by the stretch it looked at: changing a slider re-grades
     and the opinion still applies to any select that mostly covers the same stretch.
   - How it counts (both switchable): “unusable” leaves a select out (listed under Left out, with why); “maybe”, or a
     low score, moves it down a grade; a clearly good one says so in its reasons. Nothing changes in the project.

   Pure pieces first (unit-tested: US.selectsLook._pure), then the work and the card (shown by 10-selects.js). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const VERSION = 1;
  const KIND = 'selects-look';
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const r1 = x => Math.round(x * 10) / 10;

  /* =================== pure pieces =================== */
  const PROBLEMS = ['blurry or out of focus', 'too dark', 'too bright', 'shaky', 'badly framed', 'something in the way', 'camera still adjusting', 'nothing happening', 'noisy or grainy', 'lens flare or glare', 'tilted horizon', 'someone looking at the camera'];
  const GOOD = ['sharp', 'well exposed', 'steady', 'well framed', 'something happening', 'nice light', 'clean background', 'cinematic'];
  const USABLE = ['yes', 'maybe', 'no'];
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['usable', 'score', 'problems', 'good', 'note'], properties: {
    usable: { type: 'string', enum: USABLE }, score: { type: 'integer' },
    problems: { type: 'array', items: { type: 'string', enum: PROBLEMS } }, good: { type: 'array', items: { type: 'string', enum: GOOD } }, note: { type: 'string' } } };
  const SYSTEM = 'You help a video editor choose B-roll. You see small frames from ONE short moment of footage, in time order. Judge only whether the moment is USABLE as B-roll and how good it looks – do not describe or label what is in it. ' +
    '"usable": "yes" (an editor could put it in a film as it is), "maybe" (usable with a flaw, or only at a push) or "no" (blurred, far too dark or bright, shaking, the subject blocked, the camera still finding focus or exposure, or nothing worth showing). ' +
    '"score": 1 (unusable) to 5 (beautiful, a shot an editor would want). "problems": the flaws you can actually see, from the list. "good": what is good about it, from the list. "note": at most twelve words on why. ' +
    'Judge only what the frames show; small frames look a little soft – only call a moment blurry when it clearly is. British English.';
  /** When to look inside a select: n frames spread over it, away from its very edges. -> seconds */
  function stillTimes(s, n = 3) {
    const a = +s.start, b = +s.end, d = Math.max(0, b - a);
    if (n <= 1 || d < 1) return [r1(a + d / 2)];
    const k = Math.min(n, d < 2.5 ? 2 : n);
    return Array.from({ length: k }, (_, i) => r1(a + d * (0.15 + 0.7 * i / (k - 1))));
  }
  function request(s, stills) {
    const user = [`A moment of “${s.clipName || 'a clip'}”, ${r1(s.end - s.start)} seconds long. ${stills.length === 1 ? 'One frame follows.' : stills.length + ' frames follow, in time order.'}`];
    for (const st of stills) { user.push(`Frame at ${r1(st.t - s.start)} s:`); user.push({ image: { data: st.data, mime: 'image/jpeg', w: st.w, h: st.h, note: `${s.clipName || 'clip'} ${US.fmtDur ? US.fmtDur(st.t, true) : st.t} (usability)` } }); }
    return { system: SYSTEM, user, schema: SCHEMA, maxTokens: 300, feature: 'Selects – usability' };
  }
  /** A model's answer, tidied: a known verdict, a score 1–5, only listed words; a verdict that disagrees with its own score is pulled in line. */
  function tidy(r) {
    let usable = USABLE.includes(r && r.usable) ? r.usable : '', score = Math.round(+(r && r.score));
    if (!(score >= 1 && score <= 5)) score = usable === 'yes' ? 4 : usable === 'no' ? 1 : usable === 'maybe' ? 3 : 0;
    if (!usable) usable = score >= 4 ? 'yes' : score >= 3 ? 'maybe' : score ? 'no' : '';
    if (usable === 'yes' && score <= 2) usable = 'maybe';
    if (usable === 'no' && score >= 4) usable = 'maybe';
    const list = (x, ok) => Array.from(new Set((Array.isArray(x) ? x : []).map(String).filter(v => ok.includes(v)))).slice(0, 4);
    return usable ? { usable, score, problems: list(r.problems, PROBLEMS), good: list(r.good, GOOD), note: clip(r.note, 120) } : null;
  }
  /** The opinion kept for a stretch that covers most of a select ({start, end, …} looks of its clip), or null. */
  function lookFor(s, looks) {
    let best = null, most = 0;
    const d = Math.max(0.1, s.end - s.start);
    for (const l of looks || []) { const o = Math.min(l.end, s.end) - Math.max(l.start, s.start); if (o > most) { most = o; best = l; } }
    return best && most >= 0.5 * Math.min(d, best.end - best.start) ? best : null;
  }
  const DOWN = { BEST: 'GOOD', GOOD: 'OK', OK: 'OK' };
  const said = l => (l.problems.length ? l.problems.join(', ') : l.note || 'looks unusable');
  /**
   * The grade with the vision model's opinion counted: result {selects, rejected, stats} -> a new one. lookOf(select)
   * -> the opinion or null. leaveOut: “no” leaves it out; weigh: “maybe” or a score of 2 or less moves it down a grade.
   * Every select it looked at carries .look; reasons say what it thought.
   */
  function adjust(result, lookOf, { leaveOut = true, weigh = true, by = 'the vision model' } = {}) {
    if (!result) return result;
    const keep = [], out = result.rejected.slice();
    for (const s0 of result.selects) {
      const l = lookOf(s0);
      if (!l) { keep.push(s0); continue; }
      const s = Object.assign({}, s0, { look: l, reasons: s0.reasons.slice() });
      const forced = !!(s.flags && s.flags.forced);   // kept by the editor: told, never moved
      if (l.usable === 'no' && leaveOut && !forced) { out.push(Object.assign({}, s, { why: `Unusable to ${by}: ${said(l)}` })); continue; }
      if (weigh && !forced && (l.usable === 'maybe' || l.score <= 2) && s.tier !== 'OK') { s.tier = DOWN[s.tier]; s.reasons.push(`down a grade – ${by}: ${said(l)}`); }
      else if (l.usable === 'yes' && l.score >= 4) s.reasons.push(`${by}: ${l.good.slice(0, 3).join(', ') || 'looks good'}`);
      else if (l.problems.length) s.reasons.push(`${by}: ${l.problems.slice(0, 2).join(', ')}`);
      keep.push(s);
    }
    const st = Object.assign({}, result.stats);
    if (keep.length !== result.selects.length || keep.some((s, i) => s.tier !== result.selects[i].tier)) {
      st.kept = keep.length; st.best = keep.filter(s => s.tier === 'BEST').length; st.good = keep.filter(s => s.tier === 'GOOD').length; st.ok = keep.filter(s => s.tier === 'OK').length;
      st.keptDur = keep.reduce((n, s) => n + (s.dur || s.end - s.start), 0);
    }
    st.looked = result.selects.filter(s => lookOf(s)).length;
    return Object.assign({}, result, { selects: keep, rejected: out, stats: st });
  }
  /** “30 usable · 12 maybe · 6 unusable” */
  function tally(looks) {
    const c = { yes: 0, maybe: 0, no: 0 };
    for (const l of looks) if (l && c[l.usable] != null) c[l.usable]++;
    return c;
  }

  /* =================== the model on this computer =================== */
  /** Who would look: {kind: 'helper'|'own'|'none', id, label, model, own, perAsk} – never the cloud. */
  function local() {
    const M = US.models;
    if (!M || !M.jobs) return { kind: 'none', id: '', label: '', why: 'no-models' };
    const look = M.jobs().look || '', own = /^own:/.test(look) ? look.slice(4) : '';
    const pick = /^us:/.test(look) && M.runtime.installed() ? M.get(look.slice(3)) : null;
    if (pick && M.installed(pick.id)) return { kind: 'helper', id: pick.id + '@' + pick.version, label: pick.name, model: pick, perAsk: Math.max(1, Math.min(3, pick.stillsPerAsk || 1)) };
    if (own) return { kind: 'own', id: 'own:' + own, label: `${own} (your own model)`, own, perAsk: 2 };
    return { kind: 'none', id: '', label: '', why: 'model' };
  }
  /** Seconds a look takes here: measured when the model has been timed on this computer, else its own guess. -> [low, high] per select */
  function secsPer(P) {
    const b = US.understand && US.understand.bench ? US.understand.bench().vision || {} : {}, m = P.model;
    const per = m && b[m.id] ? [b[m.id], b[m.id]] : m && m.assume ? m.assume : [3, 15];
    return [per[0] * P.perAsk + 1, per[1] * P.perAsk + 2];
  }
  /* routes (tests swap these) */
  const routes = {
    grab: (item, times) => US.footage.grab(item, times, { width: 640 }),
    async ask(P, req, { job } = {}) {
      if (P.kind === 'own') return US.ai.json(Object.assign({}, req, { use: { provider: 'local', model: P.own } }));
      const url = await US.models.start(P.model.id, { job });
      try { return await US.ai.localAt(Object.assign({}, req, { url, model: P.model.id })); } finally { US.models.touch(); }
    }
  };

  /* =================== what is kept: per media file, on this computer =================== */
  const keyOf = p => US.fsx.mediaKey(p) + '-v' + VERSION;
  const mem = new Map();
  function looksOf(p) {
    if (!p) return [];
    const k = keyOf(p);
    if (!mem.has(k)) { let d = null; try { d = US.cache.get(KIND, k); } catch (e) { d = null; } mem.set(k, (d && d.looks) || []); }
    return mem.get(k);
  }
  function keep(p, look) {
    const list = looksOf(p).filter(l => !(Math.abs(l.start - look.start) < 0.3 && Math.abs(l.end - look.end) < 0.3));
    list.push(look); list.sort((a, b) => a.start - b.start);
    mem.set(keyOf(p), list);
    try { US.cache.set(KIND, keyOf(p), { v: VERSION, looks: list }); } catch (e) { /* this session only */ }
  }
  /** Everything kept for some files taken away (the tests, and “Forget”). */
  function forget(paths) { for (const p of paths || []) { const k = keyOf(p); mem.delete(k); try { require('fs').unlinkSync(US.cache.file(KIND, k)); } catch (e) { /* not there */ } } }

  /* =================== settings =================== */
  const settings = () => Object.assign({ leaveOut: true, weigh: true, how: 30 }, US.settings.get('selects.look', {}));
  const setSetting = (k, v) => US.settings.set('selects.look', Object.assign(settings(), { [k]: v }));

  /* =================== Selects' side =================== */
  const SEL = () => US.selects;
  const itemOf = s => { const c = SEL().state.clips.find(x => (x.item.srcId || x.item.id) === s.clipId); return c ? c.item : null; };
  const pathOf = s => { const it = itemOf(s); return it ? it.path : ''; };
  /** The opinion for a select, from what is kept (any model on this computer – the newest). */
  const opinion = s => lookFor(s, looksOf(pathOf(s)));
  /** Called by Selects' rescore(): the grade with the opinions counted (nothing changes when nothing has been looked at). */
  function adjustResult(result) {
    if (!result || !result.selects) return result;
    const st = settings(), P = local();
    return adjust(result, opinion, { leaveOut: st.leaveOut, weigh: st.weigh, by: P.label ? P.label.replace(/ \(your own model\)$/, '') : 'the vision model' });
  }
  /** Which selects to look at: best first, those not looked at yet (or all with force), up to `how` (a number or 'all'). */
  function toCheck(selects, { how = 30, force = false } = {}) {
    const order = selects.slice().sort((a, b) => b.score - a.score);
    const want = how === 'all' ? order : order.slice(0, +how || 30);
    return want.filter(s => force || !opinion(s));
  }
  /**
   * Look at selects with the vision model on this computer, as a job. -> {summary, looked, counts}
   * list: the selects (else the current ones, as chosen by `how`).
   */
  async function check(job, { list = null, how = settings().how, force = false, plan: given = null } = {}) {
    const P = given || local();
    if (P.kind === 'none') throw new US.UserError('NOTHING_FOUND', { title: 'There’s no vision model on this computer yet.', action: 'Download one in Settings › Vision & listening models (Gemma 4 E2B is a good start), or choose your own model in Ollama or LM Studio there. Nothing is sent anywhere.' });
    const r = SEL().state.result;
    if (!list && !r) throw new US.UserError('NOTHING_FOUND', { title: 'There are no selects yet.', action: 'Press “Find selects” first.' });
    // every select the screen has, left-out ones too: the opinion is about the moment, not the grade
    const all = list || toCheck(r.selects, { how, force });
    if (!all.length) return { summary: 'Every select asked for has been looked at already', looked: 0, counts: tally([]) };
    const got = [];
    let failed = 0;
    for (let i = 0; i < all.length; i++) {
      job.check();
      const s = all[i], it = itemOf(s);
      job.set({ who: 'computer', msg: `${P.label} is looking at ${s.clipName} · ${i + 1} of ${all.length}` });
      job.progress(i / all.length);
      if (!it || !it.path) { failed++; continue; }
      const g = await routes.grab(it, stillTimes(s, P.perAsk));
      if (!g || !g.stills || !g.stills.length) { failed++; continue; }
      let ans = null;
      try { ans = tidy(await routes.ask(P, request(s, g.stills), { job })); }
      catch (e) { if (e && e.code === 'CANCELLED') throw e; if (e instanceof US.UserError && i === 0) throw e; ans = null; }
      if (!ans) { failed++; continue; }
      const look = Object.assign({ start: r1(s.start), end: r1(s.end), by: P.id, label: P.label, at: Date.now() }, ans);
      keep(it.path, look); got.push(look);
    }
    SEL().rescore();
    try { US.bus.emit('selects-look', {}); } catch (e) { /* no listeners */ }
    const c = tally(got);
    return { looked: got.length, counts: c, summary: `${P.label} on this computer looked at ${US.plural(got.length, 'select')}: ${c.yes} usable, ${c.maybe} maybe, ${c.no} unusable${failed ? ` · ${failed} couldn’t be looked at` : ''} · nothing left this computer` };
  }

  /* =================== on screen =================== */
  /** The pill on a select's row. */
  function pills(l) {
    if (!l) return [];
    const col = l.usable === 'yes' ? '#3ecf8e' : l.usable === 'maybe' ? '#f2b84b' : '#e2483f';
    const word = l.usable === 'yes' ? 'Usable' : l.usable === 'maybe' ? 'Maybe' : 'Unusable';
    return [ui.pill(`${word} ${l.score}/5`, col)].concat(l.problems.slice(0, 2).map(p => ui.pill(p, '#f2b84b')));
  }
  function goBtn(seen, todo, how, render) {
    const b = ui.actionButton(seen ? 'Look at more' : 'Check usability', () => US.jobs.run({ title: 'Checking usability on this computer', tool: 'selects' }, job => check(job, { how })).then(() => render()), { icon: 'search', block: false });
    b.setEnabled(todo.length > 0);
    return b;
  }
  /** The card under the selects. */
  function card({ render }) {
    const r = SEL().state.result;
    if (!r) return null;
    const st = settings(), P = local(), n = r.selects.length;
    const seen = r.selects.filter(s => s.look).length + r.rejected.filter(s => s.look).length;
    const how = st.how === 'all' ? 'all' : +st.how || 30;
    const todo = toCheck(r.selects, { how });
    const [lo, hi] = secsPer(Object.assign({ perAsk: 2 }, P));
    const time = todo.length ? `about ${US.fmtDur(todo.length * lo)}${hi > lo * 1.5 ? `–${US.fmtDur(todo.length * hi)}` : ''}${P.model && US.understand && US.understand.bench && (US.understand.bench().vision || {})[P.model.id] ? '' : ' (a guess – it hasn’t been timed on this computer)'}` : '';
    const howSeg = ui.segmented({ options: [{ value: 30, label: 'Best 30' }, { value: 100, label: 'Best 100' }, { value: 'all', label: `All ${n}` }], value: how, onChange: x => { setSetting('how', x); render(); } });
    const c = tally(r.selects.map(s => s.look).concat(r.rejected.map(s => s.look)));
    return h('div.card.sel-look', { dataset: { section: 'look' } },
      h('div.card-title', 'Check usability with a vision model', h('span.right', 'on this computer')),
      h('div.muted', 'A vision model running on this computer looks at two or three small frames of each select and judges it as B-roll: sharp or soft, exposure, shake, framing, something in the way, the camera still adjusting, anything happening. It doesn’t label what’s in the shot. Nothing leaves this computer.'),
      P.kind === 'none'
        ? h('div', ui.note('There’s no vision model on this computer yet. Download one in Settings › Vision & listening models (nothing downloads until you press Download there), or choose your own model in Ollama or LM Studio.', 'info'),
          h('div.row', ui.button('Vision & listening models', { small: true, onClick: () => US.tools.open('settings', { section: 'understand' }) })))
        : h('div',
          h('div.field-hint', `Model: ${P.label}`, ' · ', h('button.link-btn', { onclick: () => US.tools.open('settings', { section: 'understand' }) }, 'change')),
          ui.field('Look at', howSeg, todo.length ? `${US.plural(todo.length, 'select')} not looked at yet · ${time}` : 'Every one of these has been looked at.'),
          h('div.row', goBtn(seen, todo, how, render),
            seen ? ui.button('Look again', { small: true, kind: 'ghost', title: 'Ask again about the selects shown (best first, as many as chosen)', onClick: () => US.jobs.run({ title: 'Checking usability on this computer', tool: 'selects' }, job => check(job, { how, force: true })).then(() => render()) }) : null)),
      seen ? h('div.field-hint', `${US.plural(seen, 'select')} looked at: ${c.yes} usable, ${c.maybe} maybe, ${c.no} unusable.`) : null,
      ui.toggle({ label: 'Leave out what it calls unusable', hint: 'They move to “Left out”, with why – press Keep on one to bring it back.', value: st.leaveOut, onChange: x => { setSetting('leaveOut', x); SEL().rescore(); render(); } }),
      ui.toggle({ label: 'Let its view move the grade', hint: '“Maybe”, or a low score, moves a select down a grade (BEST to GOOD, GOOD to OK).', value: st.weigh, onChange: x => { setSetting('weigh', x); SEL().rescore(); render(); } }));
  }

  US.selectsLook = { VERSION, PROBLEMS, GOOD, local, check, adjustResult, opinion, pills, card, settings, setSetting, toCheck, looksOf, forget, routes,
    _pure: { stillTimes, request, tidy, lookFor, adjust, tally, SCHEMA, SYSTEM } };
})();
