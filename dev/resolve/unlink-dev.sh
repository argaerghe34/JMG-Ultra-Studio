#!/bin/bash
# Development only: removes the dev plugin folder made by dev/resolve/link-dev.sh (only links and copies – the
# repository is never touched) and puts back an installed copy if there was one. Restart Resolve afterwards.
set -euo pipefail
ID="com.jmgphotography.ultrastudio"
PLUGINS="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
DEST="$PLUGINS/$ID"
PARK="$HOME/Library/Application Support/JMG Ultra Studio dev/installed-resolve-copy"
if ps -axo comm= | grep -Eq '/Contents/MacOS/Resolve$'; then echo "Resolve is open: quit it first."; exit 1; fi
SUDO=""; [ -w "$PLUGINS" ] || SUDO="sudo"
if [ -f "$DEST/.ultra-studio-dev" ]; then
  # rm -rf on the folder removes the symbolic links themselves, not what they point at
  $SUDO rm -rf "$DEST"
  echo "Removed the development plugin."
elif [ -e "$DEST" ]; then
  echo "$DEST is an installed copy, not the development one – left as it is."
fi
if [ -d "$PARK" ] && [ ! -e "$DEST" ]; then
  $SUDO mv "$PARK" "$DEST"; rmdir "$(dirname "$PARK")" 2>/dev/null || true
  echo "Put the installed copy back."
fi
echo "Restart Resolve."
