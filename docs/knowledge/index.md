# Knowledge Base

Reference material about your environment, systems, and operations. This is your "Source of Truth" for existing discoveries.

## Search Strategy

Follow this hierarchy strictly to minimize cost and token waste:

1.  **Semantic Search First:** Use `lore_search` or `lore_context` to find files in `docs/`, `.lore/skills/`, and `.lore/rules/`.
2.  **Broad Glob Second:** If semantic search is unavailable, use `Glob docs/knowledge/**/*.md`.
3.  **Specific Grep Third:** Use `grep_search` only once you have narrowed down the candidate files.
4.  **Explore Externally Last:** Only explore undocumented services/APIs if the KB has no records.

## Structure

- **Environment** (`environment/`) — systems, architecture, accounts, integrations, operations.
- **Runbooks** (`.lore/runbooks/`) — multi-step operational procedures and recipes.
- **Fieldnotes** (`.lore/fieldnotes/`) — snags, gotchas, and specific technical lessons learned.
- **`local/`** — local-only notes and operator profiles, gitignored (never committed).

## Cultivation

Prior sessions captured service endpoints, API gotchas, and environment facts here. Just as prior agents cultivated this for you, you cultivate it for future sessions. Use `/lore-capture` to persist new discoveries.

