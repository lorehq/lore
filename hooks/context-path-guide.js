// PreToolUse hook: Guide writes to docs/context/ with current structure.
// Shows an ASCII tree of existing directories and files so the agent can
// see what's already there and place new content in the right spot.
//
// Non-blocking — always allows the write to proceed.
// Suggests subdirectory patterns but doesn't enforce them.

const fs = require('fs');
const path = require('path');

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

// -- Generate ASCII tree of a directory --
// Shows directories first (sorted), then files (sorted).
// Max depth of 3 to keep output readable.
function tree(dir, prefix, depth) {
  if (depth > 3 || !fs.existsSync(dir)) return '';
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.'))
    .sort((a, b) => {
      // Directories before files, then alphabetical
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  let out = '';
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    const connector = last ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
    const suffix = entry.isDirectory() ? '/' : '';
    out += `${prefix}${connector}${entry.name}${suffix}\n`;
    if (entry.isDirectory()) {
      const next = prefix + (last ? '    ' : '\u2502   ');
      out += tree(path.join(dir, entry.name), next, depth + 1);
    }
  });
  return out;
}

// -- Build guidance message --
const ctxDir = path.join(process.cwd(), 'docs', 'context');
const structure = fs.existsSync(ctxDir) ? tree(ctxDir, '', 0) : '';

let msg = 'Context path guide:\n';
msg += `docs/context/\n${structure || '(empty)\n'}`;
msg += 'Organize subdirectories as needed (e.g. systems/, architecture/, procedures/)';

console.log(JSON.stringify({ decision: 'proceed', additional_context: msg }));
