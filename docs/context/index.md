# Project Context

Foundational configuration injected into every agent session. This is the "Base DNA" of the Lore harness — what you must know before performing any task.

## Mandates vs. Rules

Lore uses a tiered system of instructions to balance global principles with project-specific standards:

1.  **Foundational Mandates** (`CLAUDE.md`, `GEMINI.md`, `.windsurfrules`): The core Mission and Principles. These are always-on and provide your primary identity as a Lore agent.
2.  **Project Identity** (`agent-rules.md`): Defines what this specific project is and how you should behave within it.
3.  **Behavioral Rules** (`rules/`): Granular guardrails for `coding`, `security`, `documentation`, and `work-tracking`. These are often loaded on-demand via hooks or `.mdc` rules.

## Priority

If instructions conflict, follow this priority:
1.  **Root Mandates** (`GEMINI.md`, etc.) — *Highest*
2.  **Project Identity** (`agent-rules.md`)
3.  **Behavioral Rules** (`rules/*.md`) — *Lowest*

Reference material (endpoints, credentials, runbooks) should NOT live here. Use [Knowledge Base](../knowledge/index.md) instead.

