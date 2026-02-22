#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Copies .lore/ canonical files into platform directories. Overwrites existing
# files but never deletes operator-added content in .claude/skills/ etc.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/), Cursor (.cursor/rules/lore-*.mdc), OpenCode
# Future: Windsurf, etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# -- Claude Code --
if [ -d "$REPO_ROOT/.lore/skills" ]; then
  mkdir -p "$REPO_ROOT/.claude/skills"
  cp -Rf "$REPO_ROOT/.lore/skills/." "$REPO_ROOT/.claude/skills/"
fi

# Worker agent tiers — generated from template + config into .lore/agents/ and .claude/agents/
node -e "require('./.lore/lib/generate-agents').generate(process.argv[1])" "$REPO_ROOT"

# Non-worker agents — copy from .lore/agents/ to .claude/agents/ with own model field
if [ -d "$REPO_ROOT/.lore/agents" ]; then
  mkdir -p "$REPO_ROOT/.claude/agents"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[1];
    const agentDir = path.join(root, '.lore', 'agents');
    const outDir = path.join(root, '.claude', 'agents');

    for (const file of fs.readdirSync(agentDir)) {
      if (!file.endsWith('.md') || file.startsWith('lore-worker')) continue;
      const src = fs.readFileSync(path.join(agentDir, file), 'utf8');
      const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
      // Non-worker agents keep their own model field as-is
      fs.writeFileSync(path.join(outDir, file), src);
    }

    // Clean up stale files from old naming scheme
    for (const stale of ['lore-worker-agent.md', 'lore-worker-default.md']) {
      const stalePath = path.join(outDir, stale);
      if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
    }
  " "$REPO_ROOT"
fi

# -- Instructions --
if [ -f "$REPO_ROOT/.lore/instructions.md" ]; then
  cp "$REPO_ROOT/.lore/instructions.md" "$REPO_ROOT/CLAUDE.md"
fi

# -- Cursor rules --
# Generate tiered .cursor/rules/lore-*.mdc files from canonical sources.
# These replace .cursorrules with always-on, glob-based, and agent-requested rules.
bash "$REPO_ROOT/.lore/scripts/generate-cursor-rules.sh"

echo "Platform copies synced from .lore/"
