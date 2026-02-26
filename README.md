# Lore

**Coding agent harness.**

[![CI](https://github.com/lorehq/lore/actions/workflows/test.yml/badge.svg)](https://github.com/lorehq/lore/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/lorehq/lore)](https://github.com/lorehq/lore/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Cursor%20%7C%20OpenCode-purple)]()

Lore wraps your coding agent in a harness — persistent memory, rule enforcement, orchestrated delegation, and work tracking. Your agent starts every session knowing your project instead of starting over. Plain files, git-versioned, zero runtime dependencies.

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

**Sessions accelerate instead of resetting.** The harness loads your project identity, rules, active work, available agents, and a map of everything your agent knows at session start. No re-explaining.

**Semantic search and a live docs UI — highly recommended.** Tell your agent to start the docs sidecar — it pulls the Docker image, configures ports, and launches semantic search over the full knowledge base plus a live MkDocs site. Without Docker, agents fall back to Grep/Glob search.

**Snags, gotchas, quirks become fieldnotes that persist.** When your agent hits an API quirk, an encoding edge case, or a deployment snag, the harness captures that as a fieldnote. That fieldnote loads in every future session. The mistake happens once, the fix persists.

**Rules are enforced, not just documented.** Your coding standards, docs rules, and security policies are injected before every file write. The agent sees the relevant rules right when it matters.

**One knowledge base, every platform, every repo.** Capture a fieldnote in Claude Code — it's available in Cursor and OpenCode. Link repos to one hub — they all share the same knowledge. No copying, no drift. [See it in action.](https://youtu.be/u2rkR1XeHZk)

**Complex work delegates to focused workers.** The harness orchestrates delegation: when work benefits from a fresh context window, it spawns workers loaded with curated skills and rules. Compound tasks split across parallel workers for maximum throughput.

## Before / After

**Without a harness** — Every session starts cold. You re-explain your project, the agent re-discovers API quirks, makes the same mistakes, and yesterday's debugging session is gone.

**With Lore** — The agent knows your project. Fieldnotes from last week load automatically. Rules are enforced at write-time. Active roadmaps surface at startup. Complex work delegates to focused workers.

## How It Works

Lore is a harness built from markdown files, hooks that shape agent behavior, and scripts that keep everything consistent.

- **Fieldnotes** (`.lore/fieldnotes/`) — Snags and patterns captured from real work. Available on-demand in every session.
- **Skills** (`.lore/skills/`) — Procedural capabilities and reusable commands.
- **Agents** (`.lore/agents/`) — Worker agents for delegated tasks, loaded with relevant skills and fieldnotes per-task.
- **Docs** (`docs/`) — Project context, rules, environment knowledge, runbooks, and work tracking.
- **Hooks** (`.lore/hooks/`, `.cursor/hooks/`, `.opencode/plugins/`) — Inject context at session start, enforce rules before writes, nudge knowledge capture during work.
- **Scripts** (`.lore/scripts/`) — Platform sync, validation, nav building.

All hooks are plain JavaScript you can read in minutes. They don't make network requests, execute shell commands, or access anything outside your project directory.

## Working Across Repos

Tell your agent to link work repos to the hub — it generates configs so hooks fire from the hub even when you open the work repo directly. One hub, many repos, shared knowledge. See the [cross-repo guide](https://lorehq.github.io/lore-docs/guides/working-across-repos/).

## Commands

| Command | What it does |
|---------|-------------|
| `/lore-capture` | Review session work, capture fieldnotes, update registries, validate consistency |
| `/lore-consolidate` | Deep health check — stale items, overlaps, knowledge drift |
| `/lore-link <path>` | Link a work repo to this hub |
| `/lore-docker` | Start/stop the local Docker sidecar — semantic search + live MkDocs UI |
| `/lore-field-repair` | Diagnose and fix a harness bug in source |

## Platforms

| Platform | Integration | Maturity |
|----------|-------------|----------|
| **Claude Code** | Hooks + `CLAUDE.md` | Supported |
| **Cursor** | Hooks + MCP server + `.mdc` rules | Experimental |
| **OpenCode** | ESM plugins + `opencode.json` | Experimental |

All platforms share the same knowledge base. Skills, fieldnotes, agents, and rules written once sync to platform-specific formats automatically.

## Documentation

Full docs: [lorehq.github.io/lore-docs](https://lorehq.github.io/lore-docs/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
