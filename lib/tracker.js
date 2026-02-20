// Shared: knowledge tracker logic — tool classification and message selection.
// Used by hooks/knowledge-tracker.js (CJS) and .opencode/plugins/knowledge-tracker.js (ESM).

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

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
function processToolUse({ tool, filePath, isFailure, bashCount, thresholds, rootDir }) {
  const baseline =
    'Use Exploration -> Execution. Capture reusable Execution fixes -> skills. Capture new environment facts -> docs/knowledge/environment/.';
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
  let message;
  let level = 'info';

  if (isFailure) {
    message = `${failureReview} ${decision}`;
    level = 'warn';
  } else if (newCount >= warn) {
    message = `REQUIRED capture review (${newCount} consecutive commands). Confirm Exploration vs Execution. ${decision}`;
    level = 'warn';
  } else if (newCount >= nudge) {
    message = `Capture checkpoint (${newCount} commands in a row). Confirm Exploration vs Execution. ${decision}`;
    level = 'warn';
  } else if (isBashTool(tool)) {
    message = baseline;
  } else if (isWriteTool(tool) && filePath.replace(/\\/g, '/').includes('MEMORY.local.md')) {
    message = '>>> Gotcha buried in scratch notes? Move to /lore-create-skill <<<';
  } else {
    message = baseline;
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
    try {
      fs.writeFileSync(flagPath, Date.now().toString());
    } catch (e) {
      debug('setNavDirty: %s', e.message);
    }
  }
}

function navReminder(flagPath, msg) {
  if (flagPath && fs.existsSync(flagPath)) {
    const nav = 'docs/ changed \u2014 run `bash scripts/generate-nav.sh` in background';
    return msg ? `${msg} | ${nav}` : nav;
  }
  return msg;
}

module.exports = {
  processToolUse,
  getThresholds,
  isDocsWrite,
  isKnowledgePath,
  isWriteTool,
  isBashTool,
  isReadOnly,
  getNavFlagPath,
  setNavDirty,
  navReminder,
};
