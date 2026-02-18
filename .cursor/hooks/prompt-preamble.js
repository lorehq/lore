// Hook: beforeSubmitPrompt
// Fires before every user message. Reads tracker state accumulated by
// afterFileEdit/afterShellExecution (whose output Cursor ignores) and
// surfaces pending reminders via prompt injection.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getThresholds, getNavFlagPath, navReminder } = require('../../lib/tracker');
const { getAgentDomains } = require('../../lib/banner');

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');

// Locate the same state file that knowledge-tracker.js writes to
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

let bashCount = 0;
try { bashCount = JSON.parse(fs.readFileSync(stateFile, 'utf8')).bash || 0; } catch {}

const { nudge, warn } = getThresholds(hubDir);
const navFlag = getNavFlagPath(hubDir);
const parts = [];

// Delegation reminder
const agents = getAgentDomains(hubDir);
if (agents.length > 0) parts.push(`Delegate: ${agents.join(', ')}`);

// Bash escalation
if (bashCount >= warn) {
  parts.push(`${bashCount} consecutive commands — capture what you learned → lore-create-skill`);
} else if (bashCount >= nudge) {
  parts.push(`${bashCount} commands in a row — gotcha worth a skill?`);
}

// Nav-dirty
const navMsg = navReminder(navFlag, null);
if (navMsg) parts.push(navMsg);

if (parts.length > 0) {
  console.log(JSON.stringify({ additional_context: `[${parts.join(' | ')}]`, continue: true }));
}
