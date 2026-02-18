# Commands

## Slash Commands

These appear in the TUI menu. Type the command name to invoke.

| Command | Description |
|---------|-------------|
| `/lore-capture` | Review session work, capture skills, update registries |
| `/lore-consolidate` | Deep health check — stale items, overlaps, knowledge drift |
| `/lore-link <target>` | Link a work repo so hooks fire from the hub in IDE workflows |
| `/lore-ui` | Start, stop, or check docs UI status (prefers Docker, falls back to local mkdocs) |
| `/lore-update` | Pull latest framework files |
| `/lore-status` | Instance health — version, hooks, skills, agents |

OpenCode slash menu entries are defined in `.opencode/commands/` and ship with these Lore commands by default.

Per-prompt reminders nudge delegation and task planning: use a task list for multi-step work, run independent subtasks in parallel subagents, and keep dependency-gated steps sequential.

## Keywords

These aren't in the slash menu but the agent recognizes them. Just ask naturally — "create a roadmap for X" works the same as typing the keyword.

| Keyword | Description |
|---------|-------------|
| `lore-create-roadmap` | Create a strategic roadmap |
| `lore-create-plan` | Create a tactical plan |
| `lore-create-brainstorm` | Save a brainstorm for future reference |
