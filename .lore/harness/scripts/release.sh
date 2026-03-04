#!/usr/bin/env bash
# Coordinated release: tags lore, create-lore, and lore-memory.
# All repos' release.yml workflows fire automatically on tag push.
#
# Usage: bash .lore/harness/scripts/release.sh [version]
#
# If version is omitted, reads from package.json.
# Expects create-lore repo at ../create-lore (sibling directory).
# Expects lore-memory repo at ../lore-memory (optional — warns if missing).

set -euo pipefail

LORE_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CREATE_LORE_ROOT="$(cd "$LORE_ROOT/../create-lore" 2>/dev/null && pwd)" || true
LORE_MEMORY_ROOT="$(cd "$LORE_ROOT/../lore-memory" 2>/dev/null && pwd)" || true

# -- Resolve version --
if [[ -n "${1:-}" ]]; then
  VERSION="$1"
else
  VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$LORE_ROOT/package.json','utf8')).version")"
fi
TAG="v$VERSION"

echo "=== Release $TAG ==="
echo ""

# -- Preflight checks --
echo "--- Preflight ---"

# 1. Verify create-lore repo exists
if [[ -z "$CREATE_LORE_ROOT" || ! -d "$CREATE_LORE_ROOT" ]]; then
  echo "FAIL: create-lore repo not found at $LORE_ROOT/../create-lore"
  echo "Clone it there or set up the sibling directory structure."
  exit 1
fi

# 1b. Check lore-memory repo (optional — warn and skip if missing)
HAS_LORE_MEMORY=false
if [[ -n "$LORE_MEMORY_ROOT" && -d "$LORE_MEMORY_ROOT" ]]; then
  HAS_LORE_MEMORY=true
else
  echo "WARN: lore-memory repo not found at $LORE_ROOT/../lore-memory — skipping"
fi

# 2. Verify all repos are on main and clean
REPOS=("$LORE_ROOT" "$CREATE_LORE_ROOT")
if [[ "$HAS_LORE_MEMORY" == true ]]; then
  REPOS+=("$LORE_MEMORY_ROOT")
fi
for repo in "${REPOS[@]}"; do
  name="$(basename "$repo")"
  branch="$(git -C "$repo" branch --show-current)"
  if [[ "$branch" != "main" ]]; then
    echo "FAIL: $name is on branch '$branch', expected 'main'"
    exit 1
  fi
  if ! git -C "$repo" diff --quiet || ! git -C "$repo" diff --cached --quiet; then
    echo "FAIL: $name has uncommitted changes"
    exit 1
  fi
done

# 3. Verify versions match across repos (lore + create-lore only — lore-memory is tag-driven)
lore_ver="$(node -p "JSON.parse(require('fs').readFileSync('$LORE_ROOT/package.json','utf8')).version")"
lore_cfg="$(node -p "JSON.parse(require('fs').readFileSync('$LORE_ROOT/.lore/config.json','utf8')).version")"
create_ver="$(node -p "JSON.parse(require('fs').readFileSync('$CREATE_LORE_ROOT/package.json','utf8')).version")"

if [[ "$lore_ver" != "$VERSION" ]]; then
  echo "FAIL: lore package.json is $lore_ver, expected $VERSION"
  echo "Run: npm version $VERSION --no-git-tag-version --prefix $LORE_ROOT"
  exit 1
fi
if [[ "$lore_cfg" != "$VERSION" ]]; then
  echo "FAIL: lore .lore/config.json is $lore_cfg, expected $VERSION"
  exit 1
fi
if [[ "$create_ver" != "$VERSION" ]]; then
  echo "FAIL: create-lore package.json is $create_ver, expected $VERSION"
  echo "Run: npm version $VERSION --no-git-tag-version --prefix $CREATE_LORE_ROOT"
  exit 1
fi

# 4. Verify tag doesn't already exist
for repo in "${REPOS[@]}"; do
  name="$(basename "$repo")"
  if git -C "$repo" tag -l "$TAG" | grep -q "$TAG"; then
    echo "FAIL: $name already has tag $TAG"
    exit 1
  fi
done

# 5. Verify all repos are up to date with remote
for repo in "${REPOS[@]}"; do
  name="$(basename "$repo")"
  git -C "$repo" fetch origin main --quiet
  local_sha="$(git -C "$repo" rev-parse HEAD)"
  remote_sha="$(git -C "$repo" rev-parse origin/main)"
  if [[ "$local_sha" != "$remote_sha" ]]; then
    echo "FAIL: $name is not up to date with origin/main"
    echo "  local:  $local_sha"
    echo "  remote: $remote_sha"
    exit 1
  fi
done

if [[ "$HAS_LORE_MEMORY" == true ]]; then
  echo "OK: All three repos at $VERSION, clean, on main, up to date"
else
  echo "OK: lore + create-lore at $VERSION, clean, on main, up to date"
fi
echo ""

# -- Tag lore first --
echo "--- Tagging lore $TAG ---"
git -C "$LORE_ROOT" tag -a "$TAG" -m "Release $TAG"
git -C "$LORE_ROOT" push origin "$TAG"
echo "OK: lore tagged and pushed"
echo ""

# -- Tag create-lore second --
echo "--- Tagging create-lore $TAG ---"
git -C "$CREATE_LORE_ROOT" tag -a "$TAG" -m "Release $TAG"
git -C "$CREATE_LORE_ROOT" push origin "$TAG"
echo "OK: create-lore tagged and pushed"
echo ""

# -- Tag lore-memory third (if present) --
if [[ "$HAS_LORE_MEMORY" == true ]]; then
  echo "--- Tagging lore-memory $TAG ---"
  git -C "$LORE_MEMORY_ROOT" tag -a "$TAG" -m "Release $TAG"
  git -C "$LORE_MEMORY_ROOT" push origin "$TAG"
  echo "OK: lore-memory tagged and pushed"
  echo ""
fi

# -- Done --
echo "=== Release $TAG complete ==="
echo ""
echo "Release workflows are now running:"
echo "  https://github.com/lorehq/lore/actions"
echo "  https://github.com/lorehq/create-lore/actions"
if [[ "$HAS_LORE_MEMORY" == true ]]; then
  echo "  https://github.com/lorehq/lore-memory/actions"
fi
echo ""
echo "create-lore will verify the lore tag exists before publishing to npm."
if [[ "$HAS_LORE_MEMORY" == true ]]; then
  echo "lore-memory will build and push the versioned Docker image."
fi
echo "Monitor all workflows to confirm success."
