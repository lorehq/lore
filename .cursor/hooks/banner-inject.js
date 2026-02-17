// Hook: beforeSubmitPrompt
// Fires before every prompt submission in Cursor.
// First prompt: full session banner + sticky files.
// Subsequent prompts: delegation reminder only.
// First-prompt detection via flag file in .git/ (same pattern as knowledge-tracker state).

const fs = require('fs');
const path = require('path');
const { buildBanner, ensureStickyFiles, getAgentDomains } = require('../../lib/banner');

const root = path.join(__dirname, '..', '..');
const flagFile = path.join(root, '.git', 'lore-cursor-session');

const isFirstPrompt = !fs.existsSync(flagFile);

if (isFirstPrompt) {
  ensureStickyFiles(root);
  try { fs.writeFileSync(flagFile, Date.now().toString()); } catch {}
  console.log(JSON.stringify({ systemMessage: buildBanner(root) }));
} else {
  const agents = getAgentDomains(root);
  const parts = [];
  if (agents.length > 0) parts.push(`Delegate: ${agents.join(', ')}`);
  parts.push('Multi-step? \u2192 use task list');
  console.log(JSON.stringify({ systemMessage: `[${parts.join(' | ')}]` }));
}
