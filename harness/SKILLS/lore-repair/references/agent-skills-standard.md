# Agent Skills Open Standard — Deep Reference

## Overview

The Agent Skills standard (agentskills.io) defines a portable format for packaging
agent capabilities as directory-based skill modules. Maintained by Anthropic under
the `agentskills` GitHub organization. Adopted by 26+ platforms including Claude Code,
Codex, Gemini CLI, Copilot, Cursor, Windsurf, and OpenCode.

## Specification

### Directory Structure

A skill is a directory containing, at minimum, a `SKILL.md` file:

```
skill-name/
  SKILL.md          # Required: metadata + instructions
  scripts/          # Optional: executable code
  references/       # Optional: documentation
  assets/           # Optional: templates, resources
```

The directory name MUST match the `name` field in SKILL.md frontmatter.

### SKILL.md Format

Two parts: YAML frontmatter and markdown body.

**Required frontmatter fields:**

| Field | Constraints |
|-------|------------|
| `name` | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. Must match directory name. |
| `description` | Max 1024 chars. Non-empty. Describe what + when to use. |

**Optional frontmatter fields:**

| Field | Purpose |
|-------|---------|
| `license` | License name or reference |
| `compatibility` | Max 500 chars. Environment requirements |
| `metadata` | Arbitrary key-value map (author, version, etc.) |
| `allowed-tools` | Space-delimited list of pre-approved tools |

**Lore extensions:**

| Field | Purpose |
|-------|---------|
| `user-invocable` | `true` = slash command, `false` = agent-only. Required by Lore convention. |
| `type` | e.g., "command" |
| `agent` | Informational parent agent reference |

### Progressive Disclosure (Core Pattern)

Three-tier loading strategy for context efficiency:

**Tier 1 — Catalog** (~50-100 tokens per skill):
Only `name` and `description` from frontmatter. Loaded at session startup for ALL
skills. Used for skill discovery and matching.

**Tier 2 — Instructions** (<5000 tokens recommended):
Full SKILL.md body. Loaded when the skill is activated (matched to a task or
explicitly invoked). Contains workflow, procedures, and instructions.

**Tier 3 — Resources** (as needed):
Files in `scripts/`, `references/`, `assets/`. Loaded only when instructions
reference them. Keeps context lean — detailed material loaded on demand.

### Optional Directories

**`scripts/`** — Executable code. Should be:
- Self-contained (inline dependencies where possible)
- Include `--help` output
- Produce structured output (JSON/CSV)
- Avoid interactive prompts
- Handle errors with clear messages

**`references/`** — Additional documentation loaded on demand. Keep files focused
so agents load minimal context. Examples: `REFERENCE.md`, domain-specific guides.

**`assets/`** — Static resources: templates, schemas, data files, lookup tables.

### File References

Use relative paths from the skill root when referencing supporting files.
Keep references one level deep from SKILL.md. Avoid deeply nested reference chains.

### Naming Conventions

- Lowercase letters, numbers, hyphens only
- No leading/trailing/consecutive hyphens
- Max 64 characters for `name` field
- Directory name must match `name` field exactly

## How Lore Implements the Standard

### Directory Layout

Lore uses directory layout only: `SKILLS/<name>/SKILL.md` + optional supporting files.
Full Agent Skills compliance. SourceDir tracked for resource copying.
Supporting files projected to all platforms.

### Projection of Supporting Files

When projecting standard-layout skills, the entire directory tree is copied:
- SKILL.md is rewritten with normalized frontmatter
- All other files (`scripts/`, `references/`, `assets/`, etc.) are copied verbatim
- Directory structure is preserved
- Projected to all enabled platform targets

### Lore-Specific Conventions

- **Bundle namespacing:** Bundle skills are conventionally prefixed with the bundle
  slug (e.g., `lore-os-*` for the `lore-os` bundle). Convention only, not enforced.
- **user-invocable default:** Lore defaults to `false`. The standard doesn't define
  this field — platforms that read skills natively may default to `true`.
- **Harness skills:** Binary-managed skills at `~/.config/lore/.harness/SKILLS/`.
  Always projected, no policy override possible.

## Validation

The reference library at `github.com/agentskills/agentskills` provides validation:
```bash
skills-ref validate ./my-skill
```

Checks: frontmatter schema, name/directory match, file size recommendations.

## Common Issues

**Skill not discovered:**
- Verify SKILL.md exists in the skill directory
- Check `name` field matches directory name exactly
- Check for YAML syntax errors in frontmatter

**Supporting files not available to agent:**
- Verify files are in `scripts/`, `references/`, or `assets/` subdirectories
- Check that SKILL.md body references the files (for Tier 3 loading)
- Verify the skill uses standard layout, not flat layout

**Name collision across layers:**
- Higher layer wins: Harness > Project > Global > Bundle
- Check inherit.json for explicit policy overrides
- Bundle items with "defer" policy are shadowed by project items of same name
