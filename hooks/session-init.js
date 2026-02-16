// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const fs = require('fs');
const path = require('path');
const { getAgentDomains } = require('./lib/parse-agents');

const root = path.join(__dirname, '..');
const agents = getAgentDomains();

// Session banner — the three core principles, reinforced every session
let output = `=== LORE ===

DELEGATION: Delegate by domain. Available agents: ${agents.length > 0 ? agents.join(', ') : '(none yet)'}
SKILL CREATION: Every gotcha becomes a skill — no exceptions.
CAPTURE: After substantive work → capture knowledge, create skills, validate consistency.`;

// Append local memory if it has content beyond the default header
const memPath = path.join(root, 'MEMORY.local.md');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
const mem = fs.readFileSync(memPath, 'utf8').trim();
if (mem && mem !== '# Local Memory') output += `\n\nLOCAL MEMORY:\n${mem}`;

console.log(output);
