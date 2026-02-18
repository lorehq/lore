// Hook: afterFileEdit
// Detects docs/ and skills/ writes, sets nav-dirty flag.
// Thin adapter — core logic lives in lib/tracker.js.
// Known gap: no bash counter escalation (Cursor has no shell event).

const fs = require('fs');
const { processToolUse, getThresholds, isDocsWrite, getNavFlagPath, setNavDirty, navReminder } = require('../../lib/tracker');

let input = {};
try {
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
} catch {
  process.exit(0);
}

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || cwd;
const filePath = input.filePath || input.file_path || '';

// Nav-dirty flag
const navFlag = getNavFlagPath(hubDir);
if (isDocsWrite('write', filePath)) setNavDirty(navFlag);

// Process as a write event (no bash tracking in Cursor)
const result = processToolUse({
  tool: 'write',
  filePath,
  isFailure: false,
  bashCount: 0,
  thresholds: getThresholds(hubDir),
});

if (!result.silent) {
  const msg = navReminder(navFlag, result.message);
  if (msg) console.log(JSON.stringify({ message: msg }));
}
