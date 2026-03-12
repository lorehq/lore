---
name: lore-create-skill
description: Create a new Lore skill with SKILL.md, optional supporting files, and proper directory layout
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Skill

Create a properly structured skill following the Agent Skills standard.

## Workflow

1. **Ask the operator:**
   - What does the skill do? (becomes the description)
   - Should it be user-invocable (slash command) or agent-only?
   - Does it need supporting files? (scripts, references, assets)
   - Should it be tied to a specific agent?
   - Where? (project `.lore/SKILLS/`, or global `~/.config/lore/SKILLS/`)

2. **Choose a name:**
   - Kebab-case, lowercase letters/numbers/hyphens only
   - Max 64 chars, no leading/trailing/consecutive hyphens
   - Directory name MUST match the `name:` field exactly

3. **Create the directory structure:**
   ```
   SKILLS/<name>/
     SKILL.md              # Required
     scripts/              # Optional: executable code
     references/           # Optional: documentation for progressive disclosure
     assets/               # Optional: templates, schemas, data files
   ```

4. **Write SKILL.md with proper frontmatter:**
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
   ---

   # Skill Title

   ## When to Use
   Describe the trigger condition.

   ## Workflow
   1. Step one...
   2. Step two...
   3. Step three...

   ## Notes
   - Constraints and edge cases
   ```

5. **Add supporting files if needed:**
   - `references/` — documentation the skill loads on demand
   - `scripts/` — executable tools (include `--help`, structured output)
   - `assets/` — templates, schemas, lookup tables

6. **Write to the correct path:**
   - Project: `.lore/SKILLS/<name>/SKILL.md`
   - Global: `~/.config/lore/SKILLS/<name>/SKILL.md`

7. **Regenerate:** Run `lore generate` to project the skill to all platforms.

## Frontmatter Reference

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Must match directory name |
| `description` | Yes | Catalog-level summary (max 1024 chars) |
| `user-invocable` | Recommended | `true` = slash command, `false` = agent-only |
| `allowed-tools` | Recommended | Tools the skill can use |
| `agent` | No | Informational parent agent reference |
| `type` | No | e.g., "command" |

## Progressive Disclosure

Skills load in three tiers:
1. **Catalog:** `name` + `description` — loaded at session start (~50-100 tokens)
2. **Instructions:** SKILL.md body — loaded when activated (<5000 tokens ideal)
3. **Resources:** `scripts/`, `references/`, `assets/` — loaded on demand (unlimited)

Keep the body focused on workflow. Put domain knowledge in `references/`.

## Notes

- Only directory layout is supported: `SKILLS/<name>/SKILL.md`. Flat `SKILLS/<name>.md` does NOT work.
- Supporting files are copied verbatim to all platform targets during projection.
- If placing in global, the skill defaults to "off" — must be enabled per-project.
