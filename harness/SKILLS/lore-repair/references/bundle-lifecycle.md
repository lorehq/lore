# Bundle Lifecycle — Deep Reference

## Overview

Bundles are installable packages that extend Lore with rules, skills, agents, hooks,
and MCP servers. Each bundle is a directory at `~/.local/share/lore/bundles/<slug>/`
containing a `manifest.json` and optional content directories and hook scripts.

## Bundle Structure

```
~/.local/share/lore/bundles/<slug>/
  manifest.json               # Required: metadata and hook declarations
  LORE.md                     # Optional: instructions appended to mandate files
  RULES/*.md                  # Optional: rules
  SKILLS/<name>/SKILL.md      # Optional: skills (directory layout)
  AGENTS/*.md                 # Optional: agents
  MCP/                        # Optional: MCP server declarations and implementations
    <name>.json               # Server declaration
    <name>.js                 # Server implementation (ignored by scanner)
  SCRIPTS/                    # Optional: hook behavior scripts (referenced by manifest.json)
    memory-guard.mjs
    harness-guard.mjs
    ambiguity-nudge.mjs
```

## manifest.json

Required file at the bundle root. Fields:

```json
{
  "manifest_version": 1,
  "slug": "lore-os",
  "name": "Lore OS",
  "version": "0.1.10",
  "description": "Opinionated behavioral layer for the Lore harness.",
  "hooks": {
    "pre-tool-use": [
      { "name": "Memory Guard", "script": "SCRIPTS/memory-guard.mjs" },
      { "name": "Harness Guard", "script": "SCRIPTS/harness-guard.mjs" }
    ],
    "post-tool-use": [
      { "name": "Memory Capture", "script": "SCRIPTS/memory-capture.mjs" }
    ],
    "prompt-submit": [
      { "name": "Ambiguity Nudge", "script": "SCRIPTS/ambiguity-nudge.mjs" }
    ]
  }
}
```

- `slug` — required. Used as directory name and config reference.
- `name` — display name. Used in LORE.md section headers.
- `version` — semver string.
- `hooks` — maps event names to arrays of `{name, script}` behavior objects.

## Discovery (`discoverBundles`)

Scans `~/.local/share/lore/bundles/` (XDG) and legacy `~/.<name>/` for manifests:
1. Lists directories in both locations
2. Follows symlinks (uses `os.Stat` not `os.Lstat`)
3. Reads `manifest.json` from each candidate
4. Validates: slug must be non-empty
5. XDG takes precedence (deduped by slug)
6. Returns sorted by slug, with `Active` flag from current project config

## Installation (`cmd_bundle.go`)

### `lore bundle install <slug> --url <git-url>`

1. Clones the git repo to `~/.local/share/lore/bundles/<slug>/`
2. Validates `manifest.json` exists and has a valid slug
3. Does NOT enable — enabling is per-project only

### `lore bundle enable <slug>`

1. Reads `.lore/config.json`
2. Appends slug to `"bundles"` array (if not already present)
3. Writes updated config
4. Runs `lore generate` to project the bundle's content

### `lore bundle disable <slug>`

1. Reads `.lore/config.json`
2. Removes slug from `"bundles"` array
3. Writes updated config
4. Runs `lore generate` to remove the bundle's projected content

### `lore bundle update <slug>`

1. Runs `git pull` in the bundle directory
2. Runs `lore generate` if in a Lore project

### `lore bundle remove <slug>`

1. Disables bundle if enabled
2. Removes bundle directory

## Hook Dispatch

### Accumulation Strategy

All behaviors from all layers run in parallel per event. No last-wins — every layer contributes.

**Layer order (all accumulate):**
1. **Bundle** behaviors from `manifest.json` (arrays of `{name, script}`)
2. **Global** behaviors from `~/.config/lore/HOOKS/<event>/*.mjs`
3. **Project** behaviors from `.lore/HOOKS/<event>/*.mjs`

**Blocking events** (pre-tool-use, prompt-submit, stop): if ANY behavior returns deny/block, the event is blocked. Reasons from all failing scripts are concatenated.

**Non-blocking events** (post-tool-use, session-start, pre-compact, session-end): all behaviors run, failures are logged to stderr but don't block.

