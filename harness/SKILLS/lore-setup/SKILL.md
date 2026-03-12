---
name: lore-setup
description: First-run setup — initialize project, migrate pre-Lore content, configure platforms
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Setup — Initialize and Configure a Lore Project

Guides the operator through first-time Lore setup or reconfiguration.

## When to Use

- New project that needs `lore init`
- Existing project with pre-Lore agentic files (`.pre-lore` backups)
- Changing platform configuration after initial setup
- Adding a bundle to a project for the first time

## Workflow

### 1. Check Current State

Run `lore version` to verify installation. If not installed, stop and provide install instructions.

Check if `.lore/` exists:
- **No `.lore/`** → fresh init needed (step 2)
- **Has `.lore/`** → check for `.pre-lore` backups (step 3) or reconfigure (step 4)

### 2. Initialize

Ask the operator which platforms they use. Valid platforms: `claude`, `cursor`, `copilot`, `gemini`, `windsurf`, `opencode`.

Run `lore init` (or `lore init .` for in-place on existing project). This will:
- Create `.lore/` with config.json, inherit.json, LORE.md
- Create content directories: RULES/, SKILLS/, AGENTS/, HOOKS/, MCP/
- Back up existing platform files with `.pre-lore` suffix
- Run initial `lore generate`

### 3. Migrate Pre-Lore Content

Scan for `*.pre-lore` files and directories at the project root.

For each backup, categorize and convert:

| Source | Destination | Notes |
|--------|------------|-------|
| `CLAUDE.md.pre-lore` | `.lore/LORE.md` | Extract instructions (skip boilerplate) |
| `.windsurfrules.pre-lore` | `.lore/LORE.md` | Append unique content |
| `GEMINI.md.pre-lore` | `.lore/LORE.md` | Append unique content |
| `.github/copilot-instructions.md.pre-lore` | `.lore/LORE.md` | Append unique content |
| `.claude/rules/*.pre-lore` | `.lore/RULES/<name>.md` | Strip `paths:` → `globs:`, strip `alwaysApply:` |
| `.cursor/rules/*.pre-lore` | `.lore/RULES/<name>.md` | Strip `.mdc` extension, normalize frontmatter |
| `.windsurf/rules/*.pre-lore` | `.lore/RULES/<name>.md` | Normalize frontmatter |
| `.claude/skills/*/` | `.lore/SKILLS/<name>/` | Copy SKILL.md + supporting files |
| `.claude/agents/*.pre-lore` | `.lore/AGENTS/<name>.md` | Preserve frontmatter |
| Settings/hooks files | Skip | Lore generates these |

**Rules for migration:**
- Present the full plan before executing. Get operator approval.
- Preserve original content as closely as possible.
- Normalize frontmatter to Lore format (use `globs:` not `paths:` or `applyTo:`).
- If a mandate file has mixed content (rules + instructions), split appropriately.
- Don't overwrite existing `.lore/` content — ask on conflict.
- After migration, offer to delete `.pre-lore` backups.

### 4. Configure Platforms

Show current platform config from `.lore/config.json`.
Ask if changes are needed. Update via the config file directly.

### 5. Enable Bundles

If bundles are installed (`lore bundle list`), ask if the operator wants to enable any.
Run `lore bundle enable <slug>` for each.

### 6. Regenerate

Run `lore generate` to project all content to enabled platforms.
Show the operator what was generated.
