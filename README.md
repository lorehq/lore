# Lore

**Persistent memory for AI coding agents.**

[![CI](https://github.com/lorehq/lore/actions/workflows/test.yml/badge.svg)](https://github.com/lorehq/lore/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/lorehq/lore)](https://github.com/lorehq/lore/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Cursor%20%7C%20OpenCode-purple)]()

Lore captures skills, conventions, and project knowledge as you work — then loads them every session so your agent starts with full context instead of starting over. Plain files, git-versioned, zero runtime dependencies.

## Quick Start

```bash
npx create-lore my-project
cd my-project
```

Then open a session in your editor:

| Platform | Command |
|----------|---------|
| Claude Code | `claude` |
| Cursor | Open the project — hooks activate via `.cursor/hooks.json` |
| OpenCode | `opencode` |

No configuration needed. Your first session gets a full context banner immediately.

## What You Get

**Sessions accelerate instead of resetting.** Every session opens with your project identity, conventions, active work, available agents, and a map of everything your agent knows. No re-explaining.

**Semantic search and a live docs UI — highly recommended.** Run `/lore-docker` to start a local Docker sidecar that gives agents semantic search over the full knowledge base and opens a MkDocs site at `localhost` for browsing it visually. Without Docker, agents fall back to Grep/Glob search.

**Gotchas become skills that persist.** When your agent hits an API quirk, an encoding edge case, or a deployment gotcha, it captures that as a skill. That skill loads in every future session. The mistake happens once, the fix persists.

**Conventions are enforced, not just documented.** Your coding standards, docs rules, and security policies are injected before every file write. The agent sees the relevant rules right when it matters.

**One knowledge base, every platform, every repo.** Capture a skill in Claude Code — it's available in Cursor and OpenCode. Link repos to one hub — they all share the same knowledge. No copying, no drift.

**Complex work delegates to focused workers.** When work benefits from a fresh context window, the orchestrator spawns workers loaded with curated skills and conventions. Compound tasks split across parallel workers for maximum throughput.

## Before / After

**Without Lore** — Every session starts cold. You re-explain your project, the agent re-discovers API quirks, makes the same mistakes, and yesterday's debugging session is gone.

**With Lore** — The agent knows your project. Skills from last week load automatically. Conventions are enforced at write-time. Active roadmaps surface at startup. Complex work delegates to focused workers.

## How It Works

Lore is a directory of markdown files, hooks that shape agent behavior, and scripts that keep everything consistent.

- **Skills** (`.lore/skills/`) — Gotchas and patterns captured from real work. Available on-demand in every session.
- **Agents** (`.lore/agents/`) — Worker agents for delegated tasks, loaded with relevant skills per-task.
- **Docs** (`docs/`) — Project context, conventions, environment knowledge, runbooks, and work tracking.
- **Hooks** (`.lore/hooks/`, `.cursor/hooks/`, `.opencode/plugins/`) — Inject context at session start, enforce conventions before writes, nudge knowledge capture during work.
- **Scripts** (`.lore/scripts/`) — Platform sync, validation, nav building.

All hooks are plain JavaScript you can read in minutes. They don't make network requests, execute shell commands, or access anything outside your project directory.

## Working Across Repos

Link work repos to a central Lore hub so hooks fire from the hub even when you open the work repo directly:

```
/lore-link ~/projects/my-app
```

One hub, many repos, shared knowledge. See the [cross-repo guide](https://lorehq.github.io/lore-docs/guides/cross-repo-workflow/).

## Commands

| Command | What it does |
|---------|-------------|
| `/lore-capture` | Review session work, capture skills, update registries, validate consistency |
| `/lore-consolidate` | Deep health check — stale items, overlaps, knowledge drift |
| `/lore-link <path>` | Link a work repo to this hub |
| `/lore-docker` | Start/stop the local Docker sidecar — semantic search + live MkDocs UI |

## Platforms

| Platform | Integration | Status |
|----------|-------------|--------|
| **Claude Code** | Hooks + `CLAUDE.md` | Stable |
| **Cursor** | Hooks + MCP server + `.mdc` rules | Stable |
| **OpenCode** | ESM plugins + `opencode.json` | Stable |

All platforms share the same knowledge base. Skills, agents, and conventions written once sync to platform-specific formats automatically.

## Documentation

Full docs: [lorehq.github.io/lore-docs](https://lorehq.github.io/lore-docs/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
