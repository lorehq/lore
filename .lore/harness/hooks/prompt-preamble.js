// Hook: UserPromptSubmit
// Fires before every user message. Static nudge + dynamic ambiguity scan.

const fs = require('fs');
const path = require('path');
const { getConfig, getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = path.join(__dirname, '..', '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);
const cfg = getConfig(hubDir);
const docker = cfg.docker || {};
const hasSemanticSearch = !!(docker.search && docker.search.address);

// -- Static preamble --
const search = hasSemanticSearch
  ? 'SEARCH: Semantic search \u2192 Knowledge base \u2192 Filesystem.'
  : 'SEARCH: Knowledge base \u2192 Filesystem.';
const preamble = `\x1b[93m[\u25A0 LORE-PROTOCOL]\x1b[0m ${search} CAPTURE: Non-obvious fixes \u2192 fieldnotes. SECURITY: Reference secrets by name, never embed values.`;

// -- Dynamic ambiguity scan --
// Patterns that signal ambiguous inputs to resolve or clarify
// before acting or delegating. Broad categories, not specific keywords.
const ambiguityPatterns = [
  // Relative time — needs concrete date/range
  /\b(?:last|past|previous|this|next|recent|earlier|latest)\s+(?:week|month|day|quarter|year|sprint|hour|night|morning)\b/i,
  /\b(?:yesterday|today|tomorrow|tonight)\b/i,
  /\b(?:recently|lately|a while ago|the other day)\b/i,
  // Relative quantities — needs concrete threshold
  /\b(?:a few|some|many|most|several|a lot of|a couple|a handful|enough|too many|too few)\b/i,
  // Vague criteria — needs concrete definition
  /\b(?:large|small|big|slow|fast|important|relevant|significant|major|minor|critical|top|best|worst)\s+(?:files?|items?|ones?|records?|entries?|results?|issues?|errors?|requests?|transactions?|orders?|users?|accounts?)\b/i,
  // Open-ended scope — needs boundaries
  /\b(?:everything|all of|anything|whatever|stuff|things)\s+(?:from|in|about|related|that)\b/i,
];

let ambiguityNote = '';
try {
  let input = {};
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin) input = JSON.parse(stdin);
  }
  const prompt = (input.prompt || '').trim();
  if (prompt) {
    const matches = ambiguityPatterns.filter((p) => p.test(prompt)).map((p) => prompt.match(p)[0]);
    if (matches.length > 0) {
      const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
      ambiguityNote = ` \u26A0 Ambiguous input detected (${unique.map((m) => '"' + m + '"').join(', ')}). Resolve to concrete values before acting or delegating \u2014 clarify with user if needed.`;
    }
  }
} catch (_e) {
  // stdin unavailable or parse error — skip scan, still emit preamble
}

const msg = preamble + ambiguityNote;
fs.writeSync(1, msg + '\n');
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
