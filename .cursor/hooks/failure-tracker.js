// Hook: postToolUseFailure
// Records that a tool failure occurred so capture-nudge.js can mention it
// in the agent_message on the next shell command.
// Fire-and-forget — Cursor does not consume output from postToolUseFailure.
// State is persisted to .git/lore-tracker-{hash}.json (same file as bash counter).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

// State file path — same location and naming as knowledge-tracker.js
const cwd = process.cwd();
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

// Read existing state, preserving bash counter
let state = { bash: 0, lastFailure: false };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
} catch {
  /* no state file yet — use defaults */
}

// Mark failure for capture-nudge.js to pick up
state.lastFailure = true;

try {
  fs.writeFileSync(stateFile, JSON.stringify(state));
} catch {
  /* non-critical — worst case we lose the flag */
}
// No output (Cursor ignores postToolUseFailure output), but log to confirm
// the failure flag pipeline works: failure-tracker sets flag → capture-nudge reads it
logHookEvent({
  platform: 'cursor',
  hook: 'failure-tracker',
  event: 'postToolUseFailure',
  outputSize: 0,
  directory: cwd,
});
