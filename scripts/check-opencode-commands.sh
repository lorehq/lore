#!/usr/bin/env bash
# Smoke test for OpenCode slash command files in this Lore hub and linked repos.
# Usage: bash scripts/check-opencode-commands.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINKS_FILE="$ROOT/.lore-links"

REQUIRED=(
  ".opencode/commands/lore-capture.md"
  ".opencode/commands/lore-consolidate.md"
  ".opencode/commands/lore-status.md"
  ".opencode/commands/lore-update.md"
  ".opencode/commands/lore-ui.md"
  ".opencode/commands/lore-commands-check.md"
)

has_issues=0

check_dir() {
  local dir="$1"
  local label="$2"
  local missing=0

  echo ""
  echo "$label"

  for rel in "${REQUIRED[@]}"; do
    if [[ -f "$dir/$rel" ]]; then
      echo "  OK      $rel"
    else
      echo "  MISSING $rel"
      missing=1
    fi
  done

  if [[ $missing -eq 1 ]]; then
    has_issues=1
  fi
}

echo "=== OpenCode command smoke check ==="
check_dir "$ROOT" "Hub: $ROOT"

if [[ -f "$LINKS_FILE" ]]; then
  while IFS= read -r linked_path; do
    [[ -n "$linked_path" ]] || continue
    if [[ ! -d "$linked_path" ]]; then
      echo ""
      echo "Linked repo (stale): $linked_path"
      echo "  WARN    Directory no longer exists"
      has_issues=1
      continue
    fi
    check_dir "$linked_path" "Linked repo: $linked_path"
  done < <(node -e "const fs=require('fs');const p=process.argv[1];if(!fs.existsSync(p))process.exit(0);const links=JSON.parse(fs.readFileSync(p,'utf8'));for (const l of links){if(l&&l.path)console.log(l.path)}" "$LINKS_FILE")
fi

echo ""
if [[ $has_issues -eq 1 ]]; then
  echo "Result: WARN"
  echo "If linked repos are missing files, run: bash scripts/lore-link.sh --refresh"
  exit 1
fi

echo "Result: OK"
