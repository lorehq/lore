#!/usr/bin/env node
// Generates CLAUDE.md from instructions.md + static banner content.
// Usage: node generate-claude-md.js /path/to/repo

const fs = require('fs');
const path = require('path');
const { buildStaticBanner } = require('../lib/banner');

const root = process.argv[2] || process.cwd();
const absRoot = path.resolve(root);

const instructionsPath = path.join(absRoot, '.lore', 'instructions.md');
if (!fs.existsSync(instructionsPath)) {
  process.stderr.write(`Error: ${instructionsPath} not found\n`);
  process.exit(1);
}

const instructions = fs.readFileSync(instructionsPath, 'utf8').trimEnd();
const staticBanner = buildStaticBanner(absRoot);
const claudeMd = instructions + '\n\n' + staticBanner + '\n';

fs.writeFileSync(path.join(absRoot, 'CLAUDE.md'), claudeMd);
