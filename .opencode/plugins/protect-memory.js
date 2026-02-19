// Protect Memory Plugin
// Blocks access to MEMORY.md and redirects to correct locations.
// Thin ESM adapter — core logic lives in lib/memory-guard.js.
//
// OpenCode blocks tool execution by throwing from tool.execute.before.
// Claude Code uses { decision: 'block' } JSON — different wire format, same logic.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { checkMemoryAccess } = require('../../lib/memory-guard');
const { logHookEvent } = require('../../lib/hook-logger');

export const ProtectMemory = async ({ directory }) => {
  const hub = process.env.LORE_HUB || directory;
  return {
    'tool.execute.before': async (input, output) => {
      const tool = input?.tool || '';
      // OpenCode puts tool args in output.args (not input.args)
      const filePath = output?.args?.file_path || output?.args?.path || '';
      const result = checkMemoryAccess(tool, filePath, hub);
      // Log before potential throw — blocked=true means MEMORY.md access attempted
      logHookEvent({ platform: 'opencode', hook: 'protect-memory', event: 'tool.execute.before', outputSize: 0, state: { blocked: !!result }, directory: hub });
      if (result) throw new Error(result.reason);
    },
  };
};
