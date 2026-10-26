#!/bin/bash
# JMG Ultra Studio – removes the panel from Premiere Pro. Your settings and analysis results are kept in
# ~/Library/Application Support/JMG Ultra Studio (delete that folder too if you want them gone).
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/JMGUltraStudio"
if [ -e "$DEST" ]; then rm -rf "$DEST"; echo "✓ JMG Ultra Studio has been removed. Restart Premiere Pro."; else echo "JMG Ultra Studio isn't installed."; fi
read -n 1 -s -r -p "Press any key to close."
