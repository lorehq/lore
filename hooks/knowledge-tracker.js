// Hook: PostToolUse / PostToolUseFailure
// Adaptive knowledge capture reminders after every tool use.
// State (consecutive bash count) persisted to .git/ across hook invocations.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { processToolUse, getThresholds, isDocsWrite, getNavFlagPath, setNavDirty, navReminder } = require('../lib/tracker');

// -- State file location --
const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || cwd;
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const STATE_FILE = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { bash: 0 }; }
}

function writeState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }
  catch {} // Non-critical — worst case we lose the counter
}

// -- Parse hook input from stdin --
let input = {};
try {
  if (!process.stdin.isTTY) {
    const s = fs.readFileSync(0, 'utf8');
    if (s) input = JSON.parse(s);
  }
} catch {}

const tool = (input.tool_name || '').toLowerCase();
const filePath = (input.tool_input || {}).file_path || '';
const isFailure = input.hook_event_name === 'PostToolUseFailure';
const event = input.hook_event_name || 'PostToolUse';

// -- Nav-dirty flag --
const navFlag = getNavFlagPath(hubDir);
if (isDocsWrite(tool, filePath)) setNavDirty(navFlag);

// -- Process tool use --
const state = readState();
const result = processToolUse({
  tool, filePath, isFailure,
  bashCount: state.bash,
  thresholds: getThresholds(hubDir),
});
state.bash = result.bashCount;
writeState(state);

if (result.silent) {
  const extra = navReminder(navFlag, null);
  const output = { hookEventName: event };
  if (extra) output.additionalContext = extra;
  console.log(JSON.stringify({ hookSpecificOutput: output }));
} else {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: navReminder(navFlag, result.message) },
  }));
}
