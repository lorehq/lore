#!/usr/bin/env bash
# Coordinated release: tags lore first, then create-lore.
# Both repos' release.yml workflows fire automatically on tag push.
#
# Usage: bash scripts/release.sh [version]
#
# If version is omitted, reads from package.json.
# Expects create-lore repo at ../create-lore (sibling directory).

set -euo pipefail

LORE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREATE_LORE_ROOT="$(cd "$LORE_ROOT/../create-lore" 2>/dev/null && pwd)" || true

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

# 2. Verify both repos are on main and clean
for repo in "$LORE_ROOT" "$CREATE_LORE_ROOT"; do
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

# 3. Verify versions match across both repos
lore_ver="$(node -p "JSON.parse(require('fs').readFileSync('$LORE_ROOT/package.json','utf8')).version")"
lore_cfg="$(node -p "JSON.parse(require('fs').readFileSync('$LORE_ROOT/.lore-config','utf8')).version")"
create_ver="$(node -p "JSON.parse(require('fs').readFileSync('$CREATE_LORE_ROOT/package.json','utf8')).version")"

if [[ "$lore_ver" != "$VERSION" ]]; then
  echo "FAIL: lore package.json is $lore_ver, expected $VERSION"
  echo "Run: npm version $VERSION --no-git-tag-version --prefix $LORE_ROOT"
  exit 1
fi
if [[ "$lore_cfg" != "$VERSION" ]]; then
  echo "FAIL: lore .lore-config is $lore_cfg, expected $VERSION"
  exit 1
fi
if [[ "$create_ver" != "$VERSION" ]]; then
  echo "FAIL: create-lore package.json is $create_ver, expected $VERSION"
  echo "Run: npm version $VERSION --no-git-tag-version --prefix $CREATE_LORE_ROOT"
  exit 1
fi

# 4. Verify tag doesn't already exist
for repo in "$LORE_ROOT" "$CREATE_LORE_ROOT"; do
  name="$(basename "$repo")"
  if git -C "$repo" tag -l "$TAG" | grep -q "$TAG"; then
    echo "FAIL: $name already has tag $TAG"
    exit 1
  fi
done

# 5. Verify both repos are up to date with remote
for repo in "$LORE_ROOT" "$CREATE_LORE_ROOT"; do
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

echo "OK: Both repos at $VERSION, clean, on main, up to date"
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

# -- Done --
echo "=== Release $TAG complete ==="
echo ""
echo "Both release workflows are now running:"
echo "  https://github.com/lorehq/lore/actions"
echo "  https://github.com/lorehq/create-lore/actions"
echo ""
echo "create-lore will verify the lore tag exists before publishing to npm."
echo "Monitor both workflows to confirm success."
