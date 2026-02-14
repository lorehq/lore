#!/usr/bin/env bash
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[[ -d .claude/skills ]] || { echo "No skills directory"; exit 0; }
mkdir -p .claude/agents

get_field() {
  awk -v f="$1" '/^---$/{if(fm)exit;fm=1;next} fm&&$1==f":"{sub("^"f": *","");print;exit}' "$2"
}

# Map existing agents by domain
declare -A existing
for f in .claude/agents/*.md; do
  [[ -f "$f" ]] || continue
  d=$(get_field domain "$f")
  [[ -n "$d" ]] && existing["$d"]=1
done

# Group skills by domain
declare -A domain_skills
for skill_dir in .claude/skills/*/; do
  sf="$skill_dir/SKILL.md"
  [[ -f "$sf" ]] || continue
  domain=$(get_field domain "$sf")
  [[ -z "$domain" || "$domain" == "Orchestrator" ]] && continue
  name=$(basename "$skill_dir")
  if [[ -v domain_skills["$domain"] ]]; then
    domain_skills["$domain"]+=" $name"
  else
    domain_skills["$domain"]="$name"
  fi
done

echo "Found ${#domain_skills[@]} domains"

for domain in "${!domain_skills[@]}"; do
  [[ -v existing["$domain"] ]] && { echo "Skip $domain — agent exists"; continue; }

  slug=$(echo "$domain" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  agent_name="${slug}-agent"
  skills="${domain_skills[$domain]}"

  skills_yaml=""
  for s in $skills; do skills_yaml+="  - $s"$'\n'; done

  cat > ".claude/agents/${agent_name}.md" <<EOF
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
