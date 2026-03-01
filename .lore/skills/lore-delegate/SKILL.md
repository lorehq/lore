---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
banner-loaded: true
user-invocable: false
---
# Delegation Recipe

Every worker spawned without this recipe risks wasted cost, lost knowledge, and broken capture. The orchestrator's job is reasoning and operator interaction — execution belongs to workers.

## Tier Routing

Match the worker tier to the task. The deciding factor is whether the task requires reasoning:

- `lore-explore` — Read-only KB and codebase search. No writes, no execution.
- `lore-worker-fast` — Zero reasoning. KB search, file reads, calling **known documented** endpoints. Never for discovery, never for connecting to undocumented services.
- `lore-worker` — Anything requiring reasoning. API discovery, endpoint exploration, bug investigation, connecting to services not yet in the KB. The default when you're unsure.
- `lore-worker-powerful` — Complex, high-intensity reasoning. Architecture, multi-file refactors, cross-system analysis.

**The critical split: known vs unknown.** If the KB has the endpoint, path, and params documented → fast. If the worker needs to discover, interpret error messages, or figure out an API → mid tier. Fast workers cannot crack APIs — they will brute-force random paths and bail.

Examples:
- `curl` a documented endpoint with known params → `lore-worker-fast`
- Search the KB for a fieldnote → `lore-explore`
- Explore an undocumented API, follow redirects/hints → `lore-worker`
- Investigate a bug across multiple files → `lore-worker`
- Design a new module architecture → `lore-worker-powerful`

## Worker Prompt Template

Copy this template for every worker prompt. Fill every field — workers with missing fields produce worse results and lost knowledge.

```
KB-first: Search the knowledge base before acting (semantic search if available, otherwise Glob `docs/knowledge/`).

Objective: [What the worker must accomplish. Concrete, resolved — no ambiguity for the worker to interpret.]

Success criteria: [Pass/fail conditions. What makes this done vs. not done.]

Scope: [Allowed paths, services, URLs. Workers treat this as a boundary.]

Rules/skills to load: [Name files from .lore/rules/ or .lore/skills/. Include `security` for writes or sensitive data. Write "none" if no rules apply — do not omit the field.]

Bail-out: [Number of tool calls without progress before stopping. Use tier defaults: lore-explore 5, lore-worker-fast 5, lore-worker 12, lore-worker-powerful 20.]

Return format: End with a Captures section: (A) Snags/gotchas, (B) Environment facts, (C) Procedures — or "none" for each.

Uncertainty: [What to do when unsure. Examples: "return both candidates", "stop and report", "use the more conservative option".]
```

**Resolve before delegating.** Workers execute, they don't interpret. All ambiguity is resolved by the orchestrator before it reaches the worker.
- Bad: "find large files" → worker decides threshold
- Good: "find files over 10MB" → worker executes concrete threshold

Workers report findings — the orchestrator decides what to persist.

## Parallel Decomposition

Before spawning, ask: can this be split into independent chunks? If yes, spawn concurrently.
- **By target** — one worker per service, file, or endpoint
- **By concern** — research vs implementation vs validation
- Serialize only when one output feeds another

For open-ended work, spawn non-blocking and monitor. Replace stalled workers with narrower scope.

## After Worker Returns

Check the Captures section in every worker response:
1. Snags reported? → propose fieldnote to operator
2. Environment facts? → propose write to `docs/knowledge/environment/`
3. Procedures? → propose write to `.lore/runbooks/`
4. Nothing? → move on

Workers discover — the orchestrator persists. Never skip this step.
