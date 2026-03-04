# Lore

**Agentic coding tool harness.**

[![CI](https://github.com/lorehq/lore/actions/workflows/test.yml/badge.svg)](https://github.com/lorehq/lore/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/lorehq/lore)](https://github.com/lorehq/lore/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Gemini%20CLI%20%7C%20Cursor%20%7C%20Windsurf%20%7C%20Roo%20Code%20%7C%20OpenCode-purple)]()

Lore wraps your agentic coding tool in a harness — persistent memory, rule enforcement, delegation, and work tracking. Your agent starts every session knowing your project instead of starting over. Plain files, git-versioned, zero runtime dependencies.

## Quick Start

```bash
npx create-lore --platforms claude,cursor my-project
cd my-project
```

Choose which platforms you use — `claude`, `gemini`, `windsurf`, `cursor`, `opencode`, `roocode`. Only files for selected platforms are created. Then open a session in your editor:

| Platform | Command |
|----------|---------|
| Claude Code | `claude` |
| Gemini CLI | `gemini` — loads foundational mandates from `GEMINI.md` |
| Cursor | Open the project — hooks activate via `.cursor/hooks.json` |
| Windsurf | Open the project — loads context from `.windsurfrules` |
| Roo Code | Open the project — loads context from `.clinerules` |
| OpenCode | `opencode` |

No configuration needed. Your first session gets a full context banner immediately.

## What You Get

**Sessions accelerate instead of resetting.** The harness loads your project identity, rules, active work, available agents, and a map of everything your agent knows at session start. No re-explaining.

**Semantic search and hot memory — highly recommended.** Tell your agent `/lore memory` to start the sidecar — semantic search over the knowledge base and Redis-backed hot memory for session context. Without Docker, agents fall back to Grep/Glob search and `memory.local.md`.

**Snags, gotchas, quirks become fieldnotes that persist.** When your agent hits an API quirk, an encoding edge case, or a deployment snag, the harness captures that as a fieldnote. That fieldnote loads in every future session. The mistake happens once, the fix persists.

**Rules are enforced, not just documented.** Your coding standards, docs rules, and security policies are injected before every file write. The agent sees the relevant rules right when it matters.

**One knowledge base, every platform.** Capture a fieldnote in Claude Code — it's available in Cursor and OpenCode. No copying, no drift. [See it in action.](https://youtu.be/u2rkR1XeHZk)

**Complex work delegates to focused workers.** When work benefits from a fresh context window, the harness spawns workers loaded with curated skills and rules. Compound tasks split across parallel workers for maximum throughput.

## Before / After

**Without a harness** — Every session starts cold. You re-explain your project, the agent re-discovers API quirks, makes the same mistakes, and yesterday's debugging session is gone.

**With Lore** — The agent knows your project. Fieldnotes from last week load automatically. Rules are enforced at write-time. Active roadmaps surface at startup. Complex work delegates to focused workers.

## How It Works

Lore is a harness built from markdown files, hooks that shape agent behavior, and scripts that keep everything consistent.

- **Fieldnotes** (`~/.lore/knowledge-base/fieldnotes/`) — Snags and patterns captured from real work. Available in every session.
- **Skills** (`.lore/skills/`) — Procedural capabilities and reusable commands.
- **Rules** (`.lore/rules/`) — Behavioral constraints injected at write-time.
- **Agents** (`.lore/agents/`) — Worker agents for delegated tasks, loaded with relevant skills and fieldnotes per-task.
- **Hooks** (`.lore/harness/hooks/`) — Inject context at session start, enforce rules before writes, nudge knowledge capture during work.
- **Scripts** (`.lore/harness/scripts/`) — Platform sync, validation, projection.

All hooks are plain JavaScript you can read in minutes. They don't execute shell commands or access anything outside your project and global directories.

## Commands

| Command | What it does |
|---------|-------------|
| `/lore` | Show available subcommands |
| `/lore status` | Show instance health — version, hooks, skills, fieldnotes, active work |
| `/lore update` | Update harness files to the latest version |
| `/lore repair` | Diagnose and fix a harness bug in source |
| `/lore memory` | Start/stop the local Docker sidecar — semantic search + hot memory |
| `/lore memory burn` | Review hot cache facts, promote to persistent knowledge base |
| `/lore memory rem` | Knowledge defrag — restructure the KB |

## Platforms

| Platform | Integration | Maturity |
|----------|-------------|----------|
| **Claude Code** | Hooks + `CLAUDE.md` | Supported |
| **Gemini CLI** | Hooks + MCP + `GEMINI.md` | Supported |
| **Cursor** | Hooks + MCP server + `.mdc` rules | Experimental |
| **Windsurf** | `.windsurfrules` file | Experimental |
| **Roo Code** | `.clinerules` + MCP | Experimental |
| **OpenCode** | ESM plugins + `opencode.json` | Experimental |

All platforms share the same knowledge base. Skills, fieldnotes, agents, and rules written once sync to platform-specific formats automatically. Set `"platforms"` in `.lore/config.json` to control which platforms are active — the projector only generates files for active platforms and cleans up files for disabled ones. Omitting the field activates all platforms (backwards compatible).

## Documentation

Full docs: [lorehq.github.io/lore-docs](https://lorehq.github.io/lore-docs/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
