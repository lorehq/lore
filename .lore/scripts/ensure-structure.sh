#!/usr/bin/env bash
# Ensures every docs/ subdirectory has an index.md.
# Creates missing ones from the orphan template or a fallback heading.
#
# Env overrides (for Docker):
#   DOCS_DIR  — docs directory to scan (default: $REPO_ROOT/docs)
#   TPL_DIR   — templates directory (default: $REPO_ROOT/.lore/templates)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
DOCS_DIR="${DOCS_DIR:-$REPO_ROOT/docs}"
TPL_DIR="${TPL_DIR:-$REPO_ROOT/.lore/templates}"
ORPHAN_TPL="$TPL_DIR/orphan-index.md"

to_title() { echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1'; }

[[ -d "$DOCS_DIR" ]] || exit 0

while IFS= read -r -d '' dir; do
  [[ -f "$dir/index.md" ]] && continue
  name=$(basename "$dir")
  [[ "$name" == .* ]] && continue
  title=$(to_title "$name")
  if [[ -f "$ORPHAN_TPL" ]]; then
    sed "s/{{name}}/${title}/g" "$ORPHAN_TPL" > "$dir/index.md"
  else
    echo "# ${title}" > "$dir/index.md"
  fi
done < <(find "$DOCS_DIR" -mindepth 1 -type d -print0)
