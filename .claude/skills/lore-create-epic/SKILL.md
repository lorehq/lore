---
name: lore-create-epic
description: Create an epic folder with frontmatter and validation
type: command
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Epic

Epics are **operator-initiated**. Never create one unprompted.

## Process

1. **Read rules**: Check `.lore/rules.md` or `.lore/rules/index.md` for docs formatting rules. Apply these when writing content.

2. **Determine location**:
   - Standalone: `docs/workflow/in-flight/epics/<slug>/`
   - Under initiative: `docs/workflow/in-flight/initiatives/<initiative>/epics/<slug>/`

   If the operator is working within an existing initiative, nest the epic there. Otherwise standalone.

3. **Create folder**: `<location>/<slug>/`

   Also create an `items/` subfolder with a placeholder:
   `<location>/<slug>/items/README.md`

4. **Create index.md** with frontmatter:

```yaml
---
title: [Operator's epic name]
status: active
created: [today's date]
updated: [today's date]
initiative: <initiative-slug>  # optional — standalone epics only
summary: [one-liner]           # optional — shown in session banner
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

- Initiative epics are nested under the initiative folder — don't set an `initiative:` field for those
- `initiative` field = folder name (e.g., `cloud-migration`), not a path; only for standalone epics
- `summary` is shown in the session banner — keep it under 60 chars
- `index.md` syncs to external PM tools — `tasks.md` is agent-only and never syncs
