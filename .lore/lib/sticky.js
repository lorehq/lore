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

// Seed rule files: template name → target filename.
// Template 'docs.md' creates 'documentation.md' (renamed from legacy 'docs.md').
const SEED_RULES = [
  { seed: 'coding.md', target: 'coding.md' },
  { seed: 'docs.md', target: 'documentation.md' },
  { seed: 'prompt-engineering.md', target: 'prompt-engineering.md' },
  { seed: 'security.md', target: 'security.md' },
];

// Seed runbook files: scaffolded into docs/knowledge/runbooks/ (not system/).
// Supports subdirectories — use forward slashes in seed/target paths.
const SEED_RUNBOOKS = [
  { seed: 'docs-code-alignment-sweep.md', target: 'docs-code-alignment-sweep.md' },
  { seed: 'first-session/knowledge-worker.md', target: 'first-session/knowledge-worker.md' },
  { seed: 'first-session/homelab.md', target: 'first-session/homelab.md' },
  { seed: 'first-session/personal.md', target: 'first-session/personal.md' },
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
<!-- Once setup is complete, replace this file with your deployment details. -->
<!-- Coding rules belong in docs/context/rules/ \u2014 also injected. -->

## Deployment State

This instance has just been deployed and has not yet been set up. The operator profile is blank, the environment is undocumented, and worker tier routing has not been verified.

When the operator starts a session, guide them to complete first-session setup before taking on other work. The runbooks are at docs/knowledge/runbooks/first-session/ \u2014 ask which profile fits (knowledge-worker, homelab, or personal) and follow it phase by phase.

Delete this section and fill in the fields below once setup is complete.

---

## About

Describe this deployment \u2014 operator name, role, org, repos involved, key constraints.

## Agent Behavior

Rules for how the agent should operate in this instance.
`,
      );
    }

    // Rules directory — scaffold index + seed files individually
    const rulesFile = path.join(directory, 'docs', 'context', 'rules.md');
    const rulesDir = path.join(directory, 'docs', 'context', 'rules');
    if (!fs.existsSync(rulesFile) && !fs.existsSync(rulesDir)) {
      // First time: create directory with index
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(rulesDir, 'index.md'),
        `# Rules

Operational rules and standards for this environment. Each page covers a specific domain.
`,
      );
    }
    // Create individual seed rule files if missing (even if dir already exists)
    if (fs.existsSync(rulesDir)) {
      for (const { seed, target } of SEED_RULES) {
        const targetPath = path.join(rulesDir, target);
        if (!fs.existsSync(targetPath)) {
          const content = readSeed(directory, path.join('rules', seed));
          if (content) {
            fs.writeFileSync(targetPath, content);
          }
        }
      }
    }

    // Runbooks directory — scaffold seed runbooks individually
    const runbooksDir = path.join(directory, 'docs', 'knowledge', 'runbooks');
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
