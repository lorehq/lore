#!/usr/bin/env bash
# Validates cross-reference consistency between skills, agents, and registries.
# Run after any structural change to catch drift.
#
# Checks (7 total):
#   1. Every skill directory has a registry entry
#   2. Every agent file has a registry entry
#   3. Every registry skill has a directory on disk
#   4. Every registry agent has a file on disk
#   5. Skill frontmatter has required fields (name, domain, description)
#   6. Agent frontmatter has required fields (name, domain, description, model)
#   7. Agent skill references point to existing directories
#
# Exit code: 0 = all passed, 1 = inconsistencies found

set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

fail() { echo "  FAIL: $1"; ERRORS=$((ERRORS + 1)); }

# Extract a field from YAML frontmatter between --- markers
extract_field() {
  awk -v f="$1" '/^---$/{if(fm)exit;fm=1;next} fm&&$1==f":"{sub("^"f": *","");print;exit}' "$2" 2>/dev/null
}

echo "=== Lore Consistency Validation ==="
echo ""

# -- 1. Every skill directory → registry entry --
echo "--- Skills vs Registry ---"
for dir in "$REPO_ROOT"/.claude/skills/*/; do
  name=$(basename "$dir")
  # Allow hyphens or spaces in registry matching
  pattern=$(echo "$name" | sed 's/-/[- ]/g')
  grep -qi "$pattern" "$REPO_ROOT/skills-registry.md" 2>/dev/null \
    || fail "Skill '$name' not in skills-registry.md"
done

# -- 2. Every agent file → registry entry --
echo "--- Agents vs Registry ---"
for f in "$REPO_ROOT"/.claude/agents/*.md; do
  name=$(basename "$f" .md)
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
    [[ -d "$REPO_ROOT/.claude/skills/$skill" ]] \
      || fail "Registry skill '$skill' has no directory"
  done < <(grep -E '^\|' "$REPO_ROOT/skills-registry.md" | grep -v '|---' || true)
fi

# -- 4. Every registry agent → file on disk --
echo "--- Registry vs Agent Files ---"
if [[ -f "$REPO_ROOT/agent-registry.md" ]]; then
  while IFS='|' read -r _ agent _; do
    agent=$(echo "$agent" | xargs)
    [[ -z "$agent" || "$agent" == "Agent" ]] && continue
    [[ -f "$REPO_ROOT/.claude/agents/$agent.md" ]] \
      || fail "Registry agent '$agent' has no file"
  done < <(grep -E '^\|' "$REPO_ROOT/agent-registry.md" | grep -v '|---' || true)
fi

# -- 5. Skill frontmatter: required fields --
echo "--- Skill Frontmatter ---"
for dir in "$REPO_ROOT"/.claude/skills/*/; do
  sf="$dir/SKILL.md"
  [[ -f "$sf" ]] || continue
  name=$(basename "$dir")
  for field in name domain description; do
    val=$(extract_field "$field" "$sf")
    [[ -z "$val" ]] && fail "Skill '$name' missing '$field'"
  done
done

# -- 6. Agent frontmatter: required fields --
echo "--- Agent Frontmatter ---"
for f in "$REPO_ROOT"/.claude/agents/*.md; do
  name=$(basename "$f" .md)
  for field in name domain description model; do
    val=$(extract_field "$field" "$f")
    [[ -z "$val" ]] && fail "Agent '$name' missing '$field'"
  done
done

# -- 7. Agent skill references → existing directories --
echo "--- Agent-Skill References ---"
for f in "$REPO_ROOT"/.claude/agents/*.md; do
  agent=$(basename "$f" .md)
  in_skills=false
  while IFS= read -r line; do
    # Enter skills list when we hit "skills:" key
    [[ "$line" =~ ^skills: ]] && { in_skills=true; continue; }
    if $in_skills; then
      # Parse "  - skill-name" entries
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
        ref=$(echo "${BASH_REMATCH[1]}" | xargs)
        [[ -d "$REPO_ROOT/.claude/skills/$ref" ]] \
          || fail "Agent '$agent' references missing skill '$ref'"
      else
        in_skills=false # Non-list line = end of skills block
      fi
    fi
  done < "$f"
done

# -- Results --
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAILED: $ERRORS inconsistencies"
  exit 1
else
  echo "PASSED: All checks passed"
fi
