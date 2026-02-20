#!/usr/bin/env bash
# Validates cross-reference consistency between skills, agents, and registries.
# Run after any structural change to catch drift.
#
# Checks (11 total):
#   1. Every skill directory has a registry entry
#   2. Every agent file has a registry entry
#   3. Every registry skill has a directory on disk
#   4. Every registry agent has a file on disk
#   5. Skill frontmatter has required fields (name, description)
#   6. Agent frontmatter has required fields (name, description, model or per-platform model)
#   7. Agent skill references point to existing directories
#   8. Platform copies (.claude/) match canonical source (.lore/)
#   9. CLAUDE.md and lore-core.mdc body match .lore/instructions.md
#  10. Cursor hooks configuration references existing scripts
#  11. Linked repos (.lore-links) still exist on disk
#
# Exit code: 0 = all passed, 1 = inconsistencies found

set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

# shellcheck source=scripts/lib/common.sh
source "$(dirname "$0")/lib/common.sh"

fail() { echo "  FAIL: $1"; ERRORS=$((ERRORS + 1)); }

echo "=== Lore Consistency Validation ==="
echo ""

# -- 1. Every skill directory → registry entry --
echo "--- Skills vs Registry ---"
for dir in "$REPO_ROOT"/.lore/skills/*/; do
  name=$(basename "$dir")
  # Allow hyphens or spaces in registry matching
  # shellcheck disable=SC2001
  pattern=$(echo "$name" | sed 's/-/[- ]/g')
  grep -qi "$pattern" "$REPO_ROOT/skills-registry.md" 2>/dev/null \
    || fail "Skill '$name' not in skills-registry.md"
done

# -- 2. Every agent file → registry entry --
echo "--- Agents vs Registry ---"
for f in "$REPO_ROOT"/.lore/agents/*.md; do
  name=$(basename "$f" .md)
  # shellcheck disable=SC2001
  pattern=$(echo "$name" | sed 's/-/[- ]/g')
  grep -qi "$pattern" "$REPO_ROOT/agent-registry.md" 2>/dev/null \
    || fail "Agent '$name' not in agent-registry.md"
done

# -- 3. Every registry skill → directory on disk --
echo "--- Registry vs Skill Dirs ---"
if [[ -f "$REPO_ROOT/skills-registry.md" ]]; then
  while IFS='|' read -r _ skill _; do
    skill=$(echo "$skill" | xargs)
    [[ -z "$skill" || "$skill" == "Skill" ]] && continue
    [[ -d "$REPO_ROOT/.lore/skills/$skill" ]] \
      || fail "Registry skill '$skill' has no directory"
  done < <(grep -E '^\|' "$REPO_ROOT/skills-registry.md" | grep -v '|---' || true)
fi

# -- 4. Every registry agent → file on disk --
echo "--- Registry vs Agent Files ---"
if [[ -f "$REPO_ROOT/agent-registry.md" ]]; then
  while IFS='|' read -r _ agent _; do
    agent=$(echo "$agent" | xargs)
    [[ -z "$agent" || "$agent" == "Agent" ]] && continue
    [[ -f "$REPO_ROOT/.lore/agents/$agent.md" ]] \
      || fail "Registry agent '$agent' has no file"
  done < <(grep -E '^\|' "$REPO_ROOT/agent-registry.md" | grep -v '|---' || true)
fi

# -- 5. Skill frontmatter: required fields --
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

# -- 6. Agent frontmatter: required fields --
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

# -- 7. Agent skill references → existing directories --
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

# -- 8. Platform copies match canonical source --
echo "--- Platform Sync ---"
if [[ -d "$REPO_ROOT/.lore/skills" ]]; then
  # Check .claude/skills/ matches .lore/skills/
  if [[ -d "$REPO_ROOT/.claude/skills" ]]; then
    diff_out=$(diff --strip-trailing-cr -rq "$REPO_ROOT/.lore/skills" "$REPO_ROOT/.claude/skills" 2>&1) || true
    if [[ -n "$diff_out" ]]; then
      fail ".claude/skills/ out of sync with .lore/skills/ — run: bash scripts/sync-platform-skills.sh"
    fi
  else
    fail ".claude/skills/ missing — run: bash scripts/sync-platform-skills.sh"
  fi
fi
# Agent platform copies are transformed (model cascade), so check existence not content
if [[ -d "$REPO_ROOT/.lore/agents" ]]; then
  if [[ -d "$REPO_ROOT/.claude/agents" ]]; then
    for f in "$REPO_ROOT"/.lore/agents/*.md; do
      [[ -f "$f" ]] || continue
      agent_base=$(basename "$f")
      [[ -f "$REPO_ROOT/.claude/agents/$agent_base" ]] \
        || fail ".claude/agents/$agent_base missing — run: bash scripts/sync-platform-skills.sh"
    done
  else
    fail ".claude/agents/ missing — run: bash scripts/sync-platform-skills.sh"
  fi
fi

# -- 9. Instructions copies match canonical source --
echo "--- Instructions Sync ---"
if [[ -f "$REPO_ROOT/.lore/instructions.md" ]]; then
  # CLAUDE.md is a direct copy of instructions.md
  # Use --strip-trailing-cr to handle CRLF on Windows
  if [[ -f "$REPO_ROOT/CLAUDE.md" ]]; then
    if ! diff --strip-trailing-cr -q "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md" >/dev/null 2>&1; then
      fail "CLAUDE.md out of sync with .lore/instructions.md — run: bash scripts/sync-platform-skills.sh"
    fi
  else
    fail "CLAUDE.md missing — run: bash scripts/sync-platform-skills.sh"
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
      || fail "lore-core.mdc body out of sync with .lore/instructions.md — run: bash scripts/generate-cursor-rules.sh"
  else
    fail "lore-core.mdc missing — run: bash scripts/generate-cursor-rules.sh"
  fi
fi

# -- 10. Cursor hooks configuration --
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

# -- 11. Linked repos --
echo "--- Linked Repos ---"
if [[ -f "$REPO_ROOT/.lore-links" ]]; then
  while IFS= read -r lpath; do
    [[ -d "$lpath" ]] || fail "Linked repo no longer exists: $lpath"
  done < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(l=>console.log(l.path))" "$REPO_ROOT/.lore-links")
fi

# -- Results --
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAILED: $ERRORS inconsistencies"
  exit 1
else
  echo "PASSED: All checks passed"
fi
