#!/usr/bin/env bash
# Links a work repo to this Lore hub so hooks fire from the hub.
# Generates lightweight configs in the target repo that delegate to hub hooks.
#
# Usage:
#   scripts/lore-link.sh <target>          — link a work repo
#   scripts/lore-link.sh --unlink <target> — remove link
#   scripts/lore-link.sh --list            — show linked repos
#   scripts/lore-link.sh --refresh         — regenerate all linked configs

set -euo pipefail

HUB="$(cd "$(dirname "$0")/.." && pwd)"
LINKS_FILE="$HUB/.lore-links"

die() { echo "Error: $1" >&2; exit 1; }

ensure_links_file() {
  [[ -f "$LINKS_FILE" ]] || echo '[]' > "$LINKS_FILE"
}

backup_if_exists() {
  if [[ -f "$1" ]]; then
    cp "$1" "$1.bak"
    echo "  Backed up: $1 → $1.bak"
  fi
}

GENERATED_FILES=(
  .lore
  .claude/settings.json
  .cursor/hooks.json
  .cursor/rules/lore.mdc
  CLAUDE.md
  .cursorrules
  .opencode/plugins/session-init.js
  .opencode/plugins/protect-memory.js
  .opencode/plugins/knowledge-tracker.js
  opencode.json
)

# -- link --
do_link() {
  local target
  target="$(cd "$1" && pwd)"

  [[ -f "$target/.lore-config" ]] && die "Target is a Lore instance — cannot link to itself"

  echo "Linking: $target → $HUB"

  # Backup existing files
  for f in "${GENERATED_FILES[@]}"; do
    backup_if_exists "$target/$f"
  done

  mkdir -p "$target/.claude" "$target/.cursor/rules" "$target/.opencode/plugins"

  # .lore marker
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  node -e "
    const fs = require('fs');
    fs.writeFileSync(process.argv[1], JSON.stringify({hub: process.argv[2], linked: process.argv[3]}, null, 2) + '\n');
  " "$target/.lore" "$HUB" "$now"

  # Claude Code hooks
  cat > "$target/.claude/settings.json" << SETTINGS
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/session-init.js\"" }]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/prompt-preamble.js\"" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Read",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/protect-memory.js\"" }]
      },
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/context-path-guide.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/knowledge-tracker.js\" || true" }]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "LORE_HUB=\"$HUB\" node \"$HUB/hooks/knowledge-tracker.js\" || true" }]
      }
    ]
  }
}
SETTINGS

  # Cursor hooks
  cat > "$target/.cursor/hooks.json" << CURSOR
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "LORE_HUB=\"$HUB\" node \"$HUB/.cursor/hooks/session-init.js\"" }
    ],
    "beforeReadFile": [
      { "command": "LORE_HUB=\"$HUB\" node \"$HUB/.cursor/hooks/protect-memory.js\"" }
    ],
    "afterFileEdit": [
      { "command": "LORE_HUB=\"$HUB\" node \"$HUB/.cursor/hooks/knowledge-tracker.js\"" }
    ],
    "afterShellExecution": [
      { "command": "LORE_HUB=\"$HUB\" node \"$HUB/.cursor/hooks/knowledge-tracker.js\"" }
    ]
  }
}
CURSOR

  # Instructions copies
  cp "$HUB/.lore/instructions.md" "$target/.cursor/rules/lore.mdc"
  cp "$HUB/.lore/instructions.md" "$target/CLAUDE.md"
  cp "$HUB/.lore/instructions.md" "$target/.cursorrules"

  # OpenCode plugin wrappers
  local name export_name
  for plugin in session-init:SessionInit protect-memory:ProtectMemory knowledge-tracker:KnowledgeTracker; do
    name="${plugin%%:*}"
    export_name="${plugin##*:}"
    cat > "$target/.opencode/plugins/$name.js" << PLUGIN
