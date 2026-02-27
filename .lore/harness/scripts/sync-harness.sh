#!/usr/bin/env bash
# Syncs harness-owned files from a source directory into the current Lore instance.
# Overwrites harness files, never deletes operator content.
#
# Usage: .lore/harness/scripts/sync-harness.sh <source-dir>
#
# Harness-owned (synced):
#   .lore/harness/hooks/, .lore/harness/lib/, .lore/harness/mcp/, .lore/harness/scripts/, .lore/harness/templates/,
#   .lore/fieldnotes/, .opencode/, .cursor/, opencode.json, .mcp.json,
#   .claude/settings.json, .lore/skills/lore-*/, .lore/agents/lore-*,
#   .lore/instructions.md, .gitignore
#
# Operator-owned (never touched):
#   docs/, non-lore-* skills/agents, mkdocs.yml, .lore/config.json,
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

if [ -f "$TARGET/test/lore-link.test.js" ] || [ -f "$TARGET/package.json" ]; then
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

# Migrate pre-v0.16 flat layout → .lore/harness/ (safe to re-run)
for d in hooks lib scripts mcp templates; do
  if [ -d "$TARGET/.lore/$d" ] && [ ! -d "$TARGET/.lore/harness/$d" ]; then
    mkdir -p "$TARGET/.lore/harness"
    mv "$TARGET/.lore/$d" "$TARGET/.lore/harness/$d"
  elif [ -d "$TARGET/.lore/$d" ] && [ -d "$TARGET/.lore/harness/$d" ]; then
    rm -rf "$TARGET/.lore/$d"
  fi
done

# Harness directories — overwrite contents, don't delete operator extras
mkdir -p "$TARGET/.lore/harness/hooks" "$TARGET/.lore/harness/lib" "$TARGET/.lore/harness/scripts" "$TARGET/.lore/harness/mcp" "$TARGET/.lore/harness/templates"
cp -Rf "$SOURCE/.lore/harness/hooks/." "$TARGET/.lore/harness/hooks/"
cp -Rf "$SOURCE/.lore/harness/lib/." "$TARGET/.lore/harness/lib/"
cp -Rf "$SOURCE/.lore/harness/scripts/." "$TARGET/.lore/harness/scripts/"
mkdir -p "$TARGET/.opencode" "$TARGET/.cursor/hooks" "$TARGET/.claude"
cp -Rf "$SOURCE/.opencode/." "$TARGET/.opencode/"
# Selective .cursor/ sync — hooks and hooks.json are harness-owned,
# but .cursor/rules/ contains both harness and instance-specific .mdc files.
# Copy hooks directly, then copy only harness-owned rules.
cp -Rf "$SOURCE/.cursor/hooks/." "$TARGET/.cursor/hooks/"
cp "$SOURCE/.cursor/hooks.json" "$TARGET/.cursor/hooks.json"
# MCP server — exposes lore_check_in and lore_context as Cursor tools.
# Both the server script and the config are harness-owned.
mkdir -p "$TARGET/.cursor/mcp"
cp "$SOURCE/.cursor/mcp/lore-server.js" "$TARGET/.cursor/mcp/lore-server.js"
cp "$SOURCE/.cursor/mcp.json" "$TARGET/.cursor/mcp.json"
# Knowledge base search MCP — platform-agnostic semantic search tool.
mkdir -p "$TARGET/.lore/harness/mcp"
cp "$SOURCE/.lore/harness/mcp/search-server.js" "$TARGET/.lore/harness/mcp/search-server.js"

# Harness-owned rules (content derived from instructions.md, same across instances)
mkdir -p "$TARGET/.cursor/rules"
for rule in lore-core lore-work-tracking lore-knowledge-routing lore-skill-creation lore-docs-formatting; do
  [ -f "$SOURCE/.cursor/rules/$rule.mdc" ] && cp "$SOURCE/.cursor/rules/$rule.mdc" "$TARGET/.cursor/rules/$rule.mdc"
done

# Harness skills (lore-* only) — overwrite existing, skip operator skills
if [ -d "$SOURCE/.lore/skills" ]; then
  mkdir -p "$TARGET/.lore/skills"
  for skill_dir in "$SOURCE/.lore/skills"/lore-*/; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$TARGET/.lore/skills/$skill_name"
    cp -Rf "$skill_dir"* "$TARGET/.lore/skills/$skill_name/"
  done
fi

# Harness fieldnotes — overwrite existing, skip operator fieldnotes
if [ -d "$SOURCE/.lore/fieldnotes" ]; then
  mkdir -p "$TARGET/.lore/fieldnotes"
  for note_dir in "$SOURCE/.lore/fieldnotes"/*/; do
    [ -d "$note_dir" ] || continue
    note_name="$(basename "$note_dir")"
    mkdir -p "$TARGET/.lore/fieldnotes/$note_name"
    cp -Rf "$note_dir"* "$TARGET/.lore/fieldnotes/$note_name/"
  done
fi

# Harness agent templates — lore-worker.md lives in templates/, tiers generated at session start
if [ -d "$SOURCE/.lore/harness/templates" ]; then
  mkdir -p "$TARGET/.lore/harness/templates"
  cp -Rf "$SOURCE/.lore/harness/templates/." "$TARGET/.lore/harness/templates/"
fi

# Harness agents (lore-* only, non-worker) — overwrite existing, skip operator agents
# Worker tiers are generated from template by generate-agents.js at session start
if [ -d "$SOURCE/.lore/agents" ]; then
  mkdir -p "$TARGET/.lore/agents"
  for agent_file in "$SOURCE/.lore/agents"/lore-*.md; do
    [ -f "$agent_file" ] || continue
    cp "$agent_file" "$TARGET/.lore/agents/$(basename "$agent_file")"
  done
fi

# Harness-owned system rules — always overwrite
if [ -d "$SOURCE/.lore/rules/system" ]; then
  mkdir -p "$TARGET/.lore/rules/system"
  cp -Rf "$SOURCE/.lore/rules/system/." "$TARGET/.lore/rules/system/"
fi

# Harness-owned system runbooks — always overwrite
if [ -d "$SOURCE/.lore/runbooks/system" ]; then
  mkdir -p "$TARGET/.lore/runbooks/system"
  cp -Rf "$SOURCE/.lore/runbooks/system/." "$TARGET/.lore/runbooks/system/"
fi

# Single files
[ -f "$SOURCE/.lore/docker-compose.yml" ] && cp "$SOURCE/.lore/docker-compose.yml" "$TARGET/.lore/docker-compose.yml"
cp "$SOURCE/.lore/instructions.md" "$TARGET/.lore/instructions.md"
cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
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

# Generate platform copies from canonical .lore/ source
bash "$TARGET/.lore/harness/scripts/sync-platform-skills.sh"

echo "Harness synced from $SOURCE"

if [ -f "$TARGET/.lore/links" ]; then
  echo "Note: Run 'bash .lore/harness/scripts/lore-link.sh --refresh' to update linked repos."
fi
