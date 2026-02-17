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
  local dir="${1%/}" indent="$2"  # Strip trailing slash to avoid double-slash in paths
  [[ -d "$dir" ]] || return

  # Subdirectories first
  for subdir in "$dir"/*/; do
    [[ -d "$subdir" ]] || continue
    local name=$(basename "$subdir")
    [[ "$name" == .* ]] && continue   # Skip hidden dirs
    [[ "$name" == "archive" ]] && continue  # Skip archive dirs
    # Auto-scaffold: if dir has no index.md, create one from the dir name
    if [[ ! -f "${subdir%/}/index.md" ]]; then
      local scaffold_title=$(echo "$name" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
      echo "# ${scaffold_title}" > "${subdir%/}/index.md"
    fi

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
    [[ "$name" == "index" || "$name" == "README" || "$name" == "agent-rules" ]] && continue
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

# -- Curated nav sections in display order --
# Only sections listed here appear in nav. Each is included only when
# its folder exists AND contains at least one .md file (not just .gitkeep).
# To add a new top-level section, append its docs/ subfolder name here.
# NOTE: "work" is handled separately below with hardcoded subsection order.
NAV_SECTIONS=("context" "guides")

# Emit work subsections (roadmaps, plans, brainstorms) under Home.
# Work structure is framework-controlled — operators create items via
# /create-roadmap, /create-plan, /create-brainstorm but don't modify
# the folder structure itself.
emit_work_subsections() {
  local indent="$1"
  local work="$DOCS/work"
  [[ -d "$work" ]] && find "$work" -path '*/archive' -prune -o -name '*.md' -print | grep -q . || return 0

  # Fixed order: Roadmaps > Plans > Brainstorms
  for subsection in roadmaps plans brainstorms; do
    if [[ -d "$work/$subsection" ]] && find "$work/$subsection" -path '*/archive' -prune -o -name '*.md' -print | grep -q .; then
      title=$(echo "$subsection" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
      echo "${indent}- ${title}:"
      # Show subsection overview
      [[ -f "$work/$subsection/index.md" ]] && echo "${indent}    - Overview: work/$subsection/index.md"
      # Scan items within (each roadmap/plan/brainstorm folder)
      scan_dir "$work/$subsection" "${indent}    "
    fi
  done
}

# Write preserved header + fresh nav
{
  echo "$HEADER"
  echo "nav:"
  echo "  - Home:"
  echo "      - Overview: index.md"
  emit_work_subsections "      "

  for section in "${NAV_SECTIONS[@]}"; do
    # All sections: include if folder has .md content, scan dynamically
    if [[ -d "$DOCS/$section" ]] && find "$DOCS/$section" -name '*.md' | grep -q .; then
      title=$(echo "$section" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
      echo "  - ${title}:"
      [[ -f "$DOCS/$section/index.md" ]] && echo "      - Overview: $section/index.md"
      # Agent rules pinned after overview in context section
      if [[ "$section" == "context" && -f "$DOCS/$section/agent-rules.md" ]]; then
        echo "      - Agent Rules: $section/agent-rules.md"
      fi
      scan_dir "$DOCS/$section" "      "
    fi
  done
} > "$OUTPUT"

# Clear the nav-dirty flag (set by post-edit-reminder.js when docs/ files change).
# This signals that nav is now in sync with the docs/ directory structure.
rm -f "$REPO_ROOT/.git/lore-nav-dirty"

echo "Generated $OUTPUT"
