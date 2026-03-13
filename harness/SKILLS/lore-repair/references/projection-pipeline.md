# Projection Pipeline — Deep Reference

## Overview

The projection pipeline transforms content from its canonical source
(`.lore/`, `~/.config/lore/`, bundle dirs) into platform-native files.
Two phases: **composition** (merge) then **projection** (emit).

## Composition Engine (`compose.go`)

### `scanAgenticDir(baseDir)`

Scans a directory for rules, skills, and agents. Returns three maps.

**Rules:** `RULES/*.md` — flat files only, no directories.

**Skills:** `SKILLS/<name>/SKILL.md` — directory layout only. Each skill is a
directory containing SKILL.md and optional supporting files (`scripts/`,
`references/`, `assets/`). Sets `SourceDir` on the `AgenticFile` to enable
deep skills resource copying.

**Agents:** `AGENTS/*.md` — flat files only.

### `mergeAgenticSets(globalDir, projectDir)`

Four-layer merge. `globalDir` is `~/.config/lore/`, `projectDir` is `<root>/.lore/`.

```
Layer 1: Bundle content    (default policy: "defer")
Layer 2: Global content    (default policy: "off")
Layer 3: Project content   (always included, unless "overwrite")
Layer 4: Harness content   (always wins — clobbers everything)
```

**Merge order matters:** later layers override earlier layers for same-named items.
Multiple bundles merge in array order from `.lore/config.json` `"bundles"` field.

**Policy resolution (`getPolicy`):**
- Reads `.lore/inherit.json` which maps kind → name → policy
- Falls back to `defaultForSource()`: "defer" for bundles, "off" for global
- `"defer"` = include (project can shadow)
- `"off"` = exclude
- `"overwrite"` = this layer wins even over project (project version skipped)

**LORE.md accumulation:**
- All layers' LORE.md content concatenated (NOT overridden)
- Each section gets a header: `# BundleName`, `# Global`, `# Project`
- `{{NONCE}}` placeholders replaced with the project's session nonce

**MCP merge:**
- Separate three-layer merge: Bundle MCP → Global MCP → Project MCP
- Override by server name (filename minus `.json`)
- Harness layer does NOT participate in MCP merge

### `parseAgenticFile(path, kind)`

Parses YAML frontmatter from markdown files. Splits into frontmatter fields and body.
Uses `---` delimiters. All frontmatter fields are passthrough — each projector uses
what it needs.

Key frontmatter fields for rules:
- `globs` — canonical scoping field (projected as `paths:` for Claude, `applyTo:` for Copilot, `globs:` for Cursor/Windsurf)

Key frontmatter fields for skills:
- `name` — must match directory name
- `description` — used for catalog (Tier 1 discovery)
- `user-invocable` — `true` = slash command, `false` = agent-only
- `allowed-tools` — YAML list constraining tool access
- `agent` — informational parent agent reference
- `type` — e.g., "command"

## Projection Engine (`projector.go`)

### `projectSkills(baseDir, ms)`

Writes skills to `<baseDir>/skills/<name>/SKILL.md`. Universal format — all 7
platforms use identical SKILL.md structure.

For each skill:
1. Renders normalized frontmatter (`name`, `description`, `user-invocable`, etc.)
2. Writes `SKILL.md` with frontmatter + body
3. If `SourceDir` is set, copies all supporting files via `copySkillResources()`

### `copySkillResources(srcDir, dstDir)`

Walks the source skill directory and copies every file EXCEPT `SKILL.md` to the
destination. Preserves directory structure. Creates parent dirs as needed.

This enables deep skills: `scripts/`, `references/`, `assets/`, and any other
supporting files are projected alongside the SKILL.md.

### `projectAgents(baseDir, ms)`

Writes agents to `<baseDir>/agents/<name>.md`. Frontmatter includes `name`,
`description`, `model`, `tools`, `skills`.

### Per-Platform Projectors

Each platform implements the `Projector` interface:
- `Name()` — platform identifier
- `Project(root, ms)` — writes all platform files
- `OutputPaths(rules, skills, agents, hasMCP)` — lists expected output paths

Platform-specific differences:
- **Claude** — rules in `.claude/rules/<name>.md` with `paths:` frontmatter
- **Copilot** — rules as `.github/instructions/<name>.instructions.md` with `applyTo:`
- **Cursor** — rules as `.cursor/rules/<name>.mdc` with `globs:` / `alwaysApply:`
- **Gemini** — rules inlined into `GEMINI.md`
- **Windsurf** — agents only in flat `AGENTS.md` (no per-agent files)
- **OpenCode** — writes to both `.opencode/` and `.claude/` directories
- **Cline** — rules in `.clinerules/<name>.md`, agents in flat `AGENTS.md`, hooks as executable scripts in `.clinerules/hooks/`

## Staleness Detection (`cmd_generate.go`)

### `projectionStale(root)`

Returns `true` if regeneration is needed. Checks:
1. `.lore/.last-generated` sentinel exists and its mtime
2. Key input files: `.lore/config.json`, `.lore/inherit.json`, LORE.md files
3. Bundle directories: RULES/, SKILLS/, AGENTS/, and MCP/ in each active bundle
4. Global and project content directories (RULES/, SKILLS/, AGENTS/, MCP/)
5. Harness content directory (`.harness/`)

Uses `newestInDir()` to find the most recent mtime in a directory tree.

### `touchSentinel(root)`

Writes current timestamp to `.lore/.last-generated` after successful projection.

### Session-Start Freshness

`ensureFreshProjection()` in `cmd_hook.go` runs on `prompt-submit` hook events.
Checks `projectionStale()` and silently regenerates if needed, keeping projected
files fresh without manual `lore generate`.

## Troubleshooting

**Symptom: Changes not reflected after `lore generate`**
- Verify the item is in the correct content directory (RULES/, SKILLS/, or AGENTS/)
- Check inherit.json policy — item might be "off"
- Check for name collisions across layers (higher layer wins)
- For skills: ensure SKILL.md exists in the directory (not just supporting files)

**Symptom: Projection generates unexpected output**
- Read the platform's projector file (`project_<name>.go`)
- Check `OutputPaths()` for expected file list
- Verify the `MergedSet` contains expected items (add debug logging to `doProjection`)

**Symptom: Supporting files missing in projected output**
- Verify skill uses directory layout (`SKILLS/<name>/SKILL.md`)
- Check `SourceDir` is set on the `AgenticFile`
- Check file permissions on source supporting files
