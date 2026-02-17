#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Uses rsync --delete so removed items disappear from platform copies too.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/), Cursor (.cursorrules)
# Future: Windsurf, etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# -- Claude Code --
if [ -d "$REPO_ROOT/.lore/skills" ]; then
  mkdir -p "$REPO_ROOT/.claude/skills"
  rsync -a --delete "$REPO_ROOT/.lore/skills/" "$REPO_ROOT/.claude/skills/"
fi

if [ -d "$REPO_ROOT/.lore/agents" ]; then
  mkdir -p "$REPO_ROOT/.claude/agents"
  rsync -a --delete "$REPO_ROOT/.lore/agents/" "$REPO_ROOT/.claude/agents/"
fi

# -- Instructions --
if [ -f "$REPO_ROOT/.lore/instructions.md" ]; then
  cp "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md"
  cp "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/.cursorrules"
fi

echo "Platform copies synced from .lore/"
