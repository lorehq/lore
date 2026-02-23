// Session Init Plugin
// Injects session banner into the system prompt and after compaction.
// Thin ESM adapter — core logic lives in lib/banner.js.

// OpenCode plugins are ESM but shared lib is CJS. createRequire bridges the gap.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { buildDynamicBanner, ensureStickyFiles } = require('../../.lore/lib/banner');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

function runEnsureStructure(hub) {
  try {
    execSync(`bash "${join(hub, '.lore', 'scripts', 'ensure-structure.sh')}"`, { stdio: 'pipe' });
  } catch {
    /* non-critical */
  }
}

function regenerateClaudeMd(hub) {
  try {
    execSync(`node "${join(hub, '.lore', 'scripts', 'generate-claude-md.js')}" "${hub}"`, { stdio: 'pipe' });
  } catch {
    /* non-critical */
  }
}

export const SessionInit = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  // Generate worker agent tiers from template + config before banner reads .lore/agents/
  const { generate: generateAgents } = require('../../.lore/lib/generate-agents');
  generateAgents(hub);
  // Scaffold missing files before first banner build so PROJECT section
  // picks up the agent-rules.md template on first run.
  ensureStickyFiles(hub);
  runEnsureStructure(hub);
  // Regenerate CLAUDE.md with latest static banner content (read via opencode.json instructions)
  regenerateClaudeMd(hub);
  const initBanner = buildDynamicBanner(hub);
  await client.app.log({
    body: { service: 'session-init', level: 'info', message: initBanner || '(no dynamic content)' },
  });
  logHookEvent({
    platform: 'opencode',
    hook: 'session-init',
    event: 'SessionInit',
    outputSize: initBanner.length,
    directory: hub,
  });

  // First transform call injects dynamic content; subsequent calls skip (CLAUDE.md has static).
  let needsDynamic = true;

  return {
    'experimental.chat.system.transform': async (_input, output) => {
      if (needsDynamic) {
        const b = buildDynamicBanner(hub);
        if (b) output.system.push(b);
        needsDynamic = false;
        logHookEvent({
          platform: 'opencode',
          hook: 'session-init',
          event: 'chat.system.transform',
          outputSize: b.length,
          directory: hub,
        });
      }
    },
    'experimental.session.compacting': async (_input, output) => {
      // After compaction, CLAUDE.md instructions reload automatically.
      // Only re-inject dynamic content.
      const b = buildDynamicBanner(hub);
      if (b) output.context.push(b);
      needsDynamic = true;
      logHookEvent({
        platform: 'opencode',
        hook: 'session-init',
        event: 'session.compacting',
        outputSize: b.length,
        directory: hub,
      });
    },
  };
};
