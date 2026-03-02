const fs = require('fs');
const path = require('path');
const { getEnclavePath } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

let input = {};
try {
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
} catch { process.exit(0); }

const toolName = (input.tool_name || '').toLowerCase();
const filePath = (input.tool_input || {}).file_path || '';
const hubDir = process.env.LORE_HUB || process.cwd();
const enclavePath = getEnclavePath();

if (['write', 'edit'].includes(toolName)) {
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.startsWith(enclavePath)) {
    const out = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '[Lore] Access to the Local Intelligence Enclave (~/.lore/) is READ-ONLY. You MUST explicitly ask the operator for permission before modifying any global knowledge or primitives.',
      },
    });
    fs.writeSync(1, out + '\n');
    logHookEvent({
      platform: 'claude',
      hook: 'harness-guard',
      event: 'PreToolUse',
      outputSize: out.length,
      state: { blocked: true, path: filePath },
      directory: hubDir,
    });
    process.exit(0);
  }
}
