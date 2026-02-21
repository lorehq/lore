#!/usr/bin/env bash
# Syncs framework-owned files from a source directory into the current Lore instance.
# Overwrites framework files, never deletes operator content.
#
# Usage: .lore/scripts/sync-framework.sh <source-dir>
#
# Framework-owned (synced):
#   .lore/hooks/, .lore/lib/, .lore/scripts/, .opencode/, .cursor/, opencode.json,
#   .claude/settings.json, .lore/skills/lore-*/, .lore/agents/lore-*,
#   .lore/instructions.md, .gitignore
#
# Operator-owned (never touched):
#   docs/, non-lore-* skills/agents, mkdocs.yml, .lore/config.json,
#   .lore/memory.local.md, .lore/operator.gitignore
#
# .gitignore is framework-owned but merged: framework rules are written first,
# then .lore/operator.gitignore contents are appended (if non-empty).

set -euo pipefail

SOURCE="${1:?Usage: sync-framework.sh <source-dir>}"
TARGET="$(pwd)"

if [ ! -f "$TARGET/.lore/config.json" ]; then
  echo "Error: not a Lore instance (no .lore/config.json found)" >&2
  exit 1
fi

if [ ! -d "$SOURCE/.lore/hooks" ]; then
  echo "Error: source doesn't look like a Lore template (no .lore/hooks/)" >&2
  exit 1
fi

# Framework directories — overwrite contents, don't delete operator extras
cp -Rf "$SOURCE/.lore/hooks/." "$TARGET/.lore/hooks/"
cp -Rf "$SOURCE/.lore/lib/." "$TARGET/.lore/lib/"
cp -Rf "$SOURCE/.lore/scripts/." "$TARGET/.lore/scripts/"
cp -Rf "$SOURCE/.opencode/." "$TARGET/.opencode/"
# Selective .cursor/ sync — hooks and hooks.json are framework-owned,
# but .cursor/rules/ contains both framework and instance-specific .mdc files.
# Copy hooks directly, then copy only framework-owned rules.
cp -Rf "$SOURCE/.cursor/hooks/." "$TARGET/.cursor/hooks/"
cp "$SOURCE/.cursor/hooks.json" "$TARGET/.cursor/hooks.json"
# MCP server — exposes lore_check_in and lore_context as Cursor tools.
# Both the server script and the config are framework-owned.
mkdir -p "$TARGET/.cursor/mcp"
cp "$SOURCE/.cursor/mcp/lore-server.js" "$TARGET/.cursor/mcp/lore-server.js"
cp "$SOURCE/.cursor/mcp.json" "$TARGET/.cursor/mcp.json"

# Framework-owned rules (content derived from instructions.md, same across instances)
mkdir -p "$TARGET/.cursor/rules"
for rule in lore-core lore-work-tracking lore-knowledge-routing lore-skill-creation lore-docs-formatting; do
  [ -f "$SOURCE/.cursor/rules/$rule.mdc" ] && cp "$SOURCE/.cursor/rules/$rule.mdc" "$TARGET/.cursor/rules/$rule.mdc"
done

# Framework skills (lore-* only) — overwrite existing, skip operator skills
if [ -d "$SOURCE/.lore/skills" ]; then
  mkdir -p "$TARGET/.lore/skills"
  for skill_dir in "$SOURCE/.lore/skills"/lore-*/; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$TARGET/.lore/skills/$skill_name"
    cp -Rf "$skill_dir"* "$TARGET/.lore/skills/$skill_name/"
  done
fi

# Framework agents (lore-* only) — overwrite existing, skip operator agents
if [ -d "$SOURCE/.lore/agents" ]; then
  mkdir -p "$TARGET/.lore/agents"
  for agent_file in "$SOURCE/.lore/agents"/lore-*.md; do
    [ -f "$agent_file" ] || continue
    cp "$agent_file" "$TARGET/.lore/agents/$(basename "$agent_file")"
  done
fi

# Single files
[ -f "$SOURCE/.lore/docker-compose.yml" ] && cp "$SOURCE/.lore/docker-compose.yml" "$TARGET/.lore/docker-compose.yml"
cp "$SOURCE/.lore/instructions.md" "$TARGET/.lore/instructions.md"
cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
# Merge .gitignore: always inject framework rules, then append operator additions
cp "$SOURCE/.gitignore" "$TARGET/.gitignore"
if [ -s "$TARGET/.lore/operator.gitignore" ]; then
  printf '\n# --- operator rules (from .lore/operator.gitignore) ---\n' >> "$TARGET/.gitignore"
  cat "$TARGET/.lore/operator.gitignore" >> "$TARGET/.gitignore"
fi
cp "$SOURCE/opencode.json" "$TARGET/opencode.json"

# Generate platform copies from canonical .lore/ source
bash "$TARGET/.lore/scripts/sync-platform-skills.sh"

echo "Framework synced from $SOURCE"

if [ -f "$TARGET/.lore/links" ]; then
  echo "Note: Run 'bash .lore/scripts/lore-link.sh --refresh' to update linked repos."
fi
