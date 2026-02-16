# Lore

Knowledge-persistent coding agent framework. No application code — hooks, skills, agents, and docs that persist across sessions.

## Core Behaviors

1. Creates skills and agents as needed (not pre-emptively)
2. Builds environmental knowledge in `docs/` that persists across sessions
3. Documents everything learned so future sessions skip re-discovery

## Knowledge Routing

| What | Where |
|------|-------|
| Gotchas (auth quirks, encoding, parameter tricks) | `.claude/skills/` via create-skill |
| Environmental (URLs, repos, services, relationships) | `docs/environment/` |
| Procedures (multi-step operations) | `docs/runbooks/` |
| Scratch notes (temporary) | `MEMORY.local.md` (gitignored) |

`MEMORY.md` is intercepted by hooks and blocked. Use the routes above.

## Skill Creation

**Every gotcha becomes a skill. No exceptions.** 30-80 lines, generic only — no environment data (usernames, URLs, account IDs go in `docs/environment/`).

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
1. New environmental knowledge? → `docs/environment/`
2. Hit gotchas? → create skill
3. Multi-step procedure? → `docs/runbooks/`
4. Skills over 80 lines or mixing methods? → split
5. Run `scripts/validate-consistency.sh`

## File Layout

- Skills: `.claude/skills/<name>/SKILL.md`
- Agents: `.claude/agents/<name>.md`
- Registries: `agent-registry.md`, `skills-registry.md` (auto-generated via `scripts/generate-registries.sh`)
- Knowledge: `docs/environment/`, `docs/runbooks/`
- Hooks: `hooks/`
