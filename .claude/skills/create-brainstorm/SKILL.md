---
name: create-brainstorm
description: Create a brainstorm folder — always standalone, never nested
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Brainstorm

Brainstorms capture conversation artifacts for future reference. **Operator-initiated only.**

## Process

1. **Create folder**: `docs/work/brainstorms/<slug>/`

2. **Create index.md** with minimal frontmatter:

```yaml
---
title: [Descriptive title]
created: [today's date]
---
```

3. **Validate**: `bash scripts/generate-nav.sh`

## Gotchas

- **Always in `brainstorms/`** — never nest inside roadmap or plan folders
- **No `status` field** — brainstorms are reference material, not tracked work
- To promote to a plan or roadmap: archive the brainstorm, create the new item fresh
