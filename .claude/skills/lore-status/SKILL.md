---
name: lore-status
description: Show Lore instance health — version, hooks, skills, agents, active work
type: command
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
   - `beforeReadFile` → `protect-memory.js`
   - `preToolUse` (Write) → `protect-memory.js`
   - `beforeShellExecution` → `capture-nudge.js`
   - `afterFileEdit` → `knowledge-tracker.js`
   - `postToolUseFailure` → `failure-tracker.js`
   - `preCompact` → `compaction-flag.js`

   **Cursor MCP** (`.cursor/mcp.json`):
   - Config exists and references `lore-server.js`
   - `.cursor/mcp/lore-server.js` exists

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

4. **Linked repos** — use Glob to check whether `.lore-links` exists before reading it (it is optional and gitignored — never use Read on it without confirming it exists first). If present, parse it (JSON array) and report count. Flag any entries where the path no longer exists as stale. If absent, report "none".

5. **Active work** — scan `docs/work/roadmaps/` and `docs/work/plans/` for items with `status: active` or `status: on-hold` in frontmatter. List titles.

5. **Format** — present as a clean block the operator can read at a glance:
   ```
   Lore v<version>

   Hooks:
     Claude Code   OK
     Cursor        OK
     Cursor MCP    OK
     OpenCode      OK

   Skills: 12 | Agents: 2 | Knowledge docs: 5 | Runbooks: 1

   Linked repos: 2 (1 stale)

   Active roadmaps: V1 Go-Live
   Active plans: (none)
   ```
