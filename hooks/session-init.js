// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const path = require('path');
const { buildBanner, ensureStickyFiles } = require('../lib/banner');
const { debug } = require('../lib/debug');
const { logHookEvent } = require('../lib/hook-logger');

const root = path.join(__dirname, '..');
debug('session-init: root=%s', root);
ensureStickyFiles(root);
const banner = buildBanner(root);
console.log(banner);
// Log banner size to track one-time session start context cost
logHookEvent({
  platform: 'claude',
  hook: 'session-init',
  event: 'SessionStart',
  outputSize: banner.length,
  directory: root,
});
