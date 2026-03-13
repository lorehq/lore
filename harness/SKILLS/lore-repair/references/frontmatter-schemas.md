# Frontmatter Schemas

Lore uses YAML frontmatter in markdown files for rules, skills, and agents. This is the canonical schema reference.

## Rules

**Location:** `RULES/<name>.md` at any layer (bundle, global, project)

**Frontmatter fields:**
- `description` (string, optional) — natural-language trigger description. When present, some platforms (Cursor, Copilot) let the agent decide when to load the rule based on this description.
- `globs` (string[], optional) — file path patterns for scoping. When present, the rule is auto-attached when the agent reads/edits matching files.

**Rule types** (emergent from field combination):

| Type | description | globs | Behavior |
|------|------------|-------|----------|
| Always-loaded | absent | absent | Injected into every conversation |
| Auto-attached | absent | present | Loaded when matching files are in context |
| Agent-requested | present | absent | Agent decides when to load (Cursor/Copilot only) |
| Scoped+described | present | present | Agent-decided AND auto-attached on matching files |

**Body:** Free-form markdown instructions. No length limit but keep focused.

**Platform projection of frontmatter:**

| Lore field | Claude Code | Cursor | Windsurf | Copilot | Gemini | OpenCode | Cline |
|-----------|------------|--------|----------|---------|--------|----------|-------|
| `globs` | `paths:` | `globs:` | `globs:` | `applyTo:` | (inlined, no scoping) | `paths:` | `globs:` |
| `description` | `description:` | `description:` | `description:` | `description:` | (inlined) | `description:` | `description:` |
| (no globs) | `alwaysApply: true` | `alwaysApply: true` | `alwaysApply: true` | (no field) | (inlined) | `alwaysApply: true` | (no field) |

**File extensions per platform:**

| Platform | Extension | Path |
|----------|-----------|------|
| Claude Code | `.md` | `.claude/rules/<name>.md` |
| Cursor | `.mdc` | `.cursor/rules/<name>.mdc` |
| Windsurf | `.md` | `.windsurf/rules/<name>.md` |
| Copilot | `.instructions.md` | `.github/instructions/<name>.instructions.md` |
| Gemini | (inlined) | Rules embedded in `GEMINI.md` |
| OpenCode | `.md` | `.claude/rules/<name>.md` (shared with Claude) |
| Cline | `.md` | `.clinerules/<name>.md` |

## Skills

**Location:** `SKILLS/<name>/SKILL.md` (directory layout only, flat layout not supported)

**Frontmatter fields (required):**
- `name` (string) — must match directory name exactly. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. Max 64 chars.
- `description` (string) — what the skill does. Max 1024 chars.

**Frontmatter fields (optional):**
- `user-invocable` (boolean) — `true` = available as slash command, `false` = agent-only. Default varies by platform.
- `allowed-tools` (string[]) — tools the skill is allowed to use when invoked.
- `agent` (string) — informational parent agent reference (not enforced).
- `type` (string) — e.g., "command". Informational.

**Supporting directories (all optional):**
- `scripts/` — executable code (self-contained, include --help)
- `references/` — documentation loaded on demand (progressive disclosure tier 3)
- `assets/` — templates, schemas, data files, lookup tables

**Progressive disclosure tiers:**
1. **Catalog** (~50-100 tokens): `name` + `description` from frontmatter — loaded at startup
2. **Instructions** (<5000 tokens): SKILL.md body — loaded when skill is activated
3. **Resources** (unlimited): supporting files — loaded on demand by the skill's instructions

**Projection:** All 7 platforms use `<platform-dir>/skills/<name>/SKILL.md` with supporting files copied verbatim.

## Agents

**Location:** `AGENTS/<name>.md` at any layer

**Frontmatter fields (required):**
- `name` (string) — must match filename (minus `.md`). Same naming rules as skills.
- `description` (string) — what the agent does.

**Frontmatter fields (optional):**
- `model` (string) — model override (platform-specific values, e.g., "sonnet", "opus").
- `skills` (string[]) — enforced dependency list. Named skills are pre-loaded when agent activates.
- `tools` (string[]) — tools the agent can use.

**Agent-skill dependency behavior:**
- Enable agent → auto-enables declared skills to same policy
- Disable skill an agent needs → warning (lists affected agents)
- Missing skill reference → warning at generate time, not an error

**Platform projection:**

| Platform | Path | Notes |
|----------|------|-------|
| Claude Code | `.claude/agents/<name>.md` | Full frontmatter preserved |
| Cursor | `.cursor/agents/<name>.md` | Full frontmatter preserved |
| Copilot | `.github/agents/<name>.agent.md` | `skills:` → `handoffs:` |
| Gemini | `.gemini/agents/<name>.md` | Full frontmatter preserved |
| Windsurf | `AGENTS.md` only | Flat listing, no per-agent files |
| OpenCode | `.opencode/agents/<name>.md` + `.claude/agents/<name>.md` | Both locations |
| Cline | `AGENTS.md` only | Flat listing, no per-agent files |

## MCP Servers

**Location:** `MCP/<name>.json` at any layer (bundle, global, project)

**Schema:**
```json
{
  "command": "node",
  "args": ["server.js", "--port", "3000"],
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

- `command` (string, required) — executable to run
- `args` (string[], optional) — command arguments. Relative paths resolved to absolute only if the file exists on disk.
- `env` (object, optional) — environment variables passed to the server process

**Filename (minus `.json`) = server name.** Non-JSON files in `MCP/` are ignored (allows colocating implementations).

**Merge strategy:** Three-layer accumulate (not last-wins). Override by server name. Higher layer wins for same-named server.

## Naming Rules (all content types)

- Lowercase letters, numbers, hyphens only
- No leading, trailing, or consecutive hyphens
- Max 64 characters
- Name must match filename/directory name exactly
- Bundle items conventionally prefixed with bundle slug (e.g., `lore-os-*`) — convention only, not enforced

## Validation Checklist

Common issues when content isn't being picked up:

1. **YAML syntax error** — check frontmatter parses correctly (no tabs, proper quoting)
2. **Name mismatch** — `name:` field must exactly match filename/directory
3. **Wrong directory** — RULES/, SKILLS/, AGENTS/ are UPPERCASE
4. **Flat skill layout** — `SKILLS/<name>.md` is NOT supported, must be `SKILLS/<name>/SKILL.md`
5. **Missing SKILL.md** — directory exists but no SKILL.md inside
6. **Policy set to "off"** — check `.lore/inherit.json` for the item
7. **Higher layer shadow** — project item with same name overrides bundle/global
