#!/bin/bash
# JMG Ultra Studio – installer for DaVinci Resolve Studio on macOS. Double-click to run.
HERE="$(cd "$(dirname "$0")" && pwd)"
ID="com.jmgphotography.ultrastudio"
SRC="$HERE/$ID"
# (ULTRA_TEST_BMD: development only – a stand-in for Resolve's folder, so the installer can be tested safely)
BMD="${ULTRA_TEST_BMD:-/Library/Application Support/Blackmagic Design/DaVinci Resolve}"
PLUGINS="$BMD/Workflow Integration Plugins"
DEST="$PLUGINS/$ID"
WI="$BMD/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
done_key() { echo; read -n 1 -s -r -p "Press any key to close."; echo; }
clear
echo "JMG Ultra Studio for DaVinci Resolve – installer"
echo "================================================"
echo
if [ ! -f "$SRC/manifest.xml" ]; then
  echo "Can't find the plugin next to this installer."
  echo "Unzip the whole download first, then double-click this file again."
  done_key; exit 1
fi

# Resolve Studio: Ultra Studio needs its plugin support (the free DaVinci Resolve can't run plugins)
APP=""
for a in "/Applications/DaVinci Resolve/DaVinci Resolve.app" "/Applications/DaVinci Resolve Studio.app" "/Applications/DaVinci Resolve.app"; do
  [ -d "$a" ] && { APP="$a"; break; }
done
if [ -z "$APP" ] && [ ! -d "$BMD" ]; then
  echo "DaVinci Resolve Studio isn't installed on this Mac."
  echo "Ultra Studio runs inside DaVinci Resolve Studio (the paid version, 19.1 or later)."
  echo "Install it from blackmagicdesign.com, then run this installer again."
  done_key; exit 1
fi
if [ ! -f "$WI" ]; then
  echo "Couldn't find Resolve Studio's plugin support on this Mac."
  echo "Ultra Studio needs DaVinci Resolve Studio 19.1 or later – the free DaVinci Resolve can't run plugins."
  echo "Install or update DaVinci Resolve Studio, then run this installer again."
  done_key; exit 1
fi
if [ -n "$APP" ]; then
  RV=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null)
  MAJ=${RV%%.*}; REST=${RV#*.}; MIN=${REST%%.*}
  if [[ "$MAJ" =~ ^[0-9]+$ && "$MIN" =~ ^[0-9]+$ ]] && { [ "$MAJ" -lt 19 ] || { [ "$MAJ" -eq 19 ] && [ "$MIN" -lt 1 ]; }; }; then
    echo "This Mac has DaVinci Resolve $RV. Ultra Studio needs 19.1 or later:"
    echo "update Resolve (DaVinci Resolve › Check for Updates), then run this installer again."
    done_key; exit 1
  fi
fi
# a Studio licence file is the usual sign of Resolve Studio (a USB key licence has none, so this is only a note)
if ! ls -A "$BMD/.license/" 2>/dev/null | grep -qi studio; then
  echo "Note: if this Mac has the free DaVinci Resolve, Ultra Studio won't appear in it – plugins need Resolve Studio."
  echo
fi

# Resolve must be closed while the plugin is replaced (it only reads plugins when it starts)
resolve_running() { ps -axo comm= | grep -Eq '/Contents/MacOS/Resolve$'; }
if resolve_running; then
  echo "DaVinci Resolve is open. Please save your work and quit Resolve, then press any key."
  read -n 1 -s -r
  while resolve_running; do echo "Still waiting for Resolve to quit…"; sleep 3; done
fi

# Resolve's plugin folder is shared by everyone on this Mac: ask for the password only if it can't be written
SUDO=""
mkdir -p "$PLUGINS" 2>/dev/null
if [ ! -d "$PLUGINS" ] || [ ! -w "$PLUGINS" ]; then
  echo "Your Mac password is needed to install into Resolve's plugin folder (it's shared by everyone on this Mac)."
  SUDO="sudo"
  $SUDO mkdir -p "$PLUGINS" || { echo "Couldn't create Resolve's plugin folder."; done_key; exit 1; }
fi

# replace any earlier version (your settings and analysis results are kept – they live elsewhere)
[ -L "$DEST" ] && $SUDO rm "$DEST"
$SUDO rm -rf "$DEST.previous"
[ -d "$DEST" ] && $SUDO mv "$DEST" "$DEST.previous"
if ! $SUDO cp -R "$SRC" "$DEST" || ! $SUDO cp "$WI" "$DEST/WorkflowIntegration.node"; then
  echo "Couldn't copy the files. Your previous version (if any) has been put back."
  $SUDO rm -rf "$DEST"
  [ -d "$DEST.previous" ] && $SUDO mv "$DEST.previous" "$DEST"
  done_key; exit 1
fi
$SUDO rm -rf "$DEST.previous"
# never ship the development switch, and no macOS metadata or quarantine flags
$SUDO rm -f "$DEST/debug"
$SUDO find "$DEST" -name '._*' -delete 2>/dev/null
$SUDO xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
$SUDO chmod -R a+rX "$DEST"
VER=$(grep -o '<Version>[^<]*' "$DEST/manifest.xml" | cut -d'>' -f2)
echo "✓ JMG Ultra Studio $VER is installed in DaVinci Resolve Studio."
echo
echo "Next: open Resolve, then choose Workspace › Workflow Integrations › JMG Ultra Studio."
echo "On Home, press “Check my setup” to make sure everything works on this Mac."
done_key
