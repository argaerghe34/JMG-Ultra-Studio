#!/bin/bash
# Makes the speaker-labelled transcript of one FJL timeline from a TEMPORARY COPY of the project
# (the original is never opened or changed). Run inside dev/with-premiere.sh.
# Usage: fjl-copy-transcript.sh <work dir> <sequence name>
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="/Volumes/JGX10/FJL_Summer2026_Israel_24_7_26/Edit/FJL Summer 2026_1.prproj"
WORK="$1"; SEQ="$2"
COPY="$WORK/FJL Summer 2026 (temporary copy).prproj"
CEP="$ROOT/dev/cep.js"; T="$(mktemp -d)"
mkdir -p "$WORK"
python3 -I - "$SRC" "$COPY" <<'EOF'
import gzip, re, sys, os
src, dst = sys.argv[1], sys.argv[2]
x = gzip.open(src).read().decode('utf-8')
stand_in = os.path.expanduser('~/Library/Application Support/JMG Ultra Studio/guides/Ultra Letterbox 2.39x1 1920x1080.png')
n = 0
for p in set(re.findall(r'<(?:ActualMediaFilePath|FilePath)>([^<]+)</', x)):
    if p.startswith('/') and not os.path.exists(p):
        x = x.replace(p, stand_in); n += 1
with gzip.open(dst, 'wb') as f: f.write(x.encode('utf-8'))
print('temporary copy written; missing files stood in:', n)
EOF
# fresh panel so it runs the code on disk
node "$CEP" 8890 reload x >/dev/null; sleep 6
open -a "Adobe Premiere Pro 2026" "$COPY"
printf '%s' '(function(){ return app.project ? String(app.project.path) : ""; })()' > "$T/active.jsx"
ok=""
for i in $(seq 1 90); do a=$(CEP_TIMEOUT=5000 node "$CEP" 8891 jsx "$T/active.jsx" 2>/dev/null); case "$a" in *"temporary copy"*) ok=1; break;; esac; sleep 2; done
[ -z "$ok" ] && { echo "The copy didn't open"; exit 1; }
echo "copy open"; sleep 4
cat > "$T/run.js" <<EOF
await US.refreshContext();
if (!US.ctx.project || !/temporary copy/.test(US.ctx.project.path)) return { error: 'wrong project: ' + (US.ctx.project && US.ctx.project.path) };
const seqs = await US.host.call('listSequences');
const s = seqs.find(x => x.name === $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$SEQ"));
if (!s) return { error: 'no sequence' };
await US.host.call('openSequence', { seqId: s.id }); await US.refreshContext();
const t0 = performance.now();
const read = await US.actions.get('story.read').run({}, US.jobs.testJob('read'));
const tRead = (performance.now() - t0) / 1000;
const out = {};
for (const format of ['docx', 'txt']) {
  const r = await US.actions.get('story.timelineTranscript').run({ format, sequence: s.name }, US.jobs.testJob('tl'));
  out[format] = r;
}
const tl = await US.story.timelineTranscript(US.jobs.testJob('tl2'), { seqId: s.id });
const res = tl.result || tl;
return { read: read && read.summary, readSecs: tRead.toFixed(1), out, seq: s.name,
  stats: { paragraphs: (res.paragraphs || []).length, speakers: (res.speakers || []).length, missing: (res.missing || []).map(m => m.name || m), clips: (res.clips || []).length } };
EOF
CEP_TIMEOUT=900000 node "$CEP" 8890 js "$T/run.js"
cat > "$T/close.jsx" <<'EOF'
(function(){ if (String(app.project.path).indexOf('temporary copy') < 0) return 'not closing: active is ' + app.project.path; app.project.closeDocument(0, 0); return 'closed the copy; active now ' + (app.project ? app.project.name : 'none'); })()
EOF
node "$CEP" 8890 jsx "$T/close.jsx" || node "$CEP" 8891 jsx "$T/close.jsx"
rm -rf "$WORK"
