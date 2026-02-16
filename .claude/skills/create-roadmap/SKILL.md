---
name: create-roadmap
description: Create a roadmap folder with frontmatter and validation
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Roadmap

Roadmaps are **operator-initiated**. Never create one unprompted.

## Process

1. **Create folder**: `docs/work/roadmaps/<slug>/`

   Also create a `plans/` subfolder with a placeholder:
   `docs/work/roadmaps/<slug>/plans/README.md`

2. **Create index.md** with frontmatter:

```yaml
---
title: [Operator's initiative name]
status: active
created: [today's date]
updated: [today's date]
summary: [one-liner]    # optional — shown in session banner
---
```

3. **Validate**:

```bash
bash scripts/generate-nav.sh && bash scripts/validate-consistency.sh
```

## Gotchas

- Only `title`, `status`, `created`, `updated` are required — don't add unused optional fields
- `summary` is what operators see every session in the banner — keep it short
- Roadmap folders contain only `plans/`, `archive/`, flat `.md` supporting docs, and asset dirs
