---
name: serve-docs-docker
description: Start the docs site via Docker. No Python required. Supports multiple instances with deterministic ports.
domain: Documentation
scope: internal
user-invocable: true
allowed-tools: Bash
---
# Serve Docs via Docker

Start the docs site using Docker Compose. No Python or pip needed.

## Process

1. Check Docker is running (`docker info > /dev/null 2>&1`)
   - If not running, tell the user to start Docker Desktop or the Docker daemon
2. Compute a deterministic port from the directory name so multiple Lore instances don't collide:
   - `LORE_DOCS_PORT=$(( ($(printf '%s' "$(basename "$PWD")" | cksum | cut -d' ' -f1) % 999) + 8001 ))`
   - This maps the current directory name to a port in 8001-8999
   - Export it: `export LORE_DOCS_PORT`
3. Check if already running (`docker compose ps --status running 2>/dev/null | grep docs`)
   - If container shows running, **always verify** it's actually serving: `curl -s -o /dev/null -w '%{http_code}' http://localhost:$LORE_DOCS_PORT`
   - If curl succeeds (200): report the URL, don't restart
   - If curl fails: restart with `docker compose down && docker compose up -d`
4. Start detached: `docker compose up -d`
5. Wait briefly (`sleep 3`), then verify with `curl -s -o /dev/null -w '%{http_code}' http://localhost:$LORE_DOCS_PORT`
6. Report to user:
   - URL: http://localhost:$LORE_DOCS_PORT
   - Live reload is automatic — file changes on host are visible in the container via volume mount
   - To stop: use `/stop-docs`

## Gotchas

- **Docker not running**: Tell user to start Docker Desktop or run `sudo systemctl start docker`
- **Port conflict**: The deterministic port avoids most collisions, but if it's taken, suggest changing `LORE_DOCS_PORT` manually
- **Already running**: Don't restart — just confirm it's serving and report the URL
