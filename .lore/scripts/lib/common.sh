#!/usr/bin/env bash
# Shared shell functions for Lore scripts.

# Extract a field value from YAML frontmatter between --- markers.
# Usage: extract_field <field_name> <file_path>
extract_field() {
  awk -v field="$1" '
    /^---$/ { if (in_fm) exit; in_fm=1; next }
    in_fm && $1 == field":" { sub("^" field ": *", ""); print; exit }
  ' "$2" 2>/dev/null
}
