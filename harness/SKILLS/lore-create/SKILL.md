---
name: lore-create
description: Create a new Lore rule, skill, agent, MCP server, or hook override at any layer
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Lore Content

Create properly formatted agentic content at any layer of the Lore hierarchy.

## Workflow

1. **Ask where** the content should live:
   - **Project** (`.lore/`) — always included for this project, highest priority
   - **Global** (`~/.config/lore/`) — available to all projects, defaults to "off" per-project
   - **Bundle** (`~/.<slug>/`) — if the operator is developing a bundle

2. **Ask what** to create:
   - **Rule** — instructions scoped by file pattern or always loaded
   - **Skill** — a reusable capability with optional supporting files
   - **Agent** — a specialized persona with skill dependencies
   - **MCP server** — a Model Context Protocol server declaration
   - **Hook** — a lifecycle event override script

3. **Load the reference** for the chosen type from `references/`:
   - `references/rule.md` — frontmatter, rule types, glob patterns
   - `references/skill.md` — directory layout, progressive disclosure, frontmatter
   - `references/agent.md` — skill dependencies, tools, platform projection
   - `references/mcp.md` — JSON schema, path resolution, merge behavior
   - `references/hook.md` — script templates, I/O contract, resolution order

4. **Follow the reference** to create the content with correct format and placement.

5. **Regenerate** if needed: `lore generate` (not needed for hooks — they resolve at runtime).

## Naming Rules (all content types)

- Kebab-case: lowercase letters, numbers, hyphens only
- No leading, trailing, or consecutive hyphens
- Max 64 characters
- Name must match filename/directory name exactly
