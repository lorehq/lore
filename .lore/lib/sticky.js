// Shared: sticky file scaffolding.
// "Sticky" files are recreated if deleted — the hook/plugin restores them
// every session so the project always has a minimum viable structure.

const fs = require('fs');
const path = require('path');
const { debug } = require('./debug');

function readTemplate(directory, templateName) {
  return fs.readFileSync(path.join(directory, '.lore', 'templates', templateName), 'utf8');
}

// Read a seed template, returning null if not found.
function readSeed(directory, seedPath) {
  try {
    return fs.readFileSync(path.join(directory, '.lore', 'templates', 'seeds', seedPath), 'utf8');
  } catch (e) {
    debug('readSeed: %s', e.message);
    return null;
  }
}

// Seed convention files: template name → target filename.
// Template 'docs.md' creates 'documentation.md' (renamed from legacy 'docs.md').
const SEED_CONVENTIONS = [
  { seed: 'coding.md', target: 'coding.md' },
  { seed: 'docs.md', target: 'documentation.md' },
  { seed: 'prompt-engineering.md', target: 'prompt-engineering.md' },
  { seed: 'security.md', target: 'security.md' },
];

function ensureStickyFiles(directory) {
  try {
    const localIndex = path.join(directory, 'docs', 'knowledge', 'local', 'index.md');
    if (!fs.existsSync(localIndex)) {
      fs.mkdirSync(path.join(directory, 'docs', 'knowledge', 'local'), { recursive: true });
      fs.writeFileSync(localIndex, readTemplate(directory, 'local-index.md'));
    }

    const operatorProfile = path.join(directory, 'docs', 'knowledge', 'local', 'operator-profile.md');
    if (!fs.existsSync(operatorProfile)) {
      fs.mkdirSync(path.join(directory, 'docs', 'knowledge', 'local'), { recursive: true });
      fs.writeFileSync(operatorProfile, readTemplate(directory, 'operator-profile.md'));
    }

    const agentRulesPath = path.join(directory, 'docs', 'context', 'agent-rules.md');
    if (!fs.existsSync(agentRulesPath)) {
      fs.mkdirSync(path.join(directory, 'docs', 'context'), { recursive: true });
      fs.writeFileSync(
        agentRulesPath,
        `# Agent Rules

<!-- Injected into every agent session as PROJECT context. -->
<!-- Customize with your project identity and behavior rules. -->
<!-- Coding conventions belong in docs/context/conventions/ \u2014 also injected. -->

## About

Describe your project \u2014 what it is, what repos are involved, key constraints.

## Agent Behavior

Rules for how the agent should operate in this instance.
`,
      );
    }

    // Conventions directory — scaffold index + seed files individually
    const convFile = path.join(directory, 'docs', 'context', 'conventions.md');
    const convDir = path.join(directory, 'docs', 'context', 'conventions');
    if (!fs.existsSync(convFile) && !fs.existsSync(convDir)) {
      // First time: create directory with index
      fs.mkdirSync(convDir, { recursive: true });
      fs.writeFileSync(
        path.join(convDir, 'index.md'),
        `# Conventions

Operational rules and standards for this environment. Each page covers a specific domain.
`,
      );
    }
    // Create individual seed convention files if missing (even if dir already exists)
    if (fs.existsSync(convDir)) {
      for (const { seed, target } of SEED_CONVENTIONS) {
        const targetPath = path.join(convDir, target);
        if (!fs.existsSync(targetPath)) {
          const content = readSeed(directory, path.join('conventions', seed));
          if (content) {
            fs.writeFileSync(targetPath, content);
          }
        }
      }
    }

    // Notes directory — scaffold index
    const notesIndex = path.join(directory, 'docs', 'work', 'notes', 'index.md');
    if (!fs.existsSync(notesIndex)) {
      fs.mkdirSync(path.join(directory, 'docs', 'work', 'notes'), { recursive: true });
      fs.writeFileSync(notesIndex, readTemplate(directory, 'notes-index.md'));
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
