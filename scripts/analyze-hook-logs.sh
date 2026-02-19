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

# Convert epoch timestamps from first and last log lines to ISO dates
FIRST_TS=$(head -1 "$LOG" | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);console.log(new Date(o.ts).toISOString())})")
LAST_TS=$(tail -1 "$LOG" | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);console.log(new Date(o.ts).toISOString())})")
echo "Time range: $FIRST_TS → $LAST_TS"
echo ""

# High-level: which platforms are generating events? Expect only the
# platform(s) you've been working in to show up here.
echo "--- Fires per platform ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
const counts = {};
for (const e of lines) { counts[e.platform] = (counts[e.platform]||0)+1; }
for (const [p,c] of Object.entries(counts).sort()) console.log('  ' + p + ': ' + c);
"
echo ""

# Drill down: which specific hooks are firing? Key for identifying
# silent hooks (e.g., context-path-guide only fires on docs/ writes).
echo "--- Fires per hook ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
const counts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook;
  counts[key] = (counts[key]||0)+1;
}
for (const [k,c] of Object.entries(counts).sort()) console.log('  ' + k + ': ' + c);
"
echo ""

# Full detail: platform/hook/event triples. Useful for hooks that handle
# multiple events (e.g., Cursor protect-memory handles beforeReadFile + preToolUse).
echo "--- Fires per event type ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
const counts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook + '/' + e.event;
  counts[key] = (counts[key]||0)+1;
}
for (const [k,c] of Object.entries(counts).sort()) console.log('  ' + k + ': ' + c);
"
echo ""

# Context cost analysis: output_size tracks how many characters each hook
# injects into the agent's view. High averages on high-frequency hooks
# (like capture-nudge) signal context accumulation pressure.
echo "--- Average output size per hook (chars) ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
const sums = {};
const counts = {};
for (const e of lines) {
  const key = e.platform + '/' + e.hook;
  sums[key] = (sums[key]||0) + (e.output_size||0);
  counts[key] = (counts[key]||0)+1;
}
for (const [k] of Object.entries(sums).sort()) {
  const avg = Math.round(sums[k] / counts[k]);
  console.log('  ' + k + ': ' + avg + ' avg (' + sums[k] + ' total across ' + counts[k] + ' fires)');
}
"
echo ""

# Rough token estimate: ~4 chars per token. This is the cumulative context
# cost of all hook injections across the entire logged period. Compare
# against model context window size to gauge overhead.
echo "--- Estimated accumulated context tokens ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
let totalChars = 0;
for (const e of lines) totalChars += (e.output_size||0);
const estTokens = Math.round(totalChars / 4);
console.log('  Total output chars: ' + totalChars);
console.log('  Estimated tokens (chars/4): ~' + estTokens);
"
echo ""

# Gap detection: compares observed hooks against the full expected set
# (5 Claude Code + 6 Cursor + 4 OpenCode = 15 hooks). Missing hooks
# indicate either the platform wasn't used or a hook isn't wired correctly.
echo "--- Missing hooks (expected but never fired) ---"
node -e "
const fs = require('fs');
const lines = fs.readFileSync('$LOG','utf8').trim().split('\n').map(l=>JSON.parse(l));
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
"
echo ""
echo "Done."
