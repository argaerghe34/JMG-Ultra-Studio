#!/bin/bash
# Development only: removes the dev links made by dev/link-dev.sh and puts back an installed copy if there was one.
E="$HOME/Library/Application Support/Adobe/CEP/extensions"
[ -L "$E/JMGUltraStudio" ] && rm "$E/JMGUltraStudio"
[ -L "$E/JMGUltraStudioDevHelper" ] && rm "$E/JMGUltraStudioDevHelper"
PARK="$HOME/Library/Application Support/JMG Ultra Studio dev/installed-copy"
[ -d "$PARK" ] && mv "$PARK" "$E/JMGUltraStudio" && rmdir "$(dirname "$PARK")" 2>/dev/null
echo "Development links removed. Restart Premiere."
