---
name: lore-migrate
description: Convert pre-Lore agentic files (.pre-lore backups) into .lore/ content
type: command
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
# Migrate — Salvage Pre-Lore Content

After `lore init`, existing platform files are backed up with a `.pre-lore` suffix.
This skill helps convert that content into proper Lore agentic items.

## Process

1. **Find backups** — scan the project root for `*.pre-lore` files and directories.
2. **Categorize** — for each backup, identify what kind of content it contains:
   - Mandate files (CLAUDE.md, .windsurfrules, copilot-instructions.md, GEMINI.md) → extract into `.lore/LORE.md`
   - Rules (.claude/rules/, .cursor/rules/) → convert to `.lore/RULES/`
   - Skills (.claude/skills/, .cursor/skills/) → convert to `.lore/SKILLS/`
   - Agents (.claude/agents/) → convert to `.lore/AGENTS/`
   - Settings/hooks — skip (Lore generates these)
3. **Present plan** — show the operator what will be created and where.
4. **Execute** — write the converted files after approval.
5. **Cleanup** — offer to delete the `.pre-lore` backups.
6. **Regenerate** — run `lore generate` to project the new content.

## Notes

- Preserve the original content as closely as possible.
- Strip platform-specific frontmatter formats and normalize to Lore YAML frontmatter.
- If a mandate file has mixed content (rules + instructions), split them appropriately.
- Do not overwrite existing `.lore/` content files — ask if there's a conflict.
