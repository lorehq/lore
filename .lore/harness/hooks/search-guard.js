// [Lore] Search Strategy Enforcement: Semantic -> Glob -> Grep.
// Nudges agents to use semantic search for indexed paths (docs, skills, rules)
// and filesystem search only for unindexed paths (external repos, app code).

const fs = require('fs');
const path = require('path');
const { getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = path.join(__dirname, '..', '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);

// Sidecar is always assumed available at the well-known port.
// MCP tools handle errors gracefully if it's actually down.
const hasSearch = true;

let input = {};
try {
  if (!process.stdin.isTTY) {
    const s = fs.readFileSync(0, 'utf8');
    if (s) input = JSON.parse(s);
  }
} catch {
  process.exit(0);
}

const tool = input.toolName || '';
const args = input.arguments || {};
const targetPath = args.path || args.dir_path || args.include || '';

// Indexed territory: docs/, .lore/harness/skills/, .lore/AGENTIC/skills/, .lore/AGENTIC/rules/
const isIndexed = /^(docs\/|\.lore\/harness\/skills\/|\.lore\/AGENTIC\/skills\/|\.lore\/AGENTIC\/rules\/)/.test(targetPath);

let msg = '';
if (hasSearch && isIndexed) {
  msg = `\x1b[96m[■ LORE-SEARCH]\x1b[0m "${targetPath}" is indexed in the Knowledge Base. Use semantic search first to find the specific file/section before using ${tool}.`;
} else if (hasSearch && !isIndexed && (tool === 'glob' || tool === 'grep_search')) {
  // External repos / app code — Glob/Grep is correct, but still reinforce search discipline
  msg = `\x1b[96m[■ LORE-SEARCH]\x1b[0m File-system search in unindexed territory. Use broad Globs first, then Grep for specifics. Act on what you find — don't over-explore.`;
} else if (!hasSearch && isIndexed) {
  msg = `\x1b[96m[■ LORE-SEARCH]\x1b[0m Semantic search unavailable. Use Glob/Grep on the global knowledge base (~/.lore/knowledge-base/) first.`;
}

if (!msg) process.exit(0);

const out = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    additionalContext: msg,
  },
});
fs.writeSync(1, out + '\n');
logHookEvent({
  platform: 'claude',
  hook: 'search-guard',
  event: 'PreToolUse',
  outputSize: out.length,
  directory: hubDir,
});

