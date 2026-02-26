// PreToolUse hook: Reinforce rules at the point of write.
// Matches Write and Edit. Injects concise rule reminders based on
// the target file path:
//   - Security: always, for any write to any file in the repo
//   - Docs: writes to docs/work/, docs/knowledge/, or docs/ generally
//   - Work Items: writes to docs/work/ (in addition to Docs)
//   - Knowledge Capture: writes to docs/knowledge/ (in addition to Docs)
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

const hubDir = process.env.LORE_HUB || process.cwd();
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
// Checks parent dir first (operator override), then system/ fallback.
function extractPrinciples(filename) {
  const rulesDir = path.join(hubDir, 'docs', 'context', 'rules');
  const candidates = [path.join(rulesDir, filename), path.join(rulesDir, 'system', filename)];
  for (const rulePath of candidates) {
    try {
      const content = fs.readFileSync(rulePath, 'utf8');
      const lines = content.split('\n');
      const principles = [];
      for (const line of lines) {
        const match = line.match(/^\*\*(.+?)\*\*$/);
        if (match) principles.push(match[1]);
      }
      if (principles.length > 0) return principles;
    } catch (e) {
      // Try next candidate
    }
  }
  debug('rule-guard: could not read %s from parent or system/', filename);
  return [];
}

// Determine which rules apply based on path
const rules = [];

// Security: always — self-heal from seed if deleted
let security = extractPrinciples('security.md');
if (security.length === 0) {
  const secTarget = path.join(hubDir, 'docs', 'context', 'rules', 'security.md');
  const seedPath = path.join(hubDir, '.lore', 'templates', 'seeds', 'rules', 'security.md');
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
    'Security checkpoint — assess this write. Does it contain secrets, credentials, or sensitive values? Replace with references (env var names, vault paths) or escalate to the operator. When uncertain, ask before writing.',
  );
}

// Path-specific rules
const isWork = relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\');
const isKnowledge = relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\');
const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');

// Docs rule applies to all docs/ paths (including work/ and knowledge/)
if (isDocs) {
  const docs = extractPrinciples('documentation.md');
  if (docs.length > 0) {
    rules.push('Docs: ' + docs.join(' | '));
  }
}

// Additional domain-specific rules
if (isWork) {
  const workItems = extractPrinciples('work-items.md');
  if (workItems.length > 0) {
    rules.push('Work items: ' + workItems.join(' | '));
  }
} else if (isKnowledge) {
  const knowledge = extractPrinciples('knowledge-capture.md');
  if (knowledge.length > 0) {
    rules.push('Knowledge: ' + knowledge.join(' | '));
  }
}

// Build menu of rules not already injected above
const injected = new Set(['index.md', 'security.md']);
if (isDocs) injected.add('documentation.md');
if (isWork) injected.add('work-items.md');
if (isKnowledge) injected.add('knowledge-capture.md');

const rulesDir = path.join(hubDir, 'docs', 'context', 'rules');
try {
  // Merge operator rules + system/ rules, operator takes precedence
  const operatorFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md') && !injected.has(f));
  const operatorNames = new Set(operatorFiles);
  let systemFiles = [];
  const systemDir = path.join(rulesDir, 'system');
  try {
    systemFiles = fs
      .readdirSync(systemDir)
      .filter((f) => f.endsWith('.md') && !injected.has(f) && !operatorNames.has(f));
  } catch (_) {}
  const allFiles = [...operatorFiles, ...systemFiles];
  if (allFiles.length > 0) {
    const names = allFiles.map((f) => f.replace(/\.md$/, ''));
    rules.push('Other rules: ' + names.join(', ') + ' — read docs/context/rules/<name>.md if relevant');
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
