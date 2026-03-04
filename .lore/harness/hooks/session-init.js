const path = require('path');
const fs = require('fs');
const { buildDynamicBanner, ensureStickyFiles } = require('../lib/banner');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');
const { getConfig } = require('../lib/config');
const { getGlobalStructureVersion, getRequiredStructureVersion } = require('../lib/global');

const root = process.cwd();
debug('session-init: root=%s', root);

// 1. Ensure sticky files (MEMORY.local.md, etc.) exist
ensureStickyFiles(root);

// 2. Check global directory version — warn if outdated (never auto-migrate)
const migrationsDir = path.join(root, '.lore', 'harness', 'migrations');
const requiredVersion = getRequiredStructureVersion(migrationsDir);
const currentVersion = getGlobalStructureVersion();
if (requiredVersion > 0 && currentVersion < requiredVersion) {
  fs.writeSync(1, [
    '\x1b[91m▆▆▆ [LORE-GLOBAL-VERSION-MISMATCH] ▆▆▆\x1b[0m',
    `~/.lore/ structure is v${currentVersion} — this harness requires v${requiredVersion}.`,
    'Run /lore update to migrate the global directory.',
    'Do NOT capture fieldnotes or modify the knowledge base until resolved.',
    '\x1b[91m▆▆▆ [LORE-GLOBAL-VERSION-MISMATCH-END] ▆▆▆\x1b[0m',
    '',
  ].join('\n'));
}

// 3. Build and print the dynamic session banner (Operator Profile + Session Memory)
// Static content (Rules, Skills, Fieldnotes) is now handled via platform-native projections.
async function run() {
  const banner = await buildDynamicBanner(root);
  if (banner) {
    fs.writeSync(1, banner + '\n');
  }

  // 3. Log event for context cost tracking
  logHookEvent({
    platform: 'claude',
    hook: 'session-init',
    event: 'SessionStart',
    outputSize: (banner || '').length,
    directory: root,
  });
}

run().catch(e => debug('session-init error: %s', e.message));
