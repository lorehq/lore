---
name: lore-create-agent
description: Create an operator agent for recurring delegation patterns
type: command
user-invocable: false
allowed-tools: Write, Edit, Read, Glob
---

# Create Agent

Operator agents are optional static delegation patterns. The framework provides `lore-worker-agent` for general delegation — this skill is for creating additional operator-owned agents when a recurring task pattern benefits from a pre-packaged agent.

## When to Create

- You have a recurring delegation pattern that benefits from pre-packaged context
- The same set of skills, conventions, and scope boundaries apply every time
- A static agent definition is more efficient than the orchestrator assembling context each time

## Process

### Step 1: Check Existing Agents

Scan `.lore/agents/`. If an agent exists for the purpose, update it. Otherwise create new.

### Step 2: Create Agent File

**Location**: `.lore/agents/<purpose>-agent.md`

```markdown
---
name: <purpose>-agent
description: <Purpose> operations specialist.
claude-model: sonnet
opencode-model: openai/gpt-4o
cursor-model: # not yet supported
skills:
  - <skill-name>
---
# <Purpose> Agent

Handles <purpose> operations.

## Subagent Operating Rules
- You are a delegated subagent, not the orchestrator. Stay within delegated scope and return concise results.
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

Model fields are per-platform. Instance defaults in `.lore/config.json` under `subagentDefaults` — agent frontmatter overrides those defaults.

### Step 3: Sync Platform Copies

```bash
bash .lore/scripts/sync-platform-skills.sh
```

## Naming

Pattern: `<purpose>-agent` (e.g., `deploy-agent`, `infra-agent`, `docs-agent`). Lowercase, kebab-case.

**Do not use the `lore-` prefix** — that's reserved for framework agents (`lore-worker-agent`). Operator agents use descriptive names without the prefix.
