#!/usr/bin/env bash
# Cross-platform VM test: install + projection + idempotence.
# Runs in Bash on Linux/macOS, Git Bash on Windows.
#
# Usage: bash .lore/harness/scripts/vm-test.sh
#
# Phases:
#   0 — Environment validation
#   1 — Install (npx create-lore)
#   2 — Projection + global dir resolution
#   3 — Idempotence
#   4 — Windows-only checks
#   5 — Per-platform isolation

set -uo pipefail

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
RESULTS=()
WORK=""
PROJECT_DIR=""
FAKE_GLOBAL=""

IS_WINDOWS=false
if [[ "${OS:-}" == "Windows_NT" ]] || uname -s | grep -qi mingw; then
  IS_WINDOWS=true
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() {
  PASS=$((PASS + 1))
  RESULTS+=("  PASS  $1")
  echo "  PASS  $1"
}

fail() {
  FAIL=$((FAIL + 1))
  RESULTS+=("  FAIL  $1${2:+ — $2}")
  echo "  FAIL  $1${2:+ — $2}" >&2
}

check() {
  # check "label" <command...>
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label"
  fi
}

file_exists()  { [[ -f "$1" ]]; }
dir_exists()   { [[ -d "$1" ]]; }
file_contains() { grep -q "$2" "$1" 2>/dev/null; }

cleanup() {
  if [[ -n "$WORK" && -d "$WORK" ]]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Environment info
# ---------------------------------------------------------------------------
print_env() {
  echo "=== Cross-Platform VM Test ==="
  echo ""
  echo "OS:        $(uname -s) $(uname -r)"
  echo "Node:      $(node --version 2>/dev/null || echo 'NOT FOUND')"
  echo "npm:       $(npm --version 2>/dev/null || echo 'NOT FOUND')"
  echo "Git:       $(git --version 2>/dev/null || echo 'NOT FOUND')"
  echo "HOME:      ${HOME:-<unset>}"
  echo "USERPROFILE: ${USERPROFILE:-<unset>}"
  echo "Windows:   $IS_WINDOWS"
  echo ""
}

# ---------------------------------------------------------------------------
# Phase 0 — Environment validation
# ---------------------------------------------------------------------------
phase0() {
  echo "--- Phase 0: Environment validation ---"

  # Node >= 18
  if command -v node >/dev/null 2>&1; then
    local node_major
    node_major=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
    if [[ "$node_major" -ge 18 ]]; then
      pass "Node >= 18 (v$node_major)"
    else
      fail "Node >= 18" "found v$node_major"
    fi
  else
    fail "Node present"
  fi

  check "npm present" command -v npm
  check "git present" command -v git

  # HOME or USERPROFILE resolves
  local home_dir="${HOME:-${USERPROFILE:-}}"
  if [[ -n "$home_dir" && -d "$home_dir" ]]; then
    pass "HOME or USERPROFILE resolves ($home_dir)"
  else
    fail "HOME or USERPROFILE resolves"
  fi
}

# ---------------------------------------------------------------------------
# Phase 1 — Install
# ---------------------------------------------------------------------------
phase1() {
  echo ""
  echo "--- Phase 1: Install (npx create-lore) ---"

  WORK=$(mktemp -d)
  PROJECT_DIR="$WORK/test-project"

  # Run the installer
  if (cd "$WORK" && npx create-lore@latest --platforms claude,gemini,windsurf,cursor,opencode,roocode test-project 2>&1); then
    pass "npx create-lore exits 0"
  else
    fail "npx create-lore exits 0" "installer returned non-zero"
    return 1
  fi

  # Project directory created
  check "project directory created" dir_exists "$PROJECT_DIR"

  # .lore/config.json valid with name + created fields
  if file_exists "$PROJECT_DIR/.lore/config.json"; then
    local cfg_valid
    cfg_valid=$(node -e "
      const c = JSON.parse(require('fs').readFileSync('$PROJECT_DIR/.lore/config.json','utf8')
        .replace(/\/\/.*/g,'').replace(/,(\s*[}\]])/g,'\$1'));
      console.log(c.name && c.created ? 'ok' : 'missing-fields');
    " 2>/dev/null)
    if [[ "$cfg_valid" == "ok" ]]; then
      pass "config.json has name + created"
    else
      fail "config.json has name + created"
    fi
  else
    fail "config.json exists"
  fi

  # Harness directories
  check "harness hooks/ present" dir_exists "$PROJECT_DIR/.lore/harness/hooks"
  check "harness lib/ present" dir_exists "$PROJECT_DIR/.lore/harness/lib"
  check "harness templates/ present" dir_exists "$PROJECT_DIR/.lore/harness/templates"

  # .git initialized
  check ".git/ initialized" dir_exists "$PROJECT_DIR/.git"

  # Platform files
  check "CLAUDE.md present" file_exists "$PROJECT_DIR/CLAUDE.md"
  check ".claude/settings.json present" file_exists "$PROJECT_DIR/.claude/settings.json"
  check ".lore/memory.local.md present" file_exists "$PROJECT_DIR/.lore/memory.local.md"
  check ".env present" file_exists "$PROJECT_DIR/.env"

  # Hooks wired in settings.json
  if file_exists "$PROJECT_DIR/.claude/settings.json"; then
    check "hooks wired in settings.json" file_contains "$PROJECT_DIR/.claude/settings.json" "session-init"
  else
    fail "hooks wired (settings.json missing)"
  fi
}

