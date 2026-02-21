#!/usr/bin/env bash
# Fails if version references diverge across files.
# Checks: package.json, .lore/config.json, package-lock.json, SECURITY.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Use process.argv to avoid backslash escape issues on Windows paths
pkg_ver="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$ROOT/package.json")"
cfg_ver="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$ROOT/.lore/config.json")"

failed=0

if [[ "$cfg_ver" != "$pkg_ver" ]]; then
  echo "FAIL: .lore/config.json=$cfg_ver vs package.json=$pkg_ver" >&2
  failed=1
fi

# package-lock.json
if [[ -f "$ROOT/package-lock.json" ]]; then
  lock_ver="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$ROOT/package-lock.json")"
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

# create-lore/SECURITY.md
CREATE_LORE_ROOT="$(cd "$ROOT/../create-lore" 2>/dev/null && pwd)" || true
if [[ -n "$CREATE_LORE_ROOT" && -f "$CREATE_LORE_ROOT/SECURITY.md" ]]; then
  if ! grep -q "| ${major_minor}\.x" "$CREATE_LORE_ROOT/SECURITY.md"; then
    echo "FAIL: create-lore/SECURITY.md does not reference ${major_minor}.x (package.json=$pkg_ver)" >&2
    failed=1
  fi
fi

if [[ "$failed" -ne 0 ]]; then
  echo "" >&2
  echo "Fix with: bash .lore/scripts/bump-version.sh $pkg_ver" >&2
  exit 1
fi

echo "Version sync OK: $pkg_ver"
