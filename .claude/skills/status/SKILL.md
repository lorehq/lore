---
name: status
description: Show Lore instance health — version, hooks, skills, agents, active work
domain: Orchestrator
scope: internal
user-invocable: true
allowed-tools: Bash, Read, Glob
---

# Status

Operator-facing diagnostic. Shows whether Lore is loaded and healthy.

## When to Use

The operator types `/status` to verify their Lore instance.

## Process

Run these checks and present a formatted summary to the operator:

1. **Version** — read `version` from `.lore-config`. If missing, report "no version (pre-update-lore)".

2. **Hooks** — read `.claude/settings.json` and verify these hooks are configured:
   - `SessionStart` → `session-init.js`
   - `UserPromptSubmit` → `prompt-preamble.js`
   - `PreToolUse` → `protect-memory.js`
   - `PostToolUse` → `post-edit-reminder.js`
   - Report each as OK or MISSING.

3. **Counts** — count and report:
   - Skills: number of directories in `.claude/skills/`
   - Agents: number of `.md` files in `.claude/agents/` (0 if dir missing)
   - Environment docs: number of `.md` files under `docs/environment/`
   - Runbooks: number of `.md` files under `docs/runbooks/`

4. **Active work** — scan `docs/work/roadmaps/` and `docs/work/plans/` for items with `status: active` or `status: on-hold` in frontmatter. List titles.

5. **Format** — present as a clean block the operator can read at a glance:
   ```
   Lore v0.1.0

   Hooks:
     SessionStart     ✓
     UserPromptSubmit  ✓
     PreToolUse        ✓
     PostToolUse       ✓

   Skills: 12 | Agents: 2 | Env docs: 5 | Runbooks: 1

   Active roadmaps: V1 Go-Live
   Active plans: (none)
   ```
