// Hook: sessionStart
// Fires once per Cursor session on startup.
// Emits full banner (delegation, conventions, knowledge map, active work, local memory)
// via additional_context. Static .cursor/rules/lore-*.mdc files serve as first-session
// fallback only — when this hook fires, it provides the complete, dynamic view.

const path = require('path');
const { buildBanner, ensureStickyFiles } = require('../../lib/banner');
const { logHookEvent } = require('../../lib/hook-logger');

const hub = process.env.LORE_HUB || path.join(__dirname, '..', '..');

ensureStickyFiles(hub);
const banner = buildBanner(hub);
console.log(JSON.stringify({ additional_context: banner, continue: true }));
// Log banner size — Cursor banner includes the full knowledge map and conventions
logHookEvent({ platform: 'cursor', hook: 'session-init', event: 'sessionStart', outputSize: banner.length, directory: hub });
