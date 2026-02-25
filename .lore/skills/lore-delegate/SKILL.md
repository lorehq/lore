---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
user-invocable: false
---
# Delegation Recipe

## Worker Prompt Rules

Name what to load — workers read the files themselves.

Include in every worker prompt:
1. **Knowledge-base-first** — "Search the knowledge base before acting (semantic search if available, otherwise Glob/Grep)." This prevents redundant discovery and surfaces existing skills/knowledge early. See **Search Discipline** below for how workers should use results.
2. **Task description** — what needs doing and why
3. **Resolve before delegating** — Workers execute, they don't interpret. Resolve ambiguous or relative inputs to concrete values before they reach the worker. If it requires reasoning or judgment, the orchestrator decides; the worker receives the decision.
   - Bad: "find large files" → worker decides what "large" means
   - Good: "find files over 10MB" → worker executes a clear threshold
   - Bad: "get recent orders" → worker interprets "recent"
   - Good: "get orders with status pending" → worker filters on a concrete field
4. **Conventions to load** — name any from `docs/context/` the worker needs (e.g. `coding`, `security`); worker reads the files
5. **Scope** — target repo path, which files may be modified. Be explicit — workers treat this as a boundary and will return if a task requires writing outside it.
6. **Bail-out rule** — "If stuck after 10 tool calls, stop and return what you have — the orchestrator can redirect."
7. **Return contract** — "End with a Captures section: (A) Gotchas, (B) Environment facts, (C) Procedures — or 'none' for each."

You may also name specific skills to load — workers discover the rest via semantic search.

Workers report findings — the orchestrator decides what to persist.

## Search Discipline

Semantic search indexes the knowledge base (`docs/`, `.lore/skills/`, `docs/context/`). Workers who understand this avoid wasted tool calls.

**Act on what you find.** When a semantic snippet contains the answer (a URL, parameter, command), use it and move on. Don't gather more data once you have enough to act. If the snippet is partial and you need more from that file, Read it by path. Grep and Glob add nothing when the file is already identified.

**Trust negative results.** Semantic search covers the knowledge base thoroughly. When a query returns nothing relevant, the KB doesn't have it — escalate to the orchestrator rather than re-searching the same directories with Grep/Glob. Filesystem search finds what semantic search misses only outside indexed paths (external repos, application code, generated files).

**Match the tool to the territory:**
- KB paths (`docs/`, `.lore/`, `docs/context/`) → semantic search, then Read by path
- External repos and application code → Grep/Glob (not indexed)
- Already-identified file → Read directly (skip search entirely)

**Bail on dry holes.** If you haven't found what you need after a few searches, stop digging. Return to the orchestrator with what you tried and what you found — they have context you don't and can redirect. Spending 15 tool calls searching is always worse than returning early and getting pointed in the right direction.

## Parallel Workers

For independent subtasks, spawn parallel workers. Don't serialize what can run concurrently.

## After Worker Returns

1. Gotchas reported? → create skill
2. Environment facts? → write to `docs/knowledge/environment/`
3. Procedures? → write to `docs/knowledge/runbooks/`
4. Nothing? → move on
