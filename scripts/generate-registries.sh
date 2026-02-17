#!/usr/bin/env bash
# Regenerates agent-registry.md and skills-registry.md from filesystem.
# Run after creating or modifying any skill or agent file.
#
# Reads YAML frontmatter (name, domain, description) from:
#   .lore/skills/*/SKILL.md  →  skills-registry.md
#   .lore/agents/*.md        →  agent-registry.md

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Extract a field value from YAML frontmatter between --- markers
# Usage: extract_field <field_name> <file_path>
extract_field() {
  awk -v field="$1" '
    /^---$/ { if (in_fm) exit; in_fm=1; next }
    in_fm && $1 == field":" { sub("^" field ": *", ""); print; exit }
  ' "$2"
}

# -- Agent Registry --
{
  echo "# Agent Registry"
  echo ""
  echo "| Agent | Domain | Skills |"
  echo "|-------|--------|--------|"

  for agent_file in "$REPO_ROOT"/.lore/agents/*.md; do
    [ -f "$agent_file" ] || continue
    name=$(extract_field name "$agent_file")
    [ -z "$name" ] && continue
    domain=$(extract_field domain "$agent_file")
    # Count skills listed under the "skills:" YAML key
    count=$(awk '/^skills:/{f=1;next} f&&/^  - /{c++} f&&/^[a-z]/{f=0} END{print c+0}' "$agent_file")
    echo "| $name | $domain | $count |"
  done
  echo ""
} > agent-registry.md

# -- Skills Registry --
{
  echo "# Skills Registry"
  echo ""
  echo "| Skill | Domain | Description |"
  echo "|-------|--------|-------------|"

  for skill_file in "$REPO_ROOT"/.lore/skills/*/SKILL.md; do
    [ -f "$skill_file" ] || continue
    name=$(extract_field name "$skill_file")
    [ -z "$name" ] && continue
    domain=$(extract_field domain "$skill_file")
    desc=$(extract_field description "$skill_file")
    echo "| $name | $domain | $desc |"
  done
  echo ""
} > skills-registry.md

echo "Generated agent-registry.md and skills-registry.md"
