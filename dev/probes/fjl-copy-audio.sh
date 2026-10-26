#!/bin/bash
# Renders one timeline's sound from a TEMPORARY COPY of the FJL project (the original is never opened or changed).
# The copy has its one missing file (on an unmounted drive) pointed at a stand-in image so Premiere opens it without
# a Link Media dialog. Run inside dev/with-premiere.sh.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="/Volumes/JGX10/FJL_Summer2026_Israel_24_7_26/Edit/FJL Summer 2026_1.prproj"
WORK="$1"; SEQ="$2"; OUT="$3"
COPY="$WORK/FJL copy for transcript.prproj"
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
print('copy written, missing paths replaced:', n)
EOF
CEP="$ROOT/dev/cep.js"; T="$(mktemp -d)"
open -a "Adobe Premiere Pro 2026" "$COPY"
printf '%s' '(function(){ return app.project ? String(app.project.path) : ""; })()' > "$T/active.jsx"
ok=""
for i in $(seq 1 90); do a=$(CEP_TIMEOUT=5000 node "$CEP" 8891 jsx "$T/active.jsx" 2>/dev/null); case "$a" in *"FJL copy for transcript"*) ok=1; break;; esac; sleep 2; done
[ -z "$ok" ] && { echo "The copy didn't open (Premiere may be showing a dialog)"; exit 1; }
echo "copy open"
sleep 3
q() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
cat > "$T/render.jsx" <<EOF
(function(){ try {
  if (String(app.project.path).indexOf('FJL copy for transcript') < 0) return 'wrong project active: ' + app.project.path;
  var s = null; for (var i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].name === $(q "$SEQ")) s = app.project.sequences[i];
  if (!s) return 'no sequence';
  var preset = UStudio.findPreset('Settings/EncoderPresets/MP3_mono_96kbps_nometadata.epr');
  var f = new File($(q "$OUT")); if (f.exists) f.remove();
  var r = ''; try { r = s.exportAsMediaDirect($(q "$OUT"), preset, 0); } catch (e) { r = 'threw ' + e; }
  return 'seq=' + s.name + ' dur=' + (Number(s.end) / 254016000000).toFixed(1) + 's zero=' + (Number(s.zeroPoint) / 254016000000) + ' export=' + r + ' size=' + new File($(q "$OUT")).length;
} catch (e) { return 'ERR ' + e + ' line ' + e.line; } })()
EOF
CEP_TIMEOUT=900000 node "$CEP" 8890 jsx "$T/render.jsx"
cat > "$T/close.jsx" <<'EOF'
(function(){ if (String(app.project.path).indexOf('FJL copy for transcript') < 0) return 'not closing: active is ' + app.project.path; app.project.closeDocument(0, 0); return 'closed copy; active now ' + (app.project ? app.project.name : 'none'); })()
EOF
node "$CEP" 8890 jsx "$T/close.jsx" || node "$CEP" 8891 jsx "$T/close.jsx"
rm -rf "$WORK"
