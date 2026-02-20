---
name: lore-ui
description: Start, stop, or inspect the local docs UI. Prefers Docker and falls back to local mkdocs.
type: command
user-invocable: true
allowed-tools: Bash
---
# Docs UI

Manage the local docs UI lifecycle from one command.

## Process

Interpret intent from user input:
- default or `start` -> start docs UI
- `stop` -> stop docs UI
- `status` -> report current state

### Start

1. Compute deterministic Docker port:
   - `LORE_DOCS_PORT=$(( ($(printf '%s' "$(basename "$PWD")" | cksum | cut -d' ' -f1) % 999) + 8001 ))`
2. Prefer Docker when available:
   - Check Docker is running: `docker info > /dev/null 2>&1`
   - If running, export the port and start via Compose: `export LORE_DOCS_PORT && docker compose up -d`
   - Verify with `curl -s -o /dev/null -w '%{http_code}' http://localhost:$LORE_DOCS_PORT`
   - If HTTP 200, report URL and mode: Docker
3. Fall back to local mkdocs when Docker is unavailable or verification fails:
   - Check Python: `python3 --version || python --version`
   - Check mkdocs: `command -v mkdocs`
   - If missing, install deps: `pip install mkdocs-material mkdocs-panzoom-plugin`
   - Handle stale local process: if `pgrep -f 'mkdocs serve'` returns a PID but `curl http://localhost:8000` is not 200, kill stale PID
   - Start local server: `nohup mkdocs serve --livereload > /dev/null 2>&1 &`
   - Verify with curl on `http://localhost:8000`
4. Report active mode and URL.

### Stop

1. Try Docker first:
   - If docs container is running: `docker compose down`
2. Then stop local mkdocs if running:
   - `pgrep -f 'mkdocs serve'`
   - If running: `kill $(pgrep -f 'mkdocs serve')`
3. Report what was stopped, or "No docs UI is running".

### Status

1. Check Docker docs container state and verify HTTP response at computed `LORE_DOCS_PORT`.
2. Check local mkdocs process and verify HTTP response at `localhost:8000`.
3. Report one of: Docker active, local active, neither active.

## Gotchas

- Always pass `--livereload` for local mkdocs.
- `pgrep` alone is not sufficient; always verify with curl.
- Docker may be installed but daemon not running; treat that as fallback-to-local, not a hard error.
- If both Docker and local are running, prefer reporting Docker URL first and note both are active.
