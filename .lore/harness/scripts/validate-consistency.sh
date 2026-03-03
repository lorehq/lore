#!/usr/bin/env bash
# Validates cross-reference consistency between skills and platform copies.
# Run after any structural change to catch drift.
#
# Checks:
#   1. Skill frontmatter has required fields (name, description, user-invocable)
#   2. Platform copies (.claude/skills/) match canonical source (.lore/)
#   3. CLAUDE.md and lore-core.mdc body match .lore/instructions.md
#   4. Cursor hooks configuration references existing scripts
#   5. Required rules (e.g. security.md) exist on disk
#
# Exit code: 0 = all passed, 1 = inconsistencies found

set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ERRORS=0

# shellcheck source=.lore/harness/scripts/lib/common.sh
source "$(dirname "$0")/lib/common.sh"

fail() { echo "  FAIL: $1"; ERRORS=$((ERRORS + 1)); }

echo "=== Lore Consistency Validation ==="
echo ""

# -- 1. Skill frontmatter: required fields --
echo "--- Skill Frontmatter ---"
for dir in "$REPO_ROOT"/.lore/skills/*/; do
  sf="$dir/SKILL.md"
  [[ -f "$sf" ]] || continue
  name=$(basename "$dir")
  for field in name description user-invocable; do
    val=$(extract_field "$field" "$sf")
    [[ -z "$val" ]] && fail "Skill '$name' missing '$field'"
  done
done

# -- 2. Platform copies match canonical source --
echo "--- Platform Sync ---"
if [[ -d "$REPO_ROOT/.lore/skills" ]]; then
  # Check .claude/skills/ contains all skills from .lore/skills/ (existence check —
  # the projector transforms frontmatter during sync, so content won't match exactly)
  if [[ -d "$REPO_ROOT/.claude/skills" ]]; then
    sync_ok=true
    for dir in "$REPO_ROOT"/.lore/skills/*/; do
      name=$(basename "$dir")
      sf="$dir/SKILL.md"
      [[ -f "$sf" ]] || continue
      if [[ ! -d "$REPO_ROOT/.claude/skills/$name" ]]; then
        sync_ok=false; break
      fi
      if [[ ! -f "$REPO_ROOT/.claude/skills/$name/SKILL.md" ]]; then
        sync_ok=false; break
      fi
    done
    $sync_ok || fail ".claude/skills/ out of sync with .lore/skills/ — run: bash .lore/harness/scripts/sync-platform-skills.sh"
  else
    fail ".claude/skills/ missing — run: bash .lore/harness/scripts/sync-platform-skills.sh"
  fi
fi

# -- 3. Instructions copies match canonical source --
echo "--- Instructions Sync ---"
if [[ -f "$REPO_ROOT/.lore/instructions.md" ]]; then
  # CLAUDE.md = instructions.md + static banner. Verify instructions prefix matches.
  if [[ -f "$REPO_ROOT/CLAUDE.md" ]]; then
    node -e "
      const fs = require('fs');
      const norm = c => c.replace(/\r\n/g, '\n').trimEnd();
      const inst = norm(fs.readFileSync(process.argv[1], 'utf8'));
      const claude = norm(fs.readFileSync(process.argv[2], 'utf8'));
      if (!claude.startsWith(inst)) { process.exit(1); }
    " "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md" >/dev/null 2>&1 \
      || fail "CLAUDE.md out of sync with .lore/instructions.md — run: node .lore/harness/scripts/generate-claude-md.js ."
  else
    fail "CLAUDE.md missing — run: bash .lore/harness/scripts/sync-platform-skills.sh"
  fi

  # lore-core.mdc has frontmatter + instructions body — compare body only.
  core_mdc="$REPO_ROOT/.cursor/rules/lore-core.mdc"
  if [[ -f "$core_mdc" ]]; then
    node -e "
      const fs = require('fs');
      const norm = c => c.replace(/\r\n/g, '\n');
      const strip = c => norm(c).replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
      const mdc = strip(fs.readFileSync(process.argv[1], 'utf8'));
      const inst = norm(fs.readFileSync(process.argv[2], 'utf8')).trim();
      if (!mdc.startsWith(inst)) { console.log('MISMATCH'); process.exit(1); }
    " "$core_mdc" "$REPO_ROOT/.lore/instructions.md" >/dev/null 2>&1 \
      || fail "lore-core.mdc body out of sync with .lore/instructions.md — run: bash .lore/harness/scripts/generate-cursor-rules.sh"
  else
    fail "lore-core.mdc missing — run: bash .lore/harness/scripts/generate-cursor-rules.sh"
  fi
fi

# -- 4. Cursor hooks configuration --
echo "--- Cursor Hooks ---"
if [[ -f "$REPO_ROOT/.cursor/hooks.json" ]]; then
  # Extract command values and verify referenced scripts exist
  while IFS= read -r cmd || [[ -n "$cmd" ]]; do
    cmd=$(echo "$cmd" | xargs)
    # Strip "node " prefix to get the script path
    script="${cmd#node }"
    if [[ "$script" != "$cmd" && ! -f "$REPO_ROOT/$script" ]]; then
      fail "Cursor hooks.json references missing script: $script"
    fi
  done < <(sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO_ROOT/.cursor/hooks.json" 2>/dev/null || true)
fi

# -- 5. Required rules exist --
echo "--- Required Rules ---"
seed="security.md"
target="$REPO_ROOT/.lore/rules/$seed"
[[ -f "$target" ]] || fail "Required rule missing: $seed — will regenerate on next session"

# -- Results --
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAILED: $ERRORS inconsistencies"
  exit 1
else
  echo "PASSED: All checks passed"
fi
