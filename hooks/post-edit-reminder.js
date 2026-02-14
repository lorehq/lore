const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cwd = process.cwd();
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const STATE_FILE = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { bash: 0 }; } }
function writeState(s) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch {} }

let input = {};
try { if (!process.stdin.isTTY) { const s = fs.readFileSync(0, 'utf8'); if (s) input = JSON.parse(s); } } catch {}

const tool = (input.tool_name || '').toLowerCase();
const filePath = (input.tool_input || {}).file_path || '';
const isFailure = input.hook_event_name === 'PostToolUseFailure';
const event = input.hook_event_name || 'PostToolUse';

// Silent for read-only tools and knowledge captures
const isReadOnly = ['read', 'grep', 'glob'].includes(tool);
const isCapture = ['write', 'edit'].includes(tool) && (filePath.includes('docs/') || filePath.includes('.claude/skills/'));

if (isReadOnly || isCapture) {
  const st = readState(); st.bash = 0; writeState(st);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event } }));
  process.exit(0);
}

const state = readState();
if (tool === 'bash') state.bash++; else state.bash = 0;
writeState(state);

let msg;
if (state.bash >= 5) msg = `>>> ${state.bash} consecutive commands — capture what you learned → create-skill <<<`;
else if (state.bash >= 3) msg = `>>> ${state.bash} commands in a row — gotcha worth a skill? <<<`;
else if (tool === 'bash' && isFailure) msg = 'Error pattern worth a skill?';
else if (tool === 'bash') msg = 'Gotcha? → skill | New knowledge? → docs';
else if (['write', 'edit'].includes(tool) && filePath.includes('MEMORY.local.md')) msg = '>>> Gotcha buried in scratch notes? Move to /create-skill <<<';
else msg = 'Gotcha? → skill | New knowledge? → docs';

console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: msg } }));
