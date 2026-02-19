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
| Operator identity, preferences | `docs/knowledge/local/operator-profile.md` (gitignored, injected every session) |
| Gotchas (auth quirks, encoding, parameter tricks) | `.lore/skills/` via lore-create-skill |
| Rules, conventions | `docs/context/` |
| Environment (URLs, repos, services, relationships) | `docs/knowledge/environment/` |
| Procedures (multi-step operations) | `docs/knowledge/runbooks/` |
| Scratch notes (temporary) | `MEMORY.local.md` (gitignored) |

`MEMORY.md` is intercepted by hooks and blocked. Use the routes above.

## Ownership

`lore-*` prefix = framework-owned (overwritten on sync). Everything else = operator-owned (never touched by sync or generation scripts).

- Framework skills: `lore-capture`, `lore-create-skill`, etc.
- Operator skills: `bash-macos-compat`, `deploy-staging`, etc.
- Framework agents: `lore-documentation-agent`, etc.
- Operator agents: `infrastructure-agent`, etc.

Discovered gotchas are operator-owned from birth — Lore creates the file, operator owns it. If a skill already exists, warn and skip.

## Knowledge

**Every gotcha becomes a skill. No exceptions.** 30-80 lines, generic only — no context data (usernames, URLs, account IDs go in `docs/knowledge/environment/`).

One skill per interaction method (API, CLI, MCP, SDK, UI). Over 80 lines → split by concern.

Naming: `<service>-<action>-<object>`. Only use `lore-` prefix for framework commands. See `.lore/skills/lore-create-skill/SKILL.md`.

Actively map the environment as you encounter it. When you interact with a URL, service, account, API, or infrastructure component — check if it's already documented. If not, add it to `docs/knowledge/environment/`. Don't wait for capture.

## Agent Creation

**Domain = Agent (1:1). No orphaned skills.** Create immediately when skill has clear domain, even with 1 skill.

Naming: `lore-<domain-slug>-agent` for framework agents, `<domain-slug>-agent` for operator agents. See `.lore/skills/lore-create-agent/SKILL.md`.

Per-platform model preferences go on agents (not skills). Set `claude-model`, `opencode-model`, `cursor-model` in agent frontmatter. Instance defaults live in `.lore-config` under `subagentDefaults`.

## Delegation

Delegate by domain. Check `agent-registry.md` before work.

- Agent exists → delegate
- If a task has independent branches, run them in parallel subagents; keep dependent steps sequential
- Delegated subagents must load `docs/context/agent-rules.md` and relevant files under `docs/context/conventions/` before implementation
- No agent → execute directly, create agent during capture

## Capture

After substantive work:
1. New environment knowledge? → `docs/knowledge/environment/`
2. Hit gotchas? → create skill
3. Multi-step procedure? → `docs/knowledge/runbooks/`
4. Skills over 80 lines or mixing methods? → split
5. Run `scripts/validate-consistency.sh`
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
- Registries: `agent-registry.md`, `skills-registry.md` (auto-generated via `scripts/generate-registries.sh`)
- Context: `docs/context/` (rules, conventions — injected every session)
- Knowledge: `docs/knowledge/`, `docs/knowledge/runbooks/`
- Work: `docs/work/roadmaps/`, `docs/work/plans/`, `docs/work/brainstorms/`
- Hooks: `hooks/`
- Docs UI: `Dockerfile`, `docker-compose.yml` (optional — `/lore-ui`)
