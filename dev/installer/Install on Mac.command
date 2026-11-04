#!/bin/bash
# JMG Ultra Studio – installer for Premiere Pro on macOS. Double-click to run.
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/JMG Ultra Studio extension"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/JMGUltraStudio"
clear
echo "JMG Ultra Studio – installer"
echo "============================"
echo
if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "Can't find the extension next to this installer."
  echo "Unzip the whole download first, then double-click this file again."
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi
# the app itself: its own program inside the .app (macOS shortens process names, and Premiere's many helper
# programs live in the same folder, so match the full path of the main one)
ppro_running() { ps -axo comm= | grep -Eq '/Contents/MacOS/Adobe Premiere Pro( [0-9]{4})?$'; }
# an update while Premiere is open: only the panel's files change, so they're replaced where they are and the panel's
# ↻ (Reload) picks them up – no need to quit. Premiere reads the manifest only when it starts, so if that changed
# (anything but the version number), Premiere has to be quit after all.
same_manifest() { diff -q <(sed -E 's/Version="[^"]*"//g' "$SRC/CSXS/manifest.xml") <(sed -E 's/Version="[^"]*"//g' "$DEST/CSXS/manifest.xml") >/dev/null 2>&1; }
if ppro_running && [ -d "$DEST" ] && [ ! -L "$DEST" ] && [ -f "$DEST/CSXS/manifest.xml" ] && same_manifest; then
  if rsync -a --delete "$SRC/" "$DEST/"; then
    xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
    VER=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$DEST/CSXS/manifest.xml" | cut -d'"' -f2)
    echo "✓ JMG Ultra Studio $VER is installed (updated while Premiere is open)."
    echo
    echo "Next: in the panel, press ↻ (Reload) in the top bar – no need to quit Premiere."
    echo
    read -n 1 -s -r -p "Press any key to close."; exit 0
  fi
  echo "Couldn't update in place – quit Premiere and the installer will finish."
fi
if ppro_running; then
  echo "Premiere Pro is open. Please save your work and quit Premiere, then press any key."
  read -n 1 -s -r
  while ppro_running; do echo "Still waiting for Premiere to quit…"; sleep 3; done
fi
mkdir -p "$(dirname "$DEST")"
# replace any earlier version (your settings and analysis results are kept – they live elsewhere)
[ -L "$DEST" ] && rm "$DEST"
rm -rf "$DEST.previous"
[ -d "$DEST" ] && mv "$DEST" "$DEST.previous"
if ! cp -R "$SRC" "$DEST"; then
  echo "Couldn't copy the files. Your previous version (if any) has been put back."
  [ -d "$DEST.previous" ] && mv "$DEST.previous" "$DEST"
  read -n 1 -s -r -p "Press any key to close."; exit 1
fi
rm -rf "$DEST.previous"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
# Premiere only loads extensions that aren't from the Adobe marketplace when this switch is on
for v in 9 10 11 12 13 14; do defaults write com.apple.CSXS.$v PlayerDebugMode 1; done
VER=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$DEST/CSXS/manifest.xml" | cut -d'"' -f2)
echo "✓ JMG Ultra Studio $VER is installed."
echo
echo "Next: open Premiere Pro, then choose Window › Extensions › JMG Ultra Studio."
echo "On Home, press “Check my setup” to make sure everything works on this Mac."
echo
read -n 1 -s -r -p "Press any key to close."
