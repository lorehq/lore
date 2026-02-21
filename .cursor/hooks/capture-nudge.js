// Hook: beforeShellExecution
// Primary context delivery for Cursor sessions. Fires before every shell command.
//
// Reads state accumulated by other hooks' side effects:
//   - Bash counter (this hook increments it, afterFileEdit resets it)
//   - Failure flag (set by failure-tracker.js on postToolUseFailure)
//   - Compaction flag (set by compaction-flag.js on preCompact)
//   - Nav-dirty flag (set by knowledge-tracker.js on afterFileEdit)
//
// Emits a condensed one-liner via agent_message — the only Cursor hook besides
// sessionStart that can inject context into the agent's view.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getThresholds } = require('../../.lore/lib/tracker');
const { getConfig, getProfile } = require('../../.lore/lib/config');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || cwd;

if (getProfile(hubDir) === 'minimal') {
  console.log(JSON.stringify({ permission: 'allow' }));
  logHookEvent({
    platform: 'cursor',
    hook: 'capture-nudge',
    event: 'beforeShellExecution',
    outputSize: 0,
    state: { profileSkip: true },
    directory: hubDir,
  });
  process.exit(0);
}

// ── State file (shared with knowledge-tracker.js and failure-tracker.js) ──

const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

function readState() {
  try {
    return { bash: 0, lastFailure: false, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
  } catch {
    return { bash: 0, lastFailure: false };
  }
}

function writeState(s) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(s));
  } catch {}
}

// ── Compaction flag (written by compaction-flag.js) ──

const compactedPath = path.join(fs.existsSync(gitDir) ? gitDir : require('os').tmpdir(), 'lore-compacted');

function wasCompacted() {
  return fs.existsSync(compactedPath);
}
function clearCompacted() {
  try {
    fs.unlinkSync(compactedPath);
  } catch {}
}

// ── Read all accumulated state ──

const state = readState();
const hadFailure = state.lastFailure;
const compacted = wasCompacted();

// Increment bash counter (moved here from afterShellExecution so the nudge
// and the count are in sync — the message reaches the agent via agent_message)
state.bash += 1;
state.lastFailure = false; // Clear one-shot flag after reading
writeState(state);

// ── Build condensed agent_message ──

let msg;
const baseline =
  'Use Exploration -> Execution. Capture reusable Execution fixes -> skills. Capture new environment facts -> docs/knowledge/environment/.';
const decision =
  'If this is Execution phase: REQUIRED before finish choose one - (A) skill captured, (B) environment fact captured (URL/endpoint/service/host/port/auth/header/redirect/base path), or (C) no capture needed + reason.';
const failureReview =
  'Execution-phase failure is high-signal. If the resolved fix is reusable, capture it as a skill before completion.';

if (compacted) {
  // Post-compaction re-orientation — highest priority, delivers key context
  const cfg = getConfig(hubDir);
  const version = cfg.version ? `v${cfg.version}` : '';
  msg = `[COMPACTED] Lore ${version} | Delegate tasks to agents \u2014 scan .lore/agents/ | Re-read .cursor/rules/ and project context`;
  clearCompacted();
} else {
  // Normal operation — escalating nudge based on consecutive bash count
  const { nudge, warn } = getThresholds(hubDir);
  if (state.bash >= warn) {
    msg = `REQUIRED capture review (${state.bash} consecutive commands). Confirm Exploration vs Execution. ${decision}`;
  } else if (state.bash >= nudge) {
    msg = `Capture checkpoint (${state.bash} commands in a row). Confirm Exploration vs Execution. ${decision}`;
  } else {
    msg = baseline;
  }
}

// Prepend failure note if a tool failed since last shell command
if (hadFailure) {
  msg = `${failureReview} ${decision}`;
}

// Output — permission: allow lets the command proceed, agent_message reaches the agent
const out = JSON.stringify({ permission: 'allow', agent_message: msg });
console.log(out);
// Highest-frequency Cursor hook — captures full state snapshot for correlating
// nudge escalation with actual shell command patterns
logHookEvent({
  platform: 'cursor',
  hook: 'capture-nudge',
  event: 'beforeShellExecution',
  outputSize: msg.length,
  state: { bash: state.bash, compacted, hadFailure },
  directory: hubDir,
});
