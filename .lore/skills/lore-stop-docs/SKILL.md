---
name: lore-stop-docs
description: Stop the local docs site (started by /lore-serve-docs or /lore-serve-docs-docker).
domain: Documentation
scope: internal
user-invocable: true
allowed-tools: Bash
---
# Stop Docs Server

Stop the docs site regardless of how it was started.

## Process

Check both methods and stop whichever is running:

1. **Docker**: Check if the docs container is running (`docker compose ps --status running 2>/dev/null | grep docs`)
   - If running: `docker compose down`
2. **Local mkdocs**: Check for a running mkdocs serve process
   - `pgrep -f 'mkdocs serve'`
   - If running: `kill $(pgrep -f 'mkdocs serve')`
3. If neither is running, tell the user "No docs server is running."
4. Confirm what was stopped.