### Hook Events

| Event | Trigger | Blocking | Response Format |
|-------|---------|----------|-----------------|
| `pre-tool-use` | Before a tool executes | yes | `{"decision": "allow"/"deny", "reason": "..."}` |
| `post-tool-use` | After a tool executes | no | `{"additionalContext": "..."}` (optional) |
| `prompt-submit` | User submits a prompt | yes | `{"additionalContext": "..."}` (optional) |
| `session-start` | Session begins or resumes | no | `{"additionalContext": "..."}` (optional) |
| `stop` | Agent finishes responding | yes | `{"decision": "block", "reason": "..."}` (optional) |
| `pre-compact` | Before context compression | no | `{"additionalContext": "..."}` (optional) |
| `session-end` | Session terminates | no | `{"additionalContext": "..."}` (optional) |

### `readHookScripts()`

Accumulates all behavior scripts from all layers. Returns `HookScripts` with `map[event][]string` (event → list of script paths).

For bundles: parses `manifest.json` `hooks` field. Supports both array format (`[{name, script}]`) and legacy string format (`"path/to/script.mjs"`).

For global/project: scans `HOOKS/<event>/` directories for `.mjs` files. Falls back to legacy `HOOKS/<event>.mjs` single-file layout.

### Hook Execution (`cmd_hook.go`)

1. Binary receives hook event via `lore hook <event>`
2. Reads stdin for hook payload (JSON)
3. Accumulates all scripts via `readHookScripts()`
4. Runs all scripts in parallel (goroutine fan-out)
5. Aggregates results:
   - Blocking events: concatenate block reasons, exit non-zero if any blocked
   - Non-blocking events: log failures to stderr, always exit 0
6. Returns aggregated response to the calling platform

**Critical:** Hook stderr MUST NOT contain output that could be parsed as JSON.
Debug logging should go to `/tmp` or similar. Stderr contamination causes
"invalid JSON" errors in the calling platform.

### Session-Start Freshness Check

On `prompt-submit` events, the hook dispatcher calls `ensureFreshProjection()`:
1. Checks `projectionStale()`
2. If stale, silently runs `doProjection()` to regenerate
3. This keeps projected files fresh without manual `lore generate`

## Policy System (inherit.json)

`.lore/inherit.json` controls how bundle and global items participate in the merge:

```json
{
  "rules": {
    "lore-os-security": "defer",
    "example-code-quality": "off"
  },
  "skills": {
    "lore-os-delegate": "defer"
  },
  "agents": {}
}
```

Each kind has its own namespace. Policy values:
- `"defer"` — include, project layer can shadow
- `"off"` — exclude from merge entirely
- `"overwrite"` — this item wins even over project layer

### Default Policies

Source-dependent defaults (via `defaultForSource()`):
- **Bundle items:** default `"defer"` (auto-included)
- **Global items:** default `"off"` (must be explicitly opted in)

This means bundle content appears automatically, while global content is opt-in
per project. The intent: bundles provide sensible defaults, global items are
personal preferences that may not apply to every project.

## Multiple Bundles

Projects can enable multiple bundles. Stored as ordered array:
```json
{"bundles": ["lore-os", "acme-tools"]}
```

Priority order = array order. Last = highest priority. For same-named items
across bundles, the last bundle's version wins.

## Troubleshooting

**Bundle not discovered:**
- Verify `~/.local/share/lore/bundles/<slug>/manifest.json` exists
- Check `slug` field is non-empty in manifest
- Check for symlink issues (scanner follows symlinks)

**Bundle content not appearing after enable:**
- Run `lore generate` to trigger projection
- Check inherit.json — items might be set to "off"
- Verify RULES/, SKILLS/, AGENTS/ directories exist in the bundle

**Hook not firing:**
- Check manifest.json `hooks` field declares behaviors for the event
- Verify script file exists at the resolved path
- Test script directly: `echo '{}' | node ~/.local/share/lore/bundles/<slug>/SCRIPTS/my-guard.mjs`
- Check for script errors in stderr

**Wrong bundle version used:**
- Check `"bundles"` array order — last = highest priority
- For same-named items, the last bundle in the array wins
- Use `lore bundle list` to see installed bundles and their versions
