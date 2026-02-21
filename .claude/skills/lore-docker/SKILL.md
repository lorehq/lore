---
name: lore-docker
description: Start, stop, or inspect the local docs UI. Prefers Docker and falls back to local mkdocs.
type: command
user-invocable: true
allowed-tools: Bash
---
# Docs UI

Manage the local docs UI lifecycle from one command.

Current runtime model: one Docker container (`lorehq/lore-docker`) provides docs UI, semantic search, and file-watch maintenance.

## Process

Interpret intent from user input:
- default or `start` -> start docs UI
- `stop` -> stop docs UI
- `status` -> report current state

### Start

1. Compute deterministic ports:
   - `LORE_DOCS_PORT=$(( ($(printf '%s' "$(basename "$PWD")" | cksum | cut -d' ' -f1) % 999) + 9001 ))`
   - `LORE_SEMANTIC_PORT=$(( LORE_DOCS_PORT + 1000 ))`
2. Prefer Docker when available:
    - Check Docker is running: `docker info > /dev/null 2>&1`
    - Pull image if needed: `docker pull lorehq/lore-docker:latest`
    - Export ports and start: `export LORE_DOCS_PORT LORE_SEMANTIC_PORT && docker compose -f .lore/docker-compose.yml up -d`
    - Wait up to 15 seconds for docs port to respond (semantic search takes longer to load models)
    - Verify docs: `curl -s -o /dev/null -w '%{http_code}' http://localhost:$LORE_DOCS_PORT`
    - If HTTP 200, write config and report:
      - Write docker config to `.lore/config.json`: `node -e "const{getConfig}=require('./.lore/lib/config');const fs=require('fs');const c=getConfig('.');c.docker={site:{address:'localhost',port:+process.env.LORE_DOCS_PORT},search:{address:'localhost',port:+process.env.LORE_SEMANTIC_PORT}};fs.writeFileSync('.lore/config.json',JSON.stringify(c,null,2)+'\n')"`
      - Report docs URL and mode: Docker
    - Check semantic health (non-blocking — may still be loading): `curl -s http://localhost:$LORE_SEMANTIC_PORT/health`
3. Fall back to local mkdocs when Docker is unavailable or verification fails:
   - Check Python: `python3 --version || python --version`
   - Check mkdocs: `command -v mkdocs`
   - If missing, install deps: `pip install mkdocs-material mkdocs-panzoom-plugin`
   - Handle stale local process: if `pgrep -f 'mkdocs serve'` returns a PID but `curl http://localhost:8000` is not 200, kill stale PID
   - Start local server: `nohup mkdocs serve --livereload > /dev/null 2>&1 &`
   - Verify with curl on `http://localhost:8000`
   - Note: local fallback provides docs UI only — no semantic search or file watching
4. Report active mode, URLs, and whether semantic search is available.

### Stop

1. Try Docker first:
   - If container is running: `docker compose -f .lore/docker-compose.yml down`
2. Then stop local mkdocs if running:
   - `pgrep -f 'mkdocs serve'`
   - If running: `kill $(pgrep -f 'mkdocs serve')`
3. Clear config: `node -e "const{getConfig}=require('./.lore/lib/config');const fs=require('fs');const c=getConfig('.');delete c.docker;fs.writeFileSync('.lore/config.json',JSON.stringify(c,null,2)+'\n')"`
4. Report what was stopped, or "No docs UI is running".

### Status

1. Check Docker container state and verify HTTP response at computed `LORE_DOCS_PORT`.
   - If running, also check semantic health at `LORE_SEMANTIC_PORT`.
2. Check local mkdocs process and verify HTTP response at `localhost:8000`.
3. Report one of: Docker active (with semantic search status), local active (docs only), neither active.

## Gotchas

- Always pass `--livereload` for local mkdocs.
- `pgrep` alone is not sufficient; always verify with curl.
- Docker may be installed but daemon not running; treat that as fallback-to-local, not a hard error.
- If both Docker and local are running, prefer reporting Docker URL first and note both are active.
- Semantic search model loading can take 30-60 seconds on first start. Report the health endpoint URL so the user can check back.
