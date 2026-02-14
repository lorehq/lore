const fs = require('fs');
const path = require('path');
const { getAgentDomains } = require('./lib/parse-agents');

const root = path.join(__dirname, '..');
const agents = getAgentDomains();

let output = `=== LORE ===

DELEGATION: Delegate by domain. Available agents: ${agents.length > 0 ? agents.join(', ') : '(none yet)'}
SKILL CREATION: Every gotcha becomes a skill — no exceptions.
RECONCILIATION: After substantive work → capture knowledge, create skills, validate consistency.`;

// Load local memory
const memPath = path.join(root, 'MEMORY.local.md');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
const mem = fs.readFileSync(memPath, 'utf8').trim();
if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;

console.log(output);
