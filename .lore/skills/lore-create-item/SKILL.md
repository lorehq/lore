---
name: lore-create-item
description: Create an item folder with frontmatter and validation
type: command
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Item

Items are **operator-initiated**. Never create one unprompted.

## Process

1. **Read rules**: Check `docs/context/rules.md` or `docs/context/rules/index.md` for docs formatting rules. Apply these when writing content.

2. **Determine location**:
   - Standalone: `docs/workflow/in-flight/items/<slug>/`
   - Under epic: `<epic-path>/items/<slug>/`

   If the operator is working within an existing epic, nest the item there. Otherwise standalone.

3. **Create folder**: `<location>/<slug>/`

4. **Create index.md** with frontmatter:

```yaml
---
title: [Operator's item name]
status: active
created: [today's date]
updated: [today's date]
epic: <epic-slug>        # optional — standalone items only
summary: [one-liner]     # optional — shown in session banner
---
```

5. **Create tasks.md** — agent execution checklist:

```markdown
# Tasks

- [ ] [First task placeholder]
```

6. **Validate**:

```bash
bash .lore/scripts/ensure-structure.sh && bash .lore/scripts/validate-consistency.sh
```

## Snags

- Epic items are nested under the epic folder — don't set an `epic:` field for those
- `epic` field = folder name, not a path; only for standalone items
- `summary` is shown in the session banner — keep it under 60 chars
- `index.md` syncs to external PM tools — `tasks.md` is agent-only and never syncs
