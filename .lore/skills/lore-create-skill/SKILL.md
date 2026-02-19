---
name: lore-create-skill
description: Create a new skill when an operation required non-obvious knowledge
domain: Orchestrator
type: command
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

Keep it **30-80 lines**. Only document what's non-obvious. Skills must be generic — no usernames, URLs, account IDs (that goes in `docs/knowledge/environment/`).

```markdown
---
name: <skill-name>
description: One-line description
domain: Orchestrator
user-invocable: false
allowed-tools: Bash, Read, etc
---
# Skill Name

[How to use — 2-3 lines]

## Gotchas
[The actual value — what surprised you]
```

### Step 2: Choose Domain

**Default to Orchestrator.** The domain is the **tool at the bottom of the call stack** — the specific tool that broke or had the gotcha, not a category.

Examples:

- Bash calls `mkdocs build` and it fails on extension order → domain is `mkdocs`, not "Documentation"
- `git mv` fails on gitignored files → domain is `git`, not "VCS"
- `docker-compose up` has a volume gotcha → domain is `docker-compose`, not "Infrastructure"
- About Lore's own operation? → domain is `Orchestrator`
- Built-in agent tools (Bash, Read, Write, Grep, Task, etc.)? → domain is `Orchestrator`. Don't create agents for framework tools.

**Don't invent domains eagerly.** A new skill defaults to Orchestrator unless it clearly belongs to an existing domain with multiple skills. A domain earns existence when multiple skills cluster around the same tool.

Framework commands (`lore-*` prefix) always use `type: command` in frontmatter and domain `Orchestrator`.

### Step 3: Update Registries

```bash
bash scripts/generate-registries.sh
```

### Step 4: Check Agent Clustering

A domain earns an agent when **multiple skills cluster** around the same tool, making delegation valuable. A single skill doesn't warrant a domain or agent.

Check if enough skills exist for the domain:

```bash
grep -rl "domain: <domain>" .lore/skills/*/SKILL.md | wc -l
```

- 2+ skills in a domain with no agent? → Consider creating one using the lore-create-agent skill.
- 1 skill in a new domain? → Leave it. The domain and agent can form later when more skills cluster.

### Step 5: Sync Platform Copies

```bash
bash scripts/sync-platform-skills.sh
```

## Splitting Rules

- ONE interaction method per skill (API, CLI, MCP, SDK, UI)
- Over ~80 lines → split by concern
- Cross-cutting policies → separate skill

## Naming

Pattern: `<service>-<action>-<object>` (e.g., `github-create-pr`, `docker-orphan-cleanup`).

**Do not use the `lore-` prefix** — that's reserved for framework commands. Operator and discovered skills use descriptive names without the prefix.
