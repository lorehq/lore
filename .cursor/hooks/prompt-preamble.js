// Hook: beforeSubmitPrompt
// Fires before every user message. Injects the full session banner plus
// tracker state. Cursor's initial auto-opened session skips sessionStart,
// so we inject here to guarantee orientation on every prompt. Each prompt
// gets a fresh rebuild — no accumulation across turns (Cursor replaces
// prior additional_context on compaction).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getThresholds, getNavFlagPath, navReminder } = require('../../lib/tracker');
const { buildBanner } = require('../../lib/banner');

const cwd = process.cwd();
const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');

// --- Full banner (rebuilt fresh each prompt) ---
const banner = buildBanner(hubDir);

// --- Tracker state (read-back from after-hooks) ---
const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
const gitDir = path.join(cwd, '.git');
const stateFile = fs.existsSync(gitDir)
  ? path.join(gitDir, `lore-tracker-${hash}.json`)
  : path.join(require('os').tmpdir(), `lore-tracker-${hash}.json`);

let bashCount = 0;
try {
  bashCount = JSON.parse(fs.readFileSync(stateFile, 'utf8')).bash || 0;
} catch {}

const { nudge, warn } = getThresholds(hubDir);
const trackerParts = [];

if (bashCount >= warn) {
  trackerParts.push(`${bashCount} consecutive commands — capture what you learned → lore-create-skill`);
} else if (bashCount >= nudge) {
  trackerParts.push(`${bashCount} commands in a row — gotcha worth a skill?`);
}

const navFlag = getNavFlagPath(hubDir);
const navMsg = navReminder(navFlag, null);
if (navMsg) trackerParts.push(navMsg);

const output = trackerParts.length > 0
  ? banner + '\n\n' + trackerParts.join('\n')
  : banner;

console.log(JSON.stringify({ additional_context: output, continue: true }));
