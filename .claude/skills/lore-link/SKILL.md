---
name: lore-link
description: Link and unlink work repos to the Lore hub
type: command
user-invocable: true
allowed-tools: Bash, Read, Glob
---

# Link

Manage cross-repo links so hooks fire from the hub even when the operator opens a work repo directly in their IDE.

## Usage

```
/lore-link ~/projects/my-app          # Link a work repo
/lore-link --unlink ~/projects/my-app  # Remove the link
/lore-link --list                       # Show linked repos (with stale detection)
/lore-link --refresh                    # Regenerate configs in all linked repos
```

## Process

Parse the operator's arguments and run the corresponding script command:

```bash
bash scripts/lore-link.sh <arguments>
```

Report the output to the operator.

## When to Use

- **Link**: Operator wants to open a work repo in an IDE with Lore hooks active
- **Unlink**: Operator wants to remove Lore integration from a work repo
- **List**: Operator wants to see which repos are linked and detect stale links
- **Refresh**: After `/lore-update`, to regenerate configs with the latest hooks

## Gotchas

- The script must run from the hub directory (it resolves the hub path from its own location)
- All generated files in the target are auto-gitignored — no cleanup needed
- Existing configs in the target are backed up to `.bak` before overwriting
- `--refresh` regenerates ALL linked repos — remind the operator if they have many links
