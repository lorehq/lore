---
name: lore-consolidate
description: Deep repo-wide health check — stale items, overlap, duplication
domain: Orchestrator
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
---

# Consolidate

Deep, operator-triggered repo-wide maintenance scan. Unlike `/lore-capture` (session-scoped), `/lore-consolidate` reads full content and does semantic cross-referencing.

**Report-then-ask**: All scans run silently, results presented as one grouped report, operator picks what to act on. No auto-fixing.

## Thresholds

| Category | Threshold |
|----------|-----------|
| Active work items (`status: active`) | 14 days since `updated` |
| Planned/on-hold work items | 30 days since `updated` |
| Brainstorms | 21 days since `created` |
| Knowledge docs | 30 days since last git commit |
| Archived work items | 60 days since `updated` |
| MEMORY.local.md | >50 lines |

## Process

### Tier 1: Structural Scans

1. **Stale work items**: Glob `docs/work/roadmaps/*/index.md`, `docs/work/plans/*/index.md`, and nested `docs/work/roadmaps/*/plans/*/index.md`. Exclude `archive/`. Check `updated` field against thresholds.

2. **Aging brainstorms**: Glob `docs/work/brainstorms/*/index.md`. Exclude `archive/`. Flag if `created` older than 21 days. Suggest: promote or archive.

3. **Knowledge doc staleness**: For `.md` files in `docs/knowledge/` (recursive), check last git commit date. Flag files >30 days stale. Skip `index.md` files.

4. **Archive cleanup**: Glob `archive/` directories under `docs/work/`. Check `updated` field. Flag items older than 60 days as deletion candidates. Archives exist for visibility — not permanent storage.

5. **MEMORY.local.md hygiene**: Flag if >50 lines.

### Tier 2: Deep Content Analysis

6. **Work item semantic overlap**: Read full content of all active roadmaps and plans. Flag near-identical scope (HIGH), shared concerns (MEDIUM), or regrouping opportunities.

7. **Brainstorm lifecycle**: Cross-reference active brainstorms against completed work. Flag as archive candidate, promote candidate, or stale.

8. **Knowledge doc duplication**: Read all `docs/knowledge/` files. Flag content overlap, stale facts, orphaned inventory.

## Report Format

```
## Consolidation Report

### Tier 1: Structural

#### Stale Work Items (N found)
- [stale] roadmaps/foo — "Title" — active, last updated 23 days ago

#### Knowledge Doc Staleness (N found)
- docs/knowledge/environment/inventory/services.md — last touched 45 days ago

#### Archive Deletion Candidates (N found)
- plans/archive/foo — "Title" — archived 75 days ago — suggest delete

### Tier 2: Deep Analysis

#### Work Item Overlap (N found)
- HIGH: plans/foo ↔ plans/bar — overlapping deliverables

(Categories with 0 findings omitted)
```

## After the Report

1. Operator selects items to address
2. Execute approved changes: archive stale items, merge overlapping docs, route MEMORY.local.md content
3. Run `bash scripts/validate-consistency.sh`

## Gotchas

- Read-only during scan phase — never modify files until operator approves
- Exclude `archive/` from staleness scans (items 1-3) — archived items have their own cleanup threshold (item 4)
- Deletion of archived items requires explicit operator approval — suggest, never auto-delete
- Missing frontmatter fields are findings, not errors
- Overlap detection is semantic judgment, not string matching
