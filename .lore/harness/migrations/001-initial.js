// Migration 001: Create the initial ~/.lore/ directory skeleton.
// Fully idempotent — safe to re-run on existing directories.

const fs = require('fs');
const path = require('path');

const DIRS = [
  'AGENTIC/skills',
  'AGENTIC/rules',
  'AGENTIC/agents',
  'knowledge-base/fieldnotes',
  'knowledge-base/runbooks',
  'knowledge-base/environment',
  'knowledge-base/work-items',
  'knowledge-base/drafts',
];

const OPERATOR_PROFILE_CONTENT = `# Operator Profile

<!-- Injected into every session as OPERATOR PROFILE context. -->
<!-- This file is gitignored — it stays local to your machine. -->

## Identity

- **Name:**
- **Role:**

## Preferences

Add any preferences, working style notes, or context that should be
available to the agent in every session.
`;

exports.version = 1;

exports.up = function up(globalPath) {
  for (const dir of DIRS) {
    fs.mkdirSync(path.join(globalPath, dir), { recursive: true });
  }

  // Seed operator-profile.md only if missing
  const profilePath = path.join(globalPath, 'knowledge-base', 'operator-profile.md');
  if (!fs.existsSync(profilePath)) {
    fs.writeFileSync(profilePath, OPERATOR_PROFILE_CONTENT);
  }
};
