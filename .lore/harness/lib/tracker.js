// Shared: memory nudge logic — tool classification and message selection.
// Used by hooks/memory-nudge.js.

const path = require('path');

function isKnowledgePath(filePath, rootDir) {
  const resolved = path.resolve(filePath);
  const prefixes = ['docs', '.lore/harness/skills', '.lore/skills'].map(
    (p) => path.resolve(rootDir || process.cwd(), ...p.split('/')) + path.sep,
  );
  return prefixes.some((pre) => resolved.startsWith(pre));
}

function isWriteTool(tool) {
  const t = (tool || '').toLowerCase();
  return t === 'edit' || t === 'write';
}

function isBashTool(tool) {
  const t = (tool || '').toLowerCase();
  return t === 'bash' || t === 'shell' || t === 'terminal';
}

function isReadOnly(tool) {
  const t = (tool || '').toLowerCase();
  return t === 'read' || t === 'grep' || t === 'glob';
}

// Read escalation thresholds from .lore-config (defaults: nudge=15, warn=30)
function getThresholds(directory) {
  try {
    const { getConfig } = require('./config');
    const cfg = getConfig(directory);
    const profile = cfg.profile || 'standard';
    const defaults = profile === 'discovery' ? { nudge: 5, warn: 10 } : { nudge: 15, warn: 30 };
    return {
      nudge: cfg.nudgeThreshold ?? defaults.nudge,
      warn: cfg.warnThreshold ?? defaults.warn,
    };
  } catch {
    return { nudge: 15, warn: 30 };
  }
}

// Core decision function. Returns { silent: true } for read-only and
// knowledge-write tools. Emits capture reminder on first bash in a sequence,
// with escalation at nudge/warn thresholds. Failures always emit.
function processToolUse({ tool, filePath, isFailure, bashCount, thresholds, rootDir }) {
  const capture =
    '\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m Snag? \u2192 fieldnote. Decision/context? \u2192 session note. Write freely.';
  const failureReview =
    '\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m Execution failed \u2014 if the fix was non-obvious, capture a fieldnote or session note.';

  if (isReadOnly(tool)) {
    return { silent: true, bashCount: 0 };
  }

  if (isWriteTool(tool) && filePath && isKnowledgePath(filePath, rootDir)) {
    return { silent: true, bashCount: 0 };
  }

  const newCount = isBashTool(tool) ? bashCount + 1 : 0;
  const { nudge, warn } = thresholds;

  // Failures always emit
  if (isFailure) {
    return { message: `${failureReview} ${capture}`, level: 'warn', bashCount: newCount, silent: false };
  }

  // Memory scratch warning always emits
  if (isWriteTool(tool) && filePath && filePath.replace(/\\/g, '/').includes('.lore/memory.local.md')) {
    return {
      message: '\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m Local memory updated. Reusable fix? Propose graduation to the knowledge base.',
      level: 'info',
      bashCount: newCount,
      silent: false,
    };
  }

  // Non-bash tools (not read-only, not knowledge write) — silent
  if (!isBashTool(tool)) {
    return { silent: true, bashCount: newCount };
  }

  // Bash: emit only at threshold crossings
  if (newCount === nudge) {
    return {
      message: `\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m (${newCount} commands) \u2014 any findings worth a note?`,
      level: 'warn',
      bashCount: newCount,
      silent: false,
    };
  }
  if (newCount === warn || (newCount > warn && newCount % warn === 0)) {
    return {
      message: `\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m (${newCount} consecutive commands) \u2014 pause and capture findings before continuing.`,
      level: 'warn',
      bashCount: newCount,
      silent: false,
    };
  }

  // First bash in a sequence — capture reminder; subsequent silent until thresholds
  if (newCount === 1) {
    return {
      message: '\x1b[92m[\u25A0 LORE-MEMORY]\x1b[0m Snag? \u2192 fieldnote. Decision/context? \u2192 session note. Write freely.',
      level: 'info',
      bashCount: newCount,
      silent: false,
    };
  }
  return { silent: true, bashCount: newCount };
}

module.exports = {
  processToolUse,
  getThresholds,
  isKnowledgePath,
  isWriteTool,
  isBashTool,
  isReadOnly,
};
