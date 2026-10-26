/* JMG Ultra Studio – Story exports: timecodes, a tiny ZIP writer and Word (.docx), text, subtitle and spreadsheet files.
   No libraries: a .docx is a ZIP of a few XML files, written here with Node's zlib. Pure functions, unit-tested. */
(function () {
  'use strict';
  const US = window.US;
  const zlib = require('zlib');

  /* ---------- timecode ---------- */
  /** seconds -> "HH:MM:SS:FF" (";" and drop-frame counting for 29.97/59.94 drop-frame) */
  function tc(sec, { fps = 25, drop = false } = {}) {
    const base = Math.round(fps) || 25;
    let frames = Math.floor(Math.max(0, sec) * (fps || 25) + 1e-6); // the frame the moment falls in, like Premiere's playhead
    if (drop && (base === 30 || base === 60)) {
      const d = base === 60 ? 4 : 2, perMin = base * 60 - d, per10 = base * 600 - d * 9;
      const tens = Math.floor(frames / per10), rem = frames % per10;
      frames += 9 * d * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
    }
    const ff = frames % base, s = Math.floor(frames / base), p = n => String(n).padStart(2, '0'), sep = drop ? ';' : ':';
    return p(Math.floor(s / 3600)) + sep + p(Math.floor((s % 3600) / 60)) + sep + p(s % 60) + sep + p(ff);
  }
  /** seconds -> "HH:MM:SS,mmm" */
  function srtTime(sec) {
    let ms = Math.round(Math.max(0, sec) * 1000);
    const h = Math.floor(ms / 3600000); ms %= 3600000; const m = Math.floor(ms / 60000); ms %= 60000; const s = Math.floor(ms / 1000); ms %= 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  /* ---------- ZIP ---------- */
  const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function dosDateTime(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  /** files: [{name, data: Buffer|string}] -> ZIP Buffer (deflate, UTF-8 names) */
  function zip(files, when = new Date()) {
    const { time, date } = dosDateTime(when);
    const locals = [], centrals = [];
    let offset = 0;
    for (const f of files) {
      const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
      const name = Buffer.from(f.name, 'utf8');
      const crc = crc32(data);
      let body = zlib.deflateRawSync(data), method = 8;
      if (body.length >= data.length) { body = data; method = 0; }
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
      lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
      ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
      locals.push(lh, name, body); centrals.push(ch, name);
      offset += lh.length + name.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
    return Buffer.concat(locals.concat([cd, end]));
  }

  /* ---------- Word (.docx) ---------- */
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  /** run: {text, bold, italic, color (hex without #), mono, size (half-points)} */
  function run(r) {
    const pr = [r.bold ? '<w:b/>' : '', r.italic ? '<w:i/>' : '', r.mono ? '<w:rFonts w:ascii="Menlo" w:hAnsi="Menlo" w:cs="Consolas"/>' : '', r.color ? `<w:color w:val="${r.color}"/>` : '', r.size ? `<w:sz w:val="${r.size}"/>` : ''].join('');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
  }
  /** paragraph: {style, runs:[run…], spaceAfter (twips)} */
  function para(p) {
    const pp = [p.style ? `<w:pStyle w:val="${p.style}"/>` : '', p.pageBefore ? '<w:pageBreakBefore/>' : '', p.spaceAfter != null ? `<w:spacing w:after="${p.spaceAfter}"/>` : ''].join('');
    return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${(p.runs || []).map(run).join('')}</w:p>`;
  }
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="666666"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="444444"/><w:sz w:val="22"/></w:rPr></w:style>
</w:styles>`;
  /** doc: {title, subtitle, blocks:[{heading} | {paragraph}]} -> .docx Buffer */
  function docx(doc) {
    const body = [];
    if (doc.title) body.push(para({ style: 'Title', runs: [{ text: doc.title }] }));
    if (doc.subtitle) body.push(para({ style: 'Subtitle', runs: [{ text: doc.subtitle }] }));
    for (const b of doc.blocks || []) body.push(b.heading ? para({ style: 'Heading1', runs: [{ text: b.heading }] }) : para(b.paragraph));
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: document },
      { name: 'word/styles.xml', data: STYLES }
    ]);
  }

  /* ---------- the four transcript formats ----------
     t: {title, sequence, project, date, speakers:[{name, talk}], paragraphs:[{start, end, name, text}],
         entries:[{start, end, name, text, clip, srcIn, srcOut}], seqTC(sec), srcTC(entry, sec)} */
  function toText(t) {
    const out = [t.title, `${t.sequence}${t.project ? ' · ' + t.project : ''} · ${t.date}`, '', 'Speakers:'];
    for (const s of t.speakers) out.push(`  ${s.name} – ${US.fmtDur(s.talk)}`);
    out.push('');
    for (const p of t.paragraphs) out.push(`${t.seqTC(p.start)}  ${p.name}: ${p.text}`, '');
    return out.join('\n');
  }
  /** Subtitles: one cue per line, split if longer than 7 s or 84 characters, speaker name first. */
  function toSRT(t) {
    const cues = [];
    for (const e of t.entries) {
      const words = e.text.split(/\s+/).filter(Boolean), dur = e.end - e.start;
      const parts = Math.max(1, Math.ceil(dur / 7), Math.ceil(e.text.length / 84));
      const per = Math.ceil(words.length / parts);
      for (let i = 0; i < parts && i * per < words.length; i++) {
        const w0 = i * per, w1 = Math.min(words.length, w0 + per);
        cues.push({ start: e.start + dur * w0 / words.length, end: e.start + dur * w1 / words.length, text: `${i === 0 ? e.name + ': ' : ''}${words.slice(w0, w1).join(' ')}` });
      }
    }
    return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(c.end, c.start + 0.3))}\n${c.text}\n`).join('\n');
  }
  function csvCell(s) { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function toCSV(t) {
    const rows = [['Timecode in', 'Timecode out', 'Speaker', 'Text', 'Source clip', 'Source timecode in', 'Source timecode out']];
    for (const e of t.entries) rows.push([t.seqTC(e.start), t.seqTC(e.end), e.name, e.text, e.clip, t.srcTC(e, e.srcIn), t.srcTC(e, e.srcOut)]);
    return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function toDocx(t) {
    const blocks = [{ heading: 'Speakers' }];
    for (const s of t.speakers) blocks.push({ paragraph: { spaceAfter: 40, runs: [{ text: s.name, bold: true }, { text: `  ${US.fmtDur(s.talk)} of talk`, color: '666666' }] } });
    blocks.push({ heading: 'Transcript' });
    for (const p of t.paragraphs) blocks.push({ paragraph: { runs: [{ text: t.seqTC(p.start) + '   ', mono: true, color: '808080', size: 18 }, { text: p.name + ': ', bold: true }, { text: p.text }] } });
    return docx({ title: t.title, subtitle: `${t.sequence}${t.project ? ' · ' + t.project : ''} · ${t.date}`, blocks });
  }

  /* ---------- the board as a paper edit ----------
     p: {title, project, date, groups:[{name, colour, hex, cards:[{idea} | {speaker, interview, clip, srcIn, srcOut, dur, text, strong, note}]}]}
     A card without a speaker (transcripts with no speaker names) leads with its clip instead. */
  const linesOf = g => g.cards.filter(k => k.idea == null);
  const lengthOf = g => linesOf(g).reduce((n, k) => n + (k.dur || 0), 0);
  function paperSummary(p) {
    const lines = p.groups.reduce((n, g) => n + linesOf(g).length, 0), dur = p.groups.reduce((n, g) => n + lengthOf(g), 0);
    return `${US.plural(p.groups.length, 'group')} · ${US.plural(lines, 'line')} · ${US.fmtDur(dur)} of talk`;
  }
  const groupHead = g => `${g.name} – ${US.plural(linesOf(g).length, 'line')} · ${US.fmtDur(lengthOf(g))}`;
  function paperText(p) {
    const out = [p.title, `${p.project ? p.project + ' · ' : ''}${p.date} · ${paperSummary(p)}`, '', '★ = one of the strongest lines', ''];
    for (const g of p.groups) {
      out.push(groupHead(g) + (g.colour ? ` (${g.colour})` : ''), '');
      let n = 0;
      for (const k of g.cards) {
        if (k.idea != null) { out.push(`   [Idea] ${k.idea}`, ''); continue; }
        out.push(`${++n}. ${k.speaker || k.clip}${k.interview ? ' (' + k.interview + ')' : ''}${k.speaker ? ' · ' + k.clip : ''} · ${k.srcIn}–${k.srcOut} (${US.fmtDur(k.dur)})${k.strong ? ' ★' : ''}`, `   “${k.text}”`);
        if (k.note) out.push(`   Note: ${k.note}`);
        out.push('');
      }
    }
    return out.join('\n');
  }
  function paperCSV(p) {
    const rows = [['Group', 'Order', 'Speaker', 'Interview', 'Clip', 'Source timecode in', 'Source timecode out', 'Seconds', 'Text', 'Strongest', 'Note']];
    for (const g of p.groups) {
      let n = 0;
      for (const k of g.cards) rows.push(k.idea != null ? [g.name, '', '', '', '', '', '', '', '[Idea] ' + k.idea, '', ''] : [g.name, ++n, k.speaker, k.interview, k.clip, k.srcIn, k.srcOut, (k.dur || 0).toFixed(1), k.text, k.strong ? 'yes' : '', k.note || '']);
    }
    return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function paperDocx(p) {
    const blocks = [{ paragraph: { runs: [{ text: '★ = one of the strongest lines. Timecodes are the source clip’s own.', color: '666666', size: 18 }] } }];
    for (const g of p.groups) {
      blocks.push({ paragraph: { style: 'Heading1', runs: [g.hex ? { text: '■ ', color: g.hex.replace('#', '') } : null, { text: g.name }, { text: `   ${US.plural(linesOf(g).length, 'line')} · ${US.fmtDur(lengthOf(g))}`, color: '808080', size: 20 }].filter(Boolean) } });
      let n = 0;
      for (const k of g.cards) {
        if (k.idea != null) { blocks.push({ paragraph: { runs: [{ text: 'Idea: ', bold: true, color: '8A6D00' }, { text: k.idea, italic: true }] } }); continue; }
        blocks.push({ paragraph: { spaceAfter: 20, runs: [{ text: `${++n}.  `, color: '808080' }, { text: k.speaker || k.clip, bold: true }, { text: `${k.interview ? '  ' + k.interview : ''}${k.speaker ? '  ·  ' + k.clip : ''}  ·  `, color: '666666', size: 18 }, { text: `${k.srcIn}–${k.srcOut}`, mono: true, color: '666666', size: 16 }, { text: `  (${US.fmtDur(k.dur)})${k.strong ? '  ★' : ''}`, color: '666666', size: 18 }] } });
        blocks.push({ paragraph: { spaceAfter: k.note ? 20 : 160, runs: [{ text: `“${k.text}”` }] } });
        if (k.note) blocks.push({ paragraph: { spaceAfter: 160, runs: [{ text: 'Note: ', bold: true, color: '666666', size: 18 }, { text: k.note, italic: true, color: '666666', size: 18 }] } });
      }
    }
    return docx({ title: p.title, subtitle: `${p.project ? p.project + ' · ' : ''}${p.date} · ${paperSummary(p)}`, blocks });
  }

  /* ---------- the interview log ----------
     g: {title, project, date, interviews:[{name, speakers, length, summary, summaryBy, topics:[{name, hex, count, at}],
         best:[{at, dur, speaker, text}], moments:[{type, at, text, why}], transcript:[{at, speaker, text}] | null}]} */
  function logSummary(g) {
    const total = g.interviews.reduce((n, i) => n + (i.length || 0), 0);
    return `${US.plural(g.interviews.length, 'interview')} · ${US.fmtDur(total)}`;
  }
  const interviewHead = (iv, n) => `${iv.number || n}. ${iv.name}`;   // number: as on the board (Interview 3)
  const whoLine = iv => [iv.speakers, US.fmtDur(iv.length)].filter(Boolean).join(' · ');
  function logText(g) {
    const out = [g.title, `${g.project ? g.project + ' · ' : ''}${g.date} · ${logSummary(g)}`, ''];
    g.interviews.forEach((iv, i) => {
      out.push('', `${interviewHead(iv, i + 1)} – ${whoLine(iv)}`, '');
      if (iv.summary) out.push(iv.summary, '');
      if (iv.topics.length) out.push('Talks about: ' + iv.topics.map(t => `${t.name} (${t.count}, from ${t.at})`).join(' · '), '');
      if (iv.best.length) { out.push('Strongest lines:'); for (const b of iv.best) out.push(`  ${b.at} (${US.fmtDur(b.dur)})  “${b.text}”`); out.push(''); }
      if (iv.moments.length) { out.push('Moments:'); for (const m of iv.moments) out.push(`  ${m.type} · ${m.at}  “${m.text}”${m.why ? ' – ' + m.why : ''}`); out.push(''); }
      if (iv.transcript) { out.push('Transcript:'); for (const p of iv.transcript) out.push(`  ${p.at}  ${p.speaker ? p.speaker + ': ' : ''}${p.text}`); out.push(''); }
    });
    return out.join('\n');
  }
  function logCSV(g) {
    const rows = [['Interview', 'Section', 'Timecode', 'Speaker', 'Text', 'Detail']];
    for (const iv of g.interviews) {
      rows.push([iv.name, 'About', '', iv.speakers, iv.summary || '', US.fmtDur(iv.length)]);
      for (const t of iv.topics) rows.push([iv.name, 'Theme', t.at, '', t.name, US.plural(t.count, 'line')]);
      for (const b of iv.best) rows.push([iv.name, 'Strongest', b.at, b.speaker, b.text, US.fmtDur(b.dur)]);
      for (const m of iv.moments) rows.push([iv.name, m.type, m.at, '', m.text, m.why || '']);
      for (const p of iv.transcript || []) rows.push([iv.name, 'Transcript', p.at, p.speaker, p.text, '']);
    }
    return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function logDocx(g) {
    const blocks = [], grey = { color: '666666', size: 18 }, tcRun = t => ({ text: t + '   ', mono: true, color: '808080', size: 16 });
    g.interviews.forEach((iv, i) => {
      blocks.push({ paragraph: { style: 'Heading1', pageBefore: !!(iv.transcript && i > 0), runs: [{ text: interviewHead(iv, i + 1) }, { text: '   ' + whoLine(iv), color: '808080', size: 20 }] } });
      if (iv.summary) blocks.push({ paragraph: { runs: [{ text: iv.summary, italic: true }].concat(iv.summaryBy ? [{ text: `  (summary by ${iv.summaryBy})`, color: '999999', size: 16 }] : []) } });
      if (iv.topics.length) {
        const runs = [{ text: 'Talks about:  ', bold: true, size: 20 }];
        iv.topics.forEach((t, k) => runs.push({ text: '■ ', color: (t.hex || '#999999').replace('#', ''), size: 20 }, { text: t.name, size: 20 }, { text: ` ${t.count} · ${t.at}${k < iv.topics.length - 1 ? '     ' : ''}`, color: '808080', size: 16 }));
        blocks.push({ paragraph: { runs } });
      }
      if (iv.best.length) {
        blocks.push({ paragraph: { style: 'Heading2', runs: [{ text: '★ Strongest lines' }] } });
        for (const b of iv.best) blocks.push({ paragraph: { spaceAfter: 60, runs: [tcRun(b.at), { text: `“${b.text}”` }, { text: `  ${US.fmtDur(b.dur)}`, ...grey }] } });
      }
      if (iv.moments.length) {
        blocks.push({ paragraph: { style: 'Heading2', runs: [{ text: 'Moments' }] } });
        for (const m of iv.moments) blocks.push({ paragraph: { spaceAfter: 60, runs: [tcRun(m.at), { text: m.type + ': ', bold: true }, { text: `“${m.text}”` }].concat(m.why ? [{ text: '  ' + m.why, ...grey }] : []) } });
      }
      if (iv.transcript) {
        blocks.push({ paragraph: { style: 'Heading2', runs: [{ text: 'Transcript' }] } });
        for (const p of iv.transcript) blocks.push({ paragraph: { spaceAfter: 80, runs: [tcRun(p.at)].concat(p.speaker ? [{ text: p.speaker + ': ', bold: true }] : [], [{ text: p.text }]) } });
      }
    });
    return docx({ title: g.title, subtitle: `${g.project ? g.project + ' · ' : ''}${g.date} · ${logSummary(g)}`, blocks });
  }

  US.storyExport = { tc, srtTime, crc32, zip, docx, toText, toSRT, toCSV, toDocx, paperText, paperCSV, paperDocx, paperSummary, logText, logCSV, logDocx, logSummary, EXT: { docx: 'docx', txt: 'txt', srt: 'srt', csv: 'csv' } };
})();
