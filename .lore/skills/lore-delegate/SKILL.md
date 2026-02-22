---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
---
# Delegation Recipe

## Worker Prompt Rules

Name what to load — workers read the files themselves.

Include in every worker prompt:
1. **Knowledge-base-first** — "Search the knowledge base before acting (semantic search if available, otherwise Glob/Grep)."
2. **Task description** — what needs doing and why
3. **Conventions to load** — name any from `docs/context/` the worker needs (e.g. `coding`, `security`); worker reads the files
4. **Scope** — target repo path, which files may be modified
5. **Bail-out rule** — "If stuck after 10 tool calls, STOP and return what you have."
6. **Return contract** — "End with a Captures section: (A) Gotchas, (B) Environment facts, (C) Procedures — or 'none' for each."

You may also name specific skills to load — workers discover the rest via semantic search.

Workers must not create skills or update docs — they report, the orchestrator captures.

## Parallel Workers

For independent subtasks, spawn parallel workers. Don't serialize what can run concurrently.

## After Worker Returns

1. Gotchas reported? → create skill
2. Environment facts? → write to `docs/knowledge/environment/`
3. Procedures? → write to `docs/knowledge/runbooks/`
4. Nothing? → move on
