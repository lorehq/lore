---
name: lore-field-repair
description: Guided workflow for diagnosing and fixing harness bugs in deployed instances
type: command
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, TaskCreate, TaskUpdate
---

# Field Repair

Diagnose and fix a harness bug using the field repair workflow.

## When to Use

The operator types `/lore-field-repair` when a hook, script, skill, or rule is broken in the current instance or a deployed instance reports a failure.

## Process

1. Load the field-repair rule: `docs/context/rules/field-repair.md`
2. Ask the operator:
   - **What's broken?** (hook error, skill failure, script crash, bad behavior)
   - **How to reproduce?** (exact trigger — slash command, tool call, event)
   - **Which repo likely owns this?** (lore, create-lore, lore-docker, lore-docs)
3. Follow the rule steps in order:
   - Reproduce → Isolate → Fix in source → Test → Push and sync → Report → Capture
4. Use TaskCreate to track each step if the repair spans multiple turns

## Snags

- Debug output goes to `/tmp`, never stderr — stderr corrupts hook responses
- Copy fixed files into the instance for testing, but revert before syncing
- Always fix in the source repo, never patch the instance directly
- Run `/lore-update` from the instance after pushing — never run sync scripts ad-hoc
- The operator is your eyes — ask them to confirm behavior you can't observe
