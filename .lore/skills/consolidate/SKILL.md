---
name: consolidate
description: Deep repo-wide health check — stale items, overlap, duplication
domain: Orchestrator
scope: internal
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
---

# Consolidate

Deep, operator-triggered repo-wide maintenance scan. Unlike `/capture` (session-scoped), `/consolidate` reads full content and does semantic cross-referencing.

**Report-then-ask**: All scans run silently, results presented as one grouped report, operator picks what to act on. No auto-fixing.

## Thresholds

| Category | Threshold |
|----------|-----------|
| Active work items (`status: active`) | 14 days since `updated` |
| Planned/on-hold work items | 30 days since `updated` |
| Brainstorms | 21 days since `created` |
| Context docs | 30 days since last git commit |
| MEMORY.local.md | >50 lines |

## Process

### Tier 1: Structural Scans

1. **Stale work items**: Glob `docs/work/roadmaps/*/index.md`, `docs/work/plans/*/index.md`, and nested `docs/work/roadmaps/*/plans/*/index.md`. Exclude `archive/`. Check `updated` field against thresholds.

2. **Aging brainstorms**: Glob `docs/work/brainstorms/*/index.md`. Exclude `archive/`. Flag if `created` older than 21 days. Suggest: promote or archive.

3. **Context doc staleness**: For `.md` files in `docs/context/` (recursive), check last git commit date. Flag files >30 days stale. Skip `index.md` files.

4. **MEMORY.local.md hygiene**: Flag if >50 lines.

### Tier 2: Deep Content Analysis

5. **Work item semantic overlap**: Read full content of all active roadmaps and plans. Flag near-identical scope (HIGH), shared concerns (MEDIUM), or regrouping opportunities.

6. **Brainstorm lifecycle**: Cross-reference active brainstorms against completed work. Flag as archive candidate, promote candidate, or stale.

7. **Context doc duplication**: Read all `docs/context/` files. Flag content overlap, stale facts, orphaned inventory.

## Report Format

```
## Consolidation Report

### Tier 1: Structural

#### Stale Work Items (N found)
- [stale] roadmaps/foo — "Title" — active, last updated 23 days ago

#### Environment Doc Staleness (N found)
- docs/context/inventory/services.md — last touched 45 days ago

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
- Exclude `archive/` directories from all scans
- Missing frontmatter fields are findings, not errors
- Overlap detection is semantic judgment, not string matching
