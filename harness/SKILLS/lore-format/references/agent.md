# Creating Agents

## Location

- Project: `.lore/AGENTS/<name>.md`
- Global: `~/.config/lore/AGENTS/<name>.md`

## Frontmatter

```markdown
---
name: my-agent
description: What this agent does
skills:
  - skill-one
  - skill-two
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
model: sonnet
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Must match filename (minus `.md`) |
| `description` | Yes | What the agent does |
| `skills` | No | Enforced dependency list — auto-enabled with agent |
| `tools` | No | Tools the agent can use |
| `model` | No | Model override (platform-specific: "sonnet", "opus", etc.) |

## Agent-Skill Dependencies

- Enabling an agent auto-enables its declared skills to the same policy
- Disabling a skill that an agent needs triggers a warning
- Missing skill references produce warnings at `lore generate`, not errors

## Body Template

```markdown
# Agent Title

You are a [role]. You [purpose].

## Constraints
- What NOT to do (state constraints before capabilities)
- Boundaries and limitations

## Workflow
1. First step...
2. Second step...

## Rules
- Operating rules that prevent common failures
```

## Platform Projection

| Platform | Path | Notes |
|----------|------|-------|
| Claude Code | `.claude/agents/<name>.md` | Full frontmatter |
| Cursor | `.cursor/agents/<name>.md` | Full frontmatter |
| Copilot | `.github/agents/<name>.agent.md` | `skills:` becomes `handoffs:` |
| Gemini | `.gemini/agents/<name>.md` | Full frontmatter |
| Windsurf | `AGENTS.md` only | Flat listing, no per-agent files |
| OpenCode | `.opencode/agents/<name>.md` + `.claude/agents/<name>.md` | Both |

## Tips

- Lead with identity: "You are a X. You do Y."
- State constraints before capabilities — what NOT to do matters more
- Define workflow as numbered steps — agents follow explicit sequences better
- List tools explicitly — don't assume the agent will discover them
