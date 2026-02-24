---
name: lore-update
description: Update Lore harness files to the latest version
type: command
user-invocable: true
allowed-tools: Bash, Read, Edit
---

# Update Lore

Pull the latest Lore harness files without touching operator content.

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
5. On approval, run **from the instance directory** (cwd), passing the harness repo clone as the argument:
   ```bash
   bash "$tmp/.lore/scripts/sync-harness.sh" "$tmp"
   ```
   **Direction: cwd = target instance, argument = source harness repo.** Getting this backwards overwrites the harness repo with stale instance files.
6. Update the `version` field in `.lore/config.json` to match the source
7. **Seed review** — compare `.lore/templates/seeds/conventions/` to operator convention files in `docs/context/conventions/`. For each seed template where the operator file exists and differs:
   - Show the diff (seed template vs operator file)
   - Ask the operator whether to adopt the updated seed or keep their version
   - Only overwrite operator files the operator explicitly approves
   Note: seed filenames may map differently (e.g., seed `docs.md` → operator `documentation.md`). Compare by content purpose, not filename.
8. Clean up: `rm -rf "$tmp"`
9. Report what changed

## What Gets Synced

**Overwritten (harness-owned):**
- `.lore/hooks/`, `.lore/lib/`, `.lore/scripts/`, `.opencode/`
- `.claude/settings.json`, `.lore/skills/<built-in>/`
- `.lore/instructions.md`, `.gitignore`, `opencode.json`
- `docs/context/conventions/system/`, `docs/knowledge/runbooks/system/`
- Generated copies (`CLAUDE.md`, `.cursor/rules/lore-*.mdc`) are also regenerated via `sync-platform-skills.sh`

**Seed files (opt-in update):**
- `.lore/templates/seeds/conventions/` — default convention content. Created on first install if missing. On update, diffs shown for operator review.

**Never touched (operator-owned):**
- `docs/` (except `system/` subdirs), `.lore/agents/`, `mkdocs.yml`
- `.lore/config.json`, `.lore/memory.local.md`, `.lore/operator.gitignore`

## Gotchas

- Always show the version diff and file list before syncing — never auto-update
- The sync script uses rsync semantics: overwrite existing, never delete operator files
- If the operator has modified a harness-owned file (e.g., edited CLAUDE.md), the update will overwrite it — warn about this
- Operator-specific ignores go in `.lore/operator.gitignore` (never overwritten). The sync script appends them after harness rules automatically — no manual re-adding needed
- If `.lore/links` exists, remind the operator to run `/lore-link --refresh` to update linked repos with the new hooks
- Always clean up the temp clone (`rm -rf "$tmp"`) even if sync fails — otherwise a `lore/` directory persists in the project root
