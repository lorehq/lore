#!/usr/bin/env bash
# Generates tiered .cursor/rules/lore-*.mdc files from canonical Lore sources.
#
# Produces 8 rule files in a 2-4-2 tier pattern:
#   Always-on (2):  lore-core, lore-project
#   Glob-based (4): lore-work-tracking, lore-knowledge-routing,
#                   lore-skill-creation, lore-docs-formatting
#   Agent-req (2):  lore-delegation, lore-knowledge-map
#
# Each file gets Cursor .mdc frontmatter (alwaysApply, globs, or description)
# so the right context loads at the right time — including Cursor's first
# auto-opened session, which sessionStart hooks miss.
#
# Usage:
#   scripts/generate-cursor-rules.sh              — generate for current instance
#   scripts/generate-cursor-rules.sh --hub <path>  — read sources from hub, write locally

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Default: read and write within the same repo
SOURCE="$REPO_ROOT"
TARGET="$REPO_ROOT"

# --hub: read canonical sources from a hub directory (for linked repo generation).
# Without --hub, the script operates entirely within its own repo.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub) SOURCE="$(cd "$2" && pwd)"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$TARGET/.cursor/rules"

# All generation runs in one Node process — reads from SOURCE, writes to TARGET.
# Uses a single-quoted heredoc to avoid bash/JS quoting conflicts.
node - "$SOURCE" "$TARGET" <<'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const SOURCE = process.argv[2];
const TARGET = process.argv[3];
const outDir = path.join(TARGET, '.cursor', 'rules');

// ── Helpers ──────────────────────────────────────────────────────────────────

// Strip YAML frontmatter (--- delimited block) from markdown content.
function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

// Read a file safely — returns fallback string on any error.
function readOr(filePath, fallback) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return fallback || ''; }
}

// Write a .mdc file: Cursor frontmatter header + body content.
function writeMdc(filename, frontmatter, body) {
  const content = '---\n' + frontmatter + '\n---\n\n' + body.trim() + '\n';
  fs.writeFileSync(path.join(outDir, filename), content);
}

// Extract a markdown section by heading text (e.g. "Work Management").
// Returns everything from the heading line through just before the next
// heading at the same or higher level.
function extractSection(content, heading) {
  const lines = content.split(/\r?\n/);
  let capturing = false;
  let level = 0;
  const result = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      if (match[2].trim() === heading) {
        // Found target heading — start capturing
        capturing = true;
        level = match[1].length;
        result.push(line);
        continue;
      }
      // Stop at next heading of same or higher level
      if (capturing && match[1].length <= level) break;
    }
    if (capturing) result.push(line);
  }
  return result.join('\n').trim();
}

// Extract multiple sections and join with blank line separators.
function extractSections(content, headings) {
  return headings.map(h => extractSection(content, h)).filter(Boolean).join('\n\n');
}

// ── Read canonical sources ───────────────────────────────────────────────────

const instructions = readOr(path.join(SOURCE, '.lore', 'instructions.md'));

// Project identity — agent-rules.md with frontmatter stripped
const agentRules = stripFrontmatter(
  readOr(path.join(SOURCE, 'docs', 'context', 'agent-rules.md'))
);

// Agent registry — raw markdown table
const agentRegistry = readOr(path.join(SOURCE, 'agent-registry.md'));

// Conventions: prefer directory of .md files (index.md first), fall back to single file.
// Mirrors the same logic in lib/banner.js buildBanner().
const convDir = path.join(SOURCE, 'docs', 'context', 'conventions');
let conventions = '';
try {
  const files = fs.readdirSync(convDir)
    .filter(f => f.endsWith('.md'))
    .sort((a, b) => {
      if (a === 'index.md') return -1;
      if (b === 'index.md') return 1;
      return a.localeCompare(b);
    });
  conventions = files
    .map(f => stripFrontmatter(readOr(path.join(convDir, f))))
    .filter(Boolean)
    .join('\n\n');
} catch (_) {
  // Older layout: single conventions.md file
  conventions = stripFrontmatter(
    readOr(path.join(SOURCE, 'docs', 'context', 'conventions.md'))
  );
}

// Docs-specific formatting rules (standalone for the docs-formatting .mdc)
const docsFormatting = stripFrontmatter(
  readOr(path.join(SOURCE, 'docs', 'context', 'conventions', 'docs.md'))
);

// ── Tree building (reuses framework lib) ─────────────────────────────────────

const { buildTree } = require(path.join(SOURCE, 'lib', 'tree'));
const { getConfig } = require(path.join(SOURCE, 'lib', 'config'));
const treeDepth = getConfig(SOURCE).treeDepth ?? 5;

