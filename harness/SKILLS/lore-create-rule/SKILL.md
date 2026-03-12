---
name: lore-create-rule
description: Create a new Lore rule with proper frontmatter and placement
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Create Rule

Create a properly formatted rule file in the Lore project.

## Workflow

1. **Ask the operator:**
   - What should the rule do? (the instruction content)
   - Should it always apply, or only for specific files?
   - Where should it live? (project `.lore/RULES/`, or global `~/.config/lore/RULES/`)

2. **Determine the rule type:**

   | Type | Frontmatter | When it loads |
   |------|------------|---------------|
   | Always | (no description, no globs) | Every conversation |
   | Auto-attached | `globs:` only | When matching files are in context |
   | Agent-requested | `description:` only | Agent decides based on description |
   | Scoped+described | both | Either trigger fires |

3. **Choose a name:**
   - Kebab-case, lowercase letters/numbers/hyphens only
   - Descriptive: `go-error-handling`, `react-component-style`, `sql-migrations`
   - No leading/trailing/consecutive hyphens, max 64 chars

4. **Write the file:**

   For an always-loaded rule:
   ```markdown
   ---
   ---

   Your instruction content here.
   ```

   For a scoped rule:
   ```markdown
   ---
   globs:
     - "**/*.go"
     - "**/*_test.go"
   ---

   Your instruction content here.
   ```

   For an agent-requested rule:
   ```markdown
   ---
   description: Apply when writing or reviewing database migration files
   ---

   Your instruction content here.
   ```

5. **Write to the correct path:**
   - Project: `.lore/RULES/<name>.md`
   - Global: `~/.config/lore/RULES/<name>.md`

6. **Regenerate:** Run `lore generate` to project the rule to all enabled platforms.

7. **Verify:** Check that the rule appears in the platform-specific locations:
   - Claude: `.claude/rules/<name>.md`
   - Cursor: `.cursor/rules/<name>.mdc`
   - Copilot: `.github/instructions/<name>.instructions.md`

## Notes

- Keep rules focused — one concern per rule.
- Always-loaded rules should be short. Long always-loaded rules waste context on every conversation.
- Globs use standard glob patterns: `*` (one segment), `**` (any depth), `?` (one char).
- If placing in global, the rule defaults to "off" — must be enabled per-project via inherit.json.
