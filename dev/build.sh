#!/bin/bash
# Builds the shippable package: dist/JMG Ultra Studio <version>/ and a zip of it.
# Only the extension's own files go in (no dev tools, test media, debug ports or test project).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER=$(grep -o 'ExtensionBundleVersion="[^"]*"' "$ROOT/CSXS/manifest.xml" | cut -d'"' -f2)
NAME="JMG Ultra Studio $VER"
OUT="$ROOT/dist/$NAME"
EXT="$OUT/JMG Ultra Studio extension"

cd "$ROOT"
node dev/check-jsx.js
# stray control characters (e.g. a \b that became a backspace) break regular expressions silently
BAD=$(find js jsx css index.html -type f -exec perl -ne 'if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/) { print "$ARGV\n"; close ARGV; }' {} +)
if [ -n "$BAD" ]; then echo "$BAD"; echo "Control characters in the files above – not building."; exit 1; fi
node dev/tests/run.js > /dev/null || { echo "Unit tests failed – not building."; node dev/tests/run.js | grep '✗' ; exit 1; }

rm -rf "$OUT" "$ROOT/dist/JMG-Ultra-Studio-$VER.zip"
mkdir -p "$EXT"
cp -R CSXS css js jsx assets index.html "$EXT/"
find "$EXT" -name '.DS_Store' -delete
find "$EXT" -name '.debug' -delete
cp dev/installer/*.command dev/installer/*.bat "$OUT/"
chmod +x "$OUT"/*.command
node dev/docs/make-guide.js > /dev/null
cp "dev/docs/Read me first.html" "$OUT/"
mkdir -p "$EXT/docs" && cp "dev/docs/Read me first.html" "$EXT/docs/guide.html"   # Home › Guide opens it

# sanity: everything index.html and the manifest point at exists
for f in index.html jsx/host.jsx css/app.css assets/icon-dark.png; do [ -f "$EXT/$f" ] || { echo "Missing $f"; exit 1; }; done
grep -q 'enable-nodejs' "$EXT/CSXS/manifest.xml"

# no macOS metadata: Windows would unzip "._x.jsx" files as real (broken) scripts
xattr -cr "$OUT" 2>/dev/null; find "$OUT" -name '._*' -delete
(cd "$ROOT/dist" && ditto -c -k --norsrc --noextattr --keepParent "$NAME" "JMG-Ultra-Studio-$VER.zip")
if unzip -l "$ROOT/dist/JMG-Ultra-Studio-$VER.zip" | grep -q '/\._'; then echo "The zip still has ._ files – not shipping it."; exit 1; fi
echo "Built $OUT"
echo "Zip:  $ROOT/dist/JMG-Ultra-Studio-$VER.zip ($(du -h "$ROOT/dist/JMG-Ultra-Studio-$VER.zip" | cut -f1))"
echo "Files in extension: $(find "$EXT" -type f | wc -l | tr -d ' ')"
