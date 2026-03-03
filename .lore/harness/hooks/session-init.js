const path = require('path');
const { buildDynamicBanner, ensureStickyFiles } = require('../lib/banner');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');
const { getConfig } = require('../lib/config');

const root = process.cwd();
debug('session-init: root=%s', root);

// 1. Ensure sticky files (MEMORY.local.md, etc.) exist
ensureStickyFiles(root);

// 2. Build and print the dynamic session banner (Operator Profile + Session Memory)
// Static content (Rules, Skills, Fieldnotes) is now handled via platform-native projections.
async function run() {
  const banner = await buildDynamicBanner(root);
  if (banner) {
    require('fs').writeSync(1, banner + '\n');
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
