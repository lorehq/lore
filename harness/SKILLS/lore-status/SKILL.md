---
name: lore-status
description: Show Lore installation status — version, directories, bundles, projections
type: command
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
---
# Status — Lore Installation Diagnostics

Show the current state of the Lore installation.

## Checks

Run each check and present results:

**1. Version**
```bash
lore version
```

**2. Global directory**
```bash
ls -la ~/.config/lore/
```
Verify: config.json exists, RULES/SKILLS/AGENTS/ have content, .harness/ exists.

**3. Installed bundles**
```bash
lore bundle list
```

**4. Project config** (if in a Lore project)
```bash
cat .lore/config.json 2>/dev/null
```
Show enabled bundles and platforms.

**5. Projection freshness**
```bash
ls -la .lore/.last-generated 2>/dev/null
```
Compare against source file mtimes. Report if stale.

**6. Projected files**
List platform files that exist on disk (CLAUDE.md, .cursor/rules/, etc.).

**7. Pre-lore backups**
```bash
find . -name '*.pre-lore' -maxdepth 3 2>/dev/null
```
If found, mention `/lore-migrate` to convert them.

Present results as a concise summary table.
