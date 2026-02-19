---
name: lore-create-agent
description: Create a domain agent when skills cluster around a specific tool
domain: Orchestrator
type: command
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Agent

Domain = Agent (1:1). A domain earns an agent when multiple skills cluster around the same tool, making delegation valuable. A single skill doesn't warrant a domain or agent.

## When to Create

- Multiple skills (2+) cluster around the same specific tool/service/platform
- The clustering makes delegation genuinely valuable (domain-specific expertise)

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

## Subagent Operating Rules
- You are a domain subagent, not the orchestrator. Stay within delegated scope and return concise results.
- Before implementation, always load project guidance from `docs/context/agent-rules.md` and relevant files under `docs/context/conventions/`.
- Follow repo boundaries from agent rules (Lore hub for knowledge; application code in external repos).
- If scope has independent branches, run them in parallel subagents; keep dependency-gated steps sequential.

## Self-Learning
- Non-obvious gotcha during execution -> create or update an operator skill under `.lore/skills/`.
- New environment facts -> update `docs/knowledge/environment/`.
- Multi-step procedures discovered -> add/update `docs/knowledge/runbooks/`.

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

Pattern: `<tool-name>-agent` (e.g., `git-agent`, `mkdocs-agent`, `docker-compose-agent`). The domain name is the tool name — the specific tool at the bottom of the call stack, not a category. Lowercase, kebab-case.

**Do not use the `lore-` prefix** — that's reserved for framework agents. Operator agents use descriptive names without the prefix.
