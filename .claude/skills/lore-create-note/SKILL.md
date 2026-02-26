---
name: lore-create-note
description: Create a lightweight note for quick capture during deep work
type: command
user-invocable: true
allowed-tools: Bash, Write
---

# Create Note

Create a lightweight note in `docs/workflow/notes/` for quick capture — bugs hit during deep work, ideas to revisit, observations worth preserving.

## When to Use

The operator types `/lore-create-note` or asks to "jot down" / "note" something for later.

## Process

1. Ask the operator for:
   - **Title** — short descriptive name (becomes the filename slug and frontmatter title)
   - **Content** — what to capture (can be rough, doesn't need polish)
2. Generate the filename: kebab-case slug from the title (e.g., `docs/workflow/notes/flaky-auth-timeout.md`)
3. Write the file with this format:

```markdown
---
title: Short descriptive title
status: open
created: YYYY-MM-DD
---

Content here.
```

4. Confirm creation with the file path

## Rules

- **One file per note** — no folders, no nesting
- **Minimal frontmatter** — only `title`, `status`, `created`
- **Status values:** `open` (default), `resolved`
- **No banner inclusion** — notes are intentionally excluded from the session banner
- **Filename:** kebab-case slug matching the title, e.g., `flaky-auth-timeout.md`
- **Don't over-polish** — notes are quick capture, not documentation. Preserve the operator's words.

## Closing a Note

When a note is resolved, update `status: open` to `status: resolved`. Don't delete — resolved notes are still searchable context.
