// Hook: preCompact
// Sets a flag file so capture-nudge.js can detect that context compaction
// occurred and emit a re-orientation message on the next shell command.
// Fire-and-forget — Cursor does not consume output from preCompact.

const fs = require('fs');
const path = require('path');
const { logHookEvent } = require('../../.lore/lib/hook-logger');

// Write flag to .git/ (repo-local, gitignored) or tmpdir as fallback
const gitDir = path.join(process.cwd(), '.git');
const flagDir = fs.existsSync(gitDir) ? gitDir : require('os').tmpdir();
const flagPath = path.join(flagDir, 'lore-compacted');

fs.writeFileSync(flagPath, Date.now().toString());
// No output (Cursor ignores preCompact output), but log to verify compaction
// detection works — capture-nudge should emit re-orientation on next shell command
logHookEvent({
  platform: 'cursor',
  hook: 'compaction-flag',
  event: 'preCompact',
  outputSize: 0,
  directory: process.cwd(),
});
