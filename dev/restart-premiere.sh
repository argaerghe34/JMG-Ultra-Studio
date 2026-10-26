#!/bin/bash
# Development only: saves the test project, quits Premiere, relaunches it on the test project
# and opens the JMG Ultra Studio panel. Needs the dev helper extension (port 8891).
# Usage: dev/restart-premiere.sh <path-to-cep.js>
CEP="$1"
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ="$DIR/test-project/UltraStudioTest.prproj"
TMP="$(mktemp -d)"

running() { ps -axo comm= | grep -Eq '/Contents/MacOS/Adobe Premiere Pro( [0-9]{4})?$'; }   # pgrep -x sees only "Adobe Premiere "
if running; then
  echo '(function(){ try { if (app.project) app.project.save(); } catch (e) {} app.quit(); return "quitting"; })()' > "$TMP/quit.jsx"
  CEP_TIMEOUT=15000 node "$CEP" 8891 jsx "$TMP/quit.jsx" || true
  for i in $(seq 1 60); do running || break; sleep 2; done
  if running; then
    # no answer (the helper isn't loaded, or a dialog): stop the main program by its exact process id
    for p in $(ps -axo pid=,comm= | grep -E '/Contents/MacOS/Adobe Premiere Pro( [0-9]{4})?$' | awk '{print $1}'); do kill -TERM "$p"; done
    for i in $(seq 1 20); do running || break; sleep 1; done
    for p in $(ps -axo pid=,comm= | grep -E '/Contents/MacOS/Adobe Premiere Pro( [0-9]{4})?$' | awk '{print $1}'); do kill -KILL "$p"; done
    sleep 2
  fi
  if running; then echo "Premiere did not quit"; exit 1; fi
fi
# the old panels can hold their debug ports for a moment; a new Premiere that finds them taken never opens them
for i in $(seq 1 30); do lsof -nP -iTCP:8890 -iTCP:8891 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done
open -a "Adobe Premiere Pro 2026" "$PROJ"
for i in $(seq 1 90); do curl -s --max-time 1 http://127.0.0.1:8891/json >/dev/null 2>&1 && break; sleep 2; done
# wait until the project is really open before opening the panel
echo '(function(){ return app.project && app.project.path ? "ready" : "wait"; })()' > "$TMP/ready.jsx"
for i in $(seq 1 60); do r=$(CEP_TIMEOUT=5000 node "$CEP" 8891 jsx "$TMP/ready.jsx" 2>/dev/null); [ "$r" = "ready" ] && break; sleep 2; done
echo "project: $r"
echo 'return window.openPanel();' > "$TMP/open.js"
node "$CEP" 8891 js "$TMP/open.js"
for i in $(seq 1 30); do curl -s --max-time 1 http://127.0.0.1:8890/json >/dev/null 2>&1 && { echo "panel up"; exit 0; }; sleep 1; done
echo "panel did not open"; exit 1
