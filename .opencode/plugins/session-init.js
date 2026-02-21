// Session Init Plugin
// Injects session banner into the system prompt and after compaction.
// Thin ESM adapter — core logic lives in lib/banner.js.

// OpenCode plugins are ESM but shared lib is CJS. createRequire bridges the gap.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildBanner, buildCompactReminder, ensureStickyFiles } = require('../../.lore/lib/banner');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

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
  logHookEvent({
    platform: 'opencode',
    hook: 'session-init',
    event: 'SessionInit',
    outputSize: banner.length,
    directory: hub,
  });

  // True until the first chat.system.transform call; reset to true after compaction
  // so the next call after a compact gets full re-orientation.
  let needsFullBanner = true;

  return {
    'experimental.chat.system.transform': async (_input, output) => {
      ensureStickyFiles(hub);
      let b;
      if (needsFullBanner) {
        b = buildBanner(hub);
        needsFullBanner = false;
      } else {
        b = buildCompactReminder(hub);
      }
      output.system.push(b);
      // Fires every LLM call. First call gets full banner (~14K chars),
      // subsequent calls get compact reminder (~200 chars). Resets after compaction.
      logHookEvent({
        platform: 'opencode',
        hook: 'session-init',
        event: 'chat.system.transform',
        outputSize: b.length,
        directory: hub,
      });
    },
    'experimental.session.compacting': async (_input, output) => {
      ensureStickyFiles(hub);
      const b = buildBanner(hub);
      output.context.push(b);
      // Compaction rebuilds context from scratch — restore full banner on next call.
      needsFullBanner = true;
      // Fires on context compaction — should be rare, log to confirm it works
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