process.env.LORE_HUB = "$HUB";
const mod = await import("$HUB/.opencode/plugins/$name.js");
export const $export_name = mod.$export_name;
PLUGIN
  done

  # opencode.json
  cat > "$target/opencode.json" << OPENCODE
{
  "instructions": ["$HUB/.lore/instructions.md"]
}
OPENCODE

  # Add generated files to target .gitignore
  local begin="# Lore link (auto-generated) BEGIN"
  local end="# Lore link (auto-generated) END"
  if ! grep -qF "$begin" "$target/.gitignore" 2>/dev/null; then
    { echo ""; echo "$begin"; for f in "${GENERATED_FILES[@]}"; do echo "$f"; done; echo "$end"; } >> "$target/.gitignore"
  fi

  # Register in hub
  ensure_links_file
  node -e "
    const fs = require('fs');
    const file = process.argv[1], tp = process.argv[2], d = process.argv[3];
    const links = JSON.parse(fs.readFileSync(file, 'utf8'));
    const existing = links.find(l => l.path === tp);
    if (existing) existing.linked = d; else links.push({ path: tp, linked: d });
    fs.writeFileSync(file, JSON.stringify(links, null, 2) + '\n');
  " "$LINKS_FILE" "$target" "$now"

  echo "Linked successfully."
}

# -- unlink --
do_unlink() {
  local target
  target="$(cd "$1" && pwd)"

  echo "Unlinking: $target"

  for f in "${GENERATED_FILES[@]}"; do
    rm -f "$target/$f"
  done

  # Clean up empty directories
  rmdir "$target/.opencode/plugins" "$target/.opencode" 2>/dev/null || true
  rmdir "$target/.cursor/rules" "$target/.cursor" 2>/dev/null || true
  rmdir "$target/.claude" 2>/dev/null || true

  # Remove gitignore block (only the Lore-managed BEGIN/END section)
  if [[ -f "$target/.gitignore" ]]; then
    local begin="# Lore link (auto-generated) BEGIN"
    local end="# Lore link (auto-generated) END"
    node -e "
      const fs = require('fs');
      const p = process.argv[1], b = process.argv[2], e = process.argv[3];
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      let out = [], skip = false;
      for (const line of lines) {
        if (line === b) { skip = true; continue; }
        if (line === e) { skip = false; continue; }
        if (!skip) out.push(line);
      }
      fs.writeFileSync(p, out.join('\n').replace(/\n+$/, '') + '\n');
    " "$target/.gitignore" "$begin" "$end"
  fi

  # Deregister from hub
  ensure_links_file
  node -e "
    const fs = require('fs');
    const file = process.argv[1], tp = process.argv[2];
    const links = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify(links.filter(l => l.path !== tp), null, 2) + '\n');
  " "$LINKS_FILE" "$target"

  echo "Unlinked successfully."
}

# -- list --
do_list() {
  ensure_links_file
  local entries
  entries="$(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(l=>console.log(l.path+'|'+l.linked))" "$LINKS_FILE")"

  if [[ -z "$entries" ]]; then
    echo "No linked repos."
    return
  fi

  echo "Linked repos:"
  while IFS='|' read -r lpath ldate; do
    if [[ -d "$lpath" ]]; then
      echo "  $lpath (linked: $ldate)"
    else
      echo "  $lpath [STALE] (linked: $ldate)"
    fi
  done <<< "$entries"
}

# -- refresh --
do_refresh() {
  ensure_links_file
  local paths
  paths="$(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(l=>console.log(l.path))" "$LINKS_FILE")"

  if [[ -z "$paths" ]]; then
    echo "No linked repos to refresh."
    return
  fi

  while IFS= read -r lpath; do
    if [[ -d "$lpath" ]]; then
      do_link "$lpath"
    else
      echo "Skipping stale link: $lpath"
    fi
  done <<< "$paths"
}

# -- main --
case "${1:-}" in
  --unlink)  do_unlink "${2:?Usage: lore-link.sh --unlink <target>}" ;;
  --list)    do_list ;;
  --refresh) do_refresh ;;
  -h|--help)
    echo "Usage:"
    echo "  scripts/lore-link.sh <target>          Link a work repo"
    echo "  scripts/lore-link.sh --unlink <target> Remove link"
    echo "  scripts/lore-link.sh --list            Show linked repos"
    echo "  scripts/lore-link.sh --refresh         Regenerate all configs"
    ;;
  "") die "Missing target. Use --help for usage." ;;
  *)  do_link "$1" ;;
esac
