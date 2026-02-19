// PreToolUse hook: Reinforce conventions at the point of write.
// Matches Write and Edit. Injects concise convention reminders based on
// the target file path:
//   - Security: always, for any write to any file in the repo
//   - Docs: writes to docs/work/, docs/knowledge/, or docs/ generally
//   - Work Items: writes to docs/work/ (in addition to Docs)
//   - Knowledge Capture: writes to docs/knowledge/ (in addition to Docs)
//
// After hardcoded injections, lists any remaining conventions as a menu
// so the LLM can self-serve if relevant. Operator-created conventions
// appear automatically without hook changes.
//
// Reads the actual convention files and extracts the bold principle lines
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
const resolved = path.resolve(filePath);
const repoPrefix = path.resolve(hubDir) + path.sep;

// Only fire for writes inside this repo
if (!resolved.startsWith(repoPrefix)) {
  process.exit(0);
}

const relative = resolved.slice(repoPrefix.length);
debug('convention-guard: file=%s relative=%s', filePath, relative);

// Extract bold principle lines from a convention file: **Bold text.**
function extractPrinciples(filename) {
  const convPath = path.join(hubDir, 'docs', 'context', 'conventions', filename);
  try {
    const content = fs.readFileSync(convPath, 'utf8');
    const lines = content.split('\n');
    const principles = [];
    for (const line of lines) {
      const match = line.match(/^\*\*(.+?)\*\*$/);
      if (match) principles.push(match[1]);
    }
    return principles;
  } catch (e) {
    debug('convention-guard: could not read %s: %s', filename, e.message);
    return [];
  }
}

// Determine which conventions apply based on path
const conventions = [];

// Security: always
const security = extractPrinciples('security.md');
if (security.length > 0) {
  conventions.push('Security: ' + security.join(' | '));
}

// Path-specific conventions
const isWork = relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\');
const isKnowledge = relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\');
const isDocs = relative.startsWith('docs/') || relative.startsWith('docs\\');

// Docs convention applies to all docs/ paths (including work/ and knowledge/)
if (isDocs) {
  const docs = extractPrinciples('docs.md');
  if (docs.length > 0) {
    conventions.push('Docs: ' + docs.join(' | '));
  }
}

// Additional domain-specific conventions
if (isWork) {
  const workItems = extractPrinciples('work-items.md');
  if (workItems.length > 0) {
    conventions.push('Work items: ' + workItems.join(' | '));
  }
} else if (isKnowledge) {
  const knowledge = extractPrinciples('knowledge-capture.md');
  if (knowledge.length > 0) {
    conventions.push('Knowledge: ' + knowledge.join(' | '));
  }
}

// Build menu of conventions not already injected above
const injected = new Set(['index.md', 'security.md']);
if (isDocs) injected.add('docs.md');
if (isWork) injected.add('work-items.md');
if (isKnowledge) injected.add('knowledge-capture.md');

const convDir = path.join(hubDir, 'docs', 'context', 'conventions');
try {
  const files = fs.readdirSync(convDir).filter((f) => f.endsWith('.md') && !injected.has(f));
  if (files.length > 0) {
    const names = files.map((f) => f.replace(/\.md$/, ''));
    conventions.push(
      'Other conventions: ' + names.join(', ') + ' — read docs/context/conventions/<name>.md if relevant',
    );
  }
} catch (e) {
  debug('convention-guard: could not list conventions: %s', e.message);
}

if (conventions.length === 0) process.exit(0);

const msg = conventions.join('\n');
const out = JSON.stringify({ decision: 'proceed', additional_context: msg });
console.log(out);
logHookEvent({
  platform: 'claude',
  hook: 'convention-guard',
  event: 'PreToolUse',
  outputSize: out.length,
  state: { path: relative },
  directory: hubDir,
});
