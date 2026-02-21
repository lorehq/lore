---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
---
# Delegation Recipe

## Worker Prompt Rules

**Do NOT pre-load skills or conventions.** Workers self-discover using semantic search (or grep/glob fallback). Give them task context only — not file contents.

Include in every worker prompt:
1. **Task description** — what needs doing and why
2. **Scope** — target repo path, which files may be modified
3. **Bail-out rule** — "If stuck after 10 tool calls, STOP and return what you have."
4. **Return contract** — "End with a Captures section: (A) Gotchas, (B) Environment facts, (C) Procedures — or 'none' for each."

Workers must not create skills or update docs — they report, the orchestrator captures.

## Parallel Workers

For independent subtasks, spawn parallel workers. Don't serialize what can run concurrently.

## After Worker Returns

1. Gotchas reported? → create skill
2. Environment facts? → write to `docs/knowledge/environment/`
3. Procedures? → write to `docs/knowledge/runbooks/`
4. Nothing? → move on
