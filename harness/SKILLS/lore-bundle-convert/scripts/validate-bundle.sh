#!/usr/bin/env bash
# Validate a Lore bundle directory for correctness.
# Usage: validate-bundle.sh <bundle-path>

set -euo pipefail

BUNDLE="${1:?Usage: validate-bundle.sh <bundle-path>}"
ERRORS=0
WARNS=0

err()  { echo "  ERROR: $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  WARN:  $1"; WARNS=$((WARNS + 1)); }
ok()   { echo "  OK:    $1"; }

echo "Validating bundle: $BUNDLE"
echo

# ── manifest.json ──────────────────────────────────────────────────
echo "== manifest.json =="
MANIFEST="$BUNDLE/manifest.json"
if [[ ! -f "$MANIFEST" ]]; then
    err "manifest.json not found"
else
    # Check valid JSON
    if ! python3 -c "import json; json.load(open('$MANIFEST'))" 2>/dev/null; then
        err "manifest.json is not valid JSON"
    else
        for field in manifest_version slug name version description; do
            if ! python3 -c "import json; d=json.load(open('$MANIFEST')); assert '$field' in d" 2>/dev/null; then
                err "manifest.json missing required field: $field"
            fi
        done
        ok "manifest.json valid"
    fi
fi
echo

# ── RULES ──────────────────────────────────────────────────────────
echo "== RULES =="
if [[ -d "$BUNDLE/RULES" ]]; then
    RULE_COUNT=0
    for rule in "$BUNDLE"/RULES/*.md; do
        [[ -f "$rule" ]] || continue
        RULE_COUNT=$((RULE_COUNT + 1))
        name=$(basename "$rule")
        # Check for description in frontmatter
        if head -1 "$rule" | grep -q '^---'; then
            if ! sed -n '/^---$/,/^---$/p' "$rule" | grep -q 'description:'; then
                err "$name: missing 'description' in frontmatter"
            fi
        else
            err "$name: no YAML frontmatter (must have --- delimiters and description field)"
        fi
    done
    ok "$RULE_COUNT rules found"
else
    warn "No RULES/ directory"
fi
echo

# ── SKILLS ─────────────────────────────────────────────────────────
echo "== SKILLS =="
if [[ -d "$BUNDLE/SKILLS" ]]; then
    SKILL_COUNT=0
    for skill_dir in "$BUNDLE"/SKILLS/*/; do
        [[ -d "$skill_dir" ]] || continue
        SKILL_COUNT=$((SKILL_COUNT + 1))
        dir_name=$(basename "$skill_dir")
        skill_md="$skill_dir/SKILL.md"

        if [[ ! -f "$skill_md" ]]; then
            err "$dir_name: missing SKILL.md"
            continue
        fi

        # Check frontmatter exists
        if ! head -1 "$skill_md" | grep -q '^---'; then
            err "$dir_name: no YAML frontmatter"
            continue
        fi

        frontmatter=$(sed -n '/^---$/,/^---$/p' "$skill_md")

        # Required fields
        for field in name description user-invocable; do
            if ! echo "$frontmatter" | grep -q "$field:"; then
                err "$dir_name: missing '$field' in frontmatter"
            fi
        done

        # name must match directory
        fm_name=$(echo "$frontmatter" | grep '^name:' | sed 's/name: *//' | tr -d '\r')
        if [[ -n "$fm_name" && "$fm_name" != "$dir_name" ]]; then
            err "$dir_name: frontmatter name '$fm_name' does not match directory name"
        fi
    done
    ok "$SKILL_COUNT skills found"
else
    warn "No SKILLS/ directory"
fi
echo

