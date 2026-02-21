// Knowledge Tracker Plugin
// Adaptive knowledge capture reminders after tool use.
// Thin ESM adapter — core logic lives in lib/tracker.js.
//
// Unlike the Claude Code hook (which runs as a subprocess per event and
// persists state to a file), this plugin is long-lived. Bash count lives
// in a closure; thresholds are read once at init.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { processToolUse, getThresholds } = require('../../.lore/lib/tracker');
const { logHookEvent } = require('../../.lore/lib/hook-logger');
const { getProfile } = require('../../.lore/lib/config');

export const KnowledgeTracker = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  let consecutiveBash = 0;
  const thresholds = getThresholds(hub);
  const profile = getProfile(hub);

  return {
    'tool.execute.after': async (input) => {
      const tool = input?.tool || '';
      const filePath = input?.args?.file_path || input?.args?.path || '';
      const isFailure = !!input?.error;

      if (profile === 'minimal') {
        logHookEvent({ platform: 'opencode', hook: 'knowledge-tracker', event: 'tool.execute.after', outputSize: 0, state: { profileSkip: true }, directory: hub });
        return;
      }

      const result = processToolUse({
        tool,
        filePath,
        isFailure,
        bashCount: consecutiveBash,
        thresholds,
        rootDir: hub,
      });
      consecutiveBash = result.bashCount;

      if (result.silent) {
        logHookEvent({
          platform: 'opencode',
          hook: 'knowledge-tracker',
          event: 'tool.execute.after',
          outputSize: 0,
          state: { bash: consecutiveBash, silent: true },
          directory: hub,
        });
        return;
      }

      const msg = result.message;
      await client.app.log({
        body: { service: 'knowledge-tracker', level: result.level, message: msg },
      });
      // Non-silent: nudge delivered — bash counter tracks escalation level
      logHookEvent({
        platform: 'opencode',
        hook: 'knowledge-tracker',
        event: 'tool.execute.after',
        outputSize: msg.length,
        state: { bash: consecutiveBash, silent: false },
        directory: hub,
      });
    },
  };
};
