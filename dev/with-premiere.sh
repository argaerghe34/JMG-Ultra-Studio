#!/bin/bash
# Development only: run a command that talks to Premiere while holding a lock, so two test runs never
# drive Premiere at the same time (overlapping exports once left Premiere stuck in an error dialog).
# Usage: dev/with-premiere.sh <command> [args…]      e.g. dev/with-premiere.sh node dev/e2e/run.js selects
LOCK="$(cd "$(dirname "$0")" && pwd)/.premiere.lock"
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  # a lock older than 20 minutes is from a crashed run
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; continue; fi
  [ $((waited % 30)) -eq 0 ] && echo "Waiting for Premiere (another test is using it: $(cat "$LOCK/who" 2>/dev/null))…" >&2
  sleep 2; waited=$((waited + 2))
done
echo "$$ $*" > "$LOCK/who"
trap 'rm -rf "$LOCK"' EXIT
"$@"
