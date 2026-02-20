---
name: lore-create-roadmap
description: Create a roadmap folder with frontmatter and validation
type: command
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Roadmap

Roadmaps are **operator-initiated**. Never create one unprompted.

## Process

1. **Read conventions**: Check `docs/context/conventions.md` or `docs/context/conventions/index.md` for docs formatting rules. Apply these when writing content.

2. **Create folder**: `docs/work/roadmaps/<slug>/`

   Also create a `plans/` subfolder with a placeholder:
   `docs/work/roadmaps/<slug>/plans/README.md`

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

4. **Validate**:

```bash
bash scripts/generate-nav.sh && bash scripts/validate-consistency.sh
```

## Gotchas

- Only `title`, `status`, `created`, `updated` are required — don't add unused optional fields
- `summary` is what operators see every session in the banner — keep it short
- Roadmap folders contain only `plans/`, `archive/`, flat `.md` supporting docs, and asset dirs
