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

const search = hasSemanticSearch
  ? 'Curator: search KB first \u2014 if results answer the question, respond directly'
  : 'Curator: search docs/knowledge/ \u2192 docs/work/ \u2192 docs/context/ first \u2014 if results answer the question, respond directly';
const msg = `[${search}. Orchestrator: delegate API calls, curl, multi-step exploration, and parallel work to workers \u2014 don\u2019t execute directly. Capturer: gotcha \u2192 skill, new fact \u2192 docs/knowledge/. After task \u2192 propose capture or state why not.]`;

console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
