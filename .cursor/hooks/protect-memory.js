// Hook: beforeReadFile
// Blocks reads of MEMORY.md, redirects to MEMORY.local.md.
// Thin adapter — core logic lives in lib/memory-guard.js.
// Known gap: Cursor has no beforeWriteFile event, so writes can't be blocked.

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

const filePath = input.filePath || input.file_path || '';
const result = checkMemoryAccess('read', filePath, process.cwd());
if (!result) process.exit(0);

console.log(JSON.stringify({ continue: false, message: result.reason }));
