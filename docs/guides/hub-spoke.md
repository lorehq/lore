# Hub & Spoke

Lore uses a hub-spoke architecture. One **source repo** (the hub) defines the framework — hooks, scripts, skills, and docs scaffolding. **Instances** (the spokes) are created from it and sync updates from it over time.

## How It Works

```
Source (lore)
  ├── Instance A
  ├── Instance B
  └── Instance C
```

The source repo is a template. `npx create-lore` clones it into a new instance. Each instance owns its `docs/`, agents, and work items — the framework never touches operator content.

## Syncing

Instances pull framework updates with `/lore-update`. This overwrites framework-owned files (hooks, scripts, built-in skills, CLAUDE.md, .gitignore) but never touches operator-owned files (docs, agents, mkdocs.yml, registries).

Updates flow **one direction only** — source to instance. If you modify a framework file in an instance, the next `/lore-update` will overwrite it.

## Contributing Back

To change framework behavior, edit the source repo directly — not your instance. Commit and push there, then `/lore-update` from any instance to pick up the change.

