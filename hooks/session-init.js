// Hook: SessionStart
// Fires on startup, resume, and after context compaction.
// Prints the session banner with delegation info and local memory.

const path = require('path');
const { buildBanner, ensureStickyFiles } = require('../lib/banner');

const root = path.join(__dirname, '..');
ensureStickyFiles(root);
console.log(buildBanner(root));
