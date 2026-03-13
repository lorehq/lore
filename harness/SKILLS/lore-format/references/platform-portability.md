# Platform Portability Guide

Lore projects content to 7 platforms. Content in bundles must work on ALL of them — not just the platform the source was written for.

## Platform Matrix

| Platform | Rules | Skills | Agents | Hooks | MCP |
|----------|-------|--------|--------|-------|-----|
| Claude Code | `.claude/rules/` | `.claude/skills/` | `.claude/agents/` | `.claude/settings.json` | `.claude/settings.json` |
| Copilot | `.github/instructions/` | `.github/skills/` | `.github/agents/` | `.github/hooks/` | — |
| Cursor | `.cursor/rules/` (`.mdc`) | `.cursor/skills/` | `.cursor/agents/` | `.cursor/hooks.json` | — |
| Gemini CLI | inline in `GEMINI.md` | `.gemini/skills/` | `.gemini/agents/` | `.gemini/settings.json` | `.gemini/settings.json` |
| Windsurf | `.windsurf/rules/` | `.windsurf/skills/` | inline in `AGENTS.md` | `.windsurf/hooks.json` | `~/.codeium/windsurf/mcp_config.json` |
| OpenCode | `.claude/rules/` | `.opencode/skills/` | `.opencode/agents/` | `.opencode/plugins/` | `.mcp.json` |
| Cline | `.clinerules/` | `.cline/skills/` | inline in `AGENTS.md` | `.clinerules/hooks/` | `~/.cline/data/settings/cline_mcp_settings.json` |

## Common Source Formats and Portability

### Claude Code Sources

| Claude-specific | Portable alternative |
|----------------|---------------------|
| `model: opus` in agent frontmatter | Remove — not portable |
| `~/.claude/` paths | Remove or describe generically |
| `CLAUDE.md` references | "the project instructions" |
| `/compact` command | "manage context window" |
| `settings.json` hook format | Lore HOOKS/ format |
| `TodoWrite`, `TodoRead` tools | Keep — standard tool names |
| `Agent` tool | Keep — standard tool name |

### Cursor Sources

| Cursor-specific | Portable alternative |
|----------------|---------------------|
| `.cursorrules` single file | Split into individual `RULES/` files |
| `.cursor/rules/*.mdc` | Convert to `.md`, keep frontmatter |
| `alwaysApply: true` | Omit — Lore infers from `globs` presence |
| `@file` references | Remove — cursor-specific syntax |
| `description` as activation trigger | Keep — works as metadata on other platforms |

### Copilot Sources

| Copilot-specific | Portable alternative |
|----------------|---------------------|
| `.github/copilot-instructions.md` | Content moves to LORE.md or RULES/ |
| `.github/instructions/*.instructions.md` | Convert to RULES/ (rename, adjust frontmatter) |
| `applyTo:` scoping | Convert to `globs:` |

### Multi-Platform Sources

Some repos already duplicate content across platforms (e.g., same skill in `.claude/skills/` and `.cursor/skills/`). The Lore bundle should contain ONE copy — Lore handles the duplication via projection.

## Content That Is Always Portable

These patterns work on every platform — keep them:

- Markdown formatting (headings, lists, code blocks, tables)
- Step-by-step procedures
- Checklists
- Code examples (in fenced blocks)
- File path references to PROJECT files (not platform config dirs)
- Tool names (Read, Write, Edit, Bash, Grep, Glob, Agent)
- General programming concepts and patterns

## Content That Is Never Portable

Remove or generalize:

- Platform config file formats (settings.json schema, hooks.json structure)
- Platform-specific CLI commands (/compact, /clear, /model)
- Platform-specific environment variables (CLAUDECODE=1, GEMINI_CLI=1)
- Model selection directives (model: opus, prefer Sonnet 4)
- Platform-specific tool behaviors (how TodoWrite works vs Cursor's task system)
- IDE integration details (VS Code extensions, Cursor sidebar)
