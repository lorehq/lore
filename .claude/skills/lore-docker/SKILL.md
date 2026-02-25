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

## Platform detection

Before running any commands, detect the OS once:
- `uname -s` → `Linux` or `Darwin` = Unix, `MINGW*` or `MSYS*` or `CYGWIN*` = Windows (Git Bash)
- On Windows/Git Bash: `pgrep` is unavailable, `cksum` may be missing, and bash runs under Git Bash — use `powershell -NoProfile -Command "..."` for process queries and port hashing

## Process

Interpret intent from user input:
- default or `start` -> start docs UI
- `stop` -> stop docs UI
- `status` -> report current state

### Start

1. Compute ports, project name, and semantic settings:
   - Read config: `cfg=$(node -e "const{getConfig}=require('./.lore/lib/config');console.log(JSON.stringify(getConfig('.').docker||{}))")`
   - If `cfg.site.port` is explicitly set in config → use it: `LORE_DOCS_PORT=$(node -e "const{getConfig}=require('./.lore/lib/config');console.log(getConfig('.').docker.site.port)")`
   - Else compute hash-based port:
     - Unix: `LORE_DOCS_PORT=$(( ($(printf '%s' "$(basename "$PWD")" | cksum | cut -d' ' -f1) % 999) + 9001 ))`
     - Windows: use `node -e` to compute the hash instead (cksum unavailable): `LORE_DOCS_PORT=$(node -e "const s=require('path').basename(process.cwd());let h=0;for(const c of s)h=((h<<5)-h+c.charCodeAt(0))|0;console.log((Math.abs(h)%999)+9001)")`
   - If `cfg.search.port` is explicitly set → use it, else: `LORE_SEMANTIC_PORT=$(( LORE_DOCS_PORT + 1000 ))`
   - `COMPOSE_PROJECT_NAME="$(basename "$PWD")"`
   - Read `docker.semantic` from config.json, export `SEMANTIC_*` env vars (fall back to built-in defaults if key absent):
     `eval "$(node -e "const{getConfig}=require('./.lore/lib/config');const c=getConfig('.');const s=(c.docker||{}).semantic||{};const D={defaultK:8,maxK:20,maxChunkChars:1000,snippetChars:200,resultMode:'paths_min',model:'BAAI/bge-small-en-v1.5'};Object.entries({SEMANTIC_DEFAULT_K:s.defaultK??D.defaultK,SEMANTIC_MAX_K:s.maxK??D.maxK,SEMANTIC_MAX_CHUNK_CHARS:s.maxChunkChars??D.maxChunkChars,SEMANTIC_SNIPPET_CHARS:s.snippetChars??D.snippetChars,SEMANTIC_RESULT_MODE:s.resultMode??D.resultMode,SEMANTIC_EMBED_MODEL:s.model??D.model}).forEach(([k,v])=>console.log('export '+k+'='+v));")"
2. Prefer Docker when available:
    - Check Docker is running: `docker info > /dev/null 2>&1`
    - Pull image if needed: `docker pull lorehq/lore-docker:latest`
    - Export ports and start: `export LORE_DOCS_PORT LORE_SEMANTIC_PORT COMPOSE_PROJECT_NAME && docker compose -f .lore/docker-compose.yml up -d`
    - Wait up to 15 seconds for docs port to respond (semantic search takes longer to load models)
    - Verify docs: `curl -s -o /dev/null -w '%{http_code}' http://localhost:$LORE_DOCS_PORT`
    - If HTTP 200, write config and report:
      - Write docker config to `.lore/config.json` (preserves `docker.semantic`): `node -e "const{getConfig}=require('./.lore/lib/config');const fs=require('fs');const c=getConfig('.');const sem=c.docker?.semantic;c.docker={site:{address:'localhost',port:+process.env.LORE_DOCS_PORT},search:{address:'localhost',port:+process.env.LORE_SEMANTIC_PORT}};if(sem)c.docker.semantic=sem;fs.writeFileSync('.lore/config.json',JSON.stringify(c,null,2)+'\n')"`
      - Report docs URL and mode: Docker
    - Check semantic health (non-blocking — may still be loading): `curl -s http://localhost:$LORE_SEMANTIC_PORT/health`
3. Fall back to local mkdocs when Docker is unavailable or verification fails:
   - Check Python: `python3 --version || python --version`
   - Check mkdocs: `command -v mkdocs`
   - If missing, install deps: `pip install mkdocs-material mkdocs-panzoom-plugin`
   - Handle stale local process — detect and kill by platform:
     - Unix: `pgrep -f 'mkdocs serve'` — if PID exists but `curl http://localhost:8000` is not 200, `kill` the PID
     - Windows: `powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*mkdocs serve*' }).ProcessId"` — if PID exists but curl fails, `powershell -NoProfile -Command "Stop-Process -Id <PID> -Force"`
   - Start local server: `nohup mkdocs serve --livereload > /dev/null 2>&1 &`
   - Verify with curl on `http://localhost:8000`
   - Note: local fallback provides docs UI only — no semantic search or file watching
4. Report active mode, URLs, and whether semantic search is available.

### Stop

1. Try Docker first:
   - Set project name: `export COMPOSE_PROJECT_NAME="$(basename "$PWD")"`
   - If container is running: `docker compose -f .lore/docker-compose.yml down`
2. Then stop local mkdocs if running:
   - Unix: `pgrep -f 'mkdocs serve'` — if running: `kill $(pgrep -f 'mkdocs serve')`
   - Windows: `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*mkdocs serve*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`
3. Clear config (preserves `docker.semantic`): `node -e "const{getConfig}=require('./.lore/lib/config');const fs=require('fs');const c=getConfig('.');const sem=c.docker?.semantic;delete c.docker;if(sem)c.docker={semantic:sem};fs.writeFileSync('.lore/config.json',JSON.stringify(c,null,2)+'\n')"`
4. Report what was stopped, or "No docs UI is running".

### Status

1. Check Docker container state and verify HTTP response at computed `LORE_DOCS_PORT`.
   - If running, also check semantic health at `LORE_SEMANTIC_PORT`.
2. Check local mkdocs process and verify HTTP response at `localhost:8000`.
3. Report one of: Docker active (with semantic search status), local active (docs only), neither active.

## Gotchas

- `docker compose` project name defaults to the directory containing the compose file (`.lore` → `lore`), not the project root. Always export `COMPOSE_PROJECT_NAME="$(basename "$PWD")"` before any `docker compose` call so containers are named after the instance (e.g. `my-project-lore-runtime-1`).
- Always pass `--livereload` for local mkdocs.
- Process detection: `pgrep` on Unix, `Get-CimInstance Win32_Process` on Windows. Always verify with curl regardless.
- Docker may be installed but daemon not running; treat that as fallback-to-local, not a hard error.
- If both Docker and local are running, prefer reporting Docker URL first and note both are active.
- Semantic search model loading can take 30-60 seconds on first start. Report the health endpoint URL so the user can check back.
- After image pull + container recreation, the search endpoint returns connection refused (HTTP 000) for 60-120 seconds while uvicorn starts and the embedding model loads. This is normal startup behavior — poll `/health` until `ok: true` rather than treating the first failure as an error. Distinct from the volume conflict gotcha (`lore-docker-update-volume-conflict`).
