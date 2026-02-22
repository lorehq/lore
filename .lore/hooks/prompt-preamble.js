// Hook: UserPromptSubmit
// Fires before every user message. Static nudge + dynamic ambiguity scan.

const fs = require('fs');
const path = require('path');
const { getConfig, getProfile } = require('../lib/config');
const { logHookEvent } = require('../lib/hook-logger');

const hubDir = process.env.LORE_HUB || path.join(__dirname, '..', '..');
if (getProfile(hubDir) === 'minimal') process.exit(0);
const cfg = getConfig(hubDir);
const docker = cfg.docker || {};
const hasSemanticSearch = !!(docker.search && docker.search.address);

// -- Static preamble (identity roles) --
const search = hasSemanticSearch
  ? 'Curator: search KB first \u2014 if results answer the question, respond directly'
  : 'Curator: search docs/knowledge/ \u2192 docs/work/ \u2192 docs/context/ first \u2014 if results answer the question, respond directly';
const preamble = `[${search}. Orchestrator: delegate API calls, curl, multi-step exploration, and parallel work to workers (load /lore-delegate first) \u2014 don\u2019t execute directly. Capturer: gotcha \u2192 skill, new fact \u2192 docs/knowledge/. After task \u2192 propose capture or state why not.]`;

// -- Dynamic ambiguity scan --
// Patterns that signal inputs the orchestrator should resolve or clarify
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
    const matches = ambiguityPatterns
      .filter(p => p.test(prompt))
      .map(p => prompt.match(p)[0]);
    if (matches.length > 0) {
      const unique = [...new Set(matches.map(m => m.toLowerCase()))];
      ambiguityNote = ` \u26A0 Ambiguous input detected (${unique.map(m => '"' + m + '"').join(', ')}). Resolve to concrete values before acting or delegating \u2014 clarify with user if needed.`;
    }
  }
} catch (_e) {
  // stdin unavailable or parse error — skip scan, still emit preamble
}

const msg = preamble + ambiguityNote;
console.log(msg);
logHookEvent({
  platform: 'claude',
  hook: 'prompt-preamble',
  event: 'UserPromptSubmit',
  outputSize: msg.length,
  directory: hubDir,
});
