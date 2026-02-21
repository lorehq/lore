---
name: lore-update
description: Update Lore framework files to the latest version
type: command
user-invocable: true
allowed-tools: Bash, Read, Edit
---

# Update Lore

Pull the latest Lore framework files without touching operator content.

## When to Use

The operator types `/lore-update` to sync their instance with the latest Lore release.

## Process

1. Read current version from `.lore/config.json`
2. Clone the latest Lore template to a temp directory:
   ```bash
   tmp=$(mktemp -d) && [ -d "$tmp" ] || { echo "mktemp failed"; exit 1; }
   git clone --depth 1 https://github.com/lorehq/lore.git "$tmp"
   ```
   **Critical**: always pass `"$tmp"` as the target — omitting it clones into the working directory as `lore/`.
3. Read the source version from the cloned `.lore/config.json`
4. Show the operator: current version, new version, what will be synced
5. On approval, run:
   ```bash
   bash "$tmp/.lore/scripts/sync-framework.sh" "$tmp"
   ```
6. Update the `version` field in `.lore/config.json` to match the source
7. Clean up: `rm -rf "$tmp"`
8. Report what changed

## What Gets Synced

**Overwritten (framework-owned):**
- `.lore/hooks/`, `.lore/lib/`, `.lore/scripts/`, `.opencode/`
- `.claude/settings.json`, `.lore/skills/<built-in>/`
- `.lore/instructions.md`, `.gitignore`, `opencode.json`
- Generated copies (`CLAUDE.md`, `.cursor/rules/lore-*.mdc`) are also regenerated via `sync-platform-skills.sh`

**Never touched (operator-owned):**
- `docs/`, `.lore/agents/`, `mkdocs.yml`
- `.lore/config.json`, `.lore/memory.local.md`

## Gotchas

- Always show the version diff and file list before syncing — never auto-update
- The sync script uses rsync semantics: overwrite existing, never delete operator files
- If the operator has modified a framework file (e.g., edited CLAUDE.md), the update will overwrite it — warn about this
- `.gitignore` is framework-owned and gets overwritten on sync — operator-specific ignores (like `.env`) must be re-added after update, or added to the framework template
- If `.lore/links` exists, remind the operator to run `/lore-link --refresh` to update linked repos with the new hooks
- Always clean up the temp clone (`rm -rf "$tmp"`) even if sync fails — otherwise a `lore/` directory persists in the project root
