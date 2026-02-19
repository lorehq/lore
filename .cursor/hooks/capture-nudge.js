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
const { getThresholds, getNavFlagPath } = require('../../lib/tracker');
const { getConfig } = require('../../lib/config');
const { logHookEvent } = require('../../lib/hook-logger');

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || cwd;

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
const navDirty = fs.existsSync(getNavFlagPath(hubDir));
const compacted = wasCompacted();

// Increment bash counter (moved here from afterShellExecution so the nudge
// and the count are in sync — the message reaches the agent via agent_message)
state.bash += 1;
state.lastFailure = false; // Clear one-shot flag after reading
writeState(state);

// ── Build condensed agent_message ──

let msg;

if (compacted) {
  // Post-compaction re-orientation — highest priority, delivers key context
  const cfg = getConfig(hubDir);
  const version = cfg.version ? `v${cfg.version}` : '';
  msg = `[COMPACTED] Lore ${version} | Delegate tasks to agents \u2014 see agent-registry.md | Re-read .cursor/rules/ and project context`;
  clearCompacted();
} else {
  // Normal operation — escalating nudge based on consecutive bash count
  const { nudge, warn } = getThresholds(hubDir);
  if (state.bash >= warn) {
    msg = `>>> ${state.bash} consecutive commands \u2014 capture what you learned \u2192 lore-create-skill <<<`;
  } else if (state.bash >= nudge) {
    msg = `>>> ${state.bash} commands in a row \u2014 gotcha worth a skill? <<<`;
  } else {
    msg = 'Gotcha? \u2192 skill | New context? \u2192 docs/knowledge/';
  }
}

// Prepend failure note if a tool failed since last shell command
if (hadFailure) {
  msg = `Error pattern worth a skill? | ${msg}`;
}

// Append nav-dirty reminder if docs/ were edited
if (navDirty) {
  msg += ' | docs/ changed \u2014 run generate-nav.sh';
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
  state: { bash: state.bash, compacted, hadFailure, navDirty },
  directory: hubDir,
});
