// PreToolUse hook: Guide writes to docs/context/ with current structure.
// Shows an ASCII tree of existing directories and files so the agent can
// see what's already there and place new content in the right spot.
//
// Non-blocking — always allows the write to proceed.
// Suggests subdirectory patterns but doesn't enforce them.

const fs = require('fs');
const path = require('path');
const { buildTree } = require('../lib/banner');
const { debug } = require('../lib/debug');

// -- Parse hook input from stdin --
let input = {};
try {
  if (!process.stdin.isTTY) {
    const s = fs.readFileSync(0, 'utf8');
    if (s) input = JSON.parse(s);
  }
} catch {
  process.exit(0);
}

const filePath = (input.tool_input || {}).file_path || '';

// Only fire for writes targeting docs/context/
if (!filePath.includes('docs/context/')) {
  process.exit(0);
}

// -- Build guidance message --
const hubDir = process.env.LORE_HUB || process.cwd();
debug('context-path-guide: file=%s hub=%s', filePath, hubDir);
const ctxDir = path.join(hubDir, 'docs', 'context');
const treeLines = fs.existsSync(ctxDir)
  ? buildTree(ctxDir, '', { maxDepth: 4, skipDirs: new Set(), skipArchive: false })
  : [];
const structure = treeLines.length > 0 ? treeLines.join('\n') + '\n' : '';

let msg = 'Context path guide:\n';
msg += `docs/context/\n${structure || '(empty)\n'}`;
msg += 'Organize subdirectories as needed (e.g. systems/, architecture/, procedures/)';

console.log(JSON.stringify({ decision: 'proceed', additional_context: msg }));
