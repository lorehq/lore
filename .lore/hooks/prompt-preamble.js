// Hook: UserPromptSubmit
// Fires before every user message. One-line reminder: delegate, conventions, capture, work.

const fs = require('fs');
const path = require('path');
const { getAgentNames } = require('./lib/parse-agents');
const { getConfig, getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);
const cfg = getConfig(hubDir);
const docker = cfg.docker || {};
const semanticSearchUrl =
  docker.search && docker.search.address ? `http://${docker.search.address}:${docker.search.port || 9185}/search` : '';

const agents = getAgentNames();
const parts = [];

if (semanticSearchUrl) {
  // Slim preamble — one unified instruction
  parts.push(
    `DO NOT EXECUTE WORK YOURSELF. Unknown concept → semantic search → delegate. EXACT PATH (specific filename already in hand) → Read directly. Knowing a category is NOT a known path. NEVER run API calls, curl, or fetch directly.`,
  );
} else {
  // Full preamble — no semantic search, repeat key instructions
  if (agents.length > 0) {
    parts.push(
      'Orchestrate, don\u2019t execute \u2014 delegate exploration, API discovery, and multi-step work to workers; only keep single lookups and capture writes in primary',
    );
  }

  const { parseFrontmatter } = require('../lib/frontmatter');
  const convDir = path.join(hubDir, 'docs', 'context', 'conventions');
  try {
    const available = [];
    for (const f of fs.readdirSync(convDir).filter((f) => f.endsWith('.md') && f !== 'index.md')) {
      const raw = fs.readFileSync(path.join(convDir, f), 'utf8');
      const { attrs } = parseFrontmatter(raw);
      if (attrs.required !== 'true') available.push(f.replace(/\.md$/, ''));
    }
    if (available.length > 0) {
      parts.push(`Available conventions (load when relevant): ${available.join(', ')}`);
    }
  } catch {}

  parts.push(
    'Vague question lookup order: Knowledge -> Work items -> Context (docs/knowledge/ -> docs/work/ -> docs/context/) | Use Exploration -> Execution | Capture reusable Execution fixes -> skills | Capture environment discoveries -> docs/knowledge/environment/ | Ask operator before writing to docs/ or creating skills',
  );
  parts.push(
    'LOOKUP: Vague ask -> quick local lookup in order: Knowledge folder -> Work folder -> Context folder. Keep it shallow (first 2 levels), then ask clarifying questions if still unclear.',
  );
}

const msg = `[${parts.join(' | ')}]`;
console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
