// Hook: sessionStart
// Fires once per Cursor session on startup.
// Emits dynamic-only banner (version, active work, local memory) via additional_context.
// Static context (instructions, conventions, delegation, knowledge map) is now handled
// by tiered .cursor/rules/lore-*.mdc files that load on every session — including the
// first auto-opened session that this hook misses.

const path = require('path');
const { buildCursorBanner, ensureStickyFiles } = require('../../lib/banner');

const hub = process.env.LORE_HUB || path.join(__dirname, '..', '..');

ensureStickyFiles(hub);
console.log(JSON.stringify({ additional_context: buildCursorBanner(hub), continue: true }));
