---
name: lore-repair
description: Diagnose and fix a Lore harness or bundle bug
type: command
user-invocable: true
agent: lore-harness-engineer
---
# Repair — Diagnose and Fix

Delegate to the `lore-harness-engineer` agent with full context.

Ask the operator:
1. What's broken? (symptoms, error messages)
2. Which platform? (claude, cursor, copilot, gemini, windsurf, opencode)
3. How to reproduce? (steps, commands)

Then hand off to the agent. The agent has deep reference material in this skill's
`references/` directory for subsystem-specific diagnostics:

- `references/projection-pipeline.md` — composition + projection internals
- `references/agent-skills-standard.md` — Agent Skills standard structure
- `references/mcp-resolution.md` — MCP server troubleshooting
- `references/bundle-lifecycle.md` — bundle management internals

Load the relevant reference file(s) based on the symptom domain before diving into code.
