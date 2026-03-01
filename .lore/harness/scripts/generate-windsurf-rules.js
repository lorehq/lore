#!/usr/bin/env node
// Generates .windsurfrules from canonical Lore sources.
// Usage: node generate-windsurf-rules.js /path/to/repo

const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('../lib/banner');
const { stripFrontmatter } = require('../lib/frontmatter');

const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);

function readOr(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return ''; }
}

const instructionsPath = path.join(absRoot, '.lore', 'instructions.md');
if (!fs.existsSync(instructionsPath)) {
  process.stderr.write(`Error: ${instructionsPath} not found\n`);
  process.exit(1);
}

const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
const staticBanner = buildStaticBanner(absRoot);

// -- Passive Enforcement Guardrails --
// Windsurf lacks hooks, so we inject these directly into the rules.

const ambiguityGuard = `
## Ambiguity Guard
You MUST resolve or clarify the following patterns in user input to concrete values before acting or delegating:
- **Relative time:** "last week", "yesterday", "recent sprint", "next month"
- **Relative quantities:** "a few", "some", "many", "enough", "too many"
- **Vague criteria:** "large files", "important items", "slow records", "relevant results"
- **Open-ended scope:** "everything from", "all of", "stuff in about"
When detected, stop and ask the operator for specific dates, thresholds, or boundaries.
`;

const searchDiscipline = `
## Search Discipline
Follow this search strategy strictly to minimize token waste and redundant exploration:
1. **Knowledge Base First:** Search \`docs/\`, \`.lore/skills/\`, and \`.lore/rules/\` first.
2. **Indexed Paths:** Do NOT use broad codebase searches on paths already indexed in the Knowledge Base unless you have identified the specific file.
3. **Unindexed Territory:** Use broad searches first, then narrow down for specifics in external repos or application code.
4. **Act on Findings:** Once a file/section is identified, read it directly. Don't gather more data than needed to act.
`;

const delegationGuidance = `
## Delegation Guidance
You may delegate tasks to specialized workers when it would reduce cost — especially when your context has grown large (50k+ tokens) and a fresh worker avoids accumulated costs. If you delegate, you are responsible for the **Worker Contract** to ensure findings are reported back for capture. Load \`/lore-delegate\` for recipes on worker prompt construction and return format.
`;

// Project Rules
const agentRules = stripFrontmatter(readOr(path.join(absRoot, 'docs', 'context', 'agent-rules.md'))).trim();
let projectRulesBlock = '';
if (agentRules) {
    projectRulesBlock = `\n## Project Context & Rules\n${agentRules}\n`;
}

const windsurfRules = [
    instructions,
    delegationGuidance,
    ambiguityGuard,
    searchDiscipline,
    projectRulesBlock,
    staticBanner
].filter(Boolean).join('\n\n');

fs.writeFileSync(path.join(absRoot, '.windsurfrules'), windsurfRules + '\n');
process.stdout.write('Generated .windsurfrules\n');
