// PreToolUse hook: Remind to use semantic search before speculative reads.
// Fires on Read and Glob. Only active when semantic search is configured.

const fs = require('fs');
const path = require('path');
const { getConfig, getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);

const cfg = getConfig(hubDir);
const docker = cfg.docker || {};
const hasSearch = !!(docker.search && docker.search.address);
if (!hasSearch) process.exit(0);  // semantic not available — direct Glob/Grep is correct

let input = {};
try {
  if (!process.stdin.isTTY) {
    const s = fs.readFileSync(0, 'utf8');
    if (s) input = JSON.parse(s);
  }
} catch { process.exit(0); }

const msg =
  'EXACT PATH check: Do you have a specific filename already in hand? ' +
  'If you are guessing a location or category — STOP and run semantic search first.';

const out = JSON.stringify({ decision: 'proceed', additional_context: msg });
console.log(out);
logHookEvent({ platform: 'claude', hook: 'search-guard', event: 'PreToolUse',
  outputSize: out.length, directory: hubDir });
