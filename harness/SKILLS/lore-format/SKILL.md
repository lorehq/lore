---
name: lore-format
description: Canonical format reference for all Lore content types — rules, skills, agents, hooks, MCP servers, and bundles
user-invocable: false
---

# Lore Format Reference

This skill is a shared format library. It contains no workflow — only reference specifications for creating correctly formatted Lore content.

## References

Load the appropriate reference from `references/` based on what you're creating or validating:

| Reference | Content |
|-----------|---------|
| `references/rule.md` | Rule frontmatter, rule types, glob patterns, platform projection |
| `references/skill.md` | Skill directory layout, progressive disclosure, frontmatter fields |
| `references/agent.md` | Agent frontmatter, skill dependencies, platform projection |
| `references/hook.md` | Hook events, script templates, I/O contract, resolution order |
| `references/mcp.md` | MCP server JSON schema, path resolution, merge behavior |
| `references/bundle.md` | Bundle directory structure, manifest.json, LORE.md, naming conventions |
| `references/platform-portability.md` | Platform matrix, portable vs non-portable patterns |

## Naming Rules (all content types)

- Kebab-case: lowercase letters, numbers, hyphens only
- No leading, trailing, or consecutive hyphens
- Max 64 characters
- Name must match filename/directory name exactly
- Content directories: UPPERCASE (`RULES/`, `SKILLS/`, `AGENTS/`)
- Config files: lowercase (`manifest.json`, `config.json`)
