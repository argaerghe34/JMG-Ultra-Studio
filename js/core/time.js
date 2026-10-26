/* JMG Ultra Studio – timecode helpers (panel side). */
(function () {
  'use strict';
  const US = window.US;
  const TICKS = 254016000000;

  /** Seconds -> "HH:MM:SS:FF" (non-drop) at the given fps. */
  function toTC(sec, fps = 25) {
    const base = Math.round(fps) || 25;
    let frames = Math.round(Math.max(0, sec) * fps);
    const ff = frames % base; let s = Math.floor(frames / base);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); s %= 60;
    return [hh, mm, s, ff].map(n => String(n).padStart(2, '0')).join(':');
  }
  /** "01:02:03:12", "1:02:03", "02:03", "1:02:03.5", "75.5", "1h2m3s" -> seconds. Returns NaN if unreadable. */
  function parseTC(str, fps = 25) {
    const s = String(str).trim();
    if (!s) return NaN;
    let m = /^(\d+)h\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(s);
    if (m) return (+m[1]) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    m = /^(\d+)m\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(s);
    if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    const parts = s.split(/[:;]/);
    if (parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
    const n = parts.map(Number);
    if (n.length === 4) return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / (Math.round(fps) || 25);
    if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
    if (n.length === 2) return n[0] * 60 + n[1];
    return n[0];
  }
  /** "1:02" style for YouTube chapters */
  function toYouTube(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  US.time = { TICKS, toTC, parseTC, toYouTube, ticksToSec: t => Number(t) / TICKS, secToTicks: s => String(Math.round(s * TICKS)) };
})();
