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

// Session banner — the three core principles, reinforced every session
let output = `=== LORE ===

DELEGATION: Delegate by domain. Available agents: ${agents.length > 0 ? agents.join(', ') : '(none yet)'}
SKILL CREATION: Every gotcha becomes a skill — no exceptions.
CAPTURE: After substantive work → capture knowledge, create skills, validate consistency.`;

if (roadmaps.length > 0) output += `\n\nACTIVE ROADMAPS: ${roadmaps.join('; ')}`;
if (plans.length > 0) output += `\n\nACTIVE PLANS: ${plans.join('; ')}`;

// Knowledge map — show what exists for agent orientation
const trees = [];
const docsTree = buildTree(path.join(root, 'docs'));
if (docsTree.length > 0) trees.push('docs/\n' + docsTree.join('\n'));
const skillsTree = buildTree(path.join(root, '.claude', 'skills'));
if (skillsTree.length > 0) trees.push('.claude/skills/\n' + skillsTree.join('\n'));
const agentsTree = buildTree(path.join(root, '.claude', 'agents'));
if (agentsTree.length > 0) trees.push('.claude/agents/\n' + agentsTree.join('\n'));
if (trees.length > 0) output += '\n\nKNOWLEDGE MAP:\n' + trees.join('\n');

// Append local memory if it has content beyond the default header
const memPath = path.join(root, 'MEMORY.local.md');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
const mem = fs.readFileSync(memPath, 'utf8').trim();
if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;

console.log(output);
