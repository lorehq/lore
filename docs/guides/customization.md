# Customization

> **Tip:** Your agent handles all customization — conventions, rules, knowledge structure. Just describe what you want changed.

Tell your agent what you want to change. It handles file creation, naming, and format.

## What Lives Where

| Location | Purpose | Injected every session? |
|----------|---------|:----------------------:|
| `docs/context/agent-rules.md` | Project identity and behavior rules | Yes |
| `docs/context/conventions/` | Per-domain behavioral rules (coding, docs, security) | Yes |
| `docs/knowledge/` | Environment details, runbooks, reference material | On-demand |
| `docs/knowledge/local/` | Gitignored scratch notes and local-only data | On-demand |

## Key Concepts

- **Context vs Knowledge** — `docs/context/` holds rules injected every session. `docs/knowledge/` holds reference material loaded on-demand.
- **Conventions** — each `.md` file in `docs/context/conventions/` is one convention. A write-time guard reinforces relevant principles before every file write. Bold lines (`**Like this.**`) are extracted for reminders.
- **Sticky files** — agent-rules and convention directories are recreated from templates if deleted.
- **Nav generation** — handled automatically by Docker's watcher or at session start. No manual step needed.

For full documentation, see [Working with Lore](https://lorehq.github.io/lore-docs/guides/working-with-lore/) and [Conventions](https://lorehq.github.io/lore-docs/guides/conventions/) on the docs site.
