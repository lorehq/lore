#!/usr/bin/env bash
# Fails if version references diverge across files.
# Checks: package.json, .lore-config, package-lock.json, SECURITY.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pkg_ver="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package.json','utf8')).version")"
cfg_ver="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/.lore-config','utf8')).version")"

failed=0

if [[ "$cfg_ver" != "$pkg_ver" ]]; then
  echo "FAIL: .lore-config=$cfg_ver vs package.json=$pkg_ver" >&2
  failed=1
fi

# package-lock.json
if [[ -f "$ROOT/package-lock.json" ]]; then
  lock_ver="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package-lock.json','utf8')).version")"
  if [[ "$lock_ver" != "$pkg_ver" ]]; then
    echo "FAIL: package-lock.json=$lock_ver vs package.json=$pkg_ver" >&2
    failed=1
  fi
fi

# SECURITY.md supported version
if [[ -f "$ROOT/SECURITY.md" ]]; then
  major_minor="${pkg_ver%.*}"
  if ! grep -q "| ${major_minor}\.x" "$ROOT/SECURITY.md"; then
    echo "FAIL: SECURITY.md does not reference ${major_minor}.x (package.json=$pkg_ver)" >&2
    failed=1
  fi
fi

if [[ "$failed" -ne 0 ]]; then
  echo "" >&2
  echo "Fix with: bash scripts/bump-version.sh $pkg_ver" >&2
  exit 1
fi

echo "Version sync OK: $pkg_ver"
