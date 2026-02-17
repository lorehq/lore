#!/usr/bin/env bash
# Syncs framework-owned files from a source directory into the current Lore instance.
# Overwrites framework files, never deletes operator content.
#
# Usage: scripts/sync-framework.sh <source-dir>
#
# Framework-owned (synced):
#   hooks/, lib/, scripts/, .opencode/, opencode.json,
#   .claude/settings.json, .lore/skills/<built-in>/, .lore/instructions.md, .gitignore
#
# Operator-owned (never touched):
#   docs/, .lore/agents/, mkdocs.yml, .lore-config, MEMORY.local.md, *-registry.md

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
rsync -a "$SOURCE/lib/" "$TARGET/lib/"
rsync -a "$SOURCE/scripts/" "$TARGET/scripts/"
rsync -a "$SOURCE/.opencode/" "$TARGET/.opencode/"

# Built-in skills — overwrite existing, don't delete operator skills
if [ -d "$SOURCE/.lore/skills" ]; then
  mkdir -p "$TARGET/.lore/skills"
  for skill_dir in "$SOURCE/.lore/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    rsync -a "$skill_dir" "$TARGET/.lore/skills/$skill_name/"
  done
fi

# Single files
cp "$SOURCE/.lore/instructions.md" "$TARGET/.lore/instructions.md"
cp "$SOURCE/.claude/settings.json" "$TARGET/.claude/settings.json"
cp "$SOURCE/.gitignore" "$TARGET/.gitignore"
cp "$SOURCE/opencode.json" "$TARGET/opencode.json"

# Generate platform copies from canonical .lore/ source
bash "$TARGET/scripts/sync-platform-skills.sh"

echo "Framework synced from $SOURCE"
