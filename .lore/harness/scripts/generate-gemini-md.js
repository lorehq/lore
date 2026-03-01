#!/usr/bin/env node
// Generates GEMINI.md from instructions.md + static banner content.
// Usage: node generate-gemini-md.js /path/to/repo

const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('../lib/banner');
const { getConfig } = require('../lib/config');

const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);

const instructionsPath = path.join(absRoot, '.lore', 'instructions.md');
if (!fs.existsSync(instructionsPath)) {
  process.stderr.write(`Error: ${instructionsPath} not found\n`);
  process.exit(1);
}

const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
const staticBanner = buildStaticBanner(absRoot);

// Use soft delegation guidance for all setups — testing shows intrinsic
// delegation behavior is more efficient than hard enforcement.
const cfg = getConfig(absRoot);
const delegationBlock = `
## Delegation Guidance

You may delegate tasks to workers when it would reduce cost — especially when your context has grown large (50k+ tokens) and a fresh worker avoids accumulated costs. If you delegate, you are responsible for the **Worker Contract** to ensure findings are reported back for capture. Load \\\`/lore-delegate\\\` (read the file) for recipes on worker prompt construction and return format.
`;

const geminiMd = instructions + '\n' + delegationBlock + '\n' + staticBanner + '\n';

fs.writeFileSync(path.join(absRoot, 'GEMINI.md'), geminiMd);
process.stdout.write('Generated GEMINI.md\n');
