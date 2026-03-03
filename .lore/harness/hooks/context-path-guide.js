// PreToolUse hook: Guide writes to docs/context/ with current structure.
// Shows an ASCII tree of existing directories and files so the agent can
// see what's already there and place new content in the right spot.
//
// Non-blocking — always allows the write to proceed.
// Suggests subdirectory patterns but doesn't enforce them.

const fs = require('fs');
const path = require('path');
const { buildTree } = require('../lib/tree');
const { getConfig } = require('../lib/config');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');

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
const hubDir = process.cwd();
const { getProfile } = require('../lib/config');
if (getProfile(hubDir) === 'minimal') process.exit(0);

// Resolve to absolute so we match against the actual project root,
// not just any path that happens to contain "docs/context/".
const resolved = path.resolve(filePath);
const contextPrefix = path.resolve(hubDir, 'docs', 'context') + path.sep;

// Only fire for writes targeting docs/context/
if (!resolved.startsWith(contextPrefix)) {
  // Write targets a non-docs path — log to track how often this hook fires vs matches
  logHookEvent({
    platform: 'claude',
    hook: 'context-path-guide',
    event: 'PreToolUse',
    outputSize: 0,
    state: { matched: false },
    directory: hubDir,
  });
  process.exit(0);
}

// -- Build guidance message --
debug('context-path-guide: file=%s hub=%s', filePath, hubDir);
const cfg = getConfig(hubDir);
const treeDepth = cfg.treeDepth ?? 5;

// Show tree of docs/context/
const targetDir = path.join(hubDir, 'docs', 'context');
const treeLabel = 'docs/context/';
const treeLines = fs.existsSync(targetDir)
  ? buildTree(targetDir, '', { maxDepth: treeDepth, skipDirs: new Set(), dirsOnly: false })
  : [];
const structure = treeLines.length > 0 ? treeLines.join('\n') + '\n' : '';

let msg = '\x1b[96m[■ LORE-PATH]\x1b[0m Path guide:\n';
msg += `${treeLabel}\n${structure || '(empty)\n'}`;
msg += 'Context holds agent rules — knowledge goes in the global knowledge base (~/.lore/knowledge-base/)';

const out = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    additionalContext: msg,
  },
});
fs.writeSync(1, out + '\n');
// Matched a docs/ write — track output size since this injects a full directory tree
logHookEvent({
  platform: 'claude',
  hook: 'context-path-guide',
  event: 'PreToolUse',
  outputSize: out.length,
  state: { matched: true },
  directory: hubDir,
});
