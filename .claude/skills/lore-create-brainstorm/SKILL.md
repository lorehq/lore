---
name: lore-create-brainstorm
description: Create a brainstorm folder — always standalone, never nested
type: command
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Brainstorm

Brainstorms capture conversation artifacts for future reference. **Operator-initiated only.**

## Process

1. **Read rules**: Check `docs/context/rules.md` or `docs/context/rules/index.md` for docs formatting rules. Apply these when writing content.

2. **Create folder**: `docs/workflow/brainstorms/<slug>/`

3. **Create index.md** with minimal frontmatter:

```yaml
---
title: [Descriptive title]
created: [today's date]
---
```

4. **Validate**: `bash .lore/scripts/ensure-structure.sh && bash .lore/scripts/validate-consistency.sh`

## Snags

- **Always in `brainstorms/`** — never nest inside initiative or epic folders
- **No `status` field** — brainstorms are reference material, not tracked work
- To promote to an initiative or epic: archive the brainstorm, create the new item fresh
