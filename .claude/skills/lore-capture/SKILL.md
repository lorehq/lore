---
name: lore-capture
description: Session-scoped knowledge capture — review work, create fieldnotes, sync platform copies
model: sonnet
---

## USAGE
# Capture

Session-scoped review: capture what was learned, update what changed.

## When to Use

The operator types `/lore-capture` after sustained work, or as a session wrap-up.

## Checklist

Walk through every item. Report findings to the operator before making changes.

1. **Review session work** for uncaptured knowledge
2. **Snags (gotchas, quirks)?** → create fieldnote (mandatory — every snag becomes a fieldnote via `/lore-create-fieldnote`)
3. **New environment knowledge?** (URLs, repos, services, relationships) → `docs/knowledge/environment/`
4. **Sync platform copies**: `bash .lore/harness/scripts/sync-platform-skills.sh`
5. **Check active work items** — completed? → update status to `completed`, move folder to `archive/` subfolder
6. **Ensure structure**: `bash .lore/harness/scripts/ensure-structure.sh`
7. **Validate**: `bash .lore/harness/scripts/validate-consistency.sh`

## Process

1. Scan session context silently
2. Present findings grouped by category
3. Operator approves which items to act on
4. Execute approved changes
5. Run validation

## Snags

- Report first, act second — never auto-fix without operator approval
- Archiving: move folder with `git mv` to parent's `archive/` dir (e.g., `docs/workflow/in-flight/epics/archive/<slug>/`)
- When updating work item status, also update the `updated` date field