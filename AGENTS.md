# AGENTS.md

## Repository Purpose

Meta-repository for configuring your coding agent's environment, agents, and skills. No application code. The core value is **persistent knowledge** — skills and environmental docs that give the agent continuity across sessions.

## Operating Principles

Lore is a **knowledge-persistent AI coding framework** that:
1. Creates and curates skills and agents as needed (not pre-emptively)
2. Builds environmental knowledge in `docs/` so institutional knowledge persists
3. Documents everything learned so future sessions avoid re-asking the same questions

### Environmental Self-Learning

`docs/` serves dual purpose: operational documentation AND environmental knowledge base.

**Capture during reconciliation**: inventory (repos, services), locations (URLs, endpoints), relationships (dependencies, integrations), processes (workflows, conventions), context (business rules, gotchas).

## Knowledge Management

Documentation first in `docs/`. Wait for patterns before documenting. Agent access to `MEMORY.md` is intercepted and redirected — important knowledge routes to `docs/environment/` or skills, scratch notes go to `MEMORY.local.md` (gitignored, repo root).

## Skill Creation

**RULE: Every gotcha becomes a skill. No exceptions.** Auth quirks, encoding issues, parameter tricks, things that surprised you — all skills. Never bury a gotcha in scratch notes. Skills must be generic — no environment data (usernames, URLs, account IDs); that goes in `docs/environment/`.

**Skill split rules**: One skill covers ONE interaction method (API, CLI, MCP, SDK, UI). Different method → new skill. Over ~80 lines → evaluate splitting by concern.

See: `.claude/skills/create-skill/SKILL.md` for full process.

## Agent Creation

**RULE: Domain = Agent (1:1). No orphaned skills.** Every domain must have an agent. Create agent immediately when a skill has a clear domain, even with 1 skill. Same session, not deferred.

See: `.claude/skills/create-agent/SKILL.md` for full process.

## Delegation

**RULE**: Delegate by domain, not skill coverage. Agent will create skills as needed.

Before executing multi-step work:
1. Check `agent-registry.md` for delegation opportunities
2. Agent exists for that domain? → Delegate
3. No agent? → Execute directly, create agent during reconciliation

Focus on orchestration, not execution.

## Reconciliation

After substantive work, do a lightweight pass:
1. New environmental knowledge? (URLs, repos, relationships, gotchas) → `docs/environment/`
2. Hit any gotchas? → ALWAYS create skill (30-80 lines, generic only)
3. Complex multi-step procedure worth a runbook? → `docs/runbooks/`
4. Skills over 80 lines or mixing interaction methods? → Split
5. Run `scripts/validate-consistency.sh` to catch drift

## Working with This Repository

- Skill files: `.claude/skills/<skill-name>/SKILL.md`
- Agent files: `.claude/agents/<agent-name>.md`
- Scripts: `scripts/`
- Hooks: `hooks/`
- Registries: `agent-registry.md`, `skills-registry.md` (auto-generated)
