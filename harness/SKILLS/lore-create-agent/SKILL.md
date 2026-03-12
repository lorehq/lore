---
name: lore-create-agent
description: Create a new Lore agent with proper frontmatter, skill dependencies, and tool declarations
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Agent

Create a properly formatted agent definition file.

## Workflow

1. **Ask the operator:**
   - What is the agent's role? (identity and purpose)
   - What skills does it need? (enforced dependencies)
   - What tools should it have access to?
   - Should it use a specific model?
   - Where? (project `.lore/AGENTS/`, or global `~/.config/lore/AGENTS/`)

2. **Choose a name:**
   - Kebab-case, lowercase letters/numbers/hyphens only
   - Filename (minus `.md`) MUST match the `name:` field
   - Max 64 chars

3. **Write the agent file:**
   ```markdown
   ---
   name: my-agent
   description: One-line description of what this agent does
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
   ---

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

4. **Verify skill dependencies exist:**
   - Check that every skill listed in `skills:` exists in SKILLS/ at some layer
   - Missing skills produce warnings at generate time but are not errors

5. **Write to the correct path:**
   - Project: `.lore/AGENTS/<name>.md`
   - Global: `~/.config/lore/AGENTS/<name>.md`

6. **Regenerate:** Run `lore generate` to project the agent to all platforms.

## Frontmatter Reference

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Must match filename (minus `.md`) |
| `description` | Yes | What the agent does |
| `skills` | No | Enforced dependency list — auto-enabled with agent |
| `tools` | No | Tools the agent can use |
| `model` | No | Model override (platform-specific: "sonnet", "opus", etc.) |

## Agent-Skill Dependency Behavior

- Enabling an agent auto-enables its declared skills to the same policy
- Disabling a skill that an agent needs triggers a warning
- Missing skill references produce warnings at `lore generate`, not errors

## Platform Projection

| Platform | Path | Notes |
|----------|------|-------|
| Claude Code | `.claude/agents/<name>.md` | Full frontmatter |
| Cursor | `.cursor/agents/<name>.md` | Full frontmatter |
| Copilot | `.github/agents/<name>.agent.md` | `skills:` becomes `handoffs:` |
| Gemini | `.gemini/agents/<name>.md` | Full frontmatter |
| Windsurf | `AGENTS.md` only | Flat listing, no per-agent files |
| OpenCode | `.opencode/agents/<name>.md` + `.claude/agents/<name>.md` | Both locations |

## Writing Tips

- Lead with identity: "You are a X. You do Y."
- State constraints before capabilities — what NOT to do matters more.
- Define workflow as numbered steps — agents follow explicit sequences better.
- End with rules that prevent common failure modes.
