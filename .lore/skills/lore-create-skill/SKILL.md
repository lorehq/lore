---
name: lore-create-skill
description: Create a new skill when an operation required non-obvious knowledge
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Skill

**Every gotcha becomes a skill. No exceptions.**

## When to Create

**Mandatory**: Auth quirks, encoding issues, parameter tricks, anything that surprised you.

**Not skills**: Simple tool wrappers, commands with good `--help`, one-off operations without gotchas.

## Process

### Step 1: Create Skill File

**Location**: `.lore/skills/<skill-name>/SKILL.md`

Keep it **30-80 lines**. Only document what's non-obvious. Skills must be generic — no usernames, URLs, account IDs (that goes in `docs/context/`).

```markdown
---
name: <skill-name>
description: One-line description
domain: Specific Domain Name
user-invocable: false
allowed-tools: Bash, Read, etc
---
# Skill Name

[How to use — 2-3 lines]

## Gotchas
[The actual value — what surprised you]
```

### Step 2: Choose Domain

Domain = the **tool/platform/service** used, NOT the purpose.

- Uses specific external tool/API/CLI? → Domain = that tool/platform
- About Lore's own operation? → Domain = Orchestrator
- Built-in agent tools (Bash, Read, Write, Grep, Task, etc.)? → Domain = Orchestrator. Don't create agents for framework tools.
- Unsure? → "What breaks if this service is unavailable?" = your domain

### Step 3: Update Registries

```bash
bash scripts/generate-registries.sh
```

### Step 4: Create Agent if Needed

Domain = Agent (1:1). No orphaned skills. Check if agent exists:

```bash
grep -i "domain: <domain>" .lore/agents/*.md
```

No agent? → Create one now using the lore-create-agent skill. Same session.

### Step 5: Sync Platform Copies

```bash
bash scripts/sync-platform-skills.sh
```

## Splitting Rules

- ONE interaction method per skill (API, CLI, MCP, SDK, UI)
- Over ~80 lines → split by concern
- Cross-cutting policies → separate skill

## Naming

Pattern: `<service>-<action>-<object>` (e.g., `github-create-pr`, `docker-orphan-cleanup`)
