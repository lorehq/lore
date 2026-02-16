// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const fs = require('fs');
const path = require('path');
const { getAgentDomains } = require('./lib/parse-agents');

const root = path.join(__dirname, '..');
const agents = getAgentDomains();

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

// Append local memory if it has content beyond the default header
const memPath = path.join(root, 'MEMORY.local.md');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
const mem = fs.readFileSync(memPath, 'utf8').trim();
if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;

console.log(output);
