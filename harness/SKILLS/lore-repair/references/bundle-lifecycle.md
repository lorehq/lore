# Bundle Lifecycle — Deep Reference

## Overview

Bundles are installable packages that extend Lore with rules, skills, agents, hooks,
and MCP servers. Each bundle is a directory at `~/.<slug>/` containing a `manifest.json`
and optional content directories and hook scripts.

## Bundle Structure

```
~/.<slug>/                    # Bundle home directory
  manifest.json               # Required: metadata and hook declarations
  LORE.md                     # Optional: instructions appended to mandate files
  RULES/*.md                  # Optional: rules
  SKILLS/<name>/SKILL.md      # Optional: skills (directory layout)
  AGENTS/*.md                 # Optional: agents
  MCP/                        # Optional: MCP server declarations and implementations
    <name>.json               # Server declaration
    <name>.js                 # Server implementation (ignored by scanner)
  hooks/                      # Optional: hook scripts (referenced by manifest.json)
    pre-tool-use.mjs
    post-tool-use.mjs
    prompt-submit.mjs
```

## manifest.json

Required file at the bundle root. Fields:

```json
{
  "slug": "lore-os",
  "name": "Lore OS",
  "version": "0.1.0",
  "hooks": {
    "pre-tool-use": "hooks/pre-tool-use.mjs",
    "post-tool-use": "hooks/post-tool-use.mjs",
    "prompt-submit": "hooks/prompt-submit.mjs"
  }
}
```

- `slug` — required. Used as directory name (`~/.<slug>/`) and config reference.
- `name` — display name. Used in LORE.md section headers.
- `version` — semver string.
- `hooks` — maps hook event names to script paths (relative to bundle root).

## Discovery (`discoverBundles`)

Scans `~/` for directories matching `~/.<name>/manifest.json`:
1. Lists all entries in home directory starting with `.`
2. Follows symlinks (uses `os.Stat` not `os.Lstat`)
3. Reads `manifest.json` from each candidate
4. Validates: slug must be non-empty
5. Returns sorted by slug, with `Active` flag from current project config

## Installation (`cmd_bundle.go`)

### `lore bundle install <slug> --url <git-url>`

1. Clones the git repo to `~/.<slug>/`
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

1. Runs `git pull` in `~/.<slug>/`
2. Runs `lore generate` if in a Lore project

### `lore bundle remove <slug>`

1. Disables bundle if enabled
2. Removes `~/.<slug>/` directory

## Hook Dispatch

### Resolution Strategy

For each hook event, ONE script runs. Resolution is last-wins across layers:

1. Check project hooks: `.lore/HOOKS/<event>.mjs`
2. Check global hooks: `~/.config/lore/HOOKS/<event>.mjs`
3. Check bundles (priority order, last = highest):
   - Read `manifest.json` `hooks` field
   - Resolve script path relative to bundle root
   - Last bundle with a handler for this event wins

Project > Global > highest-priority Bundle.

### Hook Events

| Event | Trigger | Response Format |
|-------|---------|-----------------|
| `pre-tool-use` | Before a tool executes | JSON: `{"decision": "allow"/"block", "reason": "..."}` |
| `post-tool-use` | After a tool executes | JSON: `{"notification": "..."}` (optional) |
| `prompt-submit` | User submits a prompt | JSON: `{"notification": "..."}` (optional) |
| `session-start` | Session begins or resumes | JSON: `{"additionalContext": "..."}` (optional) |
| `stop` | Agent finishes responding | JSON: `{"decision": "block", "reason": "..."}` (optional) |
| `pre-compact` | Before context compression | JSON: `{"additionalContext": "..."}` (optional) |
| `session-end` | Session terminates | JSON: `{"additionalContext": "..."}` (optional) |

### `readHookPaths()`

Resolves the winning script for each hook event using three-layer last-wins resolution:
1. **Bundle(s)** (lowest) — from `manifest.json` `hooks` field, last bundle wins per event
2. **Global** — `~/.config/lore/HOOKS/<event>.mjs`
3. **Project** (highest) — `.lore/HOOKS/<event>.mjs`

### Hook Execution (`cmd_hook.go`)

1. Binary receives hook event via `lore hook <event>`
2. Reads stdin for hook payload (JSON)
3. Resolves winning script via `readHookPaths()` (three-layer)
4. Executes script with payload on stdin
5. Parses script's stdout as JSON response
6. Returns response to the calling platform

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
- Verify `~/.<slug>/manifest.json` exists
- Check `slug` field is non-empty in manifest
- Check for symlink issues (scanner follows symlinks)

**Bundle content not appearing after enable:**
- Run `lore generate` to trigger projection
- Check inherit.json — items might be set to "off"
- Verify RULES/, SKILLS/, AGENTS/ directories exist in the bundle

**Hook not firing:**
- Check manifest.json `hooks` field maps the event correctly
- Verify script file exists at the resolved path
- Test script directly: `echo '{}' | node ~/.<slug>/hooks/pre-tool-use.mjs`
- Check for higher-priority overrides (project or other bundle)

**Wrong bundle version used:**
- Check `"bundles"` array order — last = highest priority
- For same-named items, the last bundle in the array wins
- Use `lore bundle list` to see installed bundles and their versions
