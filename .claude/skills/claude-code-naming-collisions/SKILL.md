---
name: claude-code-naming-collisions
description: Avoid naming skills that collide with Claude Code built-in slash commands
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Read
---

# Claude Code Naming Collisions

Claude Code has built-in slash commands that occupy the `/` namespace. Lore skills that share a name will be shadowed — the operator sees Claude Code's command, not Lore's.

## Known Collisions

- `/status` — Claude Code built-in (shows model, account, API connectivity)
- `/stats` — Claude Code built-in (usage statistics)

## Rule

Lore instance management commands use the `lore-` prefix: `/lore-status`, `/lore-update`.

Workflow commands (`/capture`, `/consolidate`, `/serve-docs`) stay unprefixed — they don't collide with built-ins.

## When Creating New Skills

Before naming a user-invocable skill, check for collisions:
1. Type `/` in Claude Code and scan the autocomplete list
2. If the name appears, prefix with `lore-`
