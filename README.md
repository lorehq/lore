# Lore

**Your coding agent forgets everything between sessions. Lore fixes that.**

Lore is a lightweight framework that gives coding agents persistent memory. Install it, work normally, and your agent starts building knowledge that compounds across sessions.

## Quick Start

```bash
npx create-lore my-project
cd my-project
claude
```

No configuration. The framework activates through hooks and conventions automatically.

## What You Get

**Self-Learning** — Your agent captures gotchas as reusable skills and maps your environment through docs. API quirks, auth tricks, encoding issues, repo layouts, service endpoints — all persist. The agent adapts to your specific setup and stops re-discovering things.

**Delegation** — An orchestrator/agent pattern where the main model dispatches domain-specific work to cheaper, faster models. Each agent gets focused context for its domain. Less token spend on the expensive model, cleaner context windows, specialized execution.

**Work Continuity** — Roadmaps and plans persist across sessions. Active work surfaces in the session banner every startup, so long-running projects pick up where they left off instead of starting cold.

## How It Works

Lore is a directory of markdown files, hooks that shape agent behavior, and scripts that keep everything consistent.

| Component | Location | What it does |
|-----------|----------|--------------|
| **Hooks** | `hooks/` | Fire on session start, tool use, and edits. Reinforce capture habits and route knowledge to the right place. |
| **Skills** | `.claude/skills/` | Non-obvious knowledge captured from real work — gotchas, tricks, patterns. Loaded by agents when relevant. |
| **Agents** | `.claude/agents/` | Domain-specific workers. One agent per domain, created automatically as skills accumulate. Run on cheaper models. |
| **Docs** | `docs/` | Environmental knowledge, runbooks, and work tracking. Your agent's long-term memory. |
| **Scripts** | `scripts/` | Validation, registry generation, nav building. Keep the knowledge base consistent as it grows. |

## Commands

| Command | What it does |
|---------|-------------|
| `/capture` | Review session work, capture skills, update registries, validate consistency |
| `/consolidate` | Deep health check — find stale items, semantic overlaps, knowledge drift |
| `/serve-docs` | Browse your knowledge base locally at localhost:8000 |
| `/stop-docs` | Stop the docs server |

Docker alternative: `/serve-docs-docker` — no Python required, supports multiple instances.

## License

[Apache-2.0](LICENSE)
