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
  parts.push(
    "Orchestrate wisely \u2014 delegate heavy or parallel work to worker agents; keep simple lookups/calls and capture writes in the primary agent",
  );
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

parts.push(
  'Vague question lookup order: Knowledge -> Work items -> Context (docs/knowledge/ -> docs/work/ -> docs/context/) | Use Exploration -> Execution | Capture reusable Execution fixes -> skills | Capture new environment facts -> docs/knowledge/environment/',
);
parts.push(
  'LOOKUP: Vague ask -> quick local lookup in order: Knowledge folder -> Work folder -> Context folder. Keep it shallow (first 2 levels), then ask clarifying questions if still unclear.',
);

const msg = `[${parts.join(' | ')}]`;
console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