# ── AGENTS ─────────────────────────────────────────────────────────
echo "== AGENTS =="
if [[ -d "$BUNDLE/AGENTS" ]]; then
    AGENT_COUNT=0
    for agent in "$BUNDLE"/AGENTS/*.md; do
        [[ -f "$agent" ]] || continue
        AGENT_COUNT=$((AGENT_COUNT + 1))
        name=$(basename "$agent")

        if ! head -1 "$agent" | grep -q '^---'; then
            err "$name: no YAML frontmatter"
            continue
        fi

        frontmatter=$(sed -n '/^---$/,/^---$/p' "$agent")

        for field in name description; do
            if ! echo "$frontmatter" | grep -q "$field:"; then
                err "$name: missing '$field' in frontmatter"
            fi
        done

        # tools should be present
        if ! echo "$frontmatter" | grep -q 'tools:'; then
            warn "$name: no 'tools' in frontmatter"
        fi

        # model should NOT be present
        if echo "$frontmatter" | grep -q 'model:'; then
            err "$name: contains 'model:' field (platform-specific, not portable)"
        fi
    done
    ok "$AGENT_COUNT agents found"
else
    warn "No AGENTS/ directory"
fi
echo

# ── Platform-specific references ───────────────────────────────────
echo "== Platform portability =="
PLATFORM_REFS=0
while IFS= read -r match; do
    warn "Platform-specific path: $match"
    PLATFORM_REFS=$((PLATFORM_REFS + 1))
done < <(grep -rn '~/.claude/\|~/.cursor/\|\.github/copilot' "$BUNDLE"/{RULES,SKILLS,AGENTS} 2>/dev/null || true)

while IFS= read -r match; do
    warn "Platform-specific model field: $match"
    PLATFORM_REFS=$((PLATFORM_REFS + 1))
done < <(grep -rn '^model:' "$BUNDLE"/AGENTS/ 2>/dev/null || true)

if [[ $PLATFORM_REFS -eq 0 ]]; then
    ok "No platform-specific references found"
fi
echo

# ── HOOKS ──────────────────────────────────────────────────────────
echo "== HOOKS =="
HOOK_COUNT=0
VALID_EVENTS="pre-tool-use post-tool-use prompt-submit session-start stop pre-compact session-end"

# Check hooks declared in manifest.json
if [[ -f "$MANIFEST" ]] && python3 -c "import json; d=json.load(open('$MANIFEST')); assert 'hooks' in d" 2>/dev/null; then
    while IFS= read -r line; do
        event=$(echo "$line" | python3 -c "import sys; print(sys.stdin.read().split(':')[0].strip().strip('\"'))")
        script=$(echo "$line" | python3 -c "import sys; parts=sys.stdin.read().split(':', 1); print(parts[1].strip().strip('\"').rstrip(','))" 2>/dev/null)
        HOOK_COUNT=$((HOOK_COUNT + 1))

        # Check event name is valid
        if ! echo "$VALID_EVENTS" | grep -qw "$event"; then
            err "manifest.json hooks: unknown event '$event'"
        fi

        # Check script file exists
        if [[ -n "$script" && ! -f "$BUNDLE/$script" ]]; then
            err "manifest.json hooks: script not found: $script"
        fi

        # Check script is .mjs
        if [[ -n "$script" && "$script" != *.mjs ]]; then
            warn "manifest.json hooks: $script is not .mjs (Lore requires ES modules)"
        fi
    done < <(python3 -c "
import json
d = json.load(open('$MANIFEST'))
for event, script in d.get('hooks', {}).items():
    print(f'{event}: {script}')
" 2>/dev/null)
    ok "$HOOK_COUNT hooks declared in manifest.json"
fi

# Check for HOOKS/ directory files not declared in manifest
if [[ -d "$BUNDLE/HOOKS" ]]; then
    for hook_file in "$BUNDLE"/HOOKS/*.mjs; do
        [[ -f "$hook_file" ]] || continue
        hook_name=$(basename "$hook_file" .mjs)
        if [[ -f "$MANIFEST" ]] && ! python3 -c "
import json
d = json.load(open('$MANIFEST'))
assert '$hook_name' in d.get('hooks', {})
" 2>/dev/null; then
            warn "$(basename "$hook_file"): exists in HOOKS/ but not declared in manifest.json hooks"
        fi
    done
fi

if [[ $HOOK_COUNT -eq 0 ]]; then
    if [[ -d "$BUNDLE/HOOKS" ]]; then
        warn "HOOKS/ directory exists but no hooks declared in manifest.json"
    fi
fi
echo

# ── LORE.md ────────────────────────────────────────────────────────
echo "== LORE.md =="
if [[ -f "$BUNDLE/LORE.md" ]]; then
    lines=$(wc -l < "$BUNDLE/LORE.md")
    ok "LORE.md exists ($lines lines)"
    if [[ $lines -gt 50 ]]; then
        warn "LORE.md is long ($lines lines) — this gets injected into every session"
    fi
else
    err "LORE.md not found"
fi
echo

# ── README.md ──────────────────────────────────────────────────────
echo "== README.md =="
if [[ -f "$BUNDLE/README.md" ]]; then
    if grep -qi 'attribution\|adapted from\|original' "$BUNDLE/README.md"; then
        ok "README.md exists with attribution"
    else
        warn "README.md exists but may be missing attribution"
    fi
else
    warn "No README.md"
fi
echo

# ── Summary ────────────────────────────────────────────────────────
echo "================================"
if [[ $ERRORS -eq 0 ]]; then
    echo "PASS ($WARNS warnings)"
else
    echo "FAIL ($ERRORS errors, $WARNS warnings)"
fi
exit $ERRORS
