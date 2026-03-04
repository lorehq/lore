---
example: true
highlights:
  - Parallel vs sequential worker phases with explicit gates
  - Worker tier selection (haiku for extraction, sonnet for judgment)
  - Rule isolation — workers get one rule, never multiple
  - Dedicated semantic search containers per data source
  - Commit-scoped scanning to limit blast radius
  - Protected pages that skip certain phases
---

# Docs-Code Alignment Sweep

!!! example "Seed example"
    This runbook ships with new Lore instances as an example of advanced runbook patterns — parallel delegation, worker tiers, phased gates, and rule isolation. Customize or delete it.

Bidirectional accuracy sweep — reduce doc volume, verify doc claims against source, discover undocumented functionality, then polish for rule compliance. Produces two outputs: doc fixes and a code violations report for follow-up. Uses parallel workers with dedicated semantic search containers.

## Prerequisites

- Docs directory checked out locally
- Source repos checked out locally
- Docs rule loaded: `.lore/rules/documentation.md`
- Docker available for search containers

## Protected Pages

Some doc pages contain empirical research data (test results, cost analysis, performance measurements). These are primary sources of truth — not derived from code and not candidates for reduction or fact-checking against source.

**Rule:** Workers in Phase 1 and Phase 2 must skip protected pages entirely. Do not reduce, extract claims from, or verify these pages against source code. They are only subject to Phase 4 polish (formatting, rule compliance).

Protected page criteria:

- Contains original test data, measurements, or statistical results
- Presents methodology + findings from controlled experiments
- Explicitly cites sample sizes and conditions

## Phase 0: Search Setup (sequential)

Start two dedicated search containers before any workers launch. Both must be healthy before proceeding.

```bash
# Docs search — used by Phase 1, Phase 3b
docker run -d --name sweep-docs \
  -p 9190:8080 \
  -e MAX_K=10 \
  -v /path/to/docs:/data/docs \
  lore-memory:latest

# Source search — used by Phase 2b, Phase 3a
# Mount source repos as sections under /data/docs
docker run -d --name sweep-source \
  -p 9191:8080 \
  -e MAX_K=10 \
  -v /path/to/source-repo:/data/docs/source \
  lore-memory:latest

# Wait for both — model loading takes 30-60s on first start
curl -s http://localhost:9190/health && curl -s http://localhost:9191/health
```

`MAX_K=10` is required. The default is 2, which is too few results for sweep queries.

Do not mount as `:ro` — the container scaffold needs write access to create its directory structure inside `/data/docs` on first start. Do not proceed until both return healthy.

## Phase 1: Reduce (parallel — sonnet workers)

Cut doc volume before bidirectional passes so both phases work on canonical content only. **Skip protected pages.**

Launch 2-3 sonnet workers. Each worker loads:

- `.lore/rules/documentation.md` **only**

Workers query **docs search (port 9190)** to find topically overlapping pages, then read actual files to decide cuts.

Each worker scans for:

- Duplicate facts across pages (same info restated in multiple places)
- Verbose sections: filler, over-explanation, marketing copy
- Thin content that should merge into a parent page
- Pages over 150 lines that should split by topic
- Terminology inconsistencies (same concept, different names)

Worker return format:

```
| File | Lines | Issue | Action |
```

Review the consolidation report and execute edits before proceeding.

**After edits complete:** trigger a full reindex on the docs container:

```bash
curl -s -X POST http://localhost:9190/reindex
```

Use `POST /reindex` rather than relying on the filesystem watcher — bulk deletes and merges can race the 1s debounce.

## Phase 2: Docs to Source — Truth Sweep (two stages)

Read doc claims, verify against source, fix or remove what is false or stale.

### Stage A — Extract (haiku x4, parallel)

Split doc pages into ~4 groups by topic. **Skip protected pages.** Each worker loads:

- `.lore/rules/documentation.md` **only**

Each haiku worker extracts every verifiable claim from its group:

- File paths and directory structures
- CLI commands and described behavior
- Config keys and default values
- Hook names, event types, counts
- Behavioral claims ("X happens when Y")
- Code examples and expected output

Worker return format: structured claims list with `file:line` source for each claim.

### Stage B — Verify (sonnet x4, parallel)

Each worker receives a claims batch from Stage A. Workers load:

- **No rule** — source reading requires no doc rules

For each claim: query **source search (port 9191)** then read returned files, then classify:

- **CORRECT** — matches source
- **WRONG** — with actual current behavior noted
- **OUTDATED** — partially correct, needs update
- **MISSING** — should be in docs, is not

Worker return format:

```
| Claim | File:Line | Classification | Evidence |
```

## Phase 3: Source to Docs — Coverage Sweep (two stages)

Read source, check whether user-facing functionality is documented. Stage A runs in parallel with Phase 2 Stage B.

### Commit-Scoped Scanning

Phase 3 focuses on changes since the last docs sweep commit. Before launching workers, identify the cutoff:

```bash
# Last docs sweep commit (update hash each run)
SWEEP_CUTOFF_HASH="<last-sweep-commit>"
SWEEP_CUTOFF_DATE=$(git log --format="%aI" $SWEEP_CUTOFF_HASH -1)

# Get changed files + commit summaries since cutoff
git log --oneline --after="$SWEEP_CUTOFF_DATE"
git log --after="$SWEEP_CUTOFF_DATE" --diff-filter=ACMR --name-only --pretty=format:"" | sort -u
```

