#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Copies .lore/ canonical files into platform directories. Does NOT use
# --delete — user-added content in .claude/skills/ etc. is preserved.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/), Cursor (.cursorrules), OpenCode
# Future: Windsurf, etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# -- Claude Code --
if [ -d "$REPO_ROOT/.lore/skills" ]; then
  mkdir -p "$REPO_ROOT/.claude/skills"
  rsync -a "$REPO_ROOT/.lore/skills/" "$REPO_ROOT/.claude/skills/"
fi

if [ -d "$REPO_ROOT/.lore/agents" ]; then
  mkdir -p "$REPO_ROOT/.claude/agents"
  rsync -a "$REPO_ROOT/.lore/agents/" "$REPO_ROOT/.claude/agents/"
fi

# -- Instructions --
if [ -f "$REPO_ROOT/.lore/instructions.md" ]; then
  cp "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md"
  cp "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/.cursorrules"
fi

echo "Platform copies synced from .lore/"
