// Shared: knowledge tracker logic — tool classification and message selection.
// Used by hooks/knowledge-tracker.js (CJS) and .opencode/plugins/knowledge-tracker.js (ESM).

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

function isKnowledgePath(filePath) {
  // Normalize to forward slashes for consistent matching across platforms.
  // These are substring checks on purpose — the tracker runs in the project
  // root so any docs/ write in the working tree is a knowledge path.
  const p = filePath.replace(/\\/g, '/');
  return p.includes('docs/') || p.includes('.lore/skills/') || p.includes('.claude/skills/');
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

function isDocsWrite(tool, filePath) {
  const p = filePath.replace(/\\/g, '/');
  return isWriteTool(tool) && p.includes('/docs/');
}

// Read escalation thresholds from .lore-config (defaults: nudge=3, warn=5)
function getThresholds(directory) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(directory, '.lore-config'), 'utf8'));
    return {
      nudge: cfg.nudgeThreshold ?? 3,
      warn: cfg.warnThreshold ?? 5,
    };
  } catch {
    return { nudge: 3, warn: 5 };
  }
}

// Core decision function. Given a tool event, returns what message to show
// and the updated bash counter. Returns { silent: true } when no message
// should be emitted (read-only tools, knowledge captures).
function processToolUse({ tool, filePath, isFailure, bashCount, thresholds }) {
  if (isReadOnly(tool)) {
    return { silent: true, bashCount: 0 };
  }

  if (isWriteTool(tool) && filePath && isKnowledgePath(filePath)) {
    return { silent: true, bashCount: 0 };
  }

  const newCount = isBashTool(tool) ? bashCount + 1 : 0;
  const { nudge, warn } = thresholds;
  let message;
  let level = 'info';

  if (newCount >= warn) {
    message = `>>> ${newCount} consecutive commands \u2014 capture what you learned \u2192 lore-create-skill <<<`;
    level = 'warn';
  } else if (newCount >= nudge) {
    message = `>>> ${newCount} commands in a row \u2014 gotcha worth a skill? <<<`;
    level = 'warn';
  } else if (isBashTool(tool) && isFailure) {
    message = 'Error pattern worth a skill?';
  } else if (isBashTool(tool)) {
    message = 'Gotcha? \u2192 skill | New knowledge? \u2192 docs';
  } else if (isWriteTool(tool) && filePath.replace(/\\/g, '/').includes('MEMORY.local.md')) {
    message = '>>> Gotcha buried in scratch notes? Move to /lore-create-skill <<<';
  } else {
    message = 'Gotcha? \u2192 skill | New knowledge? \u2192 docs';
  }

  return { message, level, bashCount: newCount, silent: false };
}

// Nav-dirty flag helpers — shared between both adapters.
// The flag file signals that docs/ changed and nav needs regenerating.
// Cleared by scripts/generate-nav.sh after it rebuilds mkdocs.yml.
function getNavFlagPath(directory) {
  const gitDir = path.join(directory, '.git');
  if (fs.existsSync(gitDir)) return path.join(gitDir, 'lore-nav-dirty');
  return path.join(require('os').tmpdir(), 'lore-nav-dirty');
}

function setNavDirty(flagPath) {
  if (flagPath && !fs.existsSync(flagPath)) {
    try { fs.writeFileSync(flagPath, Date.now().toString()); } catch (e) { debug('setNavDirty: %s', e.message); }
  }
}

function navReminder(flagPath, msg) {
  if (flagPath && fs.existsSync(flagPath)) {
    const nav = 'docs/ changed \u2014 run `bash scripts/generate-nav.sh` in background';
    return msg ? `${msg} | ${nav}` : nav;
  }
  return msg;
}

module.exports = { processToolUse, getThresholds, isDocsWrite, getNavFlagPath, setNavDirty, navReminder };
