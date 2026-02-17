// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const fs = require('fs');
const path = require('path');
const { getAgentDomains } = require('./lib/parse-agents');

const root = path.join(__dirname, '..');
const agents = getAgentDomains();

// Skip directories that aren't knowledge (theme assets, build artifacts)
const SKIP_DIRS = new Set(['assets', 'stylesheets', 'node_modules', '__pycache__', 'site']);

// Build ASCII tree of a directory (folders and filenames only)
function buildTree(dir, prefix = '') {
  const lines = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const last = i === entries.length - 1;
      const connector = last ? '└── ' : '├── ';
      const isDir = entry.isDirectory();
      lines.push(prefix + connector + (isDir ? entry.name + '/' : entry.name));
      if (isDir && entry.name !== 'archive') {
        lines.push(...buildTree(path.join(dir, entry.name), prefix + (last ? '    ' : '│   ')));
      }
    }
  } catch { /* directory missing */ }
  return lines;
}

// Scan work items (roadmaps or plans) and return active labels
function scanWork(dir, hasPhase) {
  const active = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      const indexPath = path.join(dir, entry.name, 'index.md');
      if (!fs.existsSync(indexPath)) continue;
      const content = fs.readFileSync(indexPath, 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const status = (fm.match(/^status:\s*(.+)$/m) || [])[1]?.trim();
      if (status !== 'active' && status !== 'on-hold') continue;
      const title = (fm.match(/^title:\s*(.+)$/m) || [])[1]?.trim() || entry.name;
      let label = title;
      const summary = (fm.match(/^summary:\s*(.+)$/m) || [])[1]?.trim();
      if (summary) label += ` (${summary})`;
      if (status === 'on-hold') label += ' [ON HOLD]';
      active.push(label);
    }
  } catch { /* directory missing — not an error */ }
  return active;
}

const docsWork = path.join(root, 'docs', 'work');
const roadmaps = scanWork(path.join(docsWork, 'roadmaps'), true);
const plans = scanWork(path.join(docsWork, 'plans'), false);

// Read version from .lore-config
let version = '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.lore-config'), 'utf8'));
  if (cfg.version) version = ` v${cfg.version}`;
} catch { /* missing or malformed */ }

// Session banner — the three core principles, reinforced every session
let output = `=== LORE${version} ===

DELEGATION: Delegate by domain. Available agents: ${agents.length > 0 ? agents.join(', ') : '(none yet)'}
SKILL CREATION: Every gotcha becomes a skill — no exceptions.
CAPTURE: After substantive work → capture knowledge, create skills, validate consistency.`;

if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

// Project context — operator customization surface (docs/context/agent-rules.md)
try {
  const raw = fs.readFileSync(path.join(root, 'docs', 'context', 'agent-rules.md'), 'utf8');
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
  if (stripped) output += '\n\nPROJECT:\n' + stripped;
} catch { /* file missing */ }

// Conventions — read all .md files from conventions directory (or flat file fallback)
try {
  const convDir = path.join(root, 'docs', 'context', 'conventions');
  const convFile = path.join(root, 'docs', 'context', 'conventions.md');
  const parts = [];
  if (fs.existsSync(convDir) && fs.statSync(convDir).isDirectory()) {
    // Read all .md files: index.md first, then rest alphabetically
    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.md')).sort((a, b) => {
      if (a === 'index.md') return -1;
      if (b === 'index.md') return 1;
      return a.localeCompare(b);
    });
    for (const file of files) {
      const raw = fs.readFileSync(path.join(convDir, file), 'utf8');
      const stripped = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
      if (stripped) parts.push(stripped);
    }
  } else if (fs.existsSync(convFile)) {
    const raw = fs.readFileSync(convFile, 'utf8');
    const stripped = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
    if (stripped) parts.push(stripped);
  }
  if (parts.length > 0) output += '\n\nCONVENTIONS:\n' + parts.join('\n\n');
} catch { /* missing */ }

// Knowledge map — show what exists for agent orientation
const trees = [];
const docsTree = buildTree(path.join(root, 'docs'));
if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
const skillsTree = buildTree(path.join(root, '.claude', 'skills'));
if (skillsTree.length > 0) trees.push('.claude/skills/\n' + skillsTree.join('\n'));
const agentsTree = buildTree(path.join(root, '.claude', 'agents'));
if (agentsTree.length > 0) trees.push('.claude/agents/\n' + agentsTree.join('\n'));
if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');

// Ensure docs/context/local/ exists (gitignored, sticky — recreated if deleted)
const localDir = path.join(root, 'docs', 'context', 'local');
const localIndex = path.join(localDir, 'index.md');
if (!fs.existsSync(localIndex)) {
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(localIndex, `# Local Notes

This folder is gitignored — anything here stays local to your machine.

Use it for scratch notes, credentials references, personal bookmarks, or
anything you don't want committed to the shared repo.

This folder shows up in nav and the context path guide like any other
section, but git won't track its contents.
`);
}

// Ensure docs/context/agent-rules.md exists (sticky — recreated if deleted)
const agentRulesPath = path.join(root, 'docs', 'context', 'agent-rules.md');
if (!fs.existsSync(agentRulesPath)) {
  fs.mkdirSync(path.join(root, 'docs', 'context'), { recursive: true });
  fs.writeFileSync(agentRulesPath, `# Agent Rules

<!-- Injected into every agent session as PROJECT context. -->
<!-- Customize with your project identity and behavior rules. -->
<!-- Coding conventions belong in docs/context/conventions.md — also injected. -->

## About

Describe your project — what it is, what repos are involved, key constraints.

## Agent Behavior

Rules for how the agent should operate in this instance.
`);
}

// Ensure docs/context/conventions exists (sticky — scaffolded if neither path exists)
const convStickyFile = path.join(root, 'docs', 'context', 'conventions.md');
const convStickyDir = path.join(root, 'docs', 'context', 'conventions');
if (!fs.existsSync(convStickyFile) && !fs.existsSync(convStickyDir)) {
  fs.mkdirSync(convStickyDir, { recursive: true });
  fs.writeFileSync(path.join(convStickyDir, 'index.md'), `# Conventions

Operational rules and standards for this environment. Each page covers a specific domain.
`);
  fs.writeFileSync(path.join(convStickyDir, 'docs.md'), `# Docs

## Formatting

- **Checkboxes** (\`- [x]\`/\`- [ ]\`) for all actionable items: scope, deliverables, success criteria
- **Strikethrough** (\`~~text~~\`) on completed item text: \`- [x] ~~Done item~~\`
- **No emoji icons** — no checkmarks, no colored circles, no decorative symbols
- **Blank line before lists** — required for MkDocs to render lists correctly
`);
  fs.writeFileSync(path.join(convStickyDir, 'coding.md'), `# Coding

Add your coding rules here — standards the agent should follow when writing code.
`);
}

// Append local memory if it has content beyond the default header
const memPath = path.join(root, 'MEMORY.local.md');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
const mem = fs.readFileSync(memPath, 'utf8').trim();
if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;

console.log(output);
