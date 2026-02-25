// Search Guard Plugin
// Nudge to use semantic search before speculative reads.
// Fires on Read and Glob. Only active when semantic search is configured.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getConfig, getProfile } = require('../../.lore/lib/config');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

export const SearchGuard = async ({ directory, client }) => {
  const hub = process.env.LORE_HUB || directory;
  if (getProfile(hub) === 'minimal') return {};

  const cfg = getConfig(hub);
  const docker = cfg.docker || {};
  const hasSearch = !!(docker.search && docker.search.address);
  if (!hasSearch) return {}; // semantic not available — direct Glob/Grep is correct

  return {
    'tool.execute.before': async (input, output) => {
      const tool = (input?.tool || '').toLowerCase();
      if (tool !== 'read' && tool !== 'glob') return;

      const msg =
        'EXACT PATH check: Do you have a specific filename already in hand? ' +
        'If you are guessing a location or category — STOP and run semantic search first.';
      await client.app.log({
        body: { service: 'search-guard', level: 'info', message: msg },
      });
      logHookEvent({
        platform: 'opencode',
        hook: 'search-guard',
        event: 'tool.execute.before',
        outputSize: msg.length,
        directory: hub,
      });
    },
  };
};
