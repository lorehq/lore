// Hook: UserPromptSubmit
// Fires before every user message. Short nudge: search, delegate, capture.

const path = require('path');
const { getConfig, getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);
const cfg = getConfig(hubDir);
const docker = cfg.docker || {};
const hasSemanticSearch = !!(docker.search && docker.search.address);

const msg = hasSemanticSearch
  ? '[Search the knowledge base first, delegate work to workers, capture what you learn.]'
  : '[Search the knowledge base first (docs/knowledge/ \u2192 docs/work/ \u2192 docs/context/), delegate work to workers, capture what you learn.]';

console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
