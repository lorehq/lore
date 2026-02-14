const fs = require('fs');

let input = {};
try {
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
} catch { process.exit(0); }

const toolName = (input.tool_name || '').toLowerCase();
const filePath = (input.tool_input || {}).file_path || '';

if (!filePath.endsWith('MEMORY.md')) process.exit(0);

if (toolName === 'read') {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'Memory relocated to MEMORY.local.md in repo root. Read that file instead.'
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  decision: 'block',
  reason: 'Memory relocated to MEMORY.local.md. Route your knowledge:\n' +
    '  GOTCHA → /create-skill (no exceptions)\n' +
    '  ENVIRONMENTAL → docs/environment/\n' +
    '  TEMPORARY → MEMORY.local.md'
}));
