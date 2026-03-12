---
name: lore-create
description: Create a new Lore rule, skill, agent, MCP server, or hook override
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Lore Content

Create properly formatted agentic content in a Lore project.

## Workflow

1. **Ask the operator:** What do you want to create?
   - **Rule** — instructions scoped by file pattern or always loaded
   - **Skill** — a reusable capability with optional supporting files
   - **Agent** — a specialized persona with skill dependencies
   - **MCP server** — a Model Context Protocol server declaration
   - **Hook** — a lifecycle event override script

2. **Ask where:** Project (`.lore/`) or Global (`~/.config/lore/`)?
   - Project content is always included for this project
   - Global content defaults to "off" — must be enabled per-project via inherit.json

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
