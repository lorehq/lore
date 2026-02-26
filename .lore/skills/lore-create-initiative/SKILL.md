---
name: lore-create-initiative
description: Create an initiative folder with frontmatter and validation
type: command
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Initiative

Initiatives are **operator-initiated**. Never create one unprompted.

## Process

1. **Read rules**: Check `docs/context/rules.md` or `docs/context/rules/index.md` for docs formatting rules. Apply these when writing content.

2. **Create folder**: `docs/workflow/in-flight/initiatives/<slug>/`

   Also create an `epics/` subfolder with a placeholder:
   `docs/workflow/in-flight/initiatives/<slug>/epics/README.md`

3. **Create index.md** with frontmatter:

```yaml
---
title: [Operator's initiative name]
status: active
created: [today's date]
updated: [today's date]
summary: [one-liner]    # optional — shown in session banner
---
```

4. **Create tasks.md** — agent execution checklist:

```markdown
# Tasks

- [ ] [First task placeholder]
```

5. **Validate**:

```bash
bash .lore/scripts/ensure-structure.sh && bash .lore/scripts/validate-consistency.sh
```

## Snags

- Only `title`, `status`, `created`, `updated` are required — don't add unused optional fields
- `summary` is what operators see every session in the banner — keep it short
- Initiative folders contain only `epics/`, `archive/`, flat `.md` supporting docs, and asset dirs
- `index.md` syncs to external PM tools — `tasks.md` is agent-only and never syncs
