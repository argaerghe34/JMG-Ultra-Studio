#!/bin/bash
# Development only: points Premiere at this source folder (instead of an installed copy) and installs the
# dev helper that opens the panel on launch, so dev/restart-premiere.sh, dev/e2e and dev/cep.js work.
# Undo with dev/unlink-dev.sh (then run the normal installer to get a clean installed copy back).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$E"
# park any installed copy OUTSIDE the extensions folder (two copies with the same ID stop the panel opening)
PARK="$HOME/Library/Application Support/JMG Ultra Studio dev/installed-copy"
[ -e "$E/JMGUltraStudio" ] && [ ! -L "$E/JMGUltraStudio" ] && { mkdir -p "$(dirname "$PARK")"; rm -rf "$PARK"; mv "$E/JMGUltraStudio" "$PARK"; }
[ -d "$E/JMGUltraStudio.installed" ] && { mkdir -p "$(dirname "$PARK")"; rm -rf "$PARK"; mv "$E/JMGUltraStudio.installed" "$PARK"; }
ln -sfn "$ROOT" "$E/JMGUltraStudio"
ln -sfn "$ROOT/dev/helper" "$E/JMGUltraStudioDevHelper"
echo "Linked for development (debug port 8890, helper 8891). Restart Premiere to pick it up."
