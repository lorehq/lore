// PreToolUse hook: Warn when writing to harness-owned files.
// Covers two cases:
//   1. Hub context: files synced from Lore source (overwritten by /lore-update)
//   2. Linked repo context: generated configs (overwritten by /lore-link --refresh)
// Non-blocking — proceeds with a warning so the operator can still force edits.

const fs = require('fs');
const path = require('path');
const { logHookEvent } = require('../lib/hook-logger');

// --- Hub: harness-owned paths (synced by scripts/sync-harness.sh) ---

const HARNESS_PREFIXES = [
  '.lore/harness/hooks/',
  '.lore/harness/lib/',
  '.lore/harness/scripts/',
  '.opencode/',
  '.cursor/hooks/',
  '.cursor/mcp/',
  '.lore/rules/system/',
  '.lore/runbooks/system/',
];

const HARNESS_PATTERNS = [
  /^\.lore\/skills\/lore-/,
  /^\.lore\/agents\/lore-/,
  /^\.lore\/instructions\.md$/,
  /^\.cursor\/rules\/lore-.*\.mdc$/,
  /^opencode\.json$/,
  /^\.claude\/settings\.json$/,
  /^CLAUDE\.md$/,
  /^\.gitignore$/,
];

function isHarnessOwned(relative) {
  const normalized = relative.replace(/\\/g, '/');
  for (const prefix of HARNESS_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  for (const pattern of HARNESS_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

// --- Linked repos: generated configs (created by scripts/lore-link.sh) ---
// These are NOT the same as hub harness paths. A linked work repo's lib/
// is application code — only the specific configs that /lore-link generates.

const LINK_GENERATED_PREFIXES = ['.opencode/plugins/', '.opencode/commands/', '.cursor/rules/lore-', '.cursor/hooks/'];

const LINK_GENERATED_PATTERNS = [
  /^\.lore$/,
  /^\.claude\/settings\.json$/,
  /^\.cursor\/hooks\.json$/,
  /^\.cursor\/mcp\.json$/,
  /^CLAUDE\.md$/,
  /^opencode\.json$/,
];

function isLinkGenerated(relative) {
  const normalized = relative.replace(/\\/g, '/');
  for (const prefix of LINK_GENERATED_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  for (const pattern of LINK_GENERATED_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

// Detect linked work repos by checking for .lore marker file (JSON, not directory).
function isLinkedRepo(dir) {
  const marker = path.join(dir, '.lore');
  try {
    const stat = fs.statSync(marker);
    if (!stat.isFile()) return false;
    const content = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return !!content.hub;
  } catch {
    return false;
  }
}

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
if (!filePath) process.exit(0);

const hubDir = process.env.LORE_HUB || process.cwd();
const resolved = path.resolve(filePath);
const hubPrefix = path.resolve(hubDir) + path.sep;

let warningMsg = '';
let logPath = '';

// Check 1: Write to harness-owned file inside the hub
if (resolved.startsWith(hubPrefix)) {
  const relative = resolved.slice(hubPrefix.length);
  if (isHarnessOwned(relative)) {
    warningMsg =
      `[Lore] Harness-owned file \u2014 ${relative} will be overwritten on next /lore-update. ` +
      'Modify in the source repo to persist changes.';
    logPath = relative;
  }
} else {
  // Check 2: Write to link-generated config in a linked work repo
  const workDir = process.cwd();
  const workPrefix = path.resolve(workDir) + path.sep;
  if (resolved.startsWith(workPrefix) && isLinkedRepo(workDir)) {
    const relative = resolved.slice(workPrefix.length);
    if (isLinkGenerated(relative)) {
      warningMsg =
        `[Lore] Link-generated file \u2014 ${relative} will be overwritten on next /lore-link --refresh. ` +
        'This file is generated from the hub. Edit the hub source instead.';
      logPath = relative;
    }
  }
}

if (!warningMsg) process.exit(0);

const out = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    additionalContext: warningMsg,
  },
});
fs.writeSync(1, out + '\n');
logHookEvent({
  platform: 'claude',
  hook: 'harness-guard',
  event: 'PreToolUse',
  outputSize: out.length,
  state: { path: logPath },
  directory: hubDir,
});
