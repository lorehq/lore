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
const hubDir = process.env.LORE_HUB || process.cwd();

// Resolve to absolute so we match against the actual project root,
// not just any path that happens to contain "docs/context/".
const resolved = path.resolve(filePath);
const contextPrefix = path.resolve(hubDir, 'docs', 'context') + path.sep;
const knowledgePrefix = path.resolve(hubDir, 'docs', 'knowledge') + path.sep;

// Only fire for writes targeting docs/context/ or docs/knowledge/
if (!resolved.startsWith(contextPrefix) && !resolved.startsWith(knowledgePrefix)) {
  process.exit(0);
}

// -- Build guidance message --
debug('context-path-guide: file=%s hub=%s', filePath, hubDir);
const cfg = getConfig(hubDir);
const treeDepth = cfg.treeDepth ?? 5;

// Show tree of whichever directory the write targets
const isKnowledge = resolved.startsWith(knowledgePrefix);
const targetDir = isKnowledge ? path.join(hubDir, 'docs', 'knowledge') : path.join(hubDir, 'docs', 'context');
const treeLabel = isKnowledge ? 'docs/knowledge/' : 'docs/context/';
const treeLines = fs.existsSync(targetDir)
  ? buildTree(targetDir, '', { maxDepth: treeDepth, skipDirs: new Set(), dirsOnly: false })
  : [];
const structure = treeLines.length > 0 ? treeLines.join('\n') + '\n' : '';

let msg = 'Knowledge path guide:\n';
msg += `${treeLabel}\n${structure || '(empty)\n'}`;
msg += isKnowledge
  ? 'Organize under environment/ subdirs (inventory/, decisions/, reference/, diagrams/)'
  : 'Context holds rules and conventions — environment data goes in docs/knowledge/';

console.log(JSON.stringify({ decision: 'proceed', additional_context: msg }));
