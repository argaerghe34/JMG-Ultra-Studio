#!/bin/bash
# Development only: the hand-over. Builds the package, installs it the way Jacob would (the Mac installer), checks the
# installed copy in Premiere with Home › Check my setup, then leaves Premiere closed and the Mac as he left it.
# It also builds the DaVinci Resolve package (dist/JMG-Ultra-Studio-Resolve-<version>.zip) for the release.
# Run the full e2e suite first (it needs the dev links): dev/with-premiere.sh node dev/e2e/run.js
# Usage: dev/monday.sh            (prints a summary; exit 1 if any step fails)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CEP="$ROOT/dev/cep.js"
E="$HOME/Library/Application Support/Adobe/CEP/extensions"
SET="$HOME/Library/Application Support/JMG Ultra Studio/settings.json"
TMP="$(mktemp -d)"
say() { echo "[$(date +%H:%M:%S)] $*"; }
fail() { say "FAILED: $*"; exit 1; }
# the main programs only, by full path (pgrep -x sees just "Adobe Premiere ", and helpers share the folder)
pids_of() { ps -axo pid=,comm= | grep -E "/Contents/MacOS/$1( [0-9]{4})?\$" | awk '{print $1}'; }
running() { [ -n "$(pids_of 'Adobe Premiere Pro')" ]; }

quit_premiere() {
  if running; then
    echo '(function(){ try { if (app.project) app.project.save(); } catch (e) {} app.quit(); return "quitting"; })()' > "$TMP/quit.jsx"
    CEP_TIMEOUT=15000 node "$CEP" 8891 jsx "$TMP/quit.jsx" >/dev/null 2>&1 || CEP_TIMEOUT=15000 node "$CEP" 8890 jsx "$TMP/quit.jsx" >/dev/null 2>&1 || true
    for i in $(seq 1 60); do running || break; sleep 2; done
    if running; then
      # stuck (a modal or a hang): stop it by its exact process id
      for p in $(pids_of 'Adobe Premiere Pro'); do kill -TERM "$p"; done; sleep 10
      for p in $(pids_of 'Adobe Premiere Pro'); do kill -KILL "$p"; done; sleep 2
    fi
  fi
  # a Media Encoder left from an earlier Premiere can block the next export: quit it too
  for p in $(pids_of 'Adobe Media Encoder'); do kill -TERM "$p"; done
  sleep 3
  running && fail "Premiere did not quit"
  return 0
}

say "1/7 Quitting Premiere and Media Encoder"
quit_premiere

say "2/7 Building"
bash "$ROOT/dev/build.sh" > "$TMP/build.log" 2>&1 || { cat "$TMP/build.log"; fail "build"; }
VER=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$ROOT/CSXS/manifest.xml" | cut -d'"' -f2)
PKG="$ROOT/dist/JMG Ultra Studio $VER"
tail -3 "$TMP/build.log"
# the Resolve package too: every release ships both (installed into Resolve separately – dev/resolve/installer)
node "$ROOT/dev/resolve/build.js" > "$TMP/build-resolve.log" 2>&1 || { cat "$TMP/build-resolve.log"; fail "Resolve build"; }
tail -2 "$TMP/build-resolve.log"

say "3/7 Installing with the Mac installer (as Jacob would)"
[ -L "$E/JMGUltraStudio" ] && rm "$E/JMGUltraStudio"          # the dev link; the helper stays for the check
rm -rf "$HOME/Library/Application Support/JMG Ultra Studio dev/installed-copy"
bash "$PKG/Install on Mac.command" < /dev/null > "$TMP/install.log" 2>&1
grep -q "is installed" "$TMP/install.log" || { cat "$TMP/install.log"; fail "installer"; }
grep "is installed" "$TMP/install.log"
[ -L "$E/JMGUltraStudio" ] && fail "the installed copy is still a link"
cp "$ROOT/.debug" "$E/JMGUltraStudio/.debug"                   # only for the check below

say "4/7 Checking the installed copy in Premiere"
[ -d "$E/JMGUltraStudioDevHelper" ] || ln -s "$ROOT/dev/helper" "$E/JMGUltraStudioDevHelper"
bash "$ROOT/dev/restart-premiere.sh" "$CEP" > "$TMP/start.log" 2>&1 || { cat "$TMP/start.log"; fail "Premiere / panel did not start"; }
cat > "$TMP/check.js" <<'EOF'
// the panel is still starting while Premiere loads: wait for its screen and the open project
for (let i = 0; i < 120 && !(document.querySelector('.rail') && US.ctx && US.ctx.project); i++) await new Promise(r => setTimeout(r, 500));
const dir = US.host.extensionDir();
US.tools.open('home'); await new Promise(r => setTimeout(r, 1500));
const root = document.querySelector('.tool:not(.hidden)');
[...root.querySelectorAll('button')].find(x => /Check my setup/.test(x.textContent)).click();
await new Promise(r => setTimeout(r, 1500));
for (let i = 0; i < 360 && US.jobs.current; i++) await new Promise(r => setTimeout(r, 500));
const rows = [...root.querySelectorAll('.list-row, .check-row, .selftest-row')].map(r => r.innerText.replace(/\n+/g, ' | '));
return JSON.stringify({ version: US.version, dir, rows });
EOF
CEP_TIMEOUT=300000 node "$CEP" 8890 js "$TMP/check.js" > "$TMP/check.out" 2>&1
cat "$TMP/check.out"
grep -q "$VER" "$TMP/check.out" || fail "installed panel did not report version $VER"
for want in "Connected to Premiere" "Premiere commands loaded" "Can save files" "Sound analysis works" "Picture analysis works" "export presets found"; do
  grep -q "$want" "$TMP/check.out" || fail "setup check: no \"$want\""
done

say "5/7 Quitting Premiere"
quit_premiere

say "6/7 Clearing development-only settings (Premiere is closed, so nothing writes them back)"
node -e '
const fs = require("fs"), f = process.argv[1];
const s = JSON.parse(fs.readFileSync(f, "utf8"));
if (s.seenVersion === process.argv[2]) delete s.seenVersion;   // so the What’s new card shows
delete s["overnight.report"];
fs.writeFileSync(f, JSON.stringify(s, null, 2));
console.log("settings: seenVersion=" + s.seenVersion + ", overnight.report cleared");' "$SET" "$VER"

say "7/7 Removing the check-only files"
rm -f "$E/JMGUltraStudio/.debug"
[ -L "$E/JMGUltraStudioDevHelper" ] && rm "$E/JMGUltraStudioDevHelper"
rm -rf "$HOME/Library/Application Support/JMG Ultra Studio dev"          # parked copies and dev notes
ls -la "$E" | grep -i ultra
say "Done: JMG Ultra Studio $VER installed and checked. Premiere is closed."
