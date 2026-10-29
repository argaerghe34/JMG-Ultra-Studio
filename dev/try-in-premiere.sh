#!/bin/bash
# Try what's in this folder in your installed Premiere panel, without making a release: copies the panel's code
# (index.html, js, css, jsx) over the installed copy. The first time, the installed copy is kept aside so you can go
# back with:  dev/try-in-premiere.sh --undo
# Then close and reopen JMG Ultra Studio in Premiere (Window › Extensions) – no need to restart Premiere.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E="$HOME/Library/Application Support/Adobe/CEP/extensions/JMGUltraStudio"
KEEP="$HOME/Library/Application Support/JMG Ultra Studio dev/before-trying"
if [ -L "$E" ]; then echo "Premiere already uses this folder directly (dev link) – just close and reopen the panel."; exit 0; fi
if [ ! -d "$E" ]; then echo "JMG Ultra Studio isn't installed for Premiere on this Mac – install a release first."; exit 1; fi
if [ "$1" = "--undo" ]; then
  [ -d "$KEEP" ] || { echo "Nothing to undo."; exit 0; }
  rm -rf "$E" && mv "$KEEP" "$E" && echo "Back to the installed version. Close and reopen the panel in Premiere."
  exit 0
fi
[ -d "$KEEP" ] || { mkdir -p "$(dirname "$KEEP")"; cp -R "$E" "$KEEP"; }
rsync -a --delete "$ROOT/js/" "$E/js/" && rsync -a --delete "$ROOT/css/" "$E/css/" && rsync -a --delete "$ROOT/jsx/" "$E/jsx/" && cp "$ROOT/index.html" "$E/index.html" || exit 1
# marks the copy as unpublished (the top bar says so); a real install replaces the whole folder, so it goes away then
BR=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null); CM=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)
DIRTY=$(git -C "$ROOT" status --porcelain -- js css jsx index.html 2>/dev/null | head -1)
printf '{"from": "%s", "at": "%s"}\n' "${BR:-?} @ ${CM:-?}${DIRTY:+ + changes}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$E/unpublished.json"
echo "Copied. In Premiere: close JMG Ultra Studio and open it again (Window › Extensions › JMG Ultra Studio)."
