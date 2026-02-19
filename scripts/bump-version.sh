#!/usr/bin/env bash
# Bump version across ALL files in both repos at once.
#
# Usage: bash scripts/bump-version.sh <version>
#
# Updates:
#   lore/package.json
#   lore/package-lock.json
#   lore/.lore-config
#   lore/SECURITY.md (supported versions table)
#   create-lore/package.json  (if sibling repo exists)
#
# Expects create-lore repo at ../create-lore (sibling directory).

set -euo pipefail

LORE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREATE_LORE_ROOT="$(cd "$LORE_ROOT/../create-lore" 2>/dev/null && pwd)" || true

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: bash scripts/bump-version.sh <version>"
  echo "Example: bash scripts/bump-version.sh 0.9.0"
  exit 1
fi

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "FAIL: '$VERSION' is not valid semver (expected X.Y.Z)"
  exit 1
fi

CURRENT="$(node -p "require('$LORE_ROOT/package.json').version")"
echo "=== Bumping $CURRENT → $VERSION ==="
echo ""

# -- lore/package.json --
echo "  lore/package.json"
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$LORE_ROOT/package.json', 'utf8'));
  p.version = '$VERSION';
  fs.writeFileSync('$LORE_ROOT/package.json', JSON.stringify(p, null, 2) + '\n');
"

# -- lore/package-lock.json --
if [[ -f "$LORE_ROOT/package-lock.json" ]]; then
  echo "  lore/package-lock.json"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$LORE_ROOT/package-lock.json', 'utf8'));
    p.version = '$VERSION';
    if (p.packages && p.packages['']) p.packages[''].version = '$VERSION';
    fs.writeFileSync('$LORE_ROOT/package-lock.json', JSON.stringify(p, null, 2) + '\n');
  "
fi

# -- lore/.lore-config --
echo "  lore/.lore-config"
node -e "
  const fs = require('fs');
  const c = JSON.parse(fs.readFileSync('$LORE_ROOT/.lore-config', 'utf8'));
  c.version = '$VERSION';
  fs.writeFileSync('$LORE_ROOT/.lore-config', JSON.stringify(c, null, 2) + '\n');
"

# -- lore/SECURITY.md --
echo "  lore/SECURITY.md"
MAJOR_MINOR="${VERSION%.*}"
sed -i "s/| [0-9]*\.[0-9]*\.x *| Yes/| ${MAJOR_MINOR}.x   | Yes/" "$LORE_ROOT/SECURITY.md"

# -- create-lore/package.json --
if [[ -n "$CREATE_LORE_ROOT" && -d "$CREATE_LORE_ROOT" ]]; then
  echo "  create-lore/package.json"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$CREATE_LORE_ROOT/package.json', 'utf8'));
    p.version = '$VERSION';
    fs.writeFileSync('$CREATE_LORE_ROOT/package.json', JSON.stringify(p, null, 2) + '\n');
  "

  if [[ -f "$CREATE_LORE_ROOT/package-lock.json" ]]; then
    echo "  create-lore/package-lock.json"
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$CREATE_LORE_ROOT/package-lock.json', 'utf8'));
      p.version = '$VERSION';
      if (p.packages && p.packages['']) p.packages[''].version = '$VERSION';
      fs.writeFileSync('$CREATE_LORE_ROOT/package-lock.json', JSON.stringify(p, null, 2) + '\n');
    "
  fi
else
  echo "  SKIP: create-lore not found at $LORE_ROOT/../create-lore"
fi

echo ""
echo "=== Done. Verify with: bash scripts/check-version-sync.sh ==="
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff (in both repos)"
echo "  2. Commit version bumps in both repos"
echo "  3. Release: bash scripts/release.sh $VERSION"
