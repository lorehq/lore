// Hook: UserPromptSubmit
// Fires before every user message. One-line reminder: delegate, conventions, capture, work.

const fs = require('fs');
const path = require('path');
const { getAgentNames } = require('./lib/parse-agents');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = process.env.LORE_HUB || path.join(__dirname, '..');

// Agents — nudge delegation when agents exist
const agents = getAgentNames();
const parts = [];
if (agents.length > 0) {
  parts.push("Orchestrate, don't execute \u2014 delegate to worker agents");
}

// Conventions — list names so the LLM can pattern-match
const convDir = path.join(hubDir, 'docs', 'context', 'conventions');
try {
  const files = fs
    .readdirSync(convDir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => f.replace(/\.md$/, ''));
  if (files.length > 0) {
    parts.push(`Conventions: ${files.join(', ')}`);
  }
} catch {}

parts.push('New context? \u2192 docs/knowledge/ | Active work? \u2192 update progress');

const msg = `[${parts.join(' | ')}]`;
console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
