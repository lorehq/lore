#!/usr/bin/env bash
# Validates cross-reference consistency between skills, agents, and platform copies.
# Run after any structural change to catch drift.
#
# Checks (7 total):
#   1. Skill frontmatter has required fields (name, description)
#   2. Agent frontmatter has required fields (name, description, model or per-platform model)
#   3. Agent skill references point to existing directories
#   4. Platform copies (.claude/) match canonical source (.lore/)
#   5. CLAUDE.md and lore-core.mdc body match .lore/instructions.md
#   6. Cursor hooks configuration references existing scripts
#   7. Linked repos (.lore/links) still exist on disk
#
# Exit code: 0 = all passed, 1 = inconsistencies found

set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ERRORS=0

# shellcheck source=.lore/scripts/lib/common.sh
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
  for field in name description; do
    val=$(extract_field "$field" "$sf")
    [[ -z "$val" ]] && fail "Skill '$name' missing '$field'"
  done
done

# -- 2. Agent frontmatter: required fields --
echo "--- Agent Frontmatter ---"
for f in "$REPO_ROOT"/.lore/agents/*.md; do
  name=$(basename "$f" .md)
  for field in name description; do
    val=$(extract_field "$field" "$f")
    [[ -z "$val" ]] && fail "Agent '$name' missing '$field'"
  done
  # Model: accept per-platform fields (claude-model, opencode-model) or legacy 'model'
  cm=$(extract_field "claude-model" "$f")
  om=$(extract_field "opencode-model" "$f")
  lm=$(extract_field "model" "$f")
  if [[ -z "$cm" && -z "$om" && -z "$lm" ]]; then
    fail "Agent '$name' missing model field (claude-model, opencode-model, or model)"
  fi
done

# -- 3. Agent skill references → existing directories --
echo "--- Agent-Skill References ---"
for f in "$REPO_ROOT"/.lore/agents/*.md; do
  agent=$(basename "$f" .md)
  in_skills=false
  while IFS= read -r line; do
    # Enter skills list when we hit "skills:" key
    [[ "$line" =~ ^skills: ]] && { in_skills=true; continue; }
    if $in_skills; then
      # Parse "  - skill-name" entries
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
        ref=$(echo "${BASH_REMATCH[1]}" | xargs)
        [[ -d "$REPO_ROOT/.lore/skills/$ref" ]] \
          || fail "Agent '$agent' references missing skill '$ref'"
      else
        in_skills=false # Non-list line = end of skills block
      fi
    fi
  done < "$f"
done

# -- 4. Platform copies match canonical source --
echo "--- Platform Sync ---"
if [[ -d "$REPO_ROOT/.lore/skills" ]]; then
  # Check .claude/skills/ matches .lore/skills/
  if [[ -d "$REPO_ROOT/.claude/skills" ]]; then
    diff_out=$(diff --strip-trailing-cr -rq "$REPO_ROOT/.lore/skills" "$REPO_ROOT/.claude/skills" 2>&1) || true
    if [[ -n "$diff_out" ]]; then
      fail ".claude/skills/ out of sync with .lore/skills/ — run: bash .lore/scripts/sync-platform-skills.sh"
    fi
  else
    fail ".claude/skills/ missing — run: bash .lore/scripts/sync-platform-skills.sh"
  fi
fi
# Agent platform copies are transformed (model cascade), so check existence not content
if [[ -d "$REPO_ROOT/.lore/agents" ]]; then
  if [[ -d "$REPO_ROOT/.claude/agents" ]]; then
    for f in "$REPO_ROOT"/.lore/agents/*.md; do
      [[ -f "$f" ]] || continue
      agent_base=$(basename "$f")
      [[ -f "$REPO_ROOT/.claude/agents/$agent_base" ]] \
        || fail ".claude/agents/$agent_base missing — run: bash .lore/scripts/sync-platform-skills.sh"
    done
  else
    fail ".claude/agents/ missing — run: bash .lore/scripts/sync-platform-skills.sh"
  fi
fi

# -- 5. Instructions copies match canonical source --
echo "--- Instructions Sync ---"
if [[ -f "$REPO_ROOT/.lore/instructions.md" ]]; then
  # CLAUDE.md is a direct copy of instructions.md
  # Use --strip-trailing-cr to handle CRLF on Windows
  if [[ -f "$REPO_ROOT/CLAUDE.md" ]]; then
    if ! diff --strip-trailing-cr -q "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md" >/dev/null 2>&1; then
      fail "CLAUDE.md out of sync with .lore/instructions.md — run: bash .lore/scripts/sync-platform-skills.sh"
    fi
  else
    fail "CLAUDE.md missing — run: bash .lore/scripts/sync-platform-skills.sh"
  fi

  # lore-core.mdc has frontmatter + instructions body — compare body only.
  # Uses node to strip frontmatter (same regex as lib/banner.js stripFrontmatter).
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
      || fail "lore-core.mdc body out of sync with .lore/instructions.md — run: bash .lore/scripts/generate-cursor-rules.sh"
  else
    fail "lore-core.mdc missing — run: bash .lore/scripts/generate-cursor-rules.sh"
  fi
fi

# -- 6. Cursor hooks configuration --
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

# -- 7. Linked repos --
echo "--- Linked Repos ---"
if [[ -f "$REPO_ROOT/.lore/links" ]]; then
  while IFS= read -r lpath; do
    [[ -d "$lpath" ]] || fail "Linked repo no longer exists: $lpath"
  done < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(l=>console.log(l.path))" "$REPO_ROOT/.lore/links")
fi

# -- Results --
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAILED: $ERRORS inconsistencies"
  exit 1
else
  echo "PASSED: All checks passed"
fi
