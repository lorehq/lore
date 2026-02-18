# Lore

**Your coding agent forgets everything between sessions. Lore fixes that.**

Lore is a lightweight framework that gives coding agents persistent memory. Install it, work normally, and your agent starts building knowledge that compounds across sessions.

## Quick Start

```bash
npx create-lore my-project
cd my-project
```

**Claude Code:**

```bash
claude
```

**Cursor:**

Open the project in Cursor. Hooks activate automatically via `.cursor/hooks.json`.

**OpenCode:**

```bash
opencode
```

No configuration needed. Hooks and plugins activate automatically on all platforms.

## Before / After

**Without Lore** — Every session starts cold. The agent re-discovers your project structure, re-learns API quirks, and makes the same mistakes. Knowledge from yesterday's debugging session is gone.

**With Lore** — The agent knows your project. API quirks captured last week load automatically. Domain-specific work delegates to specialized agents. Your roadmap picks up where you left off.

## What You Get

**Self-Learning** — Your agent captures gotchas as reusable skills and maps your environment through docs. API quirks, auth tricks, encoding issues, repo layouts, service endpoints — all persist. The agent adapts to your specific setup and stops re-discovering things.

**Delegation** — An orchestrator/agent pattern where the main model dispatches domain-specific work to cheaper, faster models. Each agent gets focused context for its domain. Less token spend on the expensive model, cleaner context windows, specialized execution.

**Work Continuity** — Roadmaps and plans persist across sessions. Active work surfaces in the session banner every startup, so long-running projects pick up where they left off instead of starting cold.

## How It Works

Lore is a directory of markdown files, hooks/plugins that shape agent behavior, and scripts that keep everything consistent.

| Component | Location | What it does |
|-----------|----------|--------------|
| **Platform hooks** | `hooks/`, `.cursor/hooks/`, `.opencode/plugins/` | Fire on session start, tool use, and edits. Each platform has thin adapters over shared `lib/`. |
| **Skills** | `.lore/skills/` | Non-obvious knowledge captured from real work — gotchas, tricks, patterns. `lore-*` = framework-owned, everything else = yours. |
| **Agents** | `.lore/agents/` | Domain-specific workers. One agent per domain, run on cheaper models. Per-platform model preferences in frontmatter. |
| **Docs** | `docs/` | Context and runbooks, plus work tracking. Your agent's long-term memory. |
| **Scripts** | `scripts/` | Validation, registry generation, nav building. Keep the knowledge base consistent. |

## Supported Platforms

| Platform | Integration | How it works |
|----------|-------------|--------------|
| **Claude Code** | `hooks/` + `CLAUDE.md` | Hooks fire on lifecycle events. CLAUDE.md loaded automatically. |
| **Cursor** | `.cursor/hooks/` + `.cursorrules` | Hooks fire on prompt, read, and edit events. .cursorrules loaded automatically. |
| **OpenCode** | `.opencode/plugins/` + `opencode.json` | Plugins fire on lifecycle events. opencode.json points to instructions. |

`CLAUDE.md` and `.cursorrules` are generated from `.lore/instructions.md` via `scripts/sync-platform-skills.sh`.

All platforms share the same knowledge base — skills, agents, docs, and work tracking work identically.

## Working Across Repos

Lore is a central hub. Launch your agent here and work on any repo by referencing its path — knowledge captures back to Lore, work repos stay clean.

For IDEs where you need the work repo's file tree, git, and search:

```bash
bash scripts/lore-link.sh ~/projects/my-app
```

This links the work repo so hooks fire from the hub even when you open the work repo directly. See the [full guide](https://lorehq.github.io/lore-docs/guides/cross-repo-workflow/).

## Commands

| Command | What it does |
|---------|-------------|
| `/lore-capture` | Review session work, capture skills, update registries, validate consistency |
| `/lore-consolidate` | Deep health check — find stale items, semantic overlaps, knowledge drift |
| `/lore-ui` | Manage docs UI lifecycle (start/stop/status), preferring Docker with local mkdocs fallback |

## Documentation

Full docs: [lorehq.github.io/lore-docs](https://lorehq.github.io/lore-docs/)

## License

[Apache-2.0](LICENSE)
