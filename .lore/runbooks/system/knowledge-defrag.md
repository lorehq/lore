# Knowledge Defrag

**WARNING: This runbook restructures `~/.lore/knowledge-base/` freely. It will move, rename, merge, and reorganize files. Review the proposed structure before approving execution.**

Reorganizes the global knowledge base (`~/.lore/knowledge-base/`) based on actual file content rather than the original folder structure. Applies the knowledge base structure rule (`.lore/rules/knowledge-base-structure.md`) with a focus on consolidation, retrieval optimization, and LLM navigation. Produces a clean directory structure with atomic files, descriptive names, and repaired internal links.

## Prerequisites

- Knowledge rule loaded: `.lore/rules/knowledge-base-structure.md`
- Back up the global directory before starting: `cp -r ~/.lore/knowledge-base/ ~/.lore/knowledge-base.bak/`

## Protected Paths

These paths are never moved or renamed. Workers must exclude them from all proposals:

- `~/.lore/knowledge-base/operator-profile.md` — operator identity
- `~/.lore/knowledge-base/environment/` — environment facts; harness references this path
- `.lore/runbooks/` — this runbook's own directory; external references depend on the name

## Phase 1: Inventory (parallel — haiku x3)

Split `~/.lore/knowledge-base/` files into ~3 groups by directory. Each worker loads:

- `.lore/rules/knowledge-base-structure.md` **only**

For each file, extract:

```
{ file, title, primary_topic, secondary_topics: [], key_entities: [], summary: "1 sentence", line_count }
```

Flag files that may need merging (under 20 lines, closely related to a sibling) or splitting (over 150 lines, covers multiple topics). Exclude protected paths from merge/split candidates.

Worker return format: structured inventory list per file.

## Phase 2: Structure Proposal (single sonnet)

Pass the full inventory to one sonnet worker. Worker loads:

- `.lore/rules/knowledge-base-structure.md` **only**

Worker proposes a new directory structure and full move map:

```
{ old_path: new_path }                     # for every file that moves
{ merge: [file_a, file_b] → new_path }    # for merge candidates
{ split: file → [new_path_a, new_path_b] } # for split candidates
```

Constraints the worker must apply:
- Protected paths are off-limits
- Max 3 levels under `~/.lore/knowledge-base/`
- Every proposed directory must have an `index.md` entry in the map
- File names must be descriptive kebab-case
- Merges only where files cover the same topic from the same angle
- Splits only where a single file clearly covers two distinct topics

Worker return format: proposed directory tree (before and after) + full move map.

## Phase 3: Operator Review (sequential)

Present to operator:
1. Before/after directory tree
2. Files being moved (count and summary)
3. Merge candidates with rationale
4. Split candidates with rationale
5. Any judgment calls (ambiguous reorganizations)

**Do not proceed until operator explicitly approves.** Operator may reject individual moves, merges, or splits — remove them from the map before executing.

## Phase 4: Execute (sequential)

Apply approved moves in order:

1. **Moves** — use `mv old_path new_path` for every file in the move map
2. **Merges** — concatenate source files into the target, then remove the sources
3. **Splits** — write new files from source content, then remove the source
4. **Link repair** — build a complete `{ old_path: new_path }` mapping from all moves, merges, and splits. Scan knowledge base files for relative links matching any old path and replace with the corresponding new path.
5. **Index files** — create or update `index.md` in every new or modified directory. One sentence describing contents + links to children.
6. **Remove empty directories** — remove any directories left empty after moves

Apply link repair **after** all moves complete so the mapping is total before any replacement.

## Phase 5: Validate

```bash
bash .lore/harness/scripts/validate-consistency.sh
```

Also run a manual check for broken relative links:

```bash
# Find links to .md files that no longer exist
grep -r '\](.*\.md)' ~/.lore/knowledge-base/ | grep -v 'http' | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  link=$(echo "$line" | grep -oP '\]\(\K[^)]+')
  target=$(dirname "$file")/$link
  [ ! -f "$target" ] && echo "BROKEN: $file -> $link"
done
```

Report any broken links to operator before committing.

## Phase 6: Commit

Review all changes in `~/.lore/knowledge-base/` and confirm the reorganization is correct. Remove the backup once satisfied:

```bash
rm -rf ~/.lore/knowledge-base.bak/
```

## Model Allocation

| Phase | Model | Workers | Rule | Rationale |
|-------|-------|---------|------|-----------|
| Phase 1 Inventory | Haiku | 3 | knowledge.md | Structured extraction; fast and cheap |
| Phase 2 Proposal | Sonnet | 1 | knowledge.md | Structural judgment requires reasoning |
| Phase 4 Execute | Caller | 1 | — | Sequential; link repair requires full move map |

## Cadence

- **After major knowledge accumulation** — when the global knowledge base has grown organically and structure has drifted from content
- **After a project pivot** — when the original organization no longer matches how the project evolved
- **When semantic search recall degrades** — poorly named or oversized files produce weak embeddings
