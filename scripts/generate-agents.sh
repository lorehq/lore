#!/usr/bin/env bash
# Batch-generates agent files for domains that have skills but no agent.
# Skips Orchestrator domain (internal skills don't get their own agent).
# Run generate-registries.sh after this to update the registry tables.
#
# This is a catch-up tool. Normally, create-skill handles agent creation
# one at a time. Use this when skills were added manually without agents.
#
# Compatible with Bash 3.2+ (macOS stock). No associative arrays.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[[ -d .lore/skills ]] || { echo "No skills directory"; exit 0; }
mkdir -p .lore/agents

# Extract a field from YAML frontmatter
get_field() {
  awk -v f="$1" '/^---$/{if(fm)exit;fm=1;next} fm&&$1==f":"{sub("^"f": *","");print;exit}' "$2"
}

# Lowercase a string (portable — no ${var,,} which requires Bash 4+)
to_lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

# -- Map existing agents by domain (lowercase, pipe-delimited for lookup) --
existing_domains="|"
for f in .lore/agents/*.md; do
  [[ -f "$f" ]] || continue
  d=$(get_field domain "$f")
  [[ -n "$d" ]] && existing_domains="${existing_domains}$(to_lower "$d")|"
done

# -- Group skills by domain (skip Orchestrator) --
# Store as parallel arrays: domain_names[i] and domain_skills[i]
domain_names=()
domain_skills=()

for skill_dir in .lore/skills/*/; do
  sf="$skill_dir/SKILL.md"
  [[ -f "$sf" ]] || continue
  domain=$(get_field domain "$sf")
  [[ -z "$domain" || "$domain" == "Orchestrator" ]] && continue
  name=$(basename "$skill_dir")

  # Check if domain already in our list
  found=-1
  for i in "${!domain_names[@]}"; do
    if [[ "${domain_names[$i]}" == "$domain" ]]; then
      found=$i
      break
    fi
  done

  if [[ $found -ge 0 ]]; then
    domain_skills[$found]="${domain_skills[$found]} $name"
  else
    domain_names+=("$domain")
    domain_skills+=("$name")
  fi
done

echo "Found ${#domain_names[@]} domains"

# -- Create missing agents --
for i in "${!domain_names[@]}"; do
  domain="${domain_names[$i]}"
  domain_lower=$(to_lower "$domain")

  # Skip if agent already exists for this domain
  case "$existing_domains" in
    *"|${domain_lower}|"*) echo "Skip $domain — agent exists"; continue ;;
  esac

  # Convert domain name to kebab-case slug for the filename
  slug=$(echo "$domain" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  agent_name="${slug}-agent"
  skills="${domain_skills[$i]}"

  # Build YAML skills list
  skills_yaml=""
  for s in $skills; do skills_yaml+="  - $s"$'\n'; done

  cat > ".lore/agents/${agent_name}.md" <<EOF
---
name: $agent_name
description: ${domain} operations specialist. Generated from skills.
domain: $domain
model: sonnet
skills:
$skills_yaml---

# ${domain} Agent

Handles all ${domain} operations. Create new skills as needed.

## Available Skills
$(for s in $skills; do echo "- \`$s\`"; done)
EOF

  echo "Created $agent_name"
done

echo "Done. Run: bash scripts/generate-registries.sh"
echo "Then run: bash scripts/sync-platform-skills.sh"
