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

if [ -d "$REPO_ROOT/.lore/agents" ]; then
  mkdir -p "$REPO_ROOT/.claude/agents"
  # Resolve model cascade for each agent: frontmatter → subagentDefaults → omit
  # lore-worker.md gets up to 3 tier variants (fast, default, powerful).
  # All other agents use their own frontmatter model field.
  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = process.argv[1];
    const configPath = path.join(root, '.lore', 'config.json');
    let claudeTiers = {};
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      claudeTiers = (cfg.subagentDefaults && cfg.subagentDefaults.claude) || {};
    } catch (_e) { /* no config or no defaults */ }

    const agentDir = path.join(root, '.lore', 'agents');
    const outDir = path.join(root, '.claude', 'agents');

    function stampAgent(src, claudeModel, outFile) {
      const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) { fs.writeFileSync(path.join(outDir, outFile), src); return; }

      const fm = fmMatch[1];
      // Strip per-platform model fields
      let newFm = fm
        .replace(/^claude-model:.*\n?/m, '')
        .replace(/^opencode-model:.*\n?/m, '')
        .replace(/^cursor-model:.*\n?/m, '')
        .replace(/^model:.*\n?/m, '');
      if (claudeModel) {
        const descIdx = newFm.search(/^description:.*$/m);
        if (descIdx >= 0) {
          const eol = newFm.indexOf('\n', descIdx);
          newFm = newFm.slice(0, eol + 1) + 'model: ' + claudeModel + '\n' + newFm.slice(eol + 1);
        } else {
          newFm += 'model: ' + claudeModel + '\n';
        }
      }

      const out = src.replace(fmMatch[1], newFm.replace(/\n+$/, ''));
      fs.writeFileSync(path.join(outDir, outFile), out);
    }

    for (const file of fs.readdirSync(agentDir)) {
      if (!file.endsWith('.md')) continue;
      const src = fs.readFileSync(path.join(agentDir, file), 'utf8');

      if (file === 'lore-worker.md') {
        // Always emit lore-worker.md with default tier model (or no model if null)
        stampAgent(src, claudeTiers.default || null, 'lore-worker.md');
        // Emit fast and powerful variants only when tiers are configured
        if (claudeTiers.fast) stampAgent(src, claudeTiers.fast, 'lore-worker-fast.md');
        if (claudeTiers.powerful) stampAgent(src, claudeTiers.powerful, 'lore-worker-powerful.md');
      } else {
        // Non-worker agents: use their own frontmatter model field
        const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
        let agentModel = null;
        if (fmMatch) {
          const mMatch = fmMatch[1].match(/^model:\s*(.+)$/m);
          if (mMatch) agentModel = mMatch[1].trim();
        }
        stampAgent(src, agentModel, file);
      }
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
