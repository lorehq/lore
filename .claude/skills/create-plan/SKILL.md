---
name: create-plan
description: Create a plan folder with frontmatter and validation
domain: Orchestrator
scope: internal
user-invocable: false
allowed-tools: Write, Read, Bash, Glob
---

# Create Plan

Plans are **operator-initiated**. Never create one unprompted.

## Process

1. **Determine location**:
   - Standalone: `docs/work/plans/<slug>/index.md`
   - Under roadmap: `docs/work/roadmaps/<roadmap>/plans/<slug>/index.md`

   If the operator is working within an existing roadmap, nest the plan there. Otherwise standalone.

2. **Create folder**: `<location>/<slug>/`

3. **Create index.md** with frontmatter:

```yaml
---
title: [Operator's plan name]
status: active
created: [today's date]
updated: [today's date]
roadmap: <roadmap-slug>  # optional — standalone plans only
summary: [one-liner]     # optional — shown in session banner
---
```

4. **Validate**:

```bash
bash scripts/generate-nav.sh && bash scripts/validate-consistency.sh
```

## Gotchas

- Roadmap plans are nested under the roadmap folder — don't set a `roadmap:` field for those
- `roadmap` field = folder name (e.g., `cloud-migration`), not a path; only for standalone plans
- `summary` is shown in the session banner — keep it under 60 chars
