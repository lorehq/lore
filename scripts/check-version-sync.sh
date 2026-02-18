#!/usr/bin/env bash
# Fails if .lore-config and package.json versions diverge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cfg_ver="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/.lore-config','utf8')).version")"
pkg_ver="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package.json','utf8')).version")"
if [[ "$cfg_ver" != "$pkg_ver" ]]; then
  echo "Version mismatch: .lore-config=$cfg_ver package.json=$pkg_ver" >&2
  exit 1
fi
echo "Version sync OK: $cfg_ver"
