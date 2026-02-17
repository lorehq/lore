# Lore

Knowledge-persistent coding agent framework. No application code — hooks, skills, agents, and docs that persist across sessions.

## Repo Boundary

**This is a knowledge hub. All code changes happen in external repos — NEVER here.** A Lore instance contains only knowledge files (docs, skills, agents), hooks, scripts, and work tracking. The operator's application code, infrastructure, and configs live in their own repos. If a task requires writing application code, stop and ask which repo it belongs in. Do not create `src/`, `lib/`, or any application code directories in a Lore instance.

## Core Behaviors

1. Creates skills and agents as needed (not pre-emptively)
2. Builds environmental knowledge in `docs/` that persists across sessions
3. Documents everything learned so future sessions skip re-discovery

## Knowledge Routing

| What | Where |
|------|-------|
| Gotchas (auth quirks, encoding, parameter tricks) | `.claude/skills/` via create-skill |
| Context (URLs, repos, services, relationships) | `docs/context/` |
| Procedures (multi-step operations) | `docs/context/runbooks/` |
| Scratch notes (temporary) | `MEMORY.local.md` (gitignored) |

`MEMORY.md` is intercepted by hooks and blocked. Use the routes above.

## Skill Creation

**Every gotcha becomes a skill. No exceptions.** 30-80 lines, generic only — no context data (usernames, URLs, account IDs go in `docs/context/`).

One skill per interaction method (API, CLI, MCP, SDK, UI). Over 80 lines → split by concern.

Naming: `<service>-<action>-<object>`. See `.claude/skills/create-skill/SKILL.md`.

## Agent Creation

**Domain = Agent (1:1). No orphaned skills.** Create immediately when skill has clear domain, even with 1 skill.

Naming: `<domain-slug>-agent`. See `.claude/skills/create-agent/SKILL.md`.

## Delegation

Delegate by domain. Check `agent-registry.md` before work.

- Agent exists → delegate
- No agent → execute directly, create agent during capture

## Capture

After substantive work:
1. New context knowledge? → `docs/context/`
2. Hit gotchas? → create skill
3. Multi-step procedure? → `docs/context/runbooks/`
4. Skills over 80 lines or mixing methods? → split
5. Run `scripts/validate-consistency.sh`

Use `/capture` for a full checklist pass. `/consolidate` for deep repo-wide health checks.

## Work Management

Roadmaps, plans, and brainstorms — all **operator-initiated** (Lore never creates them unprompted).

- **Roadmaps** (`docs/work/roadmaps/<slug>/`): Strategic initiatives (weeks to months). Contain nested `plans/` and `archive/` folders.
- **Plans** (`docs/work/plans/<slug>/` or `docs/work/roadmaps/<roadmap>/plans/<slug>/`): Tactical work (days to weeks). Standalone or nested under a roadmap.
- **Brainstorms** (`docs/work/brainstorms/<slug>/`): Conversation artifacts for future reference. No `status` field — not tracked work.

Roadmaps and plans use YAML frontmatter (`status: active`) and active items appear in the session banner. Completed items move to `archive/` subfolders.

## File Layout

- Skills: `.claude/skills/<name>/SKILL.md`
- Agents: `.claude/agents/<name>.md`
- Registries: `agent-registry.md`, `skills-registry.md` (auto-generated via `scripts/generate-registries.sh`)
- Knowledge: `docs/context/`, `docs/context/runbooks/`
- Work: `docs/work/roadmaps/`, `docs/work/plans/`, `docs/work/brainstorms/`
- Hooks: `hooks/`
- Docs UI: `Dockerfile`, `docker-compose.yml` (optional — `/serve-docs`)
