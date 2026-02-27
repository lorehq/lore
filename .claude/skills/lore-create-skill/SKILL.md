---
name: lore-create-skill
description: Create a new skill when an operation required non-obvious knowledge
type: command
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Skill

Skills are **procedural capabilities** — reusable command procedures, multi-step workflows, harness operations. They live in `.lore/skills/` with the `lore-` prefix.

**Snags (gotchas, quirks) go in fieldnotes, not skills.** Auth quirks, encoding issues, parameter tricks, platform incompatibilities → use `/lore-create-fieldnote` instead.

## When to Create

**Mandatory**: Multi-step harness commands, reusable procedural workflows.

**Not skills**: Environmental snags (use fieldnotes), simple tool wrappers, commands with good `--help`, one-off operations.

## Process

### Step 1: Create Skill File

**Location**: `.lore/skills/<skill-name>/SKILL.md`

Keep it **30-80 lines**. Only document what's non-obvious. Skills must be generic — no usernames, URLs, account IDs (that goes in `docs/knowledge/environment/`).

```markdown
---
name: <skill-name>
description: One-line description
user-invocable: false
allowed-tools: Bash, Read, etc
---
# Skill Name

[How to use — 2-3 lines]

## Snags
[The actual value — what surprised you]
```

### Step 2: Sync Platform Copies

```bash
bash .lore/harness/scripts/sync-platform-skills.sh
```

## Splitting Rules

- ONE interaction method per skill (API, CLI, MCP, SDK, UI)
- Over ~80 lines → split by concern
- Cross-cutting policies → separate skill

## Naming

Pattern: `<service>-<action>-<object>` (e.g., `github-create-pr`, `docker-orphan-cleanup`).

**Do not use the `lore-` prefix** — that's reserved for harness commands. Operator and discovered skills use descriptive names without the prefix.
