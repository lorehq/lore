#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Overwrites existing files but never deletes operator-added content in .claude/skills/ etc.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/), Cursor (.cursor/rules/lore-*.mdc), OpenCode
# Future: Windsurf, etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# -- Claude Code skills --
# Copy ALL lore skills to .claude/skills/ so Claude can discover and use them.
# The user-invocable frontmatter field in each SKILL.md controls whether they
# appear as /commands.
if [ -d "$REPO_ROOT/.lore/skills" ]; then
  mkdir -p "$REPO_ROOT/.claude/skills"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[1];
    const srcDir = path.join(root, '.lore', 'skills');
    const outDir = path.join(root, '.claude', 'skills');

    for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const skillFile = path.join(srcDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const outSkillDir = path.join(outDir, d.name);
      fs.cpSync(path.join(srcDir, d.name), outSkillDir, { recursive: true, force: true });
    }
  " "$REPO_ROOT"
fi

# -- Claude Code agents --
# Copy user-defined agent definitions to .claude/agents/ for platform discovery.
if [ -d "$REPO_ROOT/.lore/agents" ]; then
  mkdir -p "$REPO_ROOT/.claude/agents"
  for f in "$REPO_ROOT"/.lore/agents/*.md; do
    [ -f "$f" ] || continue
    cp "$f" "$REPO_ROOT/.claude/agents/$(basename "$f")"
  done
fi

# -- Instructions + platform context (via Projector) --
node "$REPO_ROOT/.lore/harness/lib/projector.js" "$REPO_ROOT"

echo "Platform copies synced from .lore/"
