---
name: lore-capture
description: Session-scoped knowledge capture — review work, create skills, update registries
type: command
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, TaskCreate, TaskUpdate
---

# Capture

Session-scoped review: capture what was learned, update what changed.

## When to Use

The operator types `/lore-capture` after sustained work, or as a session wrap-up.

## Checklist

Walk through every item. Report findings to the operator before making changes.

1. **Review session work** for uncaptured knowledge
2. **Gotchas?** → create skill (mandatory — every gotcha becomes a skill)
3. **New environment knowledge?** (URLs, repos, services, relationships) → `docs/knowledge/environment/`
4. **Generate agents**: `bash scripts/generate-agents.sh`
5. **Update registries**: `bash scripts/generate-registries.sh`
6. **Sync platform copies**: `bash scripts/sync-platform-skills.sh`
7. **Check active work items** — completed? → update status to `completed`, move folder to `archive/` subfolder
8. **Generate nav**: `bash scripts/generate-nav.sh`
9. **Validate**: `bash scripts/validate-consistency.sh`

## Process

1. Scan session context silently
2. Present findings grouped by category
3. Operator approves which items to act on
4. Execute approved changes
5. Run validation

## Gotchas

- Report first, act second — never auto-fix without operator approval
- Archiving: move folder with `git mv` to parent's `archive/` dir (e.g., `docs/work/plans/archive/<slug>/`)
- When updating work item status, also update the `updated` date field
