// Shared: sticky file scaffolding.
// "Sticky" files are recreated if deleted — the hook/plugin restores them
// every session so the project always has a minimum viable structure.

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

function readTemplate(directory, templateName) {
  return fs.readFileSync(path.join(directory, '.lore', 'harness', 'templates', templateName), 'utf8');
}

// Read a seed template, returning null if not found.
function readSeed(directory, seedPath) {
  try {
    return fs.readFileSync(path.join(directory, '.lore', 'harness', 'templates', 'seeds', seedPath), 'utf8');
  } catch (e) {
    debug('readSeed: %s', e.message);
    return null;
  }
}

// Seed runbook files: scaffolded into .lore/runbooks/ (not system/).
// Supports subdirectories — use forward slashes in seed/target paths.
const SEED_RUNBOOKS = [
  { seed: 'docs-code-alignment-sweep.md', target: 'docs-code-alignment-sweep.md' },
  { seed: 'first-session/knowledge-worker.md', target: 'first-session/knowledge-worker.md' },
  { seed: 'first-session/homelab.md', target: 'first-session/homelab.md' },
  { seed: 'first-session/personal.md', target: 'first-session/personal.md' },
];

function ensureStickyFiles(directory) {
  try {
    // Runbooks directory — scaffold seed runbooks individually
    const runbooksDir = path.join(directory, '.lore', 'runbooks');
    if (fs.existsSync(runbooksDir)) {
      for (const { seed, target } of SEED_RUNBOOKS) {
        const targetPath = path.join(runbooksDir, target);
        if (!fs.existsSync(targetPath)) {
          const content = readSeed(directory, path.join('runbooks', seed));
          if (content) {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, content);
          }
        }
      }
    }

    const memPath = path.join(directory, '.lore', 'memory.local.md');
    if (!fs.existsSync(memPath)) {
      fs.mkdirSync(path.join(directory, '.lore'), { recursive: true });
      fs.writeFileSync(memPath, readTemplate(directory, 'memory-local.md'));
    }
  } catch (e) {
    debug('ensureStickyFiles: %s', e.message);
  }
}

module.exports = { ensureStickyFiles };
