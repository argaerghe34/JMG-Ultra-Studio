/* JMG Ultra Studio – “Rough Cut”, the hidden game (Settings › Have a code? › game). Our own little game, made for
   Ultra Studio: the rushes roll past the playhead – hold to keep a good take in your cut, let go before a fluff gets
   in. Plain canvas, no libraries, no pictures or sounds, and this file is only read when the game is opened
   (js/extra is not loaded at start-up). The best score is kept in this computer's settings. */
(function () {
  'use strict';
  const US = window.US, h = US.h;
  const FLUFFS = ['um…', 'cough', 'boom in shot', 'phone rings', 'out of focus', 'siren', '“sorry, again”', 'lens cap', 'blinked', 'plane overhead'];
  const W = 560, H = 250, HEAD = 190, LANE = 78, LANE_H = 64;

  /** A new game. Everything the game knows is in here, so step() can be tested without a screen. */
  function fresh(rand) {
    return { t: 0, x: 0, speed: 130, score: 0, patience: 3, streak: 0, best: 0, over: false, clips: [], next: 320, n: 0, kept: [], msg: 'Hold to keep the good takes', msgT: 3, rand: rand || Math.random };
  }
  /** More rushes: good takes and fluffs in turn (sometimes two takes back to back), shorter as it speeds up. */
  function feed(s) {
    while (s.next < s.x + W * 1.5) {
      const good = s.n % 2 === 0 || s.rand() < 0.22, tight = Math.max(0.55, 1 - s.t / 150);
      const len = good ? (110 + s.rand() * 170) * tight + 50 : (45 + s.rand() * 80) * tight + 30;
      s.clips.push({ a: s.next, b: s.next + len, good, name: good ? 'Take ' + (1 + s.clips.filter(c => c.good).length) : FLUFFS[Math.floor(s.rand() * FLUFFS.length)], got: 0, hit: false });
      s.next += len + 14 + s.rand() * 30; s.n++;
    }
    while (s.clips.length && s.clips[0].b < s.x - HEAD - 40) s.clips.shift();
  }
  /** Move on by dt seconds, holding or not. */
  function step(s, dt, hold) {
    if (s.over) return s;
    s.t += dt; s.speed = 130 + Math.min(260, s.t * 4); s.msgT -= dt;
    const from = s.x, to = (s.x += s.speed * dt);
    feed(s);
    for (const c of s.clips) {
      const part = Math.max(0, Math.min(to, c.b) - Math.max(from, c.a));   // how much of it passed the playhead just now
      if (part > 0 && hold) {
        if (c.good) { c.got += part; s.score += part * 0.1 * (1 + Math.min(s.streak, 8) * 0.5); }
        else if (!c.hit) { c.hit = true; s.patience--; s.streak = 0; say(s, `“${c.name}” is in the cut. The client winces.`); if (s.patience <= 0) { s.over = true; s.best = Math.max(s.best, Math.round(s.score)); } }
      }
      if (!c.done && to >= c.b) {
        c.done = true;
        if (!c.good) continue;
        const share = c.got / (c.b - c.a);
        if (share > 0.9) { s.streak++; s.score += 5 * Math.min(s.streak, 8); say(s, s.streak > 1 ? `Clean take ×${s.streak}` : 'Clean take'); }
        else if (share < 0.25) s.streak = 0;
        if (share > 0.25) s.kept.push(share);
      }
    }
    return s;
  }
  function say(s, text) { s.msg = text; s.msgT = 1.6; }

  /* ---------- the screen ---------- */
  function draw(g, s, hold, css) {
    g.clearRect(0, 0, W, H);
    g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = css.text2; g.textAlign = 'left'; g.fillText('RUSHES', 12, LANE - 14);
    g.fillStyle = css.surface; g.fillRect(0, LANE, W, LANE_H);
    for (const c of s.clips) {
      const x = HEAD + (c.a - s.x), w = c.b - c.a;
      if (x > W || x + w < 0) continue;
      g.globalAlpha = c.good ? 0.85 : 0.75; g.fillStyle = c.good ? css.ok : css.err; g.fillRect(x, LANE + 4, w, LANE_H - 8);
      if (c.good && c.got) { g.globalAlpha = 1; g.fillStyle = css.accent; g.fillRect(x, LANE + LANE_H - 10, Math.min(w, c.got), 6); }
      g.globalAlpha = 1; g.fillStyle = css.bg; g.save(); g.beginPath(); g.rect(x, LANE, w, LANE_H); g.clip(); g.fillText(c.name, x + 6, LANE + LANE_H / 2 - 3); g.restore();
    }
    // the playhead, lit while you hold
    g.fillStyle = hold ? css.accentHi : css.text; g.fillRect(HEAD - 1, LANE - 8, hold ? 3 : 2, LANE_H + 16);
    g.beginPath(); g.moveTo(HEAD - 7, LANE - 8); g.lineTo(HEAD + 8, LANE - 8); g.lineTo(HEAD + 0.5, LANE + 2); g.fill();
    // your cut: one block per take kept, as tall as how much of it you got
    g.fillStyle = css.text2; g.fillText('YOUR CUT', 12, 176);
    s.kept.slice(-34).forEach((share, i) => { g.fillStyle = share > 0.9 ? css.ok : css.accent; g.fillRect(12 + i * 16, 222 - share * 30, 13, share * 30); });
    g.textAlign = 'right'; g.fillStyle = css.text; g.font = '700 16px system-ui, sans-serif';
    g.fillText(String(Math.round(s.score)), W - 12, 20);
    g.font = '600 12px system-ui, sans-serif'; g.fillStyle = css.text2;
    g.fillText(`best ${Math.max(s.best, Math.round(s.score))} · client’s patience ${'●'.repeat(Math.max(0, s.patience))}${'○'.repeat(3 - Math.max(0, s.patience))}`, W - 12, 40);
    g.textAlign = 'center';
    if (s.over) { g.fillStyle = css.text; g.font = '700 18px system-ui, sans-serif'; g.fillText('That’s a wrap', W / 2, 26); g.font = '600 12px system-ui, sans-serif'; g.fillStyle = css.text2; g.fillText(`${s.kept.length} takes in the cut · click or press Space to go again`, W / 2, 48); }
    else if (s.msgT > 0) { g.fillStyle = css.text; g.fillText(s.msg, W / 2, 26); }
  }

  function open() {
    const canvas = h('canvas.game-canvas', { width: W, height: H, tabIndex: 0, 'aria-label': 'Rough Cut: hold Space or the mouse button to keep the good takes' });
    const g = canvas.getContext && canvas.getContext('2d');
    const cs = getComputedStyle(document.documentElement), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const css = { bg: v('--bg', '#1e1e1e'), surface: v('--surface-2', '#333'), text: v('--text', '#eee'), text2: v('--text-2', '#aaa'), ok: v('--ok', '#3ecf8e'), err: v('--err', '#ff6363'), accent: v('--accent', '#7c6cf0'), accentHi: v('--accent-hi', '#9284ff') };
    const best = () => +US.settings.get('game.best', 0) || 0;
    let s = fresh(), hold = false, last = 0, alive = true, seen = false;
    s.best = best();
    const again = () => { s = fresh(); s.best = best(); };
    const down = () => { if (s.over) again(); else hold = true; }, up = () => { hold = false; };
    const key = e => { if (e.code !== 'Space' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown') { if (!e.repeat) down(); } else up(); };
    canvas.addEventListener('mousedown', e => { e.preventDefault(); canvas.focus(); down(); });
    window.addEventListener('mouseup', up); window.addEventListener('blur', up);
    document.addEventListener('keydown', key, true); document.addEventListener('keyup', key, true);
    const stop = () => { if (!alive) return; alive = false; window.removeEventListener('mouseup', up); window.removeEventListener('blur', up); document.removeEventListener('keydown', key, true); document.removeEventListener('keyup', key, true); };
    (function frame(now) {
      if (!alive) return;
      if (canvas.isConnected) seen = true; else if (seen) return stop();   // the window was closed
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;
      const was = s.over;
      if (!document.hidden) step(s, dt, hold);
      if (s.over && !was) { hold = false; if (s.best > best()) US.settings.set('game.best', s.best); }
      if (g) draw(g, s, hold, css);
      requestAnimationFrame(frame);
    })(0);
    US.ui.modal({ title: 'Rough Cut', wide: true,
      body: h('div.game-wrap', canvas, h('div.field-hint', 'The rushes roll past the playhead. Hold Space (or the mouse button) to keep a green take in your cut; let go before a red fluff reaches it. Whole takes in a row score more. Three fluffs in the cut and the client walks.')),
      buttons: [{ label: 'Back to work', value: 1, kind: 'primary' }] }).then(stop);
    setTimeout(() => canvas.focus && canvas.focus(), 50);
    return { canvas, stop, get state() { return s; } };
  }

  US.game = { open, fresh, step, feed };
})();
