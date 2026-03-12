# Bundle Format

## Directory Structure

```
<slug>/
├── manifest.json             # Required: bundle identity and metadata
├── LORE.md                   # Required: bundle philosophy, accumulated into mandate files
├── README.md                 # Required: attribution, contents, changelog
├── RULES/                    # Policy rules (flat .md files)
│   └── <name>.md
├── SKILLS/                   # Skills (directory-per-skill)
│   └── <name>/
│       ├── SKILL.md          # Required: frontmatter + instructions
│       ├── scripts/          # Optional: executable scripts
│       ├── references/       # Optional: reference documentation
│       └── assets/           # Optional: templates, schemas, data
├── AGENTS/                   # Agent definitions (flat .md files)
│   └── <name>.md
├── MCP/                      # MCP server declarations (optional)
│   ├── <name>.json           # Declaration (scanned by binary)
│   └── <name>.js             # Implementation (ignored by scanner)
└── HOOKS/                    # Hook scripts (optional)
    └── <event>.mjs
```

## manifest.json

```json
{
  "manifest_version": 1,
  "slug": "<kebab-case-identifier>",
  "name": "<Display Name>",
  "version": "<semver>",
  "description": "<One-line description>"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `manifest_version` | yes | Always `1` |
| `slug` | yes | `^[a-z0-9-]+$`, must match bundle directory name |
| `name` | yes | Human-readable display name |
| `version` | yes | Semver string |
| `description` | yes | One-line description, max 120 chars |

Optional fields: `hooks`, `content`, `setup`/`teardown`, `tui`.

### hooks

Maps event names to script paths (relative to bundle root):

```json
{
  "manifest_version": 1,
  "slug": "my-bundle",
  "name": "My Bundle",
  "version": "1.0.0",
  "description": "Bundle with hooks",
  "hooks": {
    "pre-tool-use": "HOOKS/pre-tool-use.mjs",
    "post-tool-use": "HOOKS/post-tool-use.mjs",
    "stop": "HOOKS/stop.mjs"
  }
}
```

Valid event keys: `pre-tool-use`, `post-tool-use`, `prompt-submit`, `session-start`, `stop`, `pre-compact`, `session-end`.

Bundle hooks are the lowest priority — project and global hooks override them per-event. Only one script runs per event (last-wins). Scripts must be Node.js ES modules (`.mjs`).

## LORE.md

The bundle's philosophy and high-level instructions. This content is accumulated (concatenated) with other bundles', global, and project LORE.md into every platform's mandate file.

Keep it focused: 15-30 lines. It will be read by the agent at the start of every session.

## Bundle Home Directory

Bundles live at `~/.<slug>/` (e.g., `~/.lore-os/`). Discovery: the binary scans `~/` for `~/.<name>/manifest.json`.

## Bundle Lifecycle

- **Install**: `lore bundle install <slug> --url <git-url>` — clones to `~/.<slug>/`
- **Enable**: `lore bundle enable <slug>` — adds to `.lore/config.json` `"bundles"` array
- **Disable**: `lore bundle disable <slug>` — removes from bundles array
- **Update**: `lore bundle update <slug>` — pulls latest from origin
- **Remove**: `lore bundle remove <slug>` — deletes `~/.<slug>/`

Enable/disable is per-project. Install/remove is global.

## Merge Behavior

Bundle content defaults to policy `defer` (auto-included). Priority order for multiple bundles: array order in `.lore/config.json` (last = highest priority).

Three-layer merge: Bundles (lowest) → Global (middle) → Project (highest). Same-named items: higher layer wins.
