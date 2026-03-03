// PreToolUse hook: Reinforce rules at the point of write.
// Matches Write and Edit. Injects concise rule reminders based on
// the target file path:
//   - Security: always, for any write to any file in the repo
//   - Docs: writes to docs/ generally
//
// After hardcoded injections, lists any remaining rules as a menu
// so the LLM can self-serve if relevant. Operator-created rules
// appear automatically without hook changes.
//
// Reads the actual rule files and extracts the bold principle lines
// so the reminder stays in sync with the source of truth.

const fs = require('fs');
const path = require('path');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');

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

const hubDir = process.cwd();
const { getProfile } = require('../lib/config');
if (getProfile(hubDir) === 'minimal') process.exit(0);
const resolved = path.resolve(filePath);
const repoPrefix = path.resolve(hubDir) + path.sep;

// Only fire for writes inside this repo
if (!resolved.startsWith(repoPrefix)) {
  process.exit(0);
}

const relative = resolved.slice(repoPrefix.length);
debug('rule-guard: file=%s relative=%s', filePath, relative);

// Extract bold principle lines from a rule file: **Bold text.**
function extractPrinciples(filename) {
  const rulesDir = path.join(hubDir, '.lore', 'rules');
  const rulePath = path.join(rulesDir, filename);
  try {
    const content = fs.readFileSync(rulePath, 'utf8');
    const lines = content.split('\n');
    const principles = [];
    for (const line of lines) {
      const match = line.match(/^\*\*(.+?)\*\*$/);
      if (match) principles.push(match[1]);
    }
    return principles;
  } catch (e) {
    debug('rule-guard: could not read %s', filename);
    return [];
  }
}

// Determine which rules apply based on path
const rules = [];

// Security: always — self-heal from seed if deleted
let security = extractPrinciples('security.md');
if (security.length === 0) {
  const secTarget = path.join(hubDir, '.lore', 'rules', 'security.md');
  const seedPath = path.join(hubDir, '.lore', 'harness', 'templates', 'seeds', 'rules', 'security.md');
  try {
    if (!fs.existsSync(secTarget) && fs.existsSync(seedPath)) {
      fs.mkdirSync(path.dirname(secTarget), { recursive: true });
      fs.writeFileSync(secTarget, fs.readFileSync(seedPath, 'utf8'));
      debug('rule-guard: regenerated security.md from seed');
      security = extractPrinciples('security.md');
    }
  } catch (e) {
    debug('rule-guard: seed regeneration failed: %s', e.message);
  }
}
if (security.length > 0) {
  rules.push(
    '\x1b[91m[■ LORE-SECURITY]\x1b[0m Assess this write. Does it contain secrets, credentials, or sensitive values? Replace with references (env var names, vault paths) or escalate to the operator. When uncertain, ask before writing.',
  );
}

// Docs rule applies to all docs/ paths
const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');
if (isDocs) {
  const docs = extractPrinciples('documentation.md');
  if (docs.length > 0) {
    rules.push('\x1b[96m[■ LORE-DOCS]\x1b[0m ' + docs.join(' | '));
  }
}

// Build menu of rules not already injected above
const injected = new Set(['index.md', 'security.md']);
if (isDocs) injected.add('documentation.md');

const rulesDir = path.join(hubDir, '.lore', 'rules');
try {
  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md') && !injected.has(f) && !fs.lstatSync(path.join(rulesDir, f)).isDirectory());
  if (files.length > 0) {
    const names = files.map((f) => f.replace(/\.md$/, ''));
    rules.push('\x1b[96m[■ LORE-RULES]\x1b[0m ' + names.join(', ') + ' — read .lore/rules/<name>.md if relevant');
  }
} catch (e) {
  debug('rule-guard: could not list rules: %s', e.message);
}

if (rules.length === 0) process.exit(0);

const msg = rules.join('\n');
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
  hook: 'rule-guard',
  event: 'PreToolUse',
  outputSize: out.length,
  state: { path: relative },
  directory: hubDir,
});
