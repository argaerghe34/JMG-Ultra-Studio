#!/bin/bash
# JMG Ultra Studio – removes the plugin from DaVinci Resolve Studio. Your settings and analysis results are kept in
# ~/Library/Application Support/JMG Ultra Studio (shared with Premiere; delete that folder too if you want them gone).
DEST="${ULTRA_TEST_BMD:-/Library/Application Support/Blackmagic Design/DaVinci Resolve}/Workflow Integration Plugins/com.jmgphotography.ultrastudio"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  SUDO=""; [ -w "$(dirname "$DEST")" ] || { echo "Your Mac password is needed to remove it from Resolve's plugin folder."; SUDO="sudo"; }
  if [ -L "$DEST" ]; then $SUDO rm "$DEST"; else $SUDO rm -rf "$DEST"; fi
  if [ -e "$DEST" ]; then echo "Couldn't remove it. Quit Resolve and try again."; else echo "✓ JMG Ultra Studio has been removed from Resolve. Restart Resolve."; fi
else
  echo "JMG Ultra Studio isn't installed in Resolve."
fi
read -n 1 -s -r -p "Press any key to close."
