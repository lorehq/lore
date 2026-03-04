#!/usr/bin/env bash
# Copies canonical skills and agents from .lore/ to platform-specific directories.
# Prunes stale entries from .claude/skills/ and .claude/agents/ that no longer
# exist in any canonical source.
#
# Currently supports: Claude Code (.claude/skills/, .claude/agents/)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# Determine active platforms from config (defaults to all if missing)
ACTIVE=$(cd "$REPO_ROOT" && node -e "
  const { getActivePlatforms } = require('./.lore/harness/lib/config');
  process.stdout.write(getActivePlatforms('.').join(','));
" 2>/dev/null || echo "claude,gemini,windsurf,cursor,opencode,roocode")

platform_active() { echo ",$ACTIVE," | grep -q ",$1,"; }

# -- Claude Code skills --
# Copy skills from all source dirs (harness < global < project, last wins).
# Then prune .claude/skills/ entries not in any source.
if platform_active claude; then
  mkdir -p "$REPO_ROOT/.claude/skills"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const { getGlobalPath } = require(path.join(process.argv[1], '.lore', 'harness', 'lib', 'config'));
    const root = process.argv[1];
    const globalPath = getGlobalPath();
    const srcDirs = [
      path.join(root, '.lore', 'harness', 'skills'),
      path.join(globalPath, 'AGENTIC', 'skills'),
      path.join(root, '.lore', 'AGENTIC', 'skills'),
    ];
    const outDir = path.join(root, '.claude', 'skills');
    const canonical = new Set();

    for (const srcDir of srcDirs) {
      if (!fs.existsSync(srcDir)) continue;
      for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const skillFile = path.join(srcDir, d.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        canonical.add(d.name);
        const outSkillDir = path.join(outDir, d.name);
        fs.cpSync(path.join(srcDir, d.name), outSkillDir, { recursive: true, force: true });
      }
    }

    // Prune stale entries
    if (fs.existsSync(outDir)) {
      for (const d of fs.readdirSync(outDir, { withFileTypes: true })) {
        if (d.isDirectory() && !canonical.has(d.name)) {
          fs.rmSync(path.join(outDir, d.name), { recursive: true, force: true });
        }
      }
    }
  " "$REPO_ROOT"

  # -- Claude Code agents --
  # Copy agent definitions, then prune stale entries.
  if [ -d "$REPO_ROOT/.lore/AGENTIC/agents" ]; then
    mkdir -p "$REPO_ROOT/.claude/agents"
    for f in "$REPO_ROOT"/.lore/AGENTIC/agents/*.md; do
      [ -f "$f" ] || continue
      cp "$f" "$REPO_ROOT/.claude/agents/$(basename "$f")"
    done
    # Prune agents not in canonical source
    for f in "$REPO_ROOT"/.claude/agents/*.md; do
      [ -f "$f" ] || continue
      name="$(basename "$f")"
      [ -f "$REPO_ROOT/.lore/AGENTIC/agents/$name" ] || rm "$f"
    done
  fi
fi

# -- Instructions + platform context (via Projector) --
node "$REPO_ROOT/.lore/harness/lib/projector.js" "$REPO_ROOT"

echo "Platform copies synced from .lore/"
