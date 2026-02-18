// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const path = require('path');
const { buildBanner, ensureStickyFiles } = require('../lib/banner');
const { debug } = require('../lib/debug');

const root = path.join(__dirname, '..');
debug('session-init: root=%s', root);
ensureStickyFiles(root);
console.log(buildBanner(root));
