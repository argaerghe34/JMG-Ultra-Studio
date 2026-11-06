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
HELP="$HERE/START HERE - How to install.html"
if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'; else B=""; G=""; R=""; D=""; N=""; fi
TOTAL=5
step() { echo; echo "${B}Step $1 of $TOTAL – $2${N}"; }
ok()   { echo "  ${G}✓${N} $1"; }
info() { echo "  ${D}$1${N}"; }
fail() {   # what went wrong, what to do, and where the step-by-step help is
  echo; echo "  ${R}✗ $1${N}"; shift; for l in "$@"; do echo "    $l"; done
  echo; echo "Nothing was changed in Resolve. Step-by-step help: “START HERE - How to install.html” in this folder."
  echo; read -n 1 -s -r -p "Press H to open that help page, or any other key to close. " k; echo
  [[ "$k" == [hH] ]] && open "$HELP" 2>/dev/null
  exit 1
}
clear
echo "${B}JMG Ultra Studio for DaVinci Resolve – installer${N}"
echo "================================================"
echo "This puts JMG Ultra Studio into DaVinci Resolve Studio. It takes under a minute."

step 1 "Checking the download"
if [ ! -f "$SRC/manifest.xml" ]; then
  fail "Can't find the plugin next to this installer." "Unzip the whole download first (double-click the .zip), then double-click this file again from the unzipped folder."
fi
NEWVER=$(grep -o '<Version>[^<]*' "$SRC/manifest.xml" | cut -d'>' -f2)
ok "JMG Ultra Studio $NEWVER is here"

step 2 "Checking DaVinci Resolve Studio"
# Resolve Studio: Ultra Studio needs its plugin support (the free DaVinci Resolve can't run plugins)
APP=""
for a in "/Applications/DaVinci Resolve/DaVinci Resolve.app" "/Applications/DaVinci Resolve Studio.app" "/Applications/DaVinci Resolve.app"; do
  [ -d "$a" ] && { APP="$a"; break; }
done
if [ -z "$APP" ] && [ ! -d "$BMD" ]; then
  fail "DaVinci Resolve Studio isn't installed on this Mac." \
    "Ultra Studio runs inside DaVinci Resolve Studio (the paid version, 19.1 or later)." \
    "Install it from blackmagicdesign.com, then double-click this installer again."
fi
if [ ! -f "$WI" ]; then
  fail "Couldn't find Resolve Studio's plugin support on this Mac." \
    "Ultra Studio needs DaVinci Resolve Studio 19.1 or later – the free DaVinci Resolve can't run plugins." \
    "Install or update DaVinci Resolve Studio, then double-click this installer again."
