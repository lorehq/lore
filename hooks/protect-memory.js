// Hook: PreToolUse (matcher: Edit|Write|Read)
// Blocks all access to MEMORY.md and redirects to the correct location.
// Knowledge has three routes: skills, docs/context, or MEMORY.local.md.

const fs = require('fs');
const { checkMemoryAccess } = require('../lib/memory-guard');

// Parse hook input from stdin (hook receives JSON context via stdin)
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
const result = checkMemoryAccess(toolName, filePath, process.cwd());
if (!result) process.exit(0);

console.log(JSON.stringify({ decision: 'block', reason: result.reason }));
