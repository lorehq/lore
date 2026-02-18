# Commands

## Slash Commands

These appear in the TUI menu. Type the command name to invoke.

| Command | Description |
|---------|-------------|
| `/capture` | Review session work, capture skills, update registries |
| `/consolidate` | Deep health check — stale items, overlaps, knowledge drift |
| `/serve-docs` | Local docs site with live reload |
| `/serve-docs-docker` | Docs via Docker (no Python needed) |
| `/stop-docs` | Stop the docs server |
| `/lore-update` | Pull latest framework files |
| `/lore-status` | Instance health — version, hooks, skills, agents |

## Keywords

These aren't in the slash menu but the agent recognizes them. Just ask naturally — "create a roadmap for X" works the same as typing the keyword.

| Keyword | Description |
|---------|-------------|
| `create-roadmap` | Create a strategic roadmap |
| `create-plan` | Create a tactical plan |
| `create-brainstorm` | Save a brainstorm for future reference |

## Scripts

These run in the terminal, not in agent chat.

| Script | What it does |
|--------|-------------|
| `scripts/lore-link.sh <target>` | Link a work repo — hooks fire from hub |
| `scripts/lore-link.sh --unlink <target>` | Remove link from a work repo |
| `scripts/lore-link.sh --list` | Show linked repos with stale detection |
| `scripts/lore-link.sh --refresh` | Regenerate configs in all linked repos |
