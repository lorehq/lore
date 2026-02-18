// Shared: MEMORY.md access guard.
// Used by hooks/protect-memory.js (CJS) and .opencode/plugins/protect-memory.js (ESM).

const path = require('path');

// Returns { reason: '...' } if blocked, or null if access is allowed.
// Non-null return = blocked. Callers check truthiness, not a separate flag.
function checkMemoryAccess(tool, filePath, rootDir) {
  const t = (tool || '').toLowerCase();
  if (!['write', 'edit', 'read'].includes(t)) return null;
  if (!filePath) return null;
  if (path.basename(filePath) !== 'MEMORY.md') return null;

  // Only block MEMORY.md at project root — not nested paths
  const resolved = path.resolve(filePath);
  if (path.dirname(resolved) !== path.resolve(rootDir)) return null;

  if (t === 'read') {
    return {
      reason: 'Memory relocated to MEMORY.local.md in repo root. Read that file instead.',
    };
  }

  return {
    reason: 'Memory relocated to MEMORY.local.md. Route your knowledge:\n' +
      '  GOTCHA \u2192 /lore-create-skill (no exceptions)\n' +
      '  KNOWLEDGE \u2192 docs/knowledge/environment/\n' +
      '  TEMPORARY \u2192 MEMORY.local.md',
  };
}

module.exports = { checkMemoryAccess };
