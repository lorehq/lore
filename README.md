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

**OpenCode:**

```bash
opencode
```

No configuration needed. Hooks and plugins activate automatically on both platforms.

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
| **Hooks** | `hooks/` | Claude Code hooks — fire on session start, tool use, and edits. |
| **Plugins** | `.opencode/plugins/` | OpenCode plugins — same behavior, different platform. |
| **Skills** | `.claude/skills/` | Non-obvious knowledge captured from real work — gotchas, tricks, patterns. |
| **Agents** | `.claude/agents/` | Domain-specific workers. One agent per domain, run on cheaper models. |
| **Docs** | `docs/` | Context and runbooks, plus work tracking. Your agent's long-term memory. |
| **Scripts** | `scripts/` | Validation, registry generation, nav building. Keep the knowledge base consistent. |

## Supported Platforms

| Platform | Integration | How it works |
|----------|-------------|--------------|
| **Claude Code** | `hooks/` + `CLAUDE.md` | Hooks fire on lifecycle events. CLAUDE.md loaded automatically. |
| **OpenCode** | `.opencode/plugins/` + `opencode.json` | Plugins fire on lifecycle events. opencode.json points to CLAUDE.md. |

Both platforms share the same knowledge base — skills, agents, docs, and work tracking work identically.

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
