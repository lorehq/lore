#!/usr/bin/env bash
# Fails if .lore-config and package.json versions diverge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cfg_ver="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$ROOT/.lore-config")"
pkg_ver="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$ROOT/package.json")"
if [[ "$cfg_ver" != "$pkg_ver" ]]; then
  echo "Version mismatch: .lore-config=$cfg_ver package.json=$pkg_ver" >&2
  exit 1
fi
echo "Version sync OK: $cfg_ver"
