---
name: lore-bundle-convert
description: Convert external agentic configurations (Claude Code, Cursor, Copilot, etc.) into cross-platform Lore bundles
user-invocable: true
---

# Bundle Convert

Convert an external agentic configuration into a Lore bundle. This is not a blind format translation — it is a quality upgrade that makes single-platform content work across all platforms Lore projects to.

## Arguments

The operator provides a source — either a cloned repo path or a git URL. If a URL, clone it to a temp directory first (`git clone --depth 1`).

## Process

### Phase 1: Inventory

Read every file in the source. Classify each into one of these categories:

| Category | What it is | Action |
|----------|-----------|--------|
| **Rule** | Policy, constraint, guideline | Convert to `RULES/<name>.md` |
| **Skill** | Reusable instructions, workflow, domain knowledge | Convert to `SKILLS/<name>/SKILL.md` |
| **Agent** | Specialized persona with role + tools | Convert to `AGENTS/<name>.md` |
| **Command** | Slash command / user-invoked prompt | Convert to `SKILLS/<name>/SKILL.md` with `user-invocable: true` |
| **Hook** | Pre/post tool-use script, event handler | Evaluate — convert to `HOOKS/` if platform-agnostic, drop if platform-specific |
| **Config** | Settings, permissions, platform config | Drop — Lore generates platform configs |
| **Infrastructure** | Installer, wizard, build scripts, CI | Drop — not content |
| **Documentation** | README, changelog, internal docs | Drop — write fresh README with attribution |
| **Memory** | Session state, knowledge files | Drop — not a bundle concern |

Report the full inventory with file counts before proceeding.

### Phase 2: Decision Framework

For each piece of content, apply these decisions in order. See `references/conversion-decisions.md` for the complete decision tree.

**Keep or Drop?**
- Content that teaches the agent HOW to do something → KEEP
- Content that documents the source project's own infrastructure → DROP
- Content that configures a specific platform's settings → DROP

**Generalize or Preserve?**
- References to platform-specific paths (`~/.claude/`, `.cursor/rules/`) → GENERALIZE (remove or make generic)
- References to platform-specific commands (`/compact`, `/clear`) → GENERALIZE (describe the concept, not the command)
- References to platform-specific features (`model: opus`, `TodoWrite`) → REMOVE
- References to platform-specific APIs (settings.json hooks format) → REMOVE
- Actual guidance, patterns, checklists, workflows → PRESERVE exactly

**Restructure or Copy?**
- Flat command files → restructure into `SKILLS/<name>/SKILL.md` directories
- Skill directories with supporting files → copy structure, ensure SKILL.md has frontmatter
- Rules without frontmatter → add `description:` frontmatter
- Agents with platform-specific frontmatter fields → remove non-portable fields, keep `name`, `description`, `skills`, `tools`

### Phase 3: Build

Create the bundle directory with this structure:

```
<slug>/
├── manifest.json
├── LORE.md
├── README.md
├── RULES/
│   └── <name>.md
├── SKILLS/
│   └── <name>/
│       ├── SKILL.md
│       ├── references/    # If the skill has reference docs
│       ├── assets/        # If the skill has templates/schemas
│       └── scripts/       # If the skill has executable scripts
├── AGENTS/
│   └── <name>.md
└── HOOKS/                 # If source has convertible hooks
    └── <event>.mjs
```

See the `lore-format` skill's `references/bundle.md` for the complete format specification.

**Frontmatter requirements:**
- Rules: `description` (required), `globs` (optional)
- Skills: `name` (required, must match directory), `description` (required), `user-invocable` (required)
- Agents: `name` (required), `description` (required), `tools` (required, YAML list), `skills` (optional, YAML list)

**Skill supporting directories — use them properly:**
- `references/` — factual reference material the skill can load on demand (checklists, standards, pattern catalogs, API docs)
- `assets/` — templates, schemas, sample configs, data files the skill uses as input
- `scripts/` — executable scripts (bash, node) the skill can invoke

If a source skill has substantial content that could be split (e.g., a 200-line SKILL.md with an inline checklist), extract the checklist to `references/` and reference it from the SKILL.md body. This follows the Agent Skills standard's progressive disclosure model.

**manifest.json** — use `assets/manifest-template.json` as the starting point. If the bundle has hooks, add a `"hooks"` field mapping event names to script paths.

**HOOKS/** — convert source hooks to Node.js ES modules (`.mjs`). Merge multiple hooks per event into a single script that switches on `tool_name`. Declare all hooks in `manifest.json`. See `references/conversion-decisions.md` for the full hook conversion process, including common behavior patterns and what to drop.

**LORE.md** — write a brief (15-30 lines) summary of the bundle's philosophy and recommended workflow. This gets accumulated into every platform's mandate file, so keep it focused.

**README.md** — use `assets/readme-template.md` as the starting point. Must include full attribution and a complete changelog of every change made from the original.

### Phase 4: Validate

Run the validation script: `bash <skill-dir>/scripts/validate-bundle.sh <bundle-path>`

This checks:
- manifest.json exists and is valid JSON with required fields
- Hook scripts declared in manifest.json exist and are `.mjs` files
- All rules have `description` in frontmatter
- All skills have `name`, `description`, `user-invocable` in frontmatter
- All agents have `name`, `description`, `tools` in frontmatter
- No platform-specific path references remain (`~/.claude/`, `.cursor/`, `.github/copilot`)
- No platform-specific field references remain (`model: opus`, `model: sonnet`)
- Directory structure matches Lore standard
- All SKILL.md `name` fields match their directory names

Fix any validation errors before delivering.

### Phase 5: Deliver

Report to the operator:
- Final file counts (rules, skills, agents)
- What was kept, what was dropped, what was generalized
- Any decisions that need operator input
- The bundle path

## Key Principles

1. **We are upgrading, not just converting.** The output should be better than the input — cross-platform, properly structured, well-documented.
2. **Preserve the value, remove the platform lock-in.** The actual guidance (patterns, checklists, workflows) is the valuable part. The platform-specific wiring is not.
3. **Credit the original.** Always include attribution with repo URL and license.
4. **Use the Agent Skills standard properly.** Skills should use `references/`, `assets/`, and `scripts/` subdirectories when the content justifies it. Don't stuff everything into SKILL.md.
5. **Every frontmatter field matters.** `description` drives platform behavior (Cursor uses it for activation). `user-invocable` controls slash command visibility. Get them right.
