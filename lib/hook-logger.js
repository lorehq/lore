// Structured hook event logger for field-testing hook behavior.
//
// Purpose: Validates that all 15 hooks across 3 platforms (Claude Code,
// Cursor, OpenCode) fire as expected during real work sessions. Captures
// timing, output sizes, and hook-specific state for post-hoc analysis.
//
// Design decisions:
//   - JSONL format: append-friendly, one JSON object per line, easy to parse
//   - .git/ storage: automatically gitignored, scoped per workspace
//   - Env-var gated: LORE_HOOK_LOG=1 enables, unset = zero overhead (no
//     file I/O, no JSON serialization — early return before any work)
//   - Sync writes (appendFileSync): hooks are short-lived subprocesses in
//     Claude Code and Cursor, so async would lose data on process exit
//
// Usage:
//   Enable:  export LORE_HOOK_LOG=1
//   Analyze: bash scripts/analyze-hook-logs.sh
//   Reset:   rm .git/lore-hook-events.jsonl

const fs = require('fs');
const path = require('path');

// Resolve log file location. Prefers .git/ (gitignored, workspace-scoped).
// Falls back to OS temp dir for repos without .git (e.g., fresh clones).
function getLogPath(directory) {
  const gitDir = path.join(directory, '.git');
  if (fs.existsSync(gitDir)) return path.join(gitDir, 'lore-hook-events.jsonl');
  return path.join(require('os').tmpdir(), 'lore-hook-events.jsonl');
}

// Append a single event to the log file.
//
// Parameters:
//   platform   - "claude" | "cursor" | "opencode"
//   hook       - Hook filename without extension (e.g., "capture-nudge")
//   event      - Platform event name (e.g., "beforeShellExecution", "PostToolUse")
//   outputSize - Characters of context injected into the agent's view (0 for silent hooks)
//   state      - Optional hook-specific state snapshot (bash counter, flags, etc.)
//   directory  - Workspace root for resolving log path (defaults to cwd)
function logHookEvent({ platform, hook, event, outputSize, state, directory }) {
  if (!process.env.LORE_HOOK_LOG) return;
  const logPath = getLogPath(directory || process.cwd());
  const entry = {
    ts: Date.now(),
    platform,
    hook,
    event,
    output_size: outputSize ?? 0,
    // Only include state when non-empty to keep log lines compact
    ...(state && Object.keys(state).length > 0 ? { state } : {}),
  };
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Non-critical — never break a hook over a logging failure
  }
}

module.exports = { logHookEvent, getLogPath };
