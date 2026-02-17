---
name: lore-update
description: Update Lore framework files to the latest version
domain: Orchestrator
scope: internal
user-invocable: true
allowed-tools: Bash, Read, Edit
---

# Update Lore

Pull the latest Lore framework files without touching operator content.

## When to Use

The operator types `/update-lore` to sync their instance with the latest Lore release.

## Process

1. Read current version from `.lore-config`
2. Clone the latest Lore template to a temp directory:
   ```bash
   tmp=$(mktemp -d)
   git clone --depth 1 https://github.com/lorehq/lore.git "$tmp"
   ```
3. Read the source version from the cloned `.lore-config`
4. Show the operator: current version, new version, what will be synced
5. On approval, run:
   ```bash
   bash "$tmp/scripts/sync-framework.sh" "$tmp"
   ```
6. Update the `version` field in `.lore-config` to match the source
7. Clean up: `rm -rf "$tmp"`
8. Report what changed

## What Gets Synced

**Overwritten (framework-owned):**
- `hooks/`, `scripts/`
- `.claude/settings.json`, `.claude/skills/<built-in>/`
- `CLAUDE.md`, `.gitignore`

**Never touched (operator-owned):**
- `docs/`, `.claude/agents/`, `mkdocs.yml`
- `.lore-config`, `MEMORY.local.md`, `*-registry.md`

## Gotchas

- Always show the version diff and file list before syncing — never auto-update
- The sync script uses rsync semantics: overwrite existing, never delete operator files
- If the operator has modified a framework file (e.g., edited CLAUDE.md), the update will overwrite it — warn about this