Workers receive the changed-file lists and commit summaries as input.

### Stage A — Source Scan (sonnet, parallel — one worker per source repo)

Each worker loads:

- `.lore/rules/coding.md` **only**
- Changed-file list and commit log for its assigned repo

For each changed module, config key, hook, or script entry point:

- Is this user-facing? (affects behavior, config, or output the operator sees)
- Is it a non-obvious behavior worth documenting?
- Does it violate any coding rule? (flag with file:line, rule, severity)

Worker return format — two sections:

```
Coverage items:
{ repo, file, functionality, user-facing: yes/no, reason, commit }

Violations:
| Repo | File | Line | Rule | Severity | Description |
```

### Stage B — Doc Coverage Check (sonnet x3, parallel)

Each worker receives a user-facing item batch from Stage A. Workers load:

- `.lore/rules/documentation.md` **only**

For each item: query **docs search (port 9190)**, check returned pages, classify:

- **DOCUMENTED** — covered accurately
- **MISSING** — not in docs at all
- **WRONG** — doc exists but conflicts with Phase 2 findings

## Fix Sequence (sequential)

Apply fixes in order. Phase 2 fixes first establishes an accurate baseline; Phase 3 additions build on top.

1. **Apply Phase 2 fixes** — gets docs to accurate baseline
   - Fix WRONG and OUTDATED items
   - Remove confirmed stale content
2. **Apply Phase 3 additions** — build on accurate baseline
   - Draft and insert MISSING docs for user-facing functionality
   - Cross-check WRONG items against Phase 2 results to avoid duplicate edits
3. **Present judgment calls to operator**
   - OUTDATED items with ambiguous source (behavior unclear from code alone)
   - MISSING items with low confidence (may be intentionally undocumented)

Do not apply judgment calls without operator decision.

**Code violations output:** Present the Phase 3a violations report as a separate deliverable. Do not auto-fix — hand off to a code-tidy sweep or address in a dedicated session.

## Phase 4: Polish (parallel — sonnet workers)

Rule compliance sweep on the updated corpus. Launch 2-3 sonnet workers. Each worker loads:

- `.lore/rules/documentation.md` **only**

Each worker scans its assigned pages for:

- Filler phrases ("it should be noted", "in order to", "basically")
- Vague pronouns ("it", "this", "that" when the referent is not the immediately preceding noun)
- Pages over 150 lines
- Mixed topics on one page
- Remaining cross-page duplication
- Inconsistent terminology
- Stale TODOs or placeholders
- Prose that should be a table or link

Worker return format: punch list with exact current text and replacement text. The caller executes edits.

## Phase 5: Teardown (sequential)

```bash
docker stop sweep-docs sweep-source
docker rm sweep-docs sweep-source
```

## Model Allocation

| Phase | Model | Workers | Rule | Rationale |
|-------|-------|---------|-----------|-----------|
| Phase 1 Reduce | Sonnet | 2-3 | documentation | Judgment on what is duplicate or verbose |
| Phase 2a Extract | Haiku | 4 | documentation | Structured extraction; fast and cheap |
| Phase 2b Verify | Sonnet | 4 | none | Code comprehension; no doc rules needed |
| Phase 3a Source Scan | Sonnet | 1/repo | coding | Commit-scoped; flags violations too |
| Phase 3b Doc Coverage | Sonnet | 3 | documentation | Understands what a good doc entry covers |
| Fix Sequence | Caller | 1 | — | Human-in-the-loop triage |
| Phase 4 Polish | Sonnet | 2-3 | documentation | Rule judgment; Haiku misses nuance |

Rule isolation: workers get `documentation`, `coding`, or nothing — never both.

## Parallelization Diagram

```
Phase 0 (setup):     [docs-search :9190]   [source-search :9191]
                     ──────────────────────────────────────────────
Phase 1 (reduce):    [docs-A]  [docs-B]  [docs-C]
                     ──────────────────────────────────────────────
Phase 2a (extract):  [haiku-1] [haiku-2] [haiku-3] [haiku-4]
                     ──────────────────────────────────────────────
Phase 2b+3a (scan):  [verify-1][verify-2][verify-3][verify-4]
                     [src-1]   [src-2]   [src-3]
                     ──────────────────────────────────────────────
Phase 3b (coverage): [cov-1]   [cov-2]   [cov-3]
                     ──────────────────────────────────────────────
Fix sequence:        [Phase 2 fixes] → [Phase 3 additions] → [operator triage]
                     ──────────────────────────────────────────────
Phase 4 (polish):    [docs-A]  [docs-B]  [docs-C]
                     ──────────────────────────────────────────────
Phase 5 (teardown):  [stop + rm sweep-docs sweep-source]
```

## Cadence

- **After major releases** — hook, config, or platform behavior changes cause factual drift immediately
- **After doc-heavy sprints** — new pages accumulate duplication and loose claims
- **Quarterly** — general hygiene
- **Docs only (phases 1, 2, 4)** — when source is stable but docs changed
