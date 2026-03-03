# Field-Testing Hooks

Validate that all 15 hooks across Claude Code, Cursor, and OpenCode fire correctly and measure their context cost.

## Prerequisites

- Lore source repo at latest (hook-logger.js must be present in lib/)
- Instance synced via `/lore-update` or `sync-harness.sh`

## Enable Logging

```bash
export LORE_HOOK_LOG=1
```

Add to `~/.bashrc` or `~/.zshrc` to persist across sessions. Zero overhead when unset.

## Collect Data

Work normally across platforms for 2-7 days. No behavior change needed — just use the tools as you would.

Log location: `.git/lore-hook-events.jsonl` in each workspace where hooks fire.

## Analyze

```bash
bash scripts/analyze-hook-logs.sh
```

Or specify a log file from another workspace:

```bash
bash scripts/analyze-hook-logs.sh /path/to/other-repo/.git/lore-hook-events.jsonl
```

## Report Sections

| Section | What to look for |
|---------|-----------------|
| Fires per platform | Only platforms you used should appear |
| Fires per hook | All hooks for your platform should have > 0 fires |
| Fires per event type | Hooks handling multiple events show separate counts |
| Average output size | High-frequency hooks with large output = context pressure |
| Accumulated tokens | Total context cost from hook injections across the period |
| Missing hooks | Hooks that never fired — expected if you didn't use that platform |

## Expected Hook Inventory

| Platform | Hooks |
|----------|-----------------|
| Claude Code (6) | session-init, prompt-preamble, knowledge-tracker, protect-memory, context-path-guide, rule-guard |
| Cursor (6) | session-init, capture-nudge, knowledge-tracker, protect-memory, failure-tracker, compaction-flag |
| OpenCode (5) | session-init, knowledge-tracker, protect-memory, context-path-guide, rule-guard |

## Reset

```bash
rm .git/lore-hook-events.jsonl
```

## Disable

Remove `LORE_HOOK_LOG=1` from your shell config, or:

```bash
unset LORE_HOOK_LOG
```
