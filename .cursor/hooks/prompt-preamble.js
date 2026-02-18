// Hook: beforeSubmitPrompt
// Fires before every user message. Injects condensed banner essentials
// (survives compaction) plus tracker state accumulated by afterFileEdit
// and afterShellExecution (whose output Cursor ignores).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getThresholds, getNavFlagPath, navReminder } = require('../../lib/tracker');
const { getAgentDomains, scanWork } = require('../../lib/banner');

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');

// --- Condensed banner (always injected, survives compaction) ---
const parts = [];

const agents = getAgentDomains(hubDir);
if (agents.length > 0) parts.push(`Delegate: ${agents.join(', ')}`);

const docsWork = path.join(hubDir, 'docs', 'work');
const roadmaps = scanWork(path.join(docsWork, 'roadmaps'));
const plans = scanWork(path.join(docsWork, 'plans'));
if (roadmaps.length > 0) parts.push(`Active: ${roadmaps.join('; ')}`);
if (plans.length > 0) parts.push(`Plans: ${plans.join('; ')}`);

parts.push('Knowledge hub — code changes in external repos');
parts.push('Conventions: docs/context/conventions/');

// --- Tracker state (read-back from after-hooks) ---
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

let bashCount = 0;
try { bashCount = JSON.parse(fs.readFileSync(stateFile, 'utf8')).bash || 0; } catch {}

const { nudge, warn } = getThresholds(hubDir);

if (bashCount >= warn) {
  parts.push(`${bashCount} consecutive commands — capture what you learned → lore-create-skill`);
} else if (bashCount >= nudge) {
  parts.push(`${bashCount} commands in a row — gotcha worth a skill?`);
}

const navFlag = getNavFlagPath(hubDir);
const navMsg = navReminder(navFlag, null);
if (navMsg) parts.push(navMsg);

console.log(JSON.stringify({ additional_context: `[${parts.join(' | ')}]`, continue: true }));
