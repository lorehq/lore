# Knowledge Base Structure

## 1. One Topic Per File

**Atomic files produce the best retrieval.**

- Each file covers one entity, one concept, or one procedure — nothing more.
- A file should make sense read in isolation, without context from sibling files.
- Under 20 lines: consider merging into a sibling file. Over 150 lines: likely two topics — split.

## 2. Self-Contained Sections

**Semantic search chunks at `##` boundaries — each section is a retrieval unit.**

- A section that requires reading the section above produces a weak embedding.
- Use bullet lists over prose for enumerating facts, properties, or steps.
- Avoid nested lists deeper than two levels.

## 3. Descriptive Names

**File and directory names carry retrieval signal — make them count.**

- Use kebab-case for all file and directory names.
- File names: primary noun + qualifier (`github-actions-cache.md`, `stripe-webhook-auth.md`).
- Directory names: noun phrases describing the category (`payment-providers/`, not `misc/`).
- Avoid generic names: `misc.md`, `notes.md`, `overview.md`, `other/` — they carry no retrieval signal.

## 4. Depth Limit

**Shallow hierarchy means fewer agent navigation hops.**

- Max 3 levels under `docs/knowledge/`: domain → category → files.
- Add a third level (subcategory) only when a category has 10+ files.
- Every directory must have an `index.md` describing its contents and linking to children.

## 5. Frontmatter

**Minimal frontmatter enables filtered retrieval and helps agents reason about files before reading them.**

- Three required fields on every knowledge file:
  ```yaml
  ---
  title: Human-readable title
  tags: [tag1, tag2]
  type: environment | runbook | reference | procedure
  ---
  ```
- Use existing tags before coining new ones.
- Add `related: [path1, path2]` for strongly connected files.

## 6. Cross-References

**Links compound value. Duplication compounds drift.**

- Use `related:` frontmatter for files covering the same entity from different angles.
- Use inline links for specific fact references within prose or bullets.
- Never duplicate content — link instead.

## 7. Protected Paths

**These paths must not be renamed or moved by defrag or any reorganization.**

- `docs/knowledge/local/` — gitignored operator profile.
- `docs/knowledge/environment/` — environment facts; harness references this path.
- `.lore/runbooks/` — runbooks; external references depend on this name.
- The knowledge-defrag runbook reads this list before proposing any moves.
