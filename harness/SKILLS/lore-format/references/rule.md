# Creating Rules

## Location

- Project: `.lore/RULES/<name>.md`
- Global: `~/.config/lore/RULES/<name>.md`

## Rule Types

Behavior emerges from which frontmatter fields are present:

| Type | description | globs | When it loads |
|------|------------|-------|---------------|
| Always-loaded | absent | absent | Every conversation |
| Auto-attached | absent | present | When matching files are in context |
| Agent-requested | present | absent | Agent decides based on description |
| Scoped+described | present | present | Either trigger fires |

## Frontmatter

```markdown
---
description: Apply when modifying database migration files
globs:
  - "**/*.sql"
  - "**/migrations/**"
---

Your instruction content here.
```

- `description` (string, optional) — natural-language trigger for agent-requested loading
- `globs` (string[], optional) — file path patterns for auto-attachment

For always-loaded rules, use empty frontmatter (`---\n---`) or omit it entirely.

## Platform Projection

| Lore field | Claude | Cursor | Windsurf | Copilot | Gemini | OpenCode |
|-----------|--------|--------|----------|---------|--------|----------|
| `globs` | `paths:` | `globs:` | `globs:` | `applyTo:` | inlined | `paths:` |
| `description` | `description:` | `description:` | `description:` | `description:` | inlined | `description:` |
| (no globs) | `alwaysApply: true` | `alwaysApply: true` | `alwaysApply: true` | (no field) | inlined | `alwaysApply: true` |

File extensions: Claude/Windsurf/OpenCode `.md`, Cursor `.mdc`, Copilot `.instructions.md`, Gemini inlined in `GEMINI.md`.

## Tips

- Keep always-loaded rules short — they consume context on every conversation.
- Use tight globs. `**/*.go` loads on nearly every Go file touched.
- Description is for the agent, not the user. Write as a trigger condition.
- One concern per rule. Don't combine unrelated instructions.
