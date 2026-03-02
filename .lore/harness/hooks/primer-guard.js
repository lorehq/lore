const fs = require('fs');
const { isPrimerPath } = require('../lib/primer-guard');
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

if (toolName === 'read' && isPrimerPath(filePath, hubDir)) {
  const out = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[Lore] Access to Cognitive Primers is RESTRICTED. You MUST explicitly ask the operator for permission before reading this primer.',
    },
  });
  fs.writeSync(1, out + '\n');
  logHookEvent({
    platform: 'claude',
    hook: 'primer-guard',
    event: 'PreToolUse',
    outputSize: out.length,
    state: { blocked: true, path: filePath },
    directory: hubDir,
  });
  process.exit(0);
}
