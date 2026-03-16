# Creating Skills

## Location

- Project: `.lore/SKILLS/<name>/SKILL.md`
- Global: `~/.config/lore/SKILLS/<name>/SKILL.md`

Only directory layout is supported. Flat `SKILLS/<name>.md` does NOT work.

## Directory Structure

```
SKILLS/<name>/
  SKILL.md              # Required
  scripts/              # Optional: executable code
  references/           # Optional: documentation loaded on demand
  assets/               # Optional: templates, schemas, data files
```

## Frontmatter

```markdown
---
name: my-skill
description: One-line description of what this skill does
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
agent: parent-agent-name
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Must match directory name exactly |
| `description` | Yes | Catalog-level summary (max 1024 chars) |
| `user-invocable` | Recommended | `true` = slash command, `false` = agent-only |
| `allowed-tools` | Recommended | Tools the skill can use |
| `agent` | No | Informational parent agent reference |
| `type` | No | e.g., "command" |

## Progressive Disclosure

Skills load in three tiers — keep the body lean:

1. **Catalog** (~50-100 tokens): `name` + `description` — loaded at session start
2. **Instructions** (<5000 tokens): SKILL.md body — loaded when activated
3. **Resources** (unlimited): `scripts/`, `references/`, `assets/` — loaded on demand

Put domain knowledge in `references/`, not the body. The body should be workflow steps that point to references when needed.

## Body Template

```markdown
# Skill Title

## When to Use
Describe the trigger condition.

## Workflow
1. Step one — concrete action
2. Step two — load `references/foo.md` if needed
3. Step three — produce output

## Notes
- Constraints and edge cases
```

## Tips

- Directory name MUST match `name:` field exactly
- Supporting files are copied verbatim to all platform targets during projection
- If placing in global, the skill defaults to "off" — must be enabled per-project
- Skills without `allowed-tools` may get blocked by platform permission systems
