---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
---
# Delegation Recipe

## Worker Prompt Rules

**Do NOT paste file contents into worker prompts.** Name what to load — workers read the files themselves.

Include in every worker prompt:
1. **Task description** — what needs doing and why
2. **Conventions to load** — name any from `docs/context/` the worker needs (e.g. `coding`, `security`); worker reads the files
3. **Scope** — target repo path, which files may be modified
4. **Bail-out rule** — "If stuck after 10 tool calls, STOP and return what you have."
5. **Return contract** — "End with a Captures section: (A) Gotchas, (B) Environment facts, (C) Procedures — or 'none' for each."

Workers self-discover skills via semantic search. You may also name specific skills to load.

Workers must not create skills or update docs — they report, the orchestrator captures.

## Parallel Workers

For independent subtasks, spawn parallel workers. Don't serialize what can run concurrently.

## After Worker Returns

1. Gotchas reported? → create skill
2. Environment facts? → write to `docs/knowledge/environment/`
3. Procedures? → write to `docs/knowledge/runbooks/`
4. Nothing? → move on
