---
name: lore-create-agent
description: Create a domain agent when a skill has a clear domain
domain: Orchestrator
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Agent

Domain = Agent (1:1). Create immediately when skill has clear domain, even with 1 skill.

## When to Create

- Skill has clear domain boundary (specific service/platform)
- After creating any skill — check if domain has an agent

## Process

### Step 1: Check Existing Agents

Read `agent-registry.md`. If agent exists for domain, update it. Otherwise create new.

### Step 2: Create Agent File

**Location**: `.lore/agents/<domain-slug>-agent.md`

```markdown
---
name: <domain-slug>-agent
description: <Domain> operations specialist. Generated from skills.
domain: <Domain Name>
claude-model: sonnet
opencode-model: openai/gpt-4o
cursor-model: # not yet supported
skills:
  - <skill-name>
---
# <Domain> Agent

Handles all <domain> operations. Create new skills as needed.

## Available Skills
- `<skill-name>`
```

Model fields are per-platform. Instance defaults in `.lore-config` under `subagentDefaults` — agent frontmatter overrides those defaults.

### Step 3: Update Registries

```bash
bash scripts/generate-registries.sh
```

### Step 4: Sync Platform Copies

```bash
bash scripts/sync-platform-skills.sh
```

## Naming

Pattern: `<domain-slug>-agent` (e.g., `github-agent`, `docker-agent`). Domain slug = lowercase, kebab-case.

**Do not use the `lore-` prefix** — that's reserved for framework agents. Operator agents use descriptive names without the prefix.
