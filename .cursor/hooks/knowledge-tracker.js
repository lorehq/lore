// Hook: afterFileEdit / afterShellExecution
// Detects docs/ and skills/ writes, sets nav-dirty flag.
// Tracks consecutive bash commands via state file.
// Thin adapter — core logic lives in lib/tracker.js.
// Note: Cursor ignores output from afterFileEdit and afterShellExecution.
// Side effects (nav-dirty flag, state file) still work.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  processToolUse,
  getThresholds,
  isDocsWrite,
  getNavFlagPath,
  setNavDirty,
  navReminder,
} = require('../../lib/tracker');

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
const eventName = input.hook_event_name || 'afterFileEdit';
const isShellEvent = eventName === 'afterShellExecution';
const filePath = input.filePath || input.file_path || '';

// State file for bash counter persistence
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { bash: 0 };
  }
}

function writeState(s) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(s));
  } catch {} // Non-critical — worst case we lose the counter
}

// Nav-dirty flag
const navFlag = getNavFlagPath(hubDir);
if (!isShellEvent && isDocsWrite('write', filePath)) setNavDirty(navFlag);

// Process event
const state = readState();
const tool = isShellEvent ? 'bash' : 'write';
const result = processToolUse({
  tool,
  filePath,
  isFailure: false,
  bashCount: state.bash,
  thresholds: getThresholds(hubDir),
});
state.bash = result.bashCount;
writeState(state);

if (!result.silent) {
  const msg = navReminder(navFlag, result.message);
  if (msg) console.log(JSON.stringify({ message: msg }));
}
