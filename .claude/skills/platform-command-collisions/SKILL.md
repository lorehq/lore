---
name: platform-command-collisions
description: Avoid naming skills that collide with platform built-in slash commands
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Read
---

# Platform Command Collisions

Coding agents have built-in slash commands that occupy the `/` namespace. Lore skills that share a name will be shadowed — the operator sees the platform's command, not Lore's.

## Known Collisions

- `/status` — Claude Code built-in (shows model, account, API connectivity)
- `/stats` — Claude Code built-in (usage statistics)

Check each supported platform for collisions before naming user-invocable skills.

## Rule

Lore instance management commands use the `lore-` prefix: `/lore-status`, `/lore-update`.

Workflow commands (`/capture`, `/consolidate`, `/serve-docs`) stay unprefixed — they don't collide with built-ins on any supported platform.

## When Creating New Skills

Before naming a user-invocable skill, check for collisions:
1. Type `/` in your coding agent and scan the autocomplete list
2. If the name appears on any supported platform, prefix with `lore-`
