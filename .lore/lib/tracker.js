// Shared: knowledge tracker logic — tool classification and message selection.
// Used by hooks/knowledge-tracker.js (CJS) and .opencode/plugins/knowledge-tracker.js (ESM).

const path = require('path');

function isKnowledgePath(filePath, rootDir) {
  const resolved = path.resolve(filePath);
  const prefixes = ['docs', '.lore/skills', '.claude/skills'].map(
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

function isDocsWrite(tool, filePath, rootDir) {
  const resolved = path.resolve(filePath);
  const docsPrefix = path.resolve(rootDir || process.cwd(), 'docs') + path.sep;
  return isWriteTool(tool) && resolved.startsWith(docsPrefix);
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

// Core decision function. Given a tool event, returns what message to show
// and the updated bash counter. Returns { silent: true } when no message
// should be emitted. Only emits at threshold crossings, failures, and
// memory scratch writes — everything else is silent.
function processToolUse({ tool, filePath, isFailure, bashCount, thresholds, rootDir }) {
  const decision =
    'If this is Execution phase: REQUIRED before finish choose one - (A) skill captured, (B) environment fact captured (URL/endpoint/service/host/port/auth/header/redirect/base path), or (C) no capture needed + reason.';
  const failureReview =
    'Execution-phase failure is high-signal. If the resolved fix is reusable, capture it as a skill before completion.';

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
    return { message: `${failureReview} ${decision}`, level: 'warn', bashCount: newCount, silent: false };
  }

  // Memory scratch warning always emits
  if (isWriteTool(tool) && filePath && filePath.replace(/\\/g, '/').includes('.lore/memory.local.md')) {
    return { message: '>>> Gotcha buried in scratch notes? Move to /lore-create-skill <<<', level: 'info', bashCount: newCount, silent: false };
  }

  // Non-bash tools (not read-only, not knowledge write) — silent
  if (!isBashTool(tool)) {
    return { silent: true, bashCount: newCount };
  }

  // Bash: emit only at threshold crossings
  if (newCount === nudge) {
    return { message: `Capture checkpoint (${newCount} commands in a row). Confirm Exploration vs Execution. ${decision}`, level: 'warn', bashCount: newCount, silent: false };
  }
  if (newCount === warn || (newCount > warn && newCount % warn === 0)) {
    return { message: `REQUIRED capture review (${newCount} consecutive commands). Confirm Exploration vs Execution. ${decision}`, level: 'warn', bashCount: newCount, silent: false };
  }

  // Bash below thresholds or between crossings — silent
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
