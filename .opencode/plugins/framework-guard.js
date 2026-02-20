// Framework Guard Plugin
// Warns when writing to framework-owned files.
// Covers two cases:
//   1. Hub context: files synced from Lore source (overwritten by /lore-update)
//   2. Linked repo context: generated configs (overwritten by /lore-link --refresh)
// Non-blocking — logs a warning so the operator can still force edits.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const { logHookEvent } = require('../../lib/hook-logger');

// --- Hub: framework-owned paths (synced by scripts/sync-framework.sh) ---

const FRAMEWORK_PREFIXES = [
  'hooks/', 'lib/', 'scripts/',
  '.opencode/', '.cursor/hooks/', '.cursor/mcp/',
];

const FRAMEWORK_PATTERNS = [
  /^\.lore\/skills\/lore-/,
  /^\.lore\/agents\/lore-/,
  /^\.lore\/instructions\.md$/,
  /^\.cursor\/rules\/lore-.*\.mdc$/,
  /^opencode\.json$/,
  /^\.claude\/settings\.json$/,
  /^CLAUDE\.md$/,
  /^\.gitignore$/,
];

function isFrameworkOwned(relative) {
  const normalized = relative.replace(/\\/g, '/');
  for (const prefix of FRAMEWORK_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  for (const pattern of FRAMEWORK_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

// --- Linked repos: generated configs (created by scripts/lore-link.sh) ---
// These are NOT the same as hub framework paths. A linked work repo's lib/
// is application code — only the specific configs that /lore-link generates.

const LINK_GENERATED_PREFIXES = [
  '.opencode/plugins/', '.opencode/commands/',
  '.cursor/rules/lore-', '.cursor/hooks/',
];

const LINK_GENERATED_PATTERNS = [
  /^\.lore$/,
  /^\.claude\/settings\.json$/,
  /^\.cursor\/hooks\.json$/,
  /^\.cursor\/mcp\.json$/,
  /^CLAUDE\.md$/,
  /^opencode\.json$/,
];

function isLinkGenerated(relative) {
  const normalized = relative.replace(/\\/g, '/');
  for (const prefix of LINK_GENERATED_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  for (const pattern of LINK_GENERATED_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

// Detect linked work repos by checking for .lore marker file (JSON, not directory).
function isLinkedRepo(dir) {
  const marker = path.join(dir, '.lore');
  try {
    const stat = fs.statSync(marker);
    if (!stat.isFile()) return false;
    const content = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return !!content.hub;
  } catch {
    return false;
  }
}

export const FrameworkGuard = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;

  return {
    'tool.execute.before': async (input, output) => {
      const tool = (input?.tool || '').toLowerCase();
      if (tool !== 'write' && tool !== 'edit') return;

      const filePath = output?.args?.file_path || output?.args?.path || '';
      if (!filePath) return;

      const resolved = path.resolve(filePath);
      const hubPrefix = path.resolve(hub) + path.sep;

      let warningMsg = '';
      let logPath = '';

      // Check 1: Write to framework-owned file inside the hub
      if (resolved.startsWith(hubPrefix)) {
        const relative = resolved.slice(hubPrefix.length);
        if (isFrameworkOwned(relative)) {
          warningMsg =
            `WARNING: Framework-owned file \u2014 ${relative} will be overwritten on next /lore-update. ` +
            'Modify in the source repo to persist changes.';
          logPath = relative;
        }
      } else {
        // Check 2: Write to link-generated config in a linked work repo
        const workPrefix = path.resolve(directory) + path.sep;
        if (resolved.startsWith(workPrefix) && isLinkedRepo(directory)) {
          const relative = resolved.slice(workPrefix.length);
          if (isLinkGenerated(relative)) {
            warningMsg =
              `WARNING: Link-generated file \u2014 ${relative} will be overwritten on next /lore-link --refresh. ` +
              'This file is generated from the hub. Edit the hub source instead.';
            logPath = relative;
          }
        }
      }

      if (!warningMsg) return;

      await client.app.log({
        body: { service: 'framework-guard', level: 'warn', message: warningMsg },
      });
      logHookEvent({
        platform: 'opencode',
        hook: 'framework-guard',
        event: 'tool.execute.before',
        outputSize: warningMsg.length,
        state: { path: logPath },
        directory: hub,
      });
    },
  };
};
