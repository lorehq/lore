// Hook: PreToolUse (matcher: Edit|Write|Read)
// Blocks all access to MEMORY.md and redirects to the correct location.
// Knowledge has three routes: skills, docs/environment, or MEMORY.local.md.

const fs = require('fs');

// Parse hook input from stdin (Claude Code pipes JSON context)
let input = {};
try {
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
} catch {
  process.exit(0); // Can't parse input — allow the action
}

const toolName = (input.tool_name || '').toLowerCase();
const filePath = (input.tool_input || {}).file_path || '';

// Only intercept access to MEMORY.md
if (!filePath.endsWith('MEMORY.md')) process.exit(0);

// Block reads — point to the replacement file
if (toolName === 'read') {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'Memory relocated to MEMORY.local.md in repo root. Read that file instead.'
  }));
  process.exit(0);
}

// Block writes — show the knowledge routing table
console.log(JSON.stringify({
  decision: 'block',
  reason: 'Memory relocated to MEMORY.local.md. Route your knowledge:\n' +
    '  GOTCHA → /create-skill (no exceptions)\n' +
    '  ENVIRONMENTAL → docs/environment/\n' +
    '  TEMPORARY → MEMORY.local.md'
}));