fi
RV=""
if [ -n "$APP" ]; then
  RV=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null)
  MAJ=${RV%%.*}; REST=${RV#*.}; MIN=${REST%%.*}
  if [[ "$MAJ" =~ ^[0-9]+$ && "$MIN" =~ ^[0-9]+$ ]] && { [ "$MAJ" -lt 19 ] || { [ "$MAJ" -eq 19 ] && [ "$MIN" -lt 1 ]; }; }; then
    fail "This Mac has DaVinci Resolve $RV – Ultra Studio needs 19.1 or later." \
      "Update Resolve (DaVinci Resolve › Check for Updates), then double-click this installer again."
  fi
fi
ok "DaVinci Resolve ${RV:-Studio} found, with plugin support"
# a Studio licence file is the usual sign of Resolve Studio (a USB key licence has none, so this is only a note)
if ! ls -A "$BMD/.license/" 2>/dev/null | grep -qi studio; then
  info "Note: if this is the free DaVinci Resolve, Ultra Studio won't appear in it – plugins need Resolve Studio."
fi

# Resolve must be closed while the plugin is replaced (it only reads plugins when it starts)
step 3 "Making sure Resolve is closed"
resolve_running() { ps -axo comm= | grep -Eq '/Contents/MacOS/Resolve$'; }
if resolve_running; then
  echo "  DaVinci Resolve is open. Save your work and quit Resolve (DaVinci Resolve › Quit)."
  echo "  The installer carries on by itself as soon as Resolve has closed…"
  n=0; while resolve_running; do sleep 2; n=$((n+1)); [ $((n % 10)) -eq 0 ] && info "still waiting for Resolve to quit…"; done
fi
ok "Resolve is closed"

# Resolve's plugin folder is shared by everyone on this Mac: ask for the password only if it can't be written
step 4 "Getting permission to write to Resolve's plugin folder"
SUDO=""
mkdir -p "$PLUGINS" 2>/dev/null
if [ ! -d "$PLUGINS" ] || [ ! -w "$PLUGINS" ]; then
  echo "  Resolve's plugin folder is shared by everyone on this Mac, so it needs your Mac password."
  echo "  Type your password and press Return ${D}(nothing shows while you type – that's normal)${N}:"
  SUDO="sudo"
  $SUDO -p "  Password: " mkdir -p "$PLUGINS" || fail "Couldn't get permission for Resolve's plugin folder." "Run the installer again and type the password you use to log in to this Mac."
fi
ok "Permission granted"

# replace any earlier version (your settings and analysis results are kept – they live elsewhere)
step 5 "Copying JMG Ultra Studio into Resolve"
OLDVER=""
[ -f "$DEST/manifest.xml" ] && OLDVER=$(grep -o '<Version>[^<]*' "$DEST/manifest.xml" | cut -d'>' -f2)
[ -n "$OLDVER" ] && info "replacing version $OLDVER (your settings and analysis results are kept)"
[ -L "$DEST" ] && $SUDO rm "$DEST"
$SUDO rm -rf "$DEST.previous"
[ -d "$DEST" ] && $SUDO mv "$DEST" "$DEST.previous"
if ! $SUDO cp -R "$SRC" "$DEST" || ! $SUDO cp "$WI" "$DEST/WorkflowIntegration.node"; then
  $SUDO rm -rf "$DEST"
  [ -d "$DEST.previous" ] && $SUDO mv "$DEST.previous" "$DEST"
  fail "Couldn't copy the files – your previous version (if any) has been put back." "Make sure Resolve is closed, then run the installer again."
fi
$SUDO rm -rf "$DEST.previous"
# never ship the development switch, and no macOS metadata or quarantine flags
$SUDO rm -f "$DEST/debug"
$SUDO find "$DEST" -name '._*' -delete 2>/dev/null
$SUDO xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
$SUDO chmod -R a+rX "$DEST"
VER=$(grep -o '<Version>[^<]*' "$DEST/manifest.xml" | cut -d'>' -f2)
ok "Files copied"

echo
echo "================================================"
echo "${G}${B}✓ Installed: JMG Ultra Studio $VER is now in DaVinci Resolve Studio.${N}"
echo "================================================"
echo
echo "${B}How to open it:${N}"
echo "  1. Open DaVinci Resolve Studio and open a project (any project – the plugin menu needs one open)."
echo "  2. In the menu bar choose:  ${B}Workspace › Workflow Integrations › JMG Ultra Studio${N}"
echo "  3. It opens in its own window – drag it beside Resolve or onto a second screen."
echo "  4. On the ${B}Home${N} tab press ${B}Check my setup${N} – it checks everything works on this Mac."
echo
echo "${B}Then:${N} open a timeline and pick a tool on the left – Story, Selects and Silence Cut are good first tries."
echo "Not in the menu? Quit Resolve completely and open it again – it only looks for plugins when it starts."
echo
read -n 1 -s -r -p "Press O to open DaVinci Resolve now, H for the step-by-step help page, or any other key to close. " k; echo
case "$k" in
  [oO]) if [ -n "$APP" ]; then open "$APP"; else open -a "DaVinci Resolve"; fi && echo "Opening DaVinci Resolve… then choose Workspace › Workflow Integrations › JMG Ultra Studio." ;;
  [hH]) open "$HELP" ;;
esac
