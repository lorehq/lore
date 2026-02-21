---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
---
# Delegation Recipe

## Worker Prompt Rules

1. **Include relevant knowledge** — paste any docs/files from semantic search results that the worker needs
2. **Scope** — specify the target repo path and which files the worker may modify
4. **Bail-out rule** — include in every prompt: "If stuck after 10 tool calls, STOP and return what you have."
5. **Return contract** — include in every prompt: "End with a Captures section: (A) Gotchas, (B) Environment facts, (C) Procedures — or 'none' for each."

Workers must not create skills or update docs — they report, the orchestrator captures.

## Parallel Workers

For independent subtasks, spawn parallel workers. Don't serialize what can run concurrently.

## After Worker Returns

1. Gotchas reported? → create skill
2. Environment facts? → write to `docs/knowledge/environment/`
3. Procedures? → write to `docs/knowledge/runbooks/`
4. Nothing? → move on
