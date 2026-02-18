#!/usr/bin/env bash
# Scans markdown files for hardcoded version strings that may go stale.
# Run before releases to catch references that should be generic.
#
# Usage: bash scripts/check-version-refs.sh [old-version]
#   With argument: greps for the specific old version (e.g., "0.6.0")
#   Without argument: greps for any 0.x.y pattern and reports for review
#
# Excludes: package.json, .lore-config, package-lock.json, CHANGELOG.md,
#           node_modules/, archive/ directories (historical records)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLD_VER="${1:-}"

EXCLUDE_PATHS="node_modules/|package\.json|package-lock\.json|\.lore-config|CHANGELOG\.md|/archive/|/\.claude/"

if [[ -n "$OLD_VER" ]]; then
  echo "Scanning for stale version: $OLD_VER"
  pattern="$OLD_VER"
else
  echo "Scanning for any hardcoded version patterns (0.x.y / v0.x.y)"
  pattern='v?0\.[0-9]+\.[0-9]+'
fi

FOUND=0
while IFS= read -r file; do
  # Skip excluded paths
  [[ "$file" =~ $EXCLUDE_PATHS ]] && continue
  # Filter out IP addresses (0.0.0.0) and port patterns
  matches=$(grep -nE "$pattern" "$file" 2>/dev/null | grep -vE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || true)
  if [[ -n "$matches" ]]; then
    echo ""
    echo "  $file"
    while IFS= read -r line; do
      echo "    $line"
    done <<< "$matches"
    FOUND=$((FOUND + 1))
  fi
done < <(find "$ROOT" -name '*.md' -not -path '*/node_modules/*' 2>/dev/null)

echo ""
if [[ $FOUND -gt 0 ]]; then
  echo "Found version references in $FOUND files — review before release."
  echo "Historical references in archive/ are excluded automatically."
  exit 1
else
  echo "No stale version references found."
fi
