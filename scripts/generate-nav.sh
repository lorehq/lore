#!/usr/bin/env bash
# Generates mkdocs.yml by scanning docs/ for directories and markdown files.
# Discovers structure dynamically — add any folder to docs/ and re-run.
#
# Output: mkdocs.yml with Material theme, mermaid support, and auto-nav.
# Usage: bash scripts/generate-nav.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS="$REPO_ROOT/docs"
OUTPUT="$REPO_ROOT/mkdocs.yml"

# Recursively scan a directory and emit mkdocs nav entries.
# Processes subdirectories first (alphabetically), then loose .md files.
# If a subdir contains index.md, it becomes the "Overview" link.
scan_dir() {
  local dir="$1" indent="$2"
  [[ -d "$dir" ]] || return

  # Subdirectories first
  for subdir in "$dir"/*/; do
    [[ -d "$subdir" ]] || continue
    local name=$(basename "$subdir")
    [[ "$name" == .* ]] && continue   # Skip hidden dirs
    [[ "$name" == "archive" ]] && continue  # Skip archive dirs

    # Convert kebab-case dir name to Title Case for nav label
    local title=$(echo "$name" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
    echo "${indent}- ${title}:"

    # Use index.md as the section overview if it exists
    local rel="${subdir#$DOCS/}"
    [[ -f "${subdir}index.md" ]] && echo "${indent}    - Overview: ${rel}index.md"

    scan_dir "$subdir" "${indent}    "
  done

  # Then standalone .md files (skip index.md and README — handled above)
  for file in "$dir"/*.md; do
    [[ -f "$file" ]] || continue
    local name=$(basename "$file" .md)
    [[ "$name" == "index" || "$name" == "README" ]] && continue
    local relative="${file#$DOCS/}"
    local title=$(echo "$name" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
    echo "${indent}- ${title}: ${relative}"
  done
}

# -- Preserve everything above nav, regenerate nav only --
if [[ -f "$OUTPUT" ]]; then
  # Extract everything before the nav: line
  HEADER=$(sed '/^nav:/,$d' "$OUTPUT")
else
  # No mkdocs.yml exists — write a minimal header
  HEADER='site_name: Lore
docs_dir: docs
theme:
  name: material
markdown_extensions:
  - tables
  - toc:
      permalink: true
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
plugins:
  - search
'
fi

# Write preserved header + fresh nav
{
  echo "$HEADER"
  echo "nav:"
  echo "  - Home: index.md"

  if [[ -d "$DOCS/work" ]]; then
    echo "  - Work:"
    scan_dir "$DOCS/work" "      "
  fi

  if [[ -d "$DOCS/environment" ]]; then
    echo "  - Environment:"
    scan_dir "$DOCS/environment" "      "
  fi

  if [[ -d "$DOCS/runbooks" ]]; then
    echo "  - Runbooks:"
    scan_dir "$DOCS/runbooks" "      "
  fi
} > "$OUTPUT"

echo "Generated $OUTPUT"