# ---------------------------------------------------------------------------
# Phase 2 — Projection + global dir resolution
# ---------------------------------------------------------------------------
phase2() {
  echo ""
  echo "--- Phase 2: Projection + global dir resolution ---"

  # Scaffold a fake global ~/.lore for testing
  FAKE_GLOBAL="$WORK/fake-global-lore"
  mkdir -p "$FAKE_GLOBAL/knowledge-base/fieldnotes/test-vm-fieldnote"
  mkdir -p "$FAKE_GLOBAL/knowledge-base/runbooks"
  mkdir -p "$FAKE_GLOBAL/rules"

  cat > "$FAKE_GLOBAL/config.json" <<'GCFG'
{
  "name": "global-test",
  "version": "0.15.0"
}
GCFG

  cat > "$FAKE_GLOBAL/knowledge-base/fieldnotes/test-vm-fieldnote/FIELDNOTE.md" <<'FN'
---
name: test-vm-fieldnote
description: Test fieldnote for VM validation
---

This is a test fieldnote.
FN

  cat > "$FAKE_GLOBAL/knowledge-base/runbooks/test-vm-runbook.md" <<'RB'
---
name: test-vm-runbook
---

# Test VM Runbook

Steps go here.
RB

  cat > "$FAKE_GLOBAL/rules/test-rule.md" <<'RL'
---
domain: general
---

# Test Rule

Always test before shipping.
RL

  # Override HOME to point at fake global parent
  local orig_home="${HOME:-}"
  export HOME="$WORK/fake-global-lore-parent"
  mkdir -p "$HOME"
  # Symlink or copy .lore into the fake HOME
  if $IS_WINDOWS; then
    cp -r "$FAKE_GLOBAL" "$HOME/.lore"
  else
    ln -s "$FAKE_GLOBAL" "$HOME/.lore"
  fi

  # --- getGlobalPath resolves ---
  local resolved
  resolved=$(cd "$PROJECT_DIR" && node -e "
    const { getGlobalPath } = require('./.lore/harness/lib/config');
    process.stdout.write(getGlobalPath());
  " 2>/dev/null)
  if [[ -d "$resolved" ]]; then
    pass "getGlobalPath() resolves to existing directory"
  else
    fail "getGlobalPath() resolves" "got: $resolved"
  fi

  # --- Config merging: local name overrides global ---
  local merged_name
  merged_name=$(cd "$PROJECT_DIR" && node -e "
    const { getConfig } = require('./.lore/harness/lib/config');
    const c = getConfig('.');
    process.stdout.write(c.name || '');
  " 2>/dev/null)
  if [[ "$merged_name" == "test-project" ]]; then
    pass "config merge: local name overrides global"
  else
    fail "config merge: local name overrides global" "got: $merged_name"
  fi

  # --- buildStaticBanner includes global fieldnote, runbook, rules ---
  local banner
  banner=$(cd "$PROJECT_DIR" && node -e "
    const { buildStaticBanner } = require('./.lore/harness/lib/banner');
    buildStaticBanner('.').then(b => process.stdout.write(b));
  " 2>/dev/null)

  if echo "$banner" | grep -q "test-vm-fieldnote"; then
    pass "banner includes global fieldnote"
  else
    fail "banner includes global fieldnote"
  fi

  if echo "$banner" | grep -q "test-vm-runbook"; then
    pass "banner includes global runbook"
  else
    fail "banner includes global runbook"
  fi

  if echo "$banner" | grep -q "Test Rule"; then
    pass "banner includes global rules"
  else
    fail "banner includes global rules"
  fi

  # --- Projector generates platform files ---
  (cd "$PROJECT_DIR" && node .lore/harness/lib/projector.js . 2>/dev/null)
  local proj_exit=$?

  if [[ $proj_exit -eq 0 ]]; then
    pass "projector.js runs without error"
  else
    fail "projector.js runs without error" "exit $proj_exit"
  fi

  # Check projected files exist
  check "projected CLAUDE.md exists" file_exists "$PROJECT_DIR/CLAUDE.md"
  check "projected .windsurfrules exists" file_exists "$PROJECT_DIR/.windsurfrules"
  check "projected .clinerules exists" file_exists "$PROJECT_DIR/.clinerules"

  # Projected CLAUDE.md contains global fieldnote + runbook names
  if file_contains "$PROJECT_DIR/CLAUDE.md" "test-vm-fieldnote"; then
    pass "CLAUDE.md contains global fieldnote name"
  else
    fail "CLAUDE.md contains global fieldnote name"
  fi

  if file_contains "$PROJECT_DIR/CLAUDE.md" "test-vm-runbook"; then
    pass "CLAUDE.md contains global runbook name"
  else
    fail "CLAUDE.md contains global runbook name"
  fi

  # --- Sticky file recreation ---
  rm -f "$PROJECT_DIR/.lore/memory.local.md"
  (cd "$PROJECT_DIR" && node -e "
    const { ensureStickyFiles } = require('./.lore/harness/lib/sticky');
    ensureStickyFiles('.');
  " 2>/dev/null)
  if file_exists "$PROJECT_DIR/.lore/memory.local.md"; then
    pass "sticky: memory.local.md recreated after deletion"
  else
    fail "sticky: memory.local.md recreated after deletion"
  fi

  # --- session-init.js runs without error ---
  local si_exit
  (cd "$PROJECT_DIR" && node .lore/harness/hooks/session-init.js 2>/dev/null)
  si_exit=$?
  if [[ $si_exit -eq 0 ]]; then
    pass "session-init.js runs without error"
  else
    fail "session-init.js runs without error" "exit $si_exit"
  fi

  # Restore HOME
  export HOME="$orig_home"
}

# ---------------------------------------------------------------------------
# Phase 3 — Idempotence
# ---------------------------------------------------------------------------
phase3() {
  echo ""
  echo "--- Phase 3: Idempotence ---"

  # Point HOME at fake global again for projection
  local orig_home="${HOME:-}"
  export HOME="$WORK/fake-global-lore-parent"

  # Checksum projected files, run projector again, compare
  local files_to_check=("CLAUDE.md" "GEMINI.md" ".windsurfrules" ".clinerules")
  local checksums_before=""

  for f in "${files_to_check[@]}"; do
    if file_exists "$PROJECT_DIR/$f"; then
      checksums_before+="$(md5sum "$PROJECT_DIR/$f" 2>/dev/null || md5 -q "$PROJECT_DIR/$f" 2>/dev/null) "
    fi
  done

  # Run projector again
  (cd "$PROJECT_DIR" && node .lore/harness/lib/projector.js . 2>/dev/null)

  local checksums_after=""
  for f in "${files_to_check[@]}"; do
    if file_exists "$PROJECT_DIR/$f"; then
      checksums_after+="$(md5sum "$PROJECT_DIR/$f" 2>/dev/null || md5 -q "$PROJECT_DIR/$f" 2>/dev/null) "
    fi
  done

  if [[ "$checksums_before" == "$checksums_after" ]]; then
    pass "projector idempotent (checksums match)"
  else
    fail "projector idempotent" "checksums differ"
  fi

  # --- ensureStickyFiles 3x — no content duplication ---
  local mem_before mem_after
  mem_before=$(wc -c < "$PROJECT_DIR/.lore/memory.local.md" 2>/dev/null)

  for i in 1 2 3; do
    (cd "$PROJECT_DIR" && node -e "
      const { ensureStickyFiles } = require('./.lore/harness/lib/sticky');
      ensureStickyFiles('.');
    " 2>/dev/null)
  done

  mem_after=$(wc -c < "$PROJECT_DIR/.lore/memory.local.md" 2>/dev/null)

  if [[ "$mem_before" == "$mem_after" ]]; then
    pass "sticky idempotent: memory.local.md unchanged after 3 runs"
  else
    fail "sticky idempotent: memory.local.md grew" "before=$mem_before after=$mem_after"
  fi

  # --- Seed runbook count stable ---
  local rb_count_before rb_count_after
  rb_count_before=$(find "$PROJECT_DIR/.lore/runbooks" -name "*.md" 2>/dev/null | wc -l)

  for i in 1 2 3; do
    (cd "$PROJECT_DIR" && node -e "
      const { ensureStickyFiles } = require('./.lore/harness/lib/sticky');
      ensureStickyFiles('.');
    " 2>/dev/null)
  done

  rb_count_after=$(find "$PROJECT_DIR/.lore/runbooks" -name "*.md" 2>/dev/null | wc -l)

  if [[ "$rb_count_before" == "$rb_count_after" ]]; then
    pass "sticky idempotent: seed runbook count stable ($rb_count_before)"
  else
    fail "sticky idempotent: seed runbook count changed" "before=$rb_count_before after=$rb_count_after"
  fi

  export HOME="$orig_home"
}

# ---------------------------------------------------------------------------
# Phase 4 — Windows-only checks
# ---------------------------------------------------------------------------
phase4() {
  if ! $IS_WINDOWS; then
    echo ""
    echo "--- Phase 4: Windows-only (SKIPPED — not Windows) ---"
    return
  fi

  echo ""
  echo "--- Phase 4: Windows-only checks ---"

  # Point HOME at fake global for these tests
  local orig_home="${HOME:-}"
  export HOME="$WORK/fake-global-lore-parent"

  # --- USERPROFILE fallback when HOME is unset ---
  local up_resolved
  export USERPROFILE="$HOME"
  unset HOME
  up_resolved=$(cd "$PROJECT_DIR" && node -e "
    const { getGlobalPath } = require('./.lore/harness/lib/config');
    process.stdout.write(getGlobalPath());
  " 2>/dev/null)
  export HOME="$orig_home"

  if [[ -d "$up_resolved" ]]; then
    pass "USERPROFILE fallback resolves"
  else
    fail "USERPROFILE fallback resolves" "got: $up_resolved"
  fi

  # --- Path separator correct for platform ---
  local sep
  sep=$(node -e "process.stdout.write(require('path').sep)" 2>/dev/null)
  if [[ "$sep" == "\\" ]]; then
    pass "path.sep is backslash on Windows"
  else
    fail "path.sep is backslash on Windows" "got: $sep"
  fi

  # --- Forward-slash hook paths resolve ---
  local hook_path="$PROJECT_DIR/.lore/harness/hooks/session-init.js"
  # Convert to forward slashes as they appear in settings.json
  local fwd_path
  fwd_path=$(echo "$hook_path" | sed 's|\\|/|g')
  if node -e "require('$fwd_path')" 2>/dev/null; then
    pass "forward-slash hook paths resolve"
  else
    fail "forward-slash hook paths resolve"
  fi

  # --- Frontmatter parser handles CRLF ---
  local crlf_result
  crlf_result=$(node -e "
    const { parseFrontmatter } = require('$PROJECT_DIR/.lore/harness/lib/frontmatter');
    const crlf = '---\r\nname: test\r\ndescription: hello\r\n---\r\nBody here.\r\n';
    const { attrs } = parseFrontmatter(crlf);
    process.stdout.write(attrs.name === 'test' && attrs.description === 'hello' ? 'ok' : 'fail');
  " 2>/dev/null)
  if [[ "$crlf_result" == "ok" ]]; then
    pass "frontmatter parser handles CRLF"
  else
    fail "frontmatter parser handles CRLF"
  fi

  # --- Backslash path detection in tracker.js ---
  local tracker_result
  tracker_result=$(node -e "
    const { processToolUse } = require('$PROJECT_DIR/.lore/harness/lib/tracker');
    // tracker checks for .lore/memory.local.md with backslash normalization
    const result = processToolUse({
      tool: 'Write',
      filePath: '$PROJECT_DIR\\\\.lore\\\\memory.local.md',
      isFailure: false,
      bashCount: 0,
      thresholds: { nudge: 15, warn: 30 },
      rootDir: '$PROJECT_DIR'
    });
    process.stdout.write(result.message && result.message.includes('LORE-MEMORY') ? 'ok' : 'fail');
  " 2>/dev/null)
  if [[ "$tracker_result" == "ok" ]]; then
    pass "tracker.js handles backslash paths"
  else
    fail "tracker.js handles backslash paths"
  fi

  export HOME="$orig_home"
}

# ---------------------------------------------------------------------------
# Phase 5 — Per-platform isolation
# ---------------------------------------------------------------------------
phase5() {
  echo ""
  echo "--- Phase 5: Per-platform isolation ---"

  local orig_home="${HOME:-}"
  export HOME="$WORK/fake-global-lore-parent"

  # Platform-to-expected-file map (only platforms that produce files via projector)
  local -A PLATFORM_FILES=(
    [claude]="CLAUDE.md"
    [gemini]="GEMINI.md"
    [windsurf]=".windsurfrules"
    [cursor]=".cursor/rules/lore-core.mdc"
    [roocode]=".clinerules"
  )

  for plat in "${!PLATFORM_FILES[@]}"; do
    local expected="${PLATFORM_FILES[$plat]}"

    # Write config with only this platform active
    local cfg_path="$PROJECT_DIR/.lore/config.json"
    node -e "
      const fs = require('fs');
      const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')
        .replace(/\/\/.*/g,'').replace(/,(\s*[}\]])/g,'\$1'));
      c.platforms = [process.argv[2]];
      fs.writeFileSync(process.argv[1], JSON.stringify(c, null, 2));
    " "$cfg_path" "$plat" 2>/dev/null

    # Run projector
    (cd "$PROJECT_DIR" && node .lore/harness/lib/projector.js . 2>/dev/null)

    # Assert expected file exists
    if file_exists "$PROJECT_DIR/$expected"; then
      pass "platform=$plat: $expected exists"
    else
      fail "platform=$plat: $expected exists"
    fi

    # Assert all other platform files absent
    for other in "${!PLATFORM_FILES[@]}"; do
      [[ "$other" == "$plat" ]] && continue
      local other_file="${PLATFORM_FILES[$other]}"
      if file_exists "$PROJECT_DIR/$other_file"; then
        fail "platform=$plat: $other_file should not exist"
      else
        pass "platform=$plat: $other_file absent"
      fi
    done
  done

  # Restore all platforms for subsequent phases
  node -e "
    const fs = require('fs');
    const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')
      .replace(/\/\/.*/g,'').replace(/,(\s*[}\]])/g,'\$1'));
    delete c.platforms;
    fs.writeFileSync(process.argv[1], JSON.stringify(c, null, 2));
  " "$PROJECT_DIR/.lore/config.json" 2>/dev/null

  # Re-project with all platforms to restore files
  (cd "$PROJECT_DIR" && node .lore/harness/lib/projector.js . 2>/dev/null)

  export HOME="$orig_home"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
summary() {
  echo ""
  echo "==========================================="
  echo "  RESULTS: $PASS passed, $FAIL failed"
  echo "==========================================="
  for r in "${RESULTS[@]}"; do
    echo "$r"
  done
  echo ""

  if [[ $FAIL -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
print_env
phase0
phase1 || { echo "Phase 1 BLOCKED — skipping remaining phases."; summary; }
phase2
phase3
phase4
phase5
summary
