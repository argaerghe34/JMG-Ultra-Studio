// Read Premiere transcripts from a COPY of one of the user's real Premiere 26 projects (scratchpad), inside the panel.
const f = '/private/tmp/claude-501/-Users-jgersch--claude-spares-spare-ZV76IQ/dfdca15a-57c0-4de5-9767-1734b1f0ead1/scratchpad/prproj/a.prproj.gz';
if (!require('fs').existsSync(f)) return 'copy not found';
const t0 = performance.now(); let ticks = 0;
const r = await US.transcript.readProjectTranscripts(f, { onProgress: () => ticks++ });
const ms = performance.now() - t0;
const lines = r.flatMap(t => US.transcript.toLines(t.segments, 'x'));
const t1 = performance.now(); const hits = US.transcript.search('family', lines).length; const th = US.transcript.themesOffline(lines, { max: 10 }).length;
return { transcripts: r.length, withPath: r.filter(t => t.path).length, lines: lines.length, readMs: Math.round(ms), progressTicks: ticks, searchAndThemesMs: Math.round(performance.now() - t1), hits, themes: th };
