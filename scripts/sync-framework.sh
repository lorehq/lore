#!/usr/bin/env bash
# Syncs framework-owned files from a source directory into the current Lore instance.
# Overwrites framework files, never deletes operator content.
#
# Usage: scripts/sync-framework.sh <source-dir>
#
# Framework-owned (synced):
#   hooks/, scripts/, .claude/settings.json, .claude/skills/<built-in>/, CLAUDE.md, .gitignore
#
# Operator-owned (never touched):
#   docs/, .claude/agents/, mkdocs.yml, .lore-config, MEMORY.local.md, *-registry.md

set -euo pipefail

SOURCE="${1:?Usage: sync-framework.sh <source-dir>}"
TARGET="$(pwd)"

if [ ! -f "$TARGET/.lore-config" ]; then
  echo "Error: not a Lore instance (no .lore-config found)" >&2
  exit 1
fi

if [ ! -d "$SOURCE/hooks" ]; then
  echo "Error: source doesn't look like a Lore template (no hooks/)" >&2
  exit 1
fi

# Framework directories — overwrite contents, don't delete operator extras
rsync -a "$SOURCE/hooks/" "$TARGET/hooks/"
rsync -a "$SOURCE/scripts/" "$TARGET/scripts/"

# Built-in skills — overwrite existing, don't delete operator skills
if [ -d "$SOURCE/.claude/skills" ]; then
  for skill_dir in "$SOURCE/.claude/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    rsync -a "$skill_dir" "$TARGET/.claude/skills/$skill_name/"
  done
fi

# Single files
cp "$SOURCE/CLAUDE.md" "$TARGET/CLAUDE.md"
cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
cp "$SOURCE/.gitignore" "$TARGET/.gitignore"

echo "Framework synced from $SOURCE"
