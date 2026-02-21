# Lore

Knowledge-persistent coding agent framework.

## Repo Boundary

**This is a knowledge hub. All code changes happen in external repos — NEVER here.** A Lore instance contains only knowledge files (docs, skills, agents), hooks, scripts, and work tracking. The operator's application code, infrastructure, and configs live in their own repos. If a task requires writing application code, stop and ask which repo it belongs in. Do not create `src/`, `lib/`, or any application code directories in a Lore instance.

## Core Behaviors

1. Creates skills and agents as needed (not pre-emptively)
2. Builds environmental knowledge in `docs/` that persists across sessions
3. Documents everything learned so future sessions skip re-discovery

## Knowledge Routing

| What | Where |
|------|-------|
| Operator identity, preferences | `docs/knowledge/local/operator-profile.md` (gitignored, injected every session) |
| Gotchas (auth quirks, encoding, parameter tricks) | `.lore/skills/` via lore-create-skill |
| Rules, conventions | `docs/context/` |
| Environment (URLs, repos, services, relationships) | `docs/knowledge/environment/` |
| Procedures (multi-step operations) | `docs/knowledge/runbooks/` |
| Scratch notes (temporary) | `.lore/memory.local.md` (gitignored) |

`MEMORY.md` is intercepted by hooks and blocked. Use the routes above.

## Ownership

`lore-*` prefix = framework-owned (overwritten on sync). Everything else = operator-owned (never touched by sync or generation scripts).

- Framework skills: `lore-capture`, `lore-create-skill`, etc.
- Operator skills: `bash-macos-compat`, etc.
- Framework agents: `lore-worker-agent`

Gotcha skills are operator-owned. If a skill already exists, warn and skip.

## Knowledge

**Every gotcha becomes a skill. No exceptions.** 30-80 lines, generic only — no context data (usernames, URLs, account IDs go in `docs/knowledge/environment/`).

One skill per interaction method (API, CLI, MCP, SDK, UI). Over 80 lines → split by concern.

Naming: `<service>-<action>-<object>`. Only use `lore-` prefix for framework commands.

Actively map the environment as you encounter it. When you interact with a URL, service, account, API, or infrastructure component — check if it's already documented. If not, add it to `docs/knowledge/environment/`. Don't wait for capture.

## Exploration vs Execution

Use a two-phase workflow for problem solving:

- Exploration phase: discover interfaces, endpoints, inputs, and constraints. Non-success responses can be normal discovery noise.
- Execution phase: run the expected-success path. Failures here are high-signal and require a capture decision before completion.

Capture rules:

- Reusable fix pattern resolved in Execution -> create or update a skill.
- New environment facts (URL, endpoint, service, host, port, auth/header requirement, redirect, base path) -> `docs/knowledge/environment/`.
- If neither applies, state: `No capture needed` with a one-line reason.

## Agent Creation

**One framework worker: `lore-worker-agent`.** The orchestrator spawns it per-task with curated skills, conventions, and scope.

Operator agents are optional. Create them when a static, reusable delegation pattern is valuable — naming: `<purpose>-agent`.

Per-platform model preferences go on agents (not skills). Set `claude-model`, `opencode-model`, `cursor-model` in agent frontmatter. Instance defaults live in `.lore/config.json` under `subagentDefaults`.

## Delegation

**Orchestrate, don't execute.** Default to `lore-worker-agent`. If another agent exists whose name fits the task, use it instead.

Delegate when: parallel subtasks, long execution, context is getting heavy, or a cheaper model suffices.
Don't delegate: quick answers, single reads, single API calls, clarifications, or capture writes.

Never delegate capture writes. Environment docs, runbooks, and skills must be written by the primary orchestrator after reviewing results.

For vague asks, perform a quick local lookup in order: Knowledge folder -> Work folder -> Context folder. Keep lookup shallow (first 2 levels) before asking clarifying questions.

If `.lore/config.json` sets `semanticSearchUrl`, treat it as enabled and query semantic search first for vague asks, then fall back to local folder lookup.
For localhost/private semantic URLs, use skill `semantic-search-query-local` instead of Fetch/WebFetch, which may block private endpoints.

Conventions are selective for worker delegation:

- Always include core safety/capture conventions: `security.md`, `knowledge-capture.md`.
- Add only task-relevant conventions from `docs/context/conventions/` (for example: `coding.md` for code edits, `docs.md` for documentation work, `work-items.md` for roadmap/plan updates).
- If uncertain, include one extra likely-relevant convention rather than the entire directory.

Skills are selective. The orchestrator scans the SKILLS list (in the banner) or `.lore/skills/`, matches skill names and descriptions to the task, and passes relevant skill paths to the worker.

Example — user asks to "write a bash deploy script":

> Task(lore-worker-agent): Write a bash deployment script for the staging environment.
>
> **Load first:**
> - `docs/context/conventions/security.md`
> - `docs/context/conventions/knowledge-capture.md`
> - `docs/context/conventions/coding.md`
> - `.lore/skills/bash-macos-compat/SKILL.md`
>
> **Scope:** `/home/user/app` — only modify `scripts/deploy.sh`

1. Always include core safety/capture conventions
2. Add task-relevant conventions only
3. Scan skills for relevance → `bash-macos-compat` matches
4. Spawn worker with task + selected conventions + matched skills + scope
5. Parallel workers for independent branches
6. Review results, handle capture

## Capture

After substantive work:
1. New environment knowledge? → `docs/knowledge/environment/`
2. Hit gotchas? → create skill
3. Multi-step procedure? → `docs/knowledge/runbooks/`
4. Skills over 80 lines or mixing methods? → split
5. Run `.lore/scripts/validate-consistency.sh`
6. Active plan or roadmap? → update progress

Use `/lore-capture` for a full checklist pass. `/lore-consolidate` for deep repo-wide health checks.

## Work Management

Roadmaps, plans, and brainstorms — all **operator-initiated** (Lore never creates them unprompted).

- **Roadmaps** (`docs/work/roadmaps/<slug>/`): Strategic initiatives (weeks to months). Contain nested `plans/` and `archive/` folders.
- **Plans** (`docs/work/plans/<slug>/` or `docs/work/roadmaps/<roadmap>/plans/<slug>/`): Tactical work (days to weeks). Standalone or nested under a roadmap.
- **Brainstorms** (`docs/work/brainstorms/<slug>/`): Conversation artifacts for future reference. No `status` field — not tracked work.

Roadmaps and plans use YAML frontmatter (`status: active`) and active items appear in the session banner. Completed items move to `archive/` subfolders.

## File Layout

- Instructions: `.lore/instructions.md` (canonical), `CLAUDE.md` (generated), `.cursor/rules/lore-*.mdc` (generated)
- Skills: `.lore/skills/<name>/SKILL.md` (canonical), `.claude/skills/` (generated platform copy)
- Agents: `.lore/agents/<name>.md` (canonical), `.claude/agents/` (generated platform copy)
- Context: `docs/context/` (rules, conventions — injected every session)
- Knowledge: `docs/knowledge/`, `docs/knowledge/runbooks/`
- Work: `docs/work/roadmaps/`, `docs/work/plans/`, `docs/work/brainstorms/`
- Hooks: `.lore/hooks/`
- Docs UI: `Dockerfile`, `docker-compose.yml` (optional — `/lore-ui`)
