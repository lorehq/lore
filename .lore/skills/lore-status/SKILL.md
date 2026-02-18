---
name: lore-status
description: Show Lore instance health — version, hooks, skills, agents, active work
domain: Orchestrator
scope: internal
user-invocable: true
allowed-tools: Bash, Read, Glob
---

# Status

Operator-facing diagnostic. Shows whether Lore is loaded and healthy.

## When to Use

The operator types `/lore-status` to verify their Lore instance.

## Process

Run these checks and present a formatted summary to the operator:

1. **Version** — read `version` from `.lore-config`. If missing, report "no version (pre-update-lore)".

2. **Hooks** — check each platform that has config present:

   **Claude Code** (`.claude/settings.json`):
   - `SessionStart` → `session-init.js`
   - `UserPromptSubmit` → `prompt-preamble.js`
   - `PreToolUse` → `protect-memory.js`
   - `PreToolUse` → `context-path-guide.js`
   - `PostToolUse` → `knowledge-tracker.js`
   - `PostToolUseFailure` → `knowledge-tracker.js`

   **Cursor** (`.cursor/hooks.json`):
   - `sessionStart` → `session-init.js`
   - `beforeSubmitPrompt` → `prompt-preamble.js`
   - `beforeReadFile` → `protect-memory.js`
   - `afterFileEdit` → `knowledge-tracker.js`
   - `afterShellExecution` → `knowledge-tracker.js`

   **OpenCode** (`.opencode/plugins/`):
   - `session-init.js`
   - `protect-memory.js`
   - `knowledge-tracker.js`
   - `context-path-guide.js`

   Report each platform as OK, PARTIAL, or MISSING.

3. **Counts** — count and report:
   - Skills: number of directories in `.lore/skills/`
   - Agents: number of `.md` files in `.lore/agents/` (0 if dir missing)
   - Knowledge docs: number of `.md` files under `docs/knowledge/`
   - Runbooks: number of `.md` files under `docs/knowledge/runbooks/`

4. **Linked repos** — if `.lore-links` exists, parse it (JSON array) and report count. Flag any entries where the path no longer exists as stale.

5. **Active work** — scan `docs/work/roadmaps/` and `docs/work/plans/` for items with `status: active` or `status: on-hold` in frontmatter. List titles.

5. **Format** — present as a clean block the operator can read at a glance:
   ```
   Lore v0.3.0

   Hooks:
     Claude Code   OK
     Cursor        OK
     OpenCode      OK

   Skills: 12 | Agents: 2 | Knowledge docs: 5 | Runbooks: 1

   Linked repos: 2 (1 stale)

   Active roadmaps: V1 Go-Live
   Active plans: (none)
   ```
