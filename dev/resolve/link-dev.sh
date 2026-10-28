#!/bin/bash
# Development only: points DaVinci Resolve Studio at this source folder (instead of an installed copy), with the
# DevTools port 8892 on, so dev/cep.js 8892 … and node dev/e2e/run.js --resolve work.
# Makes the plugin folder in Resolve's Workflow Integration Plugins folder: its contents link to this repository
# (index.html, js, css, assets, resolve, CSXS, dev), with copies of resolve/plugin/main.js and preload.js (Electron
# must find index.html and the "debug" switch next to them), manifest.xml/package.json with the version filled in,
# and WorkflowIntegration.node from Resolve's Developer folder.
# Undo with dev/resolve/unlink-dev.sh. Restart Resolve to pick it up. After changing resolve/plugin/* or the version,
# run this again.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ID="com.jmgphotography.ultrastudio"
BMD="/Library/Application Support/Blackmagic Design/DaVinci Resolve"
PLUGINS="$BMD/Workflow Integration Plugins"
DEST="$PLUGINS/$ID"
WI="$BMD/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
PARK="$HOME/Library/Application Support/JMG Ultra Studio dev/installed-resolve-copy"
VER=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$ROOT/CSXS/manifest.xml" | cut -d'"' -f2)

[ -f "$WI" ] || { echo "No WorkflowIntegration.node at $WI – is DaVinci Resolve Studio installed?"; exit 1; }
if ps -axo comm= | grep -Eq '/Contents/MacOS/Resolve$'; then echo "Resolve is open: quit it first (it only reads plugins when it starts)."; exit 1; fi
SUDO=""
mkdir -p "$PLUGINS" 2>/dev/null || true
[ -w "$PLUGINS" ] || { echo "Resolve's plugin folder isn't writable: using sudo."; SUDO="sudo"; $SUDO mkdir -p "$PLUGINS"; }

# park an installed copy OUTSIDE the plugins folder (two plugins with the same id confuse Resolve)
if [ -d "$DEST" ] && [ ! -f "$DEST/.ultra-studio-dev" ]; then
  mkdir -p "$(dirname "$PARK")"; rm -rf "$PARK"
  $SUDO mv "$DEST" "$PARK"; $SUDO chown -R "$(id -u)" "$PARK" 2>/dev/null || true
  echo "Parked the installed copy in $PARK"
fi
$SUDO rm -rf "$DEST"
$SUDO mkdir -p "$DEST"
for f in index.html js css assets resolve CSXS dev; do $SUDO ln -sfn "$ROOT/$f" "$DEST/$f"; done
$SUDO cp "$ROOT/resolve/plugin/main.js" "$ROOT/resolve/plugin/preload.js" "$DEST/"
for f in manifest.xml package.json; do sed "s/__VERSION__/$VER/g" "$ROOT/resolve/plugin/$f" | $SUDO tee "$DEST/$f" >/dev/null; done
$SUDO cp "$WI" "$DEST/WorkflowIntegration.node"
echo "debug" | $SUDO tee "$DEST/debug" >/dev/null                       # opens the DevTools port 8892
echo "$ROOT" | $SUDO tee "$DEST/.ultra-studio-dev" >/dev/null           # marks this as the dev copy
echo "Linked for development: $DEST → $ROOT (version $VER, DevTools port 8892)."
echo "Restart Resolve, then Workspace › Workflow Integrations › JMG Ultra Studio. Use only the test project “JMG Ultra Studio Test”."
