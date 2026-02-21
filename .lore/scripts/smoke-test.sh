#!/usr/bin/env bash
# Smoke test: verify a fresh clone can bootstrap successfully.
# Copies the repo to a temp dir (excluding gitignored content),
# then runs sticky file creation, banner build, nav generation,
# and consistency validation.
#
# Usage: bash .lore/scripts/smoke-test.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "=== Smoke Test ==="
echo "Source: $REPO_ROOT"
echo "Work dir: $WORK"

# Copy repo excluding .git and gitignored runtime artifacts
tar cf - \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='docs/knowledge/local' \
  -C "$REPO_ROOT" . | tar xf - -C "$WORK"

cd "$WORK"

# 1. Sticky file bootstrap
echo "--- Sticky files ---"
node -e "require('./.lore/lib/banner').ensureStickyFiles('.')"
[[ -f docs/knowledge/local/index.md ]] || { echo "FAIL: docs/knowledge/local/index.md not created"; exit 1; }
[[ -f docs/context/agent-rules.md ]] || { echo "FAIL: docs/context/agent-rules.md not created"; exit 1; }
[[ -d docs/context/conventions ]] || { echo "FAIL: docs/context/conventions/ not created"; exit 1; }
[[ -f .lore/memory.local.md ]] || { echo "FAIL: .lore/memory.local.md not created"; exit 1; }
echo "OK"

# 2. Banner builds without error
echo "--- Banner build ---"
banner=$(node -e "const { buildBanner } = require('./.lore/lib/banner'); console.log(buildBanner('.'))")
[[ -n "$banner" ]] || { echo "FAIL: empty banner"; exit 1; }
echo "$banner" | grep -q "=== LORE" || { echo "FAIL: banner missing header"; exit 1; }
echo "OK"

# 3. Nav generates
echo "--- Nav generation ---"
bash .lore/scripts/generate-nav.sh
[[ -f mkdocs.yml ]] || { echo "FAIL: mkdocs.yml not generated"; exit 1; }
grep -q "^nav:" mkdocs.yml || { echo "FAIL: mkdocs.yml missing nav section"; exit 1; }
echo "OK"

# 4. Consistency validation
echo "--- Consistency ---"
bash .lore/scripts/validate-consistency.sh

# 5. Version sync (if both files exist)
echo "--- Version sync ---"
if [[ -f .lore/config.json && -f package.json ]]; then
  bash .lore/scripts/check-version-sync.sh
else
  echo "SKIP (no package.json — not a source repo)"
fi

echo ""
echo "=== Smoke test passed ==="
