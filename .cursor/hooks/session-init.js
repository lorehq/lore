// Hook: sessionStart
// Fires once per Cursor session on startup.
// Emits full session banner with delegation info via additional_context.

const path = require('path');
const { buildBanner, ensureStickyFiles } = require('../../lib/banner');

const hub = process.env.LORE_HUB || path.join(__dirname, '..', '..');

ensureStickyFiles(hub);
console.log(JSON.stringify({ additional_context: buildBanner(hub), continue: true }));
