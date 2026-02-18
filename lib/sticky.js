// Shared: sticky file scaffolding.
// "Sticky" files are recreated if deleted — the hook/plugin restores them
// every session so the project always has a minimum viable structure.

const fs = require('fs');
const path = require('path');

function ensureStickyFiles(directory) {
  const localIndex = path.join(directory, 'docs', 'knowledge', 'local', 'index.md');
  if (!fs.existsSync(localIndex)) {
    fs.mkdirSync(path.join(directory, 'docs', 'knowledge', 'local'), { recursive: true });
    fs.writeFileSync(localIndex, `# Local Notes

This folder is gitignored \u2014 anything here stays local to your machine.

Use it for scratch notes, credentials references, personal bookmarks, or
anything you don't want committed to the shared repo.

This folder shows up in nav and the knowledge path guide like any other
section, but git won't track its contents.
`);
  }

  const agentRulesPath = path.join(directory, 'docs', 'context', 'agent-rules.md');
  if (!fs.existsSync(agentRulesPath)) {
    fs.mkdirSync(path.join(directory, 'docs', 'context'), { recursive: true });
    fs.writeFileSync(agentRulesPath, `# Agent Rules

<!-- Injected into every agent session as PROJECT context. -->
<!-- Customize with your project identity and behavior rules. -->
<!-- Coding conventions belong in docs/context/conventions.md \u2014 also injected. -->

## About

Describe your project \u2014 what it is, what repos are involved, key constraints.

## Agent Behavior

Rules for how the agent should operate in this instance.
`);
  }

  const convFile = path.join(directory, 'docs', 'context', 'conventions.md');
  const convDir = path.join(directory, 'docs', 'context', 'conventions');
  if (!fs.existsSync(convFile) && !fs.existsSync(convDir)) {
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(path.join(convDir, 'index.md'), `# Conventions

Operational rules and standards for this environment. Each page covers a specific domain.
`);
    fs.writeFileSync(path.join(convDir, 'docs.md'), `# Docs

## Formatting

- **Checkboxes** (\`- [x]\`/\`- [ ]\`) for all actionable items: scope, deliverables, success criteria
- **Strikethrough** (\`~~text~~\`) on completed item text: \`- [x] ~~Done item~~\`
- **No emoji icons** \u2014 no checkmarks, no colored circles, no decorative symbols
- **Blank line before lists** \u2014 required for MkDocs to render lists correctly
`);
    fs.writeFileSync(path.join(convDir, 'coding.md'), `# Coding

Add your coding rules here \u2014 standards the agent should follow when writing code.
`);
  }

  const memPath = path.join(directory, 'MEMORY.local.md');
  if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, '# Local Memory\n');
}

module.exports = { ensureStickyFiles };
