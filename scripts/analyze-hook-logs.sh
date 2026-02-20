#!/usr/bin/env bash
# Analyze hook event logs collected via LORE_HOOK_LOG=1.
#
# Reads .git/lore-hook-events.jsonl (written by lib/hook-logger.js) and
# produces a summary report covering:
#   - Event counts per platform, per hook, and per event type
#   - Average output sizes (to gauge context accumulation cost)
#   - Estimated total token spend from hook injections
#   - Gap detection (hooks that should have fired but didn't)
#
# Uses inline Node.js for JSON parsing since the log format is JSONL.
# Each section reads the full log — acceptable for multi-day logs (~1000s of lines).
#
# Usage: bash scripts/analyze-hook-logs.sh [path/to/logfile]

set -euo pipefail

LOG="${1:-.git/lore-hook-events.jsonl}"

if [ ! -f "$LOG" ]; then
  echo "No log file found at $LOG"
  echo "Enable logging: export LORE_HOOK_LOG=1"
  echo "Then work normally and re-run this script."
  exit 1
fi

TOTAL=$(wc -l < "$LOG")
echo "=== Lore Hook Event Log Analysis ==="
echo "Log file: $LOG"
echo "Total events: $TOTAL"
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "No events recorded."
  exit 0
fi

# All analysis in a single Node process — reads log once, passes path via argv.
node -e "
const fs = require('fs');
const logPath = process.argv[1];
const lines = fs.readFileSync(logPath,'utf8').trim().split('\n').map(l=>JSON.parse(l));

// Time range
console.log('Time range: ' + new Date(lines[0].ts).toISOString() + ' → ' + new Date(lines[lines.length-1].ts).toISOString());
console.log('');

// Fires per platform
console.log('--- Fires per platform ---');
const platCounts = {};
for (const e of lines) platCounts[e.platform] = (platCounts[e.platform]||0)+1;
for (const [p,c] of Object.entries(platCounts).sort()) console.log('  ' + p + ': ' + c);
console.log('');

// Fires per hook
console.log('--- Fires per hook ---');
const hookCounts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook;
  hookCounts[key] = (hookCounts[key]||0)+1;
}
for (const [k,c] of Object.entries(hookCounts).sort()) console.log('  ' + k + ': ' + c);
console.log('');

// Fires per event type
console.log('--- Fires per event type ---');
const evCounts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook + '/' + e.event;
  evCounts[key] = (evCounts[key]||0)+1;
}
for (const [k,c] of Object.entries(evCounts).sort()) console.log('  ' + k + ': ' + c);
console.log('');

// Average output size per hook
console.log('--- Average output size per hook (chars) ---');
const sums = {};
const szCounts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook;
  sums[key] = (sums[key]||0) + (e.output_size||0);
  szCounts[key] = (szCounts[key]||0)+1;
}
for (const [k] of Object.entries(sums).sort()) {
  const avg = Math.round(sums[k] / szCounts[k]);
  console.log('  ' + k + ': ' + avg + ' avg (' + sums[k] + ' total across ' + szCounts[k] + ' fires)');
}
console.log('');

// Estimated accumulated context tokens
console.log('--- Estimated accumulated context tokens ---');
let totalChars = 0;
for (const e of lines) totalChars += (e.output_size||0);
const estTokens = Math.round(totalChars / 4);
console.log('  Total output chars: ' + totalChars);
console.log('  Estimated tokens (chars/4): ~' + estTokens);
console.log('');

// Missing hooks
console.log('--- Missing hooks (expected but never fired) ---');
const seen = new Set(lines.map(e => e.platform + '/' + e.hook));
const expected = [
  'claude/session-init', 'claude/prompt-preamble', 'claude/knowledge-tracker',
  'claude/protect-memory', 'claude/context-path-guide',
  'cursor/session-init', 'cursor/capture-nudge', 'cursor/knowledge-tracker',
  'cursor/protect-memory', 'cursor/failure-tracker', 'cursor/compaction-flag',
  'opencode/session-init', 'opencode/knowledge-tracker',
  'opencode/protect-memory', 'opencode/context-path-guide',
];
const missing = expected.filter(e => !seen.has(e));
if (missing.length === 0) console.log('  All hooks fired at least once.');
else for (const m of missing) console.log('  MISSING: ' + m);
" "$LOG"
echo ""
echo "Done."
