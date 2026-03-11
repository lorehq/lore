# Lore

**A unified harness abstraction over agentic vendor tooling.**

[![CI](https://github.com/lorehq/lore/actions/workflows/test.yml/badge.svg)](https://github.com/lorehq/lore/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/lorehq/lore)](https://github.com/lorehq/lore/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Go](https://img.shields.io/badge/go-%3E%3D1.24-00ADD8)](https://go.dev/)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Copilot%20%7C%20Cursor%20%7C%20Gemini%20CLI%20%7C%20Windsurf%20%7C%20OpenCode-purple)]()

Lore manages rules, skills, and agents, then projects them into every platform's native format. Write once, works everywhere. A single Go binary with zero runtime dependencies.

## Quick Start

```bash
# Install
npm install -g @lorehq/cli

# Initialize a new project
cd my-project
lore init

# Generate platform-native files
lore generate
```

Or install from source:

```bash
go install github.com/lorehq/lore@latest
```

Set `"platforms"` in `.lore/config.json` to control which platforms are active. The projector only generates files for enabled platforms.

## What You Get

**Sessions accelerate instead of resetting.** The harness loads your project identity, rules, active work, available agents, and a map of everything your agent knows at session start. No re-explaining.

**One knowledge base, every platform.** Capture a fieldnote in Claude Code -- it's available in Cursor, Copilot, and OpenCode. No copying, no drift. [See it in action.](https://youtu.be/u2rkR1XeHZk)

**Rules are enforced, not just documented.** Your coding standards and security policies are injected before every file write via hooks. The agent sees the relevant rules right when it matters.

**Snags become fieldnotes that persist.** When your agent hits an API quirk or a deployment snag, it captures a fieldnote. That fieldnote loads in every future session. The mistake happens once, the fix persists.

**Complex work delegates to focused workers.** When work benefits from a fresh context window, the harness spawns workers loaded with curated skills and rules.

## How It Works

Lore is a Go binary that centrally manages the three standard components of an agentic system -- **rules**, **skills**, and **agents** -- and projects them into every platform's native format. It also exposes a unified hook lifecycle interface across platforms.

### Global Directory (`~/.config/lore/`)

```
~/.config/lore/
├── config.json          # Platform config (registryUrl)
├── .cache/
│   └── registry.json    # Cached marketplace registry
├── RULES/               # Operator's global rules
├── SKILLS/              # Operator's global skills
├── AGENTS/              # Operator's global agents
└── MCP/                 # Operator's global MCP servers
```

The global directory holds platform configuration and the operator's own agentic content (rules, skills, agents). Behavioral scripts, memory, and services belong to packages (e.g., `~/.lore-os/`), not the platform directory.

### Project Instances

```
my-project/
├── .lore/
│   ├── config.json       # Project config
│   ├── RULES/            # Project-specific rules
│   ├── SKILLS/           # Project-specific skills
│   ├── AGENTS/           # Project-specific agents
│   ├── MCP/              # Project MCP servers
│   └── LORE.md           # Project instructions
├── CLAUDE.md             # Generated platform projection
└── src/
```

When `lore generate` runs, three layers merge: harness system content, global operator content, and project-local overrides. The result is emitted as platform-native files.

## Commands

### Slash commands (in-session)

| Command | What it does |
|---------|-------------|
| `/lore` | Show available subcommands |
| `/lore status` | Show instance health -- version, hooks, skills, fieldnotes, active work |
| `/lore memory` | Start/stop the local Docker memory engine |
| `/lore memory burn` | Promote hot cache facts to the persistent DATABANK |

### CLI commands (terminal)

| Command | What it does |
|---------|-------------|
| `lore` | Launch the TUI dashboard |
| `lore init` | Scaffold a new Lore project |
| `lore generate` | Run composition and projection |
| `lore memory start\|stop\|status` | Docker memory engine lifecycle |
| `lore hook <event>` | Hook handler (called by platforms, not users) |

## Platforms

| Platform | Target files |
|----------|-------------|
| **Claude Code** | `CLAUDE.md`, `.claude/` |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/hooks/`, `AGENTS.md` |
| **Cursor** | `.cursor/rules/*.mdc`, `.cursor/hooks.json`, `AGENTS.md` |
| **Gemini CLI** | `GEMINI.md`, `.gemini/` |
| **Windsurf** | `.windsurfrules`, `.windsurf/` |
| **OpenCode** | `AGENTS.md`, `.opencode/` |

All platforms share the same knowledge base. Rules, skills, agents, and fieldnotes written once are projected into platform-specific formats automatically.

## Documentation

Full docs: [lorehq.github.io/lore-docs](https://lorehq.github.io/lore-docs/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
