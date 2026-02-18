// Shared: session banner builder and sticky file scaffolding.
// Used by hooks/session-init.js (CJS) and .opencode/plugins/session-init.js (ESM).

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['assets', 'stylesheets', 'node_modules', '__pycache__', 'site']);

function getAgentDomains(directory) {
  try {
    const content = fs.readFileSync(path.join(directory, 'agent-registry.md'), 'utf8');
    const domains = new Set();
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('|') || line.includes('|---')) continue;
      const parts = line.split('|').map(p => p.trim());
      const agent = (parts[1] || '').replace(/`/g, '').trim();
      const domain = (parts[2] || '').trim();
      if (!agent || agent.toLowerCase() === 'agent') continue;
      if (!domain || domain.toLowerCase() === 'domain') continue;
      domains.add(domain);
    }
    return Array.from(domains);
  } catch {
    return [];
  }
}

// Build ASCII tree of a directory (folders and filenames only).
// Directories sort before files; archive/ appears but isn't expanded
// (its contents are historical and would clutter the map).
function buildTree(dir, prefix = '', options = {}) {
  const { depth = 0, maxDepth = 5, skipDirs = SKIP_DIRS, skipArchive = true } = options;
  if (depth >= maxDepth) return [];
  const lines = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && !skipDirs.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const last = i === entries.length - 1;
      const connector = last ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
      const isDir = entry.isDirectory();
      lines.push(prefix + connector + (isDir ? entry.name + '/' : entry.name));
      if (isDir && !(skipArchive && entry.name === 'archive')) {
        lines.push(...buildTree(path.join(dir, entry.name), prefix + (last ? '    ' : '\u2502   '), { depth: depth + 1, maxDepth, skipDirs, skipArchive }));
      }
    }
  } catch { /* directory missing */ }
  return lines;
}

// Scan work items (roadmaps or plans) and return active labels.
// YAML parsing: single-line values only — no multi-line, no flow sequences.
function scanWork(dir) {
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
  } catch { /* directory missing */ }
  return active;
}

// Scaffold files that should always exist. Called "sticky" because they're
// recreated if deleted — the hook/plugin restores them every session.
function ensureStickyFiles(directory) {
  const localIndex = path.join(directory, 'docs', 'context', 'local', 'index.md');
  if (!fs.existsSync(localIndex)) {
    fs.mkdirSync(path.join(directory, 'docs', 'context', 'local'), { recursive: true });
    fs.writeFileSync(localIndex, `# Local Notes

This folder is gitignored \u2014 anything here stays local to your machine.

Use it for scratch notes, credentials references, personal bookmarks, or
anything you don't want committed to the shared repo.

This folder shows up in nav and the context path guide like any other
section, but git won't track its contents.
`);
  }

  const agentRulesPath = path.join(directory, 'docs', 'context', 'agent-rules.md');
  if (!fs.existsSync(agentRulesPath)) {
    fs.mkdirSync(path.join(directory, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(agentRulesPath, `# Agent Rules

<!-- Injected into every agent session as PROJECT context. -->
<!-- Customize with your project identity and behavior rules. -->
<!-- Coding conventions belong in docs/context/conventions.md \u2014 also injected. -->

## About

Describe your project \u2014 what it is, what repos are involved, key constraints.

## Agent Behavior

Rules for how the agent should operate in this instance.
`);
  }

  const convFile = path.join(directory, 'docs', 'context', 'conventions.md');
  const convDir = path.join(directory, 'docs', 'context', 'conventions');
  if (!fs.existsSync(convFile) && !fs.existsSync(convDir)) {
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(path.join(convDir, 'index.md'), `# Conventions

Operational rules and standards for this environment. Each page covers a specific domain.
`);
    fs.writeFileSync(path.join(convDir, 'docs.md'), `# Docs

## Formatting

- **Checkboxes** (\`- [x]\`/\`- [ ]\`) for all actionable items: scope, deliverables, success criteria
- **Strikethrough** (\`~~text~~\`) on completed item text: \`- [x] ~~Done item~~\`
- **No emoji icons** \u2014 no checkmarks, no colored circles, no decorative symbols
- **Blank line before lists** \u2014 required for MkDocs to render lists correctly
`);
    fs.writeFileSync(path.join(convDir, 'coding.md'), `# Coding

Add your coding rules here \u2014 standards the agent should follow when writing code.
`);
  }

  const memPath = path.join(directory, 'MEMORY.local.md');
  if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
}

function getConfig(directory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, '.lore-config'), 'utf8'));
  } catch { return {}; }
}

function buildBanner(directory) {
  const agents = getAgentDomains(directory);

  const cfg = getConfig(directory);
  const version = cfg.version ? ` v${cfg.version}` : '';
  const treeDepth = cfg.treeDepth ?? 5;

  const docsWork = path.join(directory, 'docs', 'work');
  const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
  const plans = scanWork(path.join(docsWork, 'plans'));

  let output = `=== LORE${version} ===

DELEGATION: Delegate by domain. Available agents: ${agents.length > 0 ? agents.join(', ') : '(none yet)'}
SKILL CREATION: Every gotcha becomes a skill \u2014 no exceptions.
CAPTURE: After substantive work \u2192 capture knowledge, create skills, validate consistency.`;

  if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
  if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

  try {
    const raw = fs.readFileSync(path.join(directory, 'docs', 'context', 'agent-rules.md'), 'utf8');
    const stripped = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
    if (stripped) output += '\n\nPROJECT:\n' + stripped;
  } catch { /* file missing */ }

  try {
    const convDir = path.join(directory, 'docs', 'context', 'conventions');
    const convFile = path.join(directory, 'docs', 'context', 'conventions.md');
    const parts = [];
    if (fs.existsSync(convDir) && fs.statSync(convDir).isDirectory()) {
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

  const trees = [];
  const docsTree = buildTree(path.join(directory, 'docs'), '', { maxDepth: treeDepth });
  if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
  const skillsTree = buildTree(path.join(directory, '.lore', 'skills'), '', { maxDepth: treeDepth });
  if (skillsTree.length > 0) trees.push('.lore/skills/\n' + skillsTree.join('\n'));
  const agentsTree = buildTree(path.join(directory, '.lore', 'agents'), '', { maxDepth: treeDepth });
  if (agentsTree.length > 0) trees.push('.lore/agents/\n' + agentsTree.join('\n'));
  if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');

  const memPath = path.join(directory, 'MEMORY.local.md');
  try {
    const mem = fs.readFileSync(memPath, 'utf8').trim();
    if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;
  } catch { /* missing */ }

  return output;
}

module.exports = { buildBanner, buildTree, ensureStickyFiles, getAgentDomains, getConfig };
