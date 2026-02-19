// Hook: beforeReadFile + preToolUse (matcher: Write)
// Blocks reads AND writes of MEMORY.md, redirects to MEMORY.local.md.
// Handles two event formats:
//   beforeReadFile: input { filePath }, output { permission, user_message }
//   preToolUse:     input { tool_name, tool_input: { file_path } }, output { decision, reason }
// Core logic lives in lib/memory-guard.js.

const fs = require('fs');
const { checkMemoryAccess } = require('../../lib/memory-guard');

let input = {};
try {
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
} catch {
  process.exit(0);
}

// Detect event type — preToolUse sends tool_name, beforeReadFile does not
const isPreToolUse = !!input.tool_name;
const filePath = isPreToolUse
  ? ((input.tool_input || {}).file_path || '')
  : (input.filePath || input.file_path || '');
const tool = isPreToolUse ? input.tool_name.toLowerCase() : 'read';

const hubDir = process.env.LORE_HUB || process.cwd();
const result = checkMemoryAccess(tool, filePath, hubDir);
if (!result) process.exit(0);

// Output format differs by event type
if (isPreToolUse) {
  console.log(JSON.stringify({ decision: 'deny', reason: result.reason }));
} else {
  console.log(JSON.stringify({ permission: 'deny', user_message: result.reason }));
}
