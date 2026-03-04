#!/usr/bin/env bash
# Syncs harness-owned files from a source directory into the current Lore instance.
# Overwrites harness files, never deletes operator content.
#
# Usage: .lore/harness/scripts/sync-harness.sh <source-dir>
#
# Harness-owned (synced):
#   .lore/harness/hooks/, .lore/harness/lib/, .lore/harness/mcp/, .lore/harness/scripts/, .lore/harness/templates/,
#   .lore/harness/skills/lore*/,
#   .opencode/, .cursor/, .gemini/, opencode.json, .mcp.json,
#   .claude/settings.json, .lore/instructions.md, .gitignore, .windsurfrules
#
# Operator-owned (never touched):
#   non-lore-* skills/agents, .lore/config.json,
#   .lore/memory.local.md, .lore/operator.gitignore
#
# .gitignore is harness-owned but merged: harness rules are written first,
# then .lore/operator.gitignore contents are appended (if non-empty).

set -euo pipefail

SOURCE="${1:?Usage: sync-harness.sh <source-dir>}"
TARGET="$(pwd)"

# --- Direction guard ---
# This script copies FROM <source> INTO <cwd>.
# Source = harness repo (or temp clone). Target = the instance being updated.
# Getting this backwards overwrites harness files with stale instance copies.

if [ "$(realpath "$SOURCE")" = "$(realpath "$TARGET")" ]; then
  echo "Error: source and target are the same directory" >&2
  exit 1
fi

if [ -f "$TARGET/package.json" ]; then
  echo "Error: target (cwd) looks like the harness repo, not an instance." >&2
  echo "Direction: run FROM the instance, pass the harness repo as the argument." >&2
  echo "  cd /path/to/my-instance && bash .lore/harness/scripts/sync-harness.sh /path/to/lore" >&2
  exit 1
fi

if [ ! -f "$TARGET/.lore/config.json" ]; then
  echo "Error: not a Lore instance (no .lore/config.json found)" >&2
  exit 1
fi

if [ ! -d "$SOURCE/.lore/harness/hooks" ]; then
  echo "Error: source doesn't look like a Lore template (no .lore/harness/hooks/)" >&2
  exit 1
fi

# Harness directories — overwrite contents, don't delete operator extras
mkdir -p "$TARGET/.lore/harness/hooks" "$TARGET/.lore/harness/lib" "$TARGET/.lore/harness/scripts" "$TARGET/.lore/harness/mcp" "$TARGET/.lore/harness/templates"
cp -Rf "$SOURCE/.lore/harness/hooks/." "$TARGET/.lore/harness/hooks/"
cp -Rf "$SOURCE/.lore/harness/lib/." "$TARGET/.lore/harness/lib/"
cp -Rf "$SOURCE/.lore/harness/scripts/." "$TARGET/.lore/harness/scripts/"
mkdir -p "$TARGET/.opencode" "$TARGET/.cursor/hooks" "$TARGET/.claude"
[ -d "$SOURCE/.opencode" ] && cp -Rf "$SOURCE/.opencode/." "$TARGET/.opencode/"
# Selective .cursor/ sync — hooks and hooks.json are harness-owned,
# but .cursor/rules/ contains both harness and instance-specific .mdc files.
# Copy hooks directly, then copy only harness-owned rules.
[ -d "$SOURCE/.cursor/hooks" ] && cp -Rf "$SOURCE/.cursor/hooks/." "$TARGET/.cursor/hooks/"
[ -f "$SOURCE/.cursor/hooks.json" ] && cp "$SOURCE/.cursor/hooks.json" "$TARGET/.cursor/hooks.json"
mkdir -p "$TARGET/.gemini"
[ -d "$SOURCE/.gemini" ] && cp -Rf "$SOURCE/.gemini/." "$TARGET/.gemini/"
# MCP server — exposes lore_check_in and lore_context as Cursor tools.
# Both the server script and the config are harness-owned.
mkdir -p "$TARGET/.cursor/mcp"
[ -f "$SOURCE/.cursor/mcp/lore-server.js" ] && cp "$SOURCE/.cursor/mcp/lore-server.js" "$TARGET/.cursor/mcp/lore-server.js"
[ -f "$SOURCE/.cursor/mcp.json" ] && cp "$SOURCE/.cursor/mcp.json" "$TARGET/.cursor/mcp.json"
# Knowledge base search MCP — platform-agnostic semantic search tool.
mkdir -p "$TARGET/.lore/harness/mcp"
cp "$SOURCE/.lore/harness/mcp/lore-server.js" "$TARGET/.lore/harness/mcp/lore-server.js"
# Harness-owned rules
mkdir -p "$TARGET/.cursor/rules"
for rule in lore-core lore-work-tracking lore-knowledge-routing lore-skill-creation lore-docs-formatting; do
  [ -f "$SOURCE/.cursor/rules/$rule.mdc" ] && cp "$SOURCE/.cursor/rules/$rule.mdc" "$TARGET/.cursor/rules/$rule.mdc"
done

# Harness skills (lore and lore-* only) — overwrite existing, skip operator skills
if [ -d "$SOURCE/.lore/harness/skills" ]; then
  mkdir -p "$TARGET/.lore/harness/skills"
  for skill_dir in "$SOURCE/.lore/harness/skills"/lore*/; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$TARGET/.lore/harness/skills/$skill_name"
    cp -Rf "$skill_dir"* "$TARGET/.lore/harness/skills/$skill_name/"
  done
fi


# Harness templates
if [ -d "$SOURCE/.lore/harness/templates" ]; then
  mkdir -p "$TARGET/.lore/harness/templates"
  cp -Rf "$SOURCE/.lore/harness/templates/." "$TARGET/.lore/harness/templates/"
fi

# Harness migrations
if [ -d "$SOURCE/.lore/harness/migrations" ]; then
  mkdir -p "$TARGET/.lore/harness/migrations"
  cp -Rf "$SOURCE/.lore/harness/migrations/." "$TARGET/.lore/harness/migrations/"
fi


# Single files
# docker-compose.yml now lives in ~/.lore/ (global), not per-instance
cp "$SOURCE/.lore/instructions.md" "$TARGET/.lore/instructions.md"
[ -f "$SOURCE/.claude/settings.json" ] && cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
# Bootstrap operator.gitignore on first sync — never overwrite if it exists
[ -f "$TARGET/.lore/operator.gitignore" ] || cp "$SOURCE/.lore/operator.gitignore" "$TARGET/.lore/operator.gitignore"
# Merge .gitignore: always inject harness rules, then append operator additions
cp "$SOURCE/.gitignore" "$TARGET/.gitignore"
if [ -s "$TARGET/.lore/operator.gitignore" ]; then
  printf '\n# --- operator rules (from .lore/operator.gitignore) ---\n' >> "$TARGET/.gitignore"
  cat "$TARGET/.lore/operator.gitignore" >> "$TARGET/.gitignore"
fi
cp "$SOURCE/opencode.json" "$TARGET/opencode.json"
cp "$SOURCE/.mcp.json" "$TARGET/.mcp.json"
[ -f "$SOURCE/.windsurfrules" ] && cp "$SOURCE/.windsurfrules" "$TARGET/.windsurfrules"

# Generate platform copies from canonical .lore/ source
bash "$TARGET/.lore/harness/scripts/sync-platform-skills.sh"

echo "Harness synced from $SOURCE"
