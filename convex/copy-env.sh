#!/usr/bin/env bash
#
# Copy every Convex environment variable from one deployment to another.
#
# Usage:
#   ./copy-env.sh <source-deployment> <target-deployment>
#
# Example:
#   ./copy-env.sh dev:unique-chipmunk-902 prod:insightful-corgi-987
#
# Notes:
# - Reads via `convex env list` (which prints `KEY=VALUE` per line) and writes
#   via `convex env set`. Values stay on your local machine — they never leave
#   the convex CLI process.
# - Existing values on the target are overwritten without prompting.
# - The first `=` in a line is treated as the separator; values may contain
#   any number of additional `=` characters (URLs with query strings work).
# - Run from inside `hizmetsearch/convex/`.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <source-deployment> <target-deployment>" >&2
  echo "Example: $0 dev:unique-chipmunk-902 prod:insightful-corgi-987" >&2
  exit 1
fi

SRC="$1"
DST="$2"

if [ "$SRC" = "$DST" ]; then
  echo "Source and target are the same — nothing to do." >&2
  exit 1
fi

cd "$(dirname "$0")"

echo "Copying env vars from $SRC → $DST"
echo "──────────────────────────────────────────────"

count=0
while IFS= read -r line; do
  # Skip blank lines and any header / banner text the CLI might emit.
  [ -z "$line" ] && continue
  # Skip lines that don't look like KEY=VALUE (e.g., warnings, table borders).
  if [[ ! "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    continue
  fi
  key="${line%%=*}"
  value="${line#*=}"
  echo "  → $key"
  CONVEX_DEPLOYMENT="$DST" npx convex env set "$key" "$value" >/dev/null
  count=$((count + 1))
done < <(CONVEX_DEPLOYMENT="$SRC" npx convex env list)

echo "──────────────────────────────────────────────"
echo "Copied $count environment variable(s) to $DST"
