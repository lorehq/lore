// PreToolUse hook: Reinforce conventions at the point of write.
// Matches Write and Edit. Injects concise convention reminders based on
// the target file path:
//   - Security: always, for any write to any file in the repo
//   - Work Items: writes to docs/work/
//   - Knowledge Capture: writes to docs/knowledge/
//   - Docs: writes to docs/ (except work/ and knowledge/)
//   - Coding: writes to non-docs files (source code)
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
if (relative.startsWith('docs/work/') || relative.startsWith('docs\\work\\')) {
  const workItems = extractPrinciples('work-items.md');
  if (workItems.length > 0) {
    conventions.push('Work items: ' + workItems.join(' | '));
  }
} else if (relative.startsWith('docs/knowledge/') || relative.startsWith('docs\\knowledge\\')) {
  const knowledge = extractPrinciples('knowledge-capture.md');
  if (knowledge.length > 0) {
    conventions.push('Knowledge: ' + knowledge.join(' | '));
  }
} else if (relative.startsWith('docs/') || relative.startsWith('docs\\')) {
  const docs = extractPrinciples('docs.md');
  if (docs.length > 0) {
    conventions.push('Docs: ' + docs.join(' | '));
  }
}

if (conventions.length === 0) process.exit(0);

const msg = conventions.join('\n');
const out = JSON.stringify({ decision: 'proceed', additional_context: msg });
console.log(out);
logHookEvent({ platform: 'claude', hook: 'convention-guard', event: 'PreToolUse', outputSize: out.length, state: { path: relative }, directory: hubDir });
