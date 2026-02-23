// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const path = require('path');
const { execSync } = require('child_process');
const { buildDynamicBanner, ensureStickyFiles } = require('../lib/banner');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');

const { generate: generateAgents } = require('../lib/generate-agents');

const root = path.join(__dirname, '..', '..');
debug('session-init: root=%s', root);
generateAgents(root);
ensureStickyFiles(root);
try {
  execSync(`bash "${path.join(root, '.lore', 'scripts', 'ensure-structure.sh')}"`, {
    stdio: 'pipe',
  });
} catch (e) {
  debug('ensure-structure: %s', e.message);
}

// Regenerate CLAUDE.md with latest static banner content
try {
  execSync(`node "${path.join(root, '.lore', 'scripts', 'generate-claude-md.js')}" "${root}"`, {
    stdio: 'pipe',
  });
} catch (e) {
  debug('generate-claude-md: %s', e.message);
}

// Only output dynamic content (operator profile + local memory) — static content is in CLAUDE.md
const banner = buildDynamicBanner(root);
if (banner) console.log(banner);
// Log banner size to track one-time session start context cost
logHookEvent({
  platform: 'claude',
  hook: 'session-init',
  event: 'SessionStart',
  outputSize: banner.length,
  directory: root,
});
