---
name: lore-delegate
description: Delegation recipe — how to construct worker prompts with required context, scope, and return contract.
---
# Delegation Recipe

How to construct a worker prompt. Follow every step.

## 1. Required Context (always load)

Every worker prompt must include:

- `docs/context/agent-rules.md` — project identity, repo boundaries, behavioral constraints
- All `required: true` conventions from `docs/context/conventions/` — check frontmatter

Without these, workers don't know what repo they're in or what constraints apply.

## 2. Task-Relevant Context (selective)

Add based on the task:

- **Additional conventions** — scan `docs/context/conventions/` for non-required files relevant to the task (e.g., `docs.md` for documentation work, `work-items.md` for roadmap/plan updates, `knowledge-capture.md` for capture-heavy tasks)
- **Skills** — scan the SKILLS list (in the banner), match names and descriptions to the task. If no skills match, say so explicitly
- If uncertain, include one extra likely-relevant convention rather than the entire directory

## 3. Scope

Every worker prompt must specify:

- **Target repo path** — the absolute path to the repo the worker operates in
- **Files** — which files the worker may modify

**CRITICAL: Verify target files belong to the scoped repo.** This is a hub — you work across multiple repos. Before delegating, confirm the files you're modifying actually live in the repo you're scoping to. If they belong elsewhere, scope the worker there instead.

## 4. Return Contract

State this acceptance criterion in the worker prompt:

> End your response with a Captures section:
>
> ### Captures
> - (A) Gotchas: <describe each reusable fix, or "none">
> - (B) Environment: <new URLs, endpoints, auth, services, headers, or "none">
> - (C) Procedures: <multi-step operations worth a runbook, or "none">

The orchestrator uses this to decide what to persist. Workers must not create skills or update docs — they report, the orchestrator captures.

## 5. Parallel Workers

For independent subtasks, spawn parallel workers. Each gets its own scope and context selection. Don't serialize what can run concurrently.

## 6. Exploration Delegation

API/endpoint discovery is the highest-value delegation target. Never have the orchestrator (Opus) do serial trial-and-error probing. Instead:

- Spawn a worker (cheaper model) with the base URL and a goal: "discover the API for X"
- The worker probes endpoints, finds docs/swagger, and reports back the working paths, required headers, and auth
- The orchestrator uses those results for execution

This saves 10-20x on exploration tokens vs doing it in the primary agent.

## 7. Example Prompts

**Exploration — user says "check inventory at http://localhost:8791":**

> Task(lore-worker-agent): Discover the inventory API at http://localhost:8791.
>
> Probe common paths (/api, /api/v1, /swagger.json, /openapi.json, /docs, etc.) to find working endpoints. Report the full URL pattern, required headers, query params, and any gotchas (stale swagger, version mismatches).
>
> **Read first (REQUIRED):**
> - `docs/context/agent-rules.md`
> - `docs/context/conventions/security.md`
> - `docs/context/conventions/coding.md`
>
> **Acceptance:** End your response with a Captures section (A/B/C).

**Execution — user says "write a bash deploy script":**

> Task(lore-worker-agent): Write a bash deployment script for the staging environment.
>
> **Read first (REQUIRED):**
> - `docs/context/agent-rules.md`
> - `docs/context/conventions/security.md`
> - `docs/context/conventions/coding.md`
> - `.lore/skills/bash-macos-compat/SKILL.md`
>
> **Scope:** `/home/user/app` — only modify `scripts/deploy.sh`
>
> **Acceptance:** End your response with a Captures section (A/B/C).

## After Worker Returns

1. Review the Captures section
2. Gotchas reported? → `/lore-create-skill`
3. Environment facts reported? → write to `docs/knowledge/environment/`
4. Procedures reported? → write to `docs/knowledge/runbooks/`
5. Nothing to capture? → move on
