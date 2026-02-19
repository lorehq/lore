// Hook: beforeReadFile + preToolUse (matcher: Write)
// Blocks reads AND writes of MEMORY.md, redirects to MEMORY.local.md.
// Handles two event formats:
//   beforeReadFile: input { filePath }, output { permission, user_message }
//   preToolUse:     input { tool_name, tool_input: { file_path } }, output { decision, reason }
// Core logic lives in lib/memory-guard.js.

const fs = require('fs');
const { checkMemoryAccess } = require('../../lib/memory-guard');
const { logHookEvent } = require('../../lib/hook-logger');

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
// Cursor protect-memory handles two event types with different output formats
const eventName = isPreToolUse ? 'preToolUse' : 'beforeReadFile';
if (!result) {
  // Allowed — log with event type to distinguish read vs write guard paths
  logHookEvent({ platform: 'cursor', hook: 'protect-memory', event: eventName, outputSize: 0, state: { blocked: false }, directory: hubDir });
  process.exit(0);
}

if (isPreToolUse) {
  const out = JSON.stringify({ decision: 'deny', reason: result.reason });
  console.log(out);
  logHookEvent({ platform: 'cursor', hook: 'protect-memory', event: eventName, outputSize: out.length, state: { blocked: true }, directory: hubDir });
} else {
  const out = JSON.stringify({ permission: 'deny', user_message: result.reason });
  console.log(out);
  logHookEvent({ platform: 'cursor', hook: 'protect-memory', event: eventName, outputSize: out.length, state: { blocked: true }, directory: hubDir });
}
