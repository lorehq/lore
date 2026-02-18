// PreToolUse hook: Guide writes to docs/context/ or docs/knowledge/ with current structure.
// Shows an ASCII tree of existing directories and files so the agent can
// see what's already there and place new content in the right spot.
//
// Non-blocking — always allows the write to proceed.
// Suggests subdirectory patterns but doesn't enforce them.

const fs = require('fs');
const path = require('path');
const { buildTree, getConfig } = require('../lib/banner');
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

// Only fire for writes targeting docs/context/ or docs/knowledge/
if (!filePath.includes('docs/context/') && !filePath.includes('docs/knowledge/')) {
  process.exit(0);
}

// -- Build guidance message --
const hubDir = process.env.LORE_HUB || process.cwd();
debug('context-path-guide: file=%s hub=%s', filePath, hubDir);
const cfg = getConfig(hubDir);
const treeDepth = cfg.treeDepth ?? 5;

// Show tree of whichever directory the write targets
const isKnowledge = filePath.includes('docs/knowledge/');
const targetDir = isKnowledge
  ? path.join(hubDir, 'docs', 'knowledge')
  : path.join(hubDir, 'docs', 'context');
const treeLabel = isKnowledge ? 'docs/knowledge/' : 'docs/context/';
const treeLines = fs.existsSync(targetDir)
  ? buildTree(targetDir, '', { maxDepth: treeDepth, skipDirs: new Set(), skipArchive: false })
  : [];
const structure = treeLines.length > 0 ? treeLines.join('\n') + '\n' : '';

let msg = 'Knowledge path guide:\n';
msg += `${treeLabel}\n${structure || '(empty)\n'}`;
msg += isKnowledge
  ? 'Organize under environment/ subdirs (systems/, architecture/, accounts/, integrations/, operations/)'
  : 'Context holds rules and conventions — environment data goes in docs/knowledge/';

console.log(JSON.stringify({ decision: 'proceed', additional_context: msg }));
