// Session Init Plugin
// Injects session banner into the system prompt and after compaction.
// Thin ESM adapter — core logic lives in lib/banner.js.

// OpenCode plugins are ESM but shared lib is CJS. createRequire bridges the gap.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildBanner, ensureStickyFiles } = require('../../lib/banner');
const { logHookEvent } = require('../../lib/hook-logger');

export const SessionInit = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  // Scaffold missing files before first banner build so PROJECT section
  // picks up the agent-rules.md template on first run.
  ensureStickyFiles(hub);
  const banner = buildBanner(hub);
  await client.app.log({
    body: { service: 'session-init', level: 'info', message: banner },
  });
  // One-time init — log banner size for baseline context cost
  logHookEvent({ platform: 'opencode', hook: 'session-init', event: 'SessionInit', outputSize: banner.length, directory: hub });

  return {
    'experimental.chat.system.transform': async (_input, output) => {
      ensureStickyFiles(hub);
      const b = buildBanner(hub);
      output.system.push(b);
      // Fires every LLM call — this is the OpenCode per-prompt injection point.
      // Unlike Claude Code, this REPLACES the system prompt (not additive to history),
      // so output size here is the ongoing cost, not accumulated.
      logHookEvent({ platform: 'opencode', hook: 'session-init', event: 'chat.system.transform', outputSize: b.length, directory: hub });
    },
    'experimental.session.compacting': async (_input, output) => {
      ensureStickyFiles(hub);
      const b = buildBanner(hub);
      output.context.push(b);
      // Fires on context compaction — should be rare, log to confirm it works
      logHookEvent({ platform: 'opencode', hook: 'session-init', event: 'session.compacting', outputSize: b.length, directory: hub });
    },
  };
};
