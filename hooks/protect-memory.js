// Hook: PreToolUse (matcher: Edit|Write|Read)
// Blocks all access to MEMORY.md and redirects to the correct location.
// Knowledge has three routes: skills, docs/context, or MEMORY.local.md.

const fs = require('fs');
const { checkMemoryAccess } = require('../lib/memory-guard');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');

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
const hubDir = process.env.LORE_HUB || process.cwd();
const result = checkMemoryAccess(toolName, filePath, hubDir);
debug('protect-memory: tool=%s file=%s blocked=%s', toolName, filePath, !!result);
if (!result) {
  // Allowed — log to confirm the hook fires even on non-MEMORY.md paths
  logHookEvent({ platform: 'claude', hook: 'protect-memory', event: 'PreToolUse', outputSize: 0, state: { blocked: false }, directory: hubDir });
  process.exit(0);
}

const out = JSON.stringify({ decision: 'block', reason: result.reason });
console.log(out);
// Blocked — track how often MEMORY.md access attempts occur
logHookEvent({ platform: 'claude', hook: 'protect-memory', event: 'PreToolUse', outputSize: out.length, state: { blocked: true }, directory: hubDir });
