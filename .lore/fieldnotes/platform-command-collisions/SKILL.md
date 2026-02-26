---
name: platform-command-collisions
description: Avoid naming skills that collide with platform built-in slash commands
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

All user-invocable Lore skills use the `lore-` prefix. This eliminates collisions across all platforms — no per-name checking needed.

## When Creating New Skills

All user-invocable skills MUST be named `lore-<action>` (e.g., `/lore-capture`, `/lore-docker`). Non-user-invocable skills (internal gotcha captures) don't need the prefix.
