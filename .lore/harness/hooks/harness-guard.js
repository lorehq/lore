const fs = require('fs');
const path = require('path');
const { getGlobalPath } = require('../lib/config');
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
const hubDir = process.cwd();
const globalPath = getGlobalPath();

if (['write', 'edit'].includes(toolName)) {
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.startsWith(globalPath)) {
    const out = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '[Lore] The global directory (~/.lore/) is READ-ONLY. You MUST explicitly ask the operator for permission before modifying global content.',
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
