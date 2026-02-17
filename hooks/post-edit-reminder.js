// Hook: PostToolUse / PostToolUseFailure
// Adaptive knowledge capture reminders after every tool use.
//
// Behavior by tool type:
//   Read-only (read, grep, glob) → silent (these fire constantly during exploration)
//   Knowledge capture (write to docs/ or .claude/skills/) → silent + reset counter
//   Bash commands → escalating reminders (3+ = nudge, 5+ = strong warning)
//   Write to MEMORY.local.md → warn about burying gotchas in scratch notes
//   Everything else → gentle reminder
//
// State (consecutive bash count) is persisted to .git/ so it survives across
// separate hook invocations within a session.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// -- State file location --
// Store in .git/ (repo-local, survives reboots) or fall back to OS temp dir
const cwd = process.cwd();
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
// When docs/ files change, set a flag so we can remind the agent to
// regenerate nav. The flag is cleared by scripts/generate-nav.sh.
// Must run BEFORE the isCapture early-exit below, because docs/ writes
// hit that path and would skip any logic placed after it.
const NAV_FLAG = path.join(
  fs.existsSync(gitDir) ? gitDir : require('os').tmpdir(),
  'lore-nav-dirty'
);
const isDocsWrite = ['write', 'edit'].includes(tool) && filePath.includes('/docs/');
if (isDocsWrite && !fs.existsSync(NAV_FLAG)) {
  try { fs.writeFileSync(NAV_FLAG, Date.now().toString()); } catch {}
}

// Helper: append nav reminder to output if the flag is set
function navReminder(msg) {
  if (fs.existsSync(NAV_FLAG)) {
    const nav = 'docs/ changed \u2014 run `bash scripts/generate-nav.sh` in background';
    return msg ? `${msg} | ${nav}` : nav;
  }
  return msg;
}

// -- Silent exit for read-only tools and knowledge captures --
const isReadOnly = ['read', 'grep', 'glob'].includes(tool);
const isCapture = ['write', 'edit'].includes(tool)
  && (filePath.includes('docs/') || filePath.includes('.claude/skills/'));

if (isReadOnly || isCapture) {
  const st = readState();
  st.bash = 0; // Reset consecutive bash counter
  writeState(st);
  const extra = navReminder(null);
  const output = { hookEventName: event };
  if (extra) output.additionalContext = extra;
  console.log(JSON.stringify({ hookSpecificOutput: output }));
  process.exit(0);
}

// -- Track consecutive bash commands --
const state = readState();
if (tool === 'bash') state.bash++;
else state.bash = 0;
writeState(state);

// -- Select message based on tool type and bash count --
let msg;
if (state.bash >= 5)
  msg = `>>> ${state.bash} consecutive commands — capture what you learned → create-skill <<<`;
else if (state.bash >= 3)
  msg = `>>> ${state.bash} commands in a row — gotcha worth a skill? <<<`;
else if (tool === 'bash' && isFailure)
  msg = 'Error pattern worth a skill?';
else if (tool === 'bash')
  msg = 'Gotcha? → skill | New knowledge? → docs';
else if (['write', 'edit'].includes(tool) && filePath.includes('MEMORY.local.md'))
  msg = '>>> Gotcha buried in scratch notes? Move to /create-skill <<<';
else
  msg = 'Gotcha? → skill | New knowledge? → docs';

console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: navReminder(msg) } }));
