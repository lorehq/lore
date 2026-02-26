#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Copies .lore/ canonical files into platform directories. Overwrites existing
# files but never deletes operator-added content in .claude/skills/ etc.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/), Cursor (.cursor/rules/lore-*.mdc), OpenCode
# Future: Windsurf, etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# -- Claude Code skills --
# Copy ALL lore skills to .claude/skills/ so Claude can discover and use them.
# The user-invocable frontmatter field in each SKILL.md controls whether they
# appear as /commands — non-command skills (gotchas, recipes) are still visible
# to the agent for reference without being exposed to the user.
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

# -- Claude Code fieldnotes --
# Copy ALL lore fieldnotes to .claude/fieldnotes/ so Claude can discover and use them.
if [ -d "$REPO_ROOT/.lore/fieldnotes" ]; then
  mkdir -p "$REPO_ROOT/.claude/fieldnotes"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[1];
    const srcDir = path.join(root, '.lore', 'fieldnotes');
    const outDir = path.join(root, '.claude', 'fieldnotes');

    for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const skillFile = path.join(srcDir, d.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const outNoteDir = path.join(outDir, d.name);
      fs.cpSync(path.join(srcDir, d.name), outNoteDir, { recursive: true, force: true });
    }
  " "$REPO_ROOT"
fi

# All agents — workers from template, non-workers from .lore/agents/ with tier → model stamping
node -e "require('./.lore/lib/generate-agents').generate(process.argv[1])" "$REPO_ROOT"

# -- Instructions + static banner --
if [ -f "$REPO_ROOT/.lore/instructions.md" ]; then
  node "$REPO_ROOT/.lore/scripts/generate-claude-md.js" "$REPO_ROOT"
fi

# -- Cursor rules --
# Generate tiered .cursor/rules/lore-*.mdc files from canonical sources.
# These replace .cursorrules with always-on, glob-based, and agent-requested rules.
bash "$REPO_ROOT/.lore/scripts/generate-cursor-rules.sh"

echo "Platform copies synced from .lore/"
