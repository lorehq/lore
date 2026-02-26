---
name: lore-create-fieldnote
description: Create a new fieldnote when an operation hit a non-obvious environmental gotcha
type: command
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Fieldnote

**Every gotcha becomes a fieldnote. No exceptions.**

Fieldnotes capture environmental knowledge from failures — auth quirks, encoding issues, parameter tricks, platform incompatibilities. They live in `.lore/fieldnotes/` and use the same `SKILL.md` file format for platform compatibility.

## When to Create

**Mandatory**: Auth quirks, encoding issues, parameter tricks, platform incompatibilities, anything that surprised you during execution.

**Not fieldnotes**: Procedural commands, multi-step workflows, harness operations — those are skills (`/lore-create-skill`).

## Process

### Step 1: Create Fieldnote File

**Location**: `.lore/fieldnotes/<fieldnote-name>/SKILL.md`

Keep it **30-80 lines**. Only document what's non-obvious. Fieldnotes must be generic — no usernames, URLs, account IDs (that goes in `docs/knowledge/environment/`).

```markdown
---
name: <fieldnote-name>
description: One-line description
user-invocable: false
allowed-tools: Bash, Read, etc
---
# Fieldnote Name

[Context — 2-3 lines on when this applies]

## Gotchas
[The actual value — what surprised you]

## Workaround
[How to fix or avoid the issue]
```

### Step 2: Sync Platform Copies

```bash
bash .lore/scripts/sync-platform-skills.sh
```

## Splitting Rules

- ONE interaction method per fieldnote (API, CLI, MCP, SDK, UI)
- Over ~80 lines -> split by concern
- Cross-cutting policies -> separate fieldnote

## Naming

Pattern: `<service>-<action>-<object>` (e.g., `eslint-10-node-18-crash`, `git-mv-gitignored-files`).

**Do not use the `lore-` prefix** — that's reserved for harness command skills.