// Build the same knowledge-map tree that the session banner produces.
function buildKnowledgeMap() {
  const trees = [];
  const pairs = [
    ['docs', path.join(SOURCE, 'docs')],
    ['.lore/skills', path.join(SOURCE, '.lore', 'skills')],
    ['.lore/agents', path.join(SOURCE, '.lore', 'agents')],
  ];
  for (const [label, dir] of pairs) {
    const lines = buildTree(dir, '', { maxDepth: treeDepth });
    if (lines.length) trees.push(label + '/\n' + lines.join('\n'));
  }
  return trees.join('\n');
}

// ── Generate .mdc files ──────────────────────────────────────────────────────

// -- Tier 1: Always-on (loaded every session, including first auto-open) ------

// 1. lore-core — full framework instructions (replaces .cursorrules)
writeMdc('lore-core.mdc',
  'description: Lore framework instructions — core behaviors, knowledge routing, ownership, skill/agent creation\nalwaysApply: true',
  instructions
);

// 2. lore-project — project identity + conventions snapshot
let projectBody = '';
if (agentRules) projectBody += agentRules;
if (conventions) projectBody += (projectBody ? '\n\n' : '') + conventions;
writeMdc('lore-project.mdc',
  'description: Project identity, agent behavior rules, and coding/docs conventions\nalwaysApply: true',
  projectBody || '# Project\n\nNo project rules or conventions configured yet.'
);

// -- Tier 2: Glob-based (loaded when matching files are touched) --------------

// 3. lore-work-tracking — work management rules + Cursor-specific plan routing.
//    The Cursor note preserves context from the old work-tracking.mdc: Lore plans
//    vs Cursor's built-in .cursor/plans/ (which are session-scoped throwaway).
const workSection = extractSection(instructions, 'Work Management');
const cursorPlanNote = [
  '## Cursor Plans vs Lore Plans',
  '',
  'Plans that should persist across sessions use `/lore-create-plan` and live in',
  '`docs/work/plans/` or under a roadmap. Cursor\'s built-in `.cursor/plans/` is for',
  'throwaway session-scoped implementation checklists only.',
  '',
  'When the operator asks to "create a plan", default to Lore\'s system unless the',
  'task is clearly a one-off implementation checklist that won\'t outlive the session.',
].join('\n');
writeMdc('lore-work-tracking.mdc',
  'description: Rules for managing roadmaps, plans, and brainstorms in Lore work system\nglobs: docs/work/**',
  workSection + '\n\n' + cursorPlanNote
);

// 4. lore-knowledge-routing — where to put knowledge + capture checklist
writeMdc('lore-knowledge-routing.mdc',
  'description: Where to put different types of knowledge — routing table and capture checklist\nglobs: docs/knowledge/**, docs/context/**',
  extractSections(instructions, ['Knowledge Routing', 'Capture'])
);

// 5. lore-skill-creation — skill naming, size limits, domain=agent rule
writeMdc('lore-skill-creation.mdc',
  'description: Rules for creating skills and agents — naming, size limits, domain=agent\nglobs: .lore/skills/**',
  extractSections(instructions, ['Skill Creation', 'Agent Creation'])
);

// 6. lore-docs-formatting — docs formatting standards
writeMdc('lore-docs-formatting.mdc',
  'description: Formatting standards for documentation files — checkboxes, strikethrough, no emoji\nglobs: docs/**/*.md, *.md',
  docsFormatting || '# Docs Formatting\n\nNo formatting conventions configured yet.'
);

// -- Tier 3: Agent-requested (agent decides based on description) -------------

// 7. lore-delegation — delegation procedures + full agent registry table
let delegationBody = extractSection(instructions, 'Delegation');
if (agentRegistry) {
  delegationBody += '\n\n## Agent Registry\n\n' + agentRegistry.trim();
}
writeMdc('lore-delegation.mdc',
  'description: Agent delegation map — which agents handle which domains, parallel execution patterns\nalwaysApply: false',
  delegationBody
);

// 8. lore-knowledge-map — directory tree snapshot for codebase navigation
const tree = buildKnowledgeMap();
writeMdc('lore-knowledge-map.mdc',
  'description: Directory tree of docs, skills, and agents for navigating the knowledge base\nalwaysApply: false',
  '# Knowledge Map\n\n' + (tree || '(empty)')
);

// ── Report ───────────────────────────────────────────────────────────────────

const files = fs.readdirSync(outDir).filter(f => f.startsWith('lore-') && f.endsWith('.mdc'));
console.log('Generated ' + files.length + ' .cursor/rules/lore-*.mdc files');
NODE_SCRIPT
