// Hook: afterFileEdit
// Detects docs/ and skills/ writes, sets nav-dirty flag.
// Resets consecutive bash counter (file edits break the streak).
// No output — Cursor ignores afterFileEdit output.
// Bash counting and nudge delivery moved to capture-nudge.js (beforeShellExecution).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDocsWrite, getNavFlagPath, setNavDirty } = require('../../.lore/lib/tracker');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

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

// Nav-dirty flag — signal that docs/ changed and nav needs regenerating
const navFlag = getNavFlagPath(hubDir);
if (isDocsWrite('write', filePath, hubDir)) setNavDirty(navFlag);

// Reset bash counter — a file edit breaks the "consecutive bash" streak.
// Also clears failure flag since a productive edit suggests the agent moved on.
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

let state = { bash: 0, lastFailure: false };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
} catch {
  /* no state file yet */
}

state.bash = 0;
state.lastFailure = false;

try {
  fs.writeFileSync(stateFile, JSON.stringify(state));
} catch {
  /* non-critical */
}
// No output (Cursor ignores afterFileEdit output), but log to confirm it fires
// and resets the bash counter — important for validating the counter lifecycle
logHookEvent({
  platform: 'cursor',
  hook: 'knowledge-tracker',
  event: 'afterFileEdit',
  outputSize: 0,
  state: { bashReset: true, file: filePath },
  directory: hubDir,
});
