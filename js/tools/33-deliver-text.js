/* JMG Ultra Studio – Deliver › Episode text: titles, a description, show notes with times, YouTube chapters, pull
   quotes and social posts for the open sequence, from what is said in it (Story's transcripts of the clips used).
   Only that text goes to the AI. Without AI: chapters from your markers and the strongest lines as pull quotes.
   Pure logic here (unit-tested); the tab is in 33-deliver.js. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;
  const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0'); };

  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['titles', 'description', 'showNotes', 'chapters', 'quotes', 'social', 'keywords'],
    properties: {
      titles: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
      showNotes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'text'], properties: { at: { type: 'number' }, text: { type: 'string' } } } },
      chapters: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'title'], properties: { at: { type: 'number' }, title: { type: 'string' } } } },
      quotes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'speaker', 'text'], properties: { at: { type: 'number' }, speaker: { type: 'string' }, text: { type: 'string' } } } },
      social: { type: 'object', additionalProperties: false, required: ['short', 'linkedin', 'instagram'], properties: { short: { type: 'string' }, linkedin: { type: 'string' }, instagram: { type: 'string' } } },
      keywords: { type: 'array', items: { type: 'string' } }
    }
  };
  const SYSTEM = [
    'You write the text that goes with a video or podcast episode, for its editor to publish. You get what is said in the episode, paragraph by paragraph, with the time each starts (seconds from the start, and m:ss).',
    'Write in plain, natural British English that sounds like the people in it. Never invent facts, names, numbers or claims that aren’t said; quotes must be word for word from the transcript (you may cut words with “…”).',
    '- titles: 5 different titles, under 70 characters, specific to what is said – no clickbait, no emojis.',
    '- description: 2–4 short paragraphs for YouTube or a podcast page: what it is about, who speaks, why watch.',
    '- showNotes: 6–15 points in time order, each "at" the second where it starts, a sentence each.',
    '- chapters: YouTube chapters in time order – the first at 0, at least 3, each at least 10 seconds long, short titles (2–6 words).',
    '- quotes: 3–8 strong pull quotes (one to three sentences each), word for word, with who said them and "at".',
    '- social: "short" – a post under 250 characters; "linkedin" – 3–5 sentences; "instagram" – a caption of 2–4 sentences with up to 5 hashtags at the end.',
    '- keywords: 5–15 search keywords.'
  ].join('\n');
  /** What is said, as the AI reads it: "[m:ss | s] Name: words" per paragraph. */
  function listing(paras) { return paras.map(p => `[${mmss(p.start)} | ${Math.round(p.start)}] ${p.name || 'Speaker'}: ${String(p.text).replace(/\s+/g, ' ').trim()}`).join('\n'); }
  /** The request for the AI. */
  function request(paras, { title = '', notes = '' } = {}) {
    const extra = String(notes || '').trim();
    return { system: [{ text: SYSTEM, cache: true }], user: [`Episode: ${title || 'Untitled'}${extra ? `\nThe editor’s notes (tone, show name, links, what to mention): ${extra.slice(0, 4000)}` : ''}\n\nWHAT IS SAID:\n${listing(paras)}`], schema: SCHEMA, maxTokens: 8000, effort: 'low', feature: 'Episode text' };
  }
  /** The AI's answer tidied: times within the episode, chapters valid for YouTube, quotes that really are in the transcript. */
  function organise(r, paras, duration) {
    const within = t => Math.max(0, Math.min(duration || Infinity, +t || 0));
    const said = paras.map(p => String(p.text).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ')).join(' ');
    const isSaid = q => String(q).toLowerCase().split(/…|\.\.\./).map(x => x.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()).filter(x => x.split(' ').length >= 3).every(x => said.includes(x));
    let ch = (r.chapters || []).map(c => ({ t: within(c.at), title: String(c.title || '').replace(/\s+/g, ' ').trim() })).filter(c => c.title).sort((a, b) => a.t - b.t);
    // YouTube: the first at 0:00 (one in the first 10 s moves there), each at least 10 s long, none in the last 10 s
    if (ch.length && ch[0].t < 10) ch[0].t = 0; else ch.unshift({ t: 0, title: ch.length ? 'Intro' : 'Start' });
    if (duration) ch = ch.filter((c, i) => i === 0 || c.t <= duration - 10);
    const kept = []; for (const c of ch) if (!kept.length || c.t - kept[kept.length - 1].t >= 10) kept.push(c);
    ch = kept;
    return {
      titles: (r.titles || []).map(x => String(x).trim()).filter(Boolean).slice(0, 8),
      description: String(r.description || '').trim(),
      showNotes: (r.showNotes || []).map(n => ({ t: within(n.at), text: String(n.text || '').trim() })).filter(n => n.text).sort((a, b) => a.t - b.t),
      chapters: ch,
      quotes: (r.quotes || []).map(q => ({ t: within(q.at), speaker: String(q.speaker || '').trim(), text: String(q.text || '').trim() })).filter(q => q.text && isSaid(q.text)),
      social: { short: String((r.social || {}).short || '').trim(), linkedin: String((r.social || {}).linkedin || '').trim(), instagram: String((r.social || {}).instagram || '').trim() },
      keywords: (r.keywords || []).map(k => String(k).trim()).filter(Boolean).slice(0, 20),
      by: 'ai'
    };
  }
  /** Without AI: chapters from the sequence's named markers, the strongest lines as pull quotes. */
  function basic(paras, markers = []) {
    const ch = markers.filter(m => String(m.name || '').trim()).sort((a, b) => a.start - b.start).map(m => ({ t: m.start, title: m.name.trim() }));
    if (!ch.length || ch[0].t > 0.5) ch.unshift({ t: 0, title: 'Intro' }); else ch[0].t = 0;
    const lines = paras.flatMap(p => (p.entries || [{ start: p.start, end: p.end, text: p.text }]).map(e => ({ t: e.start, speaker: p.name, text: e.text, q: T().quality({ text: e.text, start: e.start, end: e.end }).score })));
    const quotes = lines.filter(l => l.text.split(/\s+/).length >= 8).sort((a, b) => b.q - a.q).slice(0, 6).sort((a, b) => a.t - b.t).map(({ q, ...x }) => x);
    return { titles: [], description: '', showNotes: [], chapters: ch, quotes, social: { short: '', linkedin: '', instagram: '' }, keywords: [], by: 'basic' };
  }
  /** Everything as one text file (Markdown). */
  function toText(pack, title) {
    const out = [`# ${title || 'Episode'}`, ''];
    if (pack.titles.length) out.push('## Title ideas', ...pack.titles.map(t => `- ${t}`), '');
    if (pack.description) out.push('## Description', pack.description, '');
    if (pack.chapters.length) out.push('## Chapters', ...pack.chapters.map(c => `${US.time && US.time.toYouTube ? US.time.toYouTube(c.t) : mmss(c.t)} ${c.title}`), '');
    if (pack.showNotes.length) out.push('## Show notes', ...pack.showNotes.map(n => `- ${mmss(n.t)} ${n.text}`), '');
    if (pack.quotes.length) out.push('## Pull quotes', ...pack.quotes.map(q => `> “${q.text}” – ${q.speaker || 'Speaker'} (${mmss(q.t)})`), '');
    const so = pack.social;
    if (so.short || so.linkedin || so.instagram) out.push('## Social posts', so.short ? `**Short:** ${so.short}` : '', so.linkedin ? `**LinkedIn:** ${so.linkedin}` : '', so.instagram ? `**Instagram:** ${so.instagram}` : '', '');
    if (pack.keywords.length) out.push('## Keywords', pack.keywords.join(', '), '');
    return out.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  }

  US.episodeText = { SCHEMA, SYSTEM, listing, request, organise, basic, toText, mmss };
})();
