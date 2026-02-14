---
name: create-agent
description: Create a domain agent when a skill has a clear domain
domain: Orchestrator
scope: internal
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

**Location**: `.claude/agents/<domain-slug>-agent.md`

```markdown
---
name: <domain-slug>-agent
description: "Use for ANY <domain> operation"
domain: <Domain Name>
model: sonnet
skills:
  - <skill-name>
---
# <Domain> Agent

Handles all <domain> operations. Domain = delegation trigger.

## Available Skills
- `<skill-name>` — description

## Approach
1. Check existing skills for the operation
2. Skill missing? → Create it
3. Execute the operation
```

### Step 3: Update Registries

```bash
bash scripts/generate-registries.sh
```

## Naming

Pattern: `<domain-slug>-agent` (e.g., `github-agent`, `docker-agent`)

Domain slug: lowercase, kebab-case of domain name.
