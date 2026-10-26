#!/bin/bash
# Development only: opens a TEMPORARY COPY of the FJL project in Premiere (the original is never opened or changed;
# missing media is stood in so no Link Media dialog appears). Usage: fjl-open-copy.sh <work dir>
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="/Volumes/JGX10/FJL_Summer2026_Israel_24_7_26/Edit/FJL Summer 2026_1.prproj"
WORK="$1"; COPY="$WORK/FJL Summer 2026 (temporary copy).prproj"
CEP="$ROOT/dev/cep.js"; T="$(mktemp -d)"
mkdir -p "$WORK"
python3 -I - "$SRC" "$COPY" <<'PY'
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
PY
open -a "Adobe Premiere Pro 2026" "$COPY"
printf '%s' '(function(){ return app.project ? String(app.project.path) : ""; })()' > "$T/active.jsx"
for i in $(seq 1 90); do a=$(CEP_TIMEOUT=5000 node "$CEP" 8891 jsx "$T/active.jsx" 2>/dev/null); case "$a" in *"temporary copy"*) echo "copy open: $a"; exit 0;; esac; sleep 2; done
echo "The copy didn't open"; exit 1
