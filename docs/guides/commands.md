# Commands

## Slash Commands

These appear in the TUI menu. Type the command name to invoke.

| Command | Description |
|---------|-------------|
| `/lore-capture` | Review session work, capture skills, update registries |
| `/lore-consolidate` | Deep health check — stale items, overlaps, knowledge drift |
| `/lore-ui` | Start, stop, or check docs UI status (prefers Docker, falls back to local mkdocs) |
| `/lore-update` | Pull latest framework files |
| `/lore-status` | Instance health — version, hooks, skills, agents |
| `/lore-commands-check` | OpenCode smoke check for required `.opencode/commands` files |

OpenCode slash menu entries are defined in `.opencode/commands/` and ship with these Lore commands by default.

## Keywords

These aren't in the slash menu but the agent recognizes them. Just ask naturally — "create a roadmap for X" works the same as typing the keyword.

| Keyword | Description |
|---------|-------------|
| `lore-create-roadmap` | Create a strategic roadmap |
| `lore-create-plan` | Create a tactical plan |
| `lore-create-brainstorm` | Save a brainstorm for future reference |

## Scripts

These run in the terminal, not in agent chat.

| Script | What it does |
|--------|-------------|
| `scripts/lore-link.sh <target>` | Link a work repo — hooks fire from hub |
| `scripts/lore-link.sh --unlink <target>` | Remove link from a work repo |
| `scripts/lore-link.sh --list` | Show linked repos with stale detection |
| `scripts/lore-link.sh --refresh` | Regenerate configs in all linked repos |
