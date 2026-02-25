// Hook: sessionStart
// Fires once per Cursor session on startup.
// Emits full banner (delegation, conventions, knowledge map, active work, local memory)
// via additional_context. Static .cursor/rules/lore-*.mdc files serve as first-session
// fallback only — when this hook fires, it provides the complete, dynamic view.

const path = require('path');
const { execSync } = require('child_process');
const { buildCursorBanner, ensureStickyFiles } = require('../../.lore/lib/banner');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

const { generate: generateAgents } = require('../../.lore/lib/generate-agents');

const hub = process.env.LORE_HUB || path.join(__dirname, '..', '..');

generateAgents(hub);
ensureStickyFiles(hub);
try {
  execSync(`bash "${path.join(hub, '.lore', 'scripts', 'ensure-structure.sh')}"`, {
    stdio: 'pipe',
  });
} catch {
  /* non-critical */
}

// Regenerate .mdc files with latest static content
try {
  execSync(`bash "${path.join(hub, '.lore', 'scripts', 'generate-cursor-rules.sh')}"`, {
    stdio: 'pipe',
  });
} catch {
  /* non-critical */
}

// Only output dynamic content — static content lives in .cursor/rules/lore-*.mdc
const banner = buildCursorBanner(hub);
require('fs').writeSync(1, JSON.stringify({ additional_context: banner, continue: true }) + '\n');
logHookEvent({
  platform: 'cursor',
  hook: 'session-init',
  event: 'sessionStart',
  outputSize: banner.length,
  directory: hub,
});
