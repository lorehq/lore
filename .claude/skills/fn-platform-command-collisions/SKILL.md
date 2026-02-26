---
name: platform-command-collisions
description: Avoid naming skills or fieldnotes that collide with platform built-in slash commands
user-invocable: false
allowed-tools: Read
---

# Platform Command Collisions

Coding agents have built-in slash commands that occupy the `/` namespace. Lore skills or fieldnotes that share a name will be shadowed — the operator sees the platform's command, not Lore's.

## Known Collisions

- `/status` — Claude Code built-in (shows model, account, API connectivity)
- `/stats` — Claude Code built-in (usage statistics)

Check each supported platform for collisions before naming user-invocable skills or fieldnotes.

## Rule

All user-invocable Lore skills use the `lore-` prefix. This eliminates collisions across all platforms — no per-name checking needed.

## When Creating New Skills or Fieldnotes

All user-invocable skills MUST be named `lore-<action>` (e.g., `/lore-capture`, `/lore-docker`). Non-user-invocable fieldnotes (internal gotcha captures) don't need the prefix.
